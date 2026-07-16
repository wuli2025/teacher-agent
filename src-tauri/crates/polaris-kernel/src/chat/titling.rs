//! 对话自动命名: 侧栏里每条对话叫「做出来的那个东西」的名字(《范进中举》课件、
//! 光合作用教案…), 而不是用户第一句话的前 24 个字。
//!
//! 触发点: 一轮对话结束、assistant 消息落库之后 (`pipeline.rs`)。只对
//! `conv::needs_auto_title` 为真的对话跑一次 —— 手动改过名的、已经拿到正式名的都不碰。
//!
//! 两级取名, 先便宜的:
//!   ① 产物文件名: 这一轮真做出了 `范进中举.pptx` → 对话就叫「范进中举」。零成本、最准。
//!   ② LLM 兜底: 纯问答/没产物时, 额外起一个极短的 `claude --print` 让它读首轮内容归纳
//!      一个主题名。跑在后台线程, 失败/超时就静默放弃(标题保持原样, 下轮还能再试)。

use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

use crate::conv;

/// LLM 兜底取名的墙钟上限: 超时直接放弃, 绝不拖住任何东西(它跑在独立线程里)。
const LLM_TITLE_TIMEOUT_SECS: u64 = 45;
/// 标题长度上限(字符): 侧栏一行放得下。
const MAX_TITLE_CHARS: usize = 20;

/// 一轮结束后给对话取名(阻塞, 调用方已在后台线程里)。
pub(crate) fn auto_title_after_turn(
    conversation_id: &str,
    artifacts: &[String],
    user_prompt: &str,
    assistant_text: &str,
    provider_id: Option<&str>,
) {
    if !conv::needs_auto_title(conversation_id) {
        return;
    }
    if let Some(t) = title_from_artifacts(artifacts) {
        conv::set_auto_title(conversation_id, &t);
        return;
    }
    if let Some(t) = title_from_llm(user_prompt, assistant_text, provider_id) {
        conv::set_auto_title(conversation_id, &t);
    }
}

/// 产物「像成品」的程度: 越小越像最终交付物。一轮里常常既有源稿清单、又有配图、
/// 最后才落最终课件 —— 取名必须挑交付物, 不能撞上谁先落盘谁当名字。
fn deliverable_rank(path: &str) -> u8 {
    if path.ends_with('/') {
        return 0; // 应用文件夹: 整体就是交付物
    }
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "pptx" | "ppt" | "docx" | "doc" | "pdf" | "xlsx" | "xls" => 0,
        "html" | "htm" => 1,
        "md" | "markdown" | "txt" | "csv" => 2,
        "zip" => 3,
        _ => 4, // 配图/音视频等素材: 全场只剩它时才拿来取名
    }
}

/// ① 产物文件名 → 标题。按交付物优先级挑一个(源稿清单剔除), 取其文件名主干。
/// `v1-范进中举.pptx` / `范进中举_final.docx` 这类前后缀是生成侧的习惯噪音, 一并削掉。
/// 一轮只产出源稿清单时返回 None, 让 LLM 兜底去归纳课题名。
fn title_from_artifacts(artifacts: &[String]) -> Option<String> {
    let mut ranked: Vec<&String> = artifacts
        .iter()
        .filter(|p| !super::artifacts::is_spec_artifact(p))
        .collect();
    ranked.sort_by_key(|p| deliverable_rank(p)); // 稳定排序: 同级仍按产出顺序
    for raw in ranked {
        // 应用文件夹产物的表示是带尾随 `/` 的目录路径, 取目录名即可。
        let trimmed = raw.trim_end_matches('/');
        let stem = if raw.ends_with('/') {
            Path::new(trimmed).file_name()?.to_string_lossy().to_string()
        } else {
            Path::new(trimmed).file_stem()?.to_string_lossy().to_string()
        };
        let cleaned = clean_stem(&stem);
        if !cleaned.is_empty() {
            return Some(truncate(&cleaned));
        }
    }
    None
}

/// 削掉版本号前缀(`v1-`/`v2_`)、常见收尾后缀(`_final`/`-最终版`)与首尾标点。
fn clean_stem(stem: &str) -> String {
    let mut s = stem.trim().to_string();
    // 前缀 v<数字> + 分隔符
    let bytes: Vec<char> = s.chars().collect();
    if matches!(bytes.first(), Some('v' | 'V')) {
        let mut i = 1;
        while i < bytes.len() && bytes[i].is_ascii_digit() {
            i += 1;
        }
        if i > 1 && matches!(bytes.get(i), Some('-' | '_' | '.')) {
            s = bytes[i + 1..].iter().collect();
        }
    }
    for suffix in ["_final", "-final", "_最终版", "-最终版", "_v1", "-v1"] {
        if let Some(rest) = s.strip_suffix(suffix) {
            s = rest.to_string();
        }
    }
    s.trim_matches(|c: char| c.is_whitespace() || "《》\"'`-_.".contains(c))
        .to_string()
}

/// ② LLM 兜底: 一次性极短 `claude --print`, 让它读首轮内容归纳一个主题名。
fn title_from_llm(user_prompt: &str, assistant_text: &str, provider_id: Option<&str>) -> Option<String> {
    let ask = format!(
        "下面是一段师生备课对话的开头。请用一个短名字概括这次对话「在做的东西」\
         —— 优先用具体的课题 / 课文 / 教学内容本身(例如「范进中举」「光合作用」\
         「二次函数图像」), 而不是复述用户的问句。\n\n\
         规则: 只输出这个名字本身, 不要引号、不要标点、不要任何解释; \
         最多 {MAX_TITLE_CHARS} 个字; 用中文。\n\n\
         【用户】{}\n\n【助手】{}\n",
        clip(user_prompt, 600),
        clip(assistant_text, 800),
    );

    let claude_bin: std::ffi::OsString = crate::doctor::resolve_claude_exe()
        .map(|p| p.into_os_string())
        .unwrap_or_else(|| "claude".into());
    let mut cmd = Command::new(&claude_bin);
    cmd.args(["--print", "--permission-mode=default", "--disallowedTools", "*"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    crate::doctor::harden_child_env(&mut cmd);
    crate::provider::scope_child_claude_by_id(&mut cmd, provider_id);
    crate::runtime::procs::no_window(&mut cmd);

    let mut child = cmd.spawn().ok()?;
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(ask.as_bytes());
    } // drop → EOF, claude 开工

    // 超时看门狗: 起名不值得等一分钟以上, 到点杀掉。
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(LLM_TITLE_TIMEOUT_SECS);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => {
                if std::time::Instant::now() >= deadline {
                    crate::runtime::procs::kill_tree(child.id());
                    let _ = child.kill();
                    let _ = child.wait();
                    return None;
                }
                std::thread::sleep(std::time::Duration::from_millis(200));
            }
            Err(_) => return None,
        }
    }

    let out = child.wait_with_output().ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    sanitize_llm_title(&text)
}

/// LLM 有时不听话(多吐一行解释、加引号、加句号)。取第一行非空 + 去壳 + 截断;
/// 明显不像标题的(空/太长/带换行说明)就放弃, 宁可不改名。
fn sanitize_llm_title(raw: &str) -> Option<String> {
    let line = raw.lines().map(str::trim).find(|l| !l.is_empty())?;
    let cleaned = line
        .trim_matches(|c: char| c.is_whitespace() || "《》「」\"'`。.,、:：*#".contains(c))
        .to_string();
    if cleaned.is_empty() || cleaned.chars().count() > MAX_TITLE_CHARS * 2 {
        return None;
    }
    Some(truncate(&cleaned))
}

fn truncate(s: &str) -> String {
    s.chars().take(MAX_TITLE_CHARS).collect()
}

fn clip(s: &str, n: usize) -> String {
    let out: String = s.chars().take(n).collect();
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn artifact_name_wins_and_gets_cleaned() {
        let arts = vec!["C:/Polaris/artifacts/c1/v1-范进中举.pptx".to_string()];
        assert_eq!(title_from_artifacts(&arts).unwrap(), "范进中举");
        let arts = vec!["/home/u/art/光合作用教案_final.docx".to_string()];
        assert_eq!(title_from_artifacts(&arts).unwrap(), "光合作用教案");
        let arts = vec!["/home/u/art/互动课件/".to_string()];
        assert_eq!(title_from_artifacts(&arts).unwrap(), "互动课件");
    }

    /// 回归: deck 流程先落 polaris.slides.json、再落配图, 最后才是课件。
    /// 取名必须跳过源稿清单、越过配图, 落在 .pptx 上(此前侧栏叫「polaris.slides」)。
    #[test]
    fn deck_run_is_named_after_the_deck_not_the_spec_or_images() {
        let arts = vec![
            "C:/Polaris/artifacts/c1/polaris.slides.json".to_string(),
            "C:/Polaris/artifacts/c1/img/cover.png".to_string(),
            "C:/Polaris/artifacts/c1/勾股定理_课件.pptx".to_string(),
        ];
        assert_eq!(title_from_artifacts(&arts).unwrap(), "勾股定理_课件");
    }

    /// 只出了源稿清单(课件还没落盘)时不硬取名, 交给 LLM 兜底。
    #[test]
    fn spec_only_run_defers_to_llm() {
        let arts = vec!["C:/Polaris/artifacts/c1/polaris.slides.json".to_string()];
        assert!(title_from_artifacts(&arts).is_none());
    }

    /// 全场只有图时它就是交付物, 照常取名。
    #[test]
    fn image_only_run_still_gets_named() {
        let arts = vec!["C:/Polaris/artifacts/c1/水循环示意图.png".to_string()];
        assert_eq!(title_from_artifacts(&arts).unwrap(), "水循环示意图");
    }

    #[test]
    fn long_artifact_name_truncates() {
        let arts = vec!["/a/这是一个远远超过二十个字符的超长课件标题需要被截断掉尾巴.pptx".to_string()];
        assert_eq!(title_from_artifacts(&arts).unwrap().chars().count(), MAX_TITLE_CHARS);
    }

    #[test]
    fn llm_title_is_unwrapped() {
        assert_eq!(sanitize_llm_title("《范进中举》\n").unwrap(), "范进中举");
        assert_eq!(sanitize_llm_title("  光合作用。").unwrap(), "光合作用");
        assert!(sanitize_llm_title("   \n  ").is_none());
        assert!(sanitize_llm_title(&"太长".repeat(50)).is_none());
    }
}

//! 问知识库 kb_ask —— 「检索 + 只读 claude」的一问一答。
//!
//! 与「构建知识网」那条重管线的分工:那边是**改库**(写 wiki/补双链/去重),必须抢维护锁;
//! 这边纯**读库回答**,不碰任何文件 —— 所以不占 KB 维护锁(用户一边构建一边提问也不该被拦),
//! 用的是只读 headless claude(allowedTools 仅 Read/Glob/Grep,物理上写不了文件)。
//!
//! 召回给上下文、而不是让模型从零 Grep:先用 kb_search 的加权评分挑出最相关的几篇塞进 prompt,
//! 模型再按需自己 Read 别的文件核实。这样常见问题一轮就能答,省掉大量试探性检索。

use super::*;

/// 回答里可点的来源(前端渲染成角标 chip)
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KbAskSource {
    /// 角标序号,与 prompt 里的 `[n]` 对应
    pub idx: usize,
    pub title: String,
    pub path: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KbAskEvent {
    pub run_id: String,
    /// phase | sources | tool | delta | done | error
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sources: Option<Vec<KbAskSource>>,
}

/// 前端带上来的最近几轮对话(让追问「那它和 X 的区别呢」能接得上)
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KbAskTurn {
    /// user | assistant
    pub role: String,
    pub text: String,
}

/// 召回几篇进上下文 / 每篇截多少字 / 带几轮历史 —— 都取「够用且不撑爆上下文」的保守值。
const ASK_TOP_K: usize = 6;
const ASK_DOC_CHARS: usize = 3000;
const ASK_HISTORY_TURNS: usize = 6;
/// 墙钟上限:一问一答是交互路径,卡住必须能放手(超时后前端收到 error + done,输入框解锁)。
const ASK_TIMEOUT_SECS: u64 = 180;

/// 问知识库:立刻返回 runId,答案经 `kb:ask` 事件流式回传。
#[cfg_attr(feature = "desktop", tauri::command)]
pub fn kb_ask(
    app: AppHandle,
    question: String,
    history: Option<Vec<KbAskTurn>>,
) -> Result<String, String> {
    let q = question.trim().to_string();
    if q.is_empty() {
        return Err("请先输入问题".into());
    }
    let root = KB_ROOT.read().clone();
    if root.as_os_str().is_empty() || !root.exists() {
        return Err("知识库根目录不存在".into());
    }

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let c = KB_COMPILE_COUNTER.fetch_add(1, Ordering::Relaxed);
    let run_id = format!("kba-{:x}-{:x}", ts, c);

    let history = history.unwrap_or_default();
    let run_id_t = run_id.clone();
    std::thread::spawn(move || {
        let emit = |kind: &str, text: Option<String>, sources: Option<Vec<KbAskSource>>| {
            let _ = app.emit(
                "kb:ask",
                KbAskEvent {
                    run_id: run_id_t.clone(),
                    kind: kind.into(),
                    text,
                    sources,
                },
            );
        };

        emit("phase", Some("检索知识库…".into()), None);
        let hits = kb_search_sync(q.clone(), Some(ASK_TOP_K));
        let sources: Vec<KbAskSource> = hits
            .iter()
            .enumerate()
            .map(|(i, h)| KbAskSource {
                idx: i + 1,
                title: h.title.clone(),
                path: h.path.clone(),
            })
            .collect();
        emit("sources", None, Some(sources));

        // 召回块:逐篇读正文截断塞进 prompt。读不到的(已删/权限)跳过,不让一篇坏文件毁掉整轮。
        let mut ctx = String::new();
        for (i, h) in hits.iter().enumerate() {
            let body = fs::read_to_string(root.join(&h.path)).unwrap_or_default();
            if body.trim().is_empty() {
                continue;
            }
            let trimmed: String = body.chars().take(ASK_DOC_CHARS).collect();
            ctx.push_str(&format!(
                "### [{}] {}\n来源: `{}`\n\n{}\n\n---\n\n",
                i + 1,
                h.title,
                h.path,
                trimmed
            ));
        }
        if ctx.is_empty() {
            ctx.push_str("(关键词召回为空 —— 请自己用 Glob/Grep 在库里找,找不到就如实说没有)\n\n");
        }

        let mut hist = String::new();
        let start = history.len().saturating_sub(ASK_HISTORY_TURNS);
        for t in &history[start..] {
            let who = if t.role == "assistant" { "助手" } else { "用户" };
            let line: String = t.text.chars().take(600).collect();
            hist.push_str(&format!("{who}: {line}\n"));
        }
        let hist_block = if hist.is_empty() {
            String::new()
        } else {
            format!("## 最近几轮对话\n{hist}\n")
        };

        emit("phase", Some("思考中…".into()), None);
        let prompt = format!(
            "# 任务: 依据本地知识库回答用户的问题(只读, 不要写任何文件)\n\n\
你的工作目录就是知识库根目录, 下面是按关键词加权召回的相关资料(可能不全)。\n\
若召回内容不足以回答, 用 Read/Glob/Grep 自己去 `wiki/` `raw/` `output/` `memory/` 里找。\n\n\
## 召回资料\n\n{ctx}\
{hist_block}\
## 用户的问题\n\n{q}\n\n\
## 回答要求\n\
- 用中文, 先给结论再给展开; 控制在 400 字内, 除非用户明确要求详述。\n\
- **只依据知识库内容作答**。库里确实没有就直说「知识库里没有查到」, 再补一句你的常识判断并标明「(库外补充)」。\n\
- 引用来源用 `[1]` `[2]` 角标, 对应上面召回资料的编号; 若你另外读了别的文件, 直接写它的相对路径。\n\
- 用 Markdown 排版, 不要输出检索过程、任务复述之类与答案无关的话。\n\n\
现在直接开始回答。"
        );

        match run_claude_readonly_timeout(
            &root,
            &prompt,
            |kind, text| {
                if kind == "tool" {
                    emit("tool", Some(text.to_string()), None);
                } else if kind == "delta" && !text.is_empty() {
                    emit("delta", Some(text.to_string()), None);
                }
            },
            std::time::Duration::from_secs(ASK_TIMEOUT_SECS),
        ) {
            Ok(_) => emit("done", None, None),
            Err(e) => {
                emit("error", Some(e), None);
                emit("done", None, None);
            }
        }
    });

    Ok(run_id)
}

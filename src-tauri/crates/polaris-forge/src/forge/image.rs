//! Polaris Forge · 文生图(MiniMax image-01,纯 Rust ureq)。
//!
//! 契约对齐已跑通的 build/genimg(Python 版,4 次重试直出 MiniMax):
//!   POST https://api.minimaxi.com/v1/image_generation  Authorization: Bearer <key>
//!   body {model:"image-01", prompt, n:1, response_format:"url", aspect_ratio, prompt_optimizer:true}
//!   → data.image_urls[0](临时 URL)→ 下载落盘
//!
//! 存在的理由:spec 路线的 `image-full` / `image-text` 版式吃本地图片路径,得有人把图变出来。
//! 用纯 Rust 而非 sidecar 调 genimg.py —— forge 已有 ureq,不引 Python 运行时(Docker slim
//! 里没有 python 也能出带图课件,与「零浏览器」同一个理由)。
//!
//! key 走 tts::discover_key() 同一条链(env MINIMAX_API_KEY → 供应商坞 providers.json),
//! **不在本文件内置任何 key** —— 坞里的「粉丝福利」条目由 kernel 首启播种,forge 只读不写。

use serde_json::{json, Value};
use std::time::Duration;

const ENDPOINT: &str = "https://api.minimaxi.com/v1/image_generation";
const DEFAULT_MODEL: &str = "image-01";
/// 生图慢(常 20–60s),给足超时;比 genimg.py 的 180s 略紧,失败快点暴露。
const GEN_TIMEOUT: u64 = 150;
const DOWNLOAD_TIMEOUT: u64 = 120;
/// MiniMax 支持的画幅。传别的会被网关拒,不如本地先挡住给出可读错误。
const RATIOS: &[&str] = &["1:1", "16:9", "4:3", "3:2", "2:3", "3:4", "9:16", "21:9"];

fn agent(timeout: u64) -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(timeout))
        .build()
}

/// 文生图 → 落盘 png/jpg。ratio 缺省 16:9(课件配图主力画幅)。
///
/// 返回 {ok,out,bytes,ratio,model,attempts}。失败返 Err(可读原因),调用方(SKILL/模型)
/// 据此决定是重试、换 prompt 还是退无图版式 —— 生图失败不该让整套课件卡住。
pub fn generate(prompt: &str, out_path: &str, ratio: Option<&str>) -> Result<Value, String> {
    let prompt = prompt.trim();
    if prompt.is_empty() {
        return Err("prompt 为空".into());
    }
    let ratio = ratio.unwrap_or("16:9").trim();
    if !RATIOS.contains(&ratio) {
        return Err(format!(
            "不支持的画幅 \"{ratio}\";可用: {}",
            RATIOS.join(" / ")
        ));
    }
    let key = crate::forge::tts::discover_key().ok_or(
        "找不到 MiniMax key:在供应商坞启用「MiniMax」,或设环境变量 MINIMAX_API_KEY",
    )?;
    let model = std::env::var("MINIMAX_IMAGE_MODEL").unwrap_or_else(|_| DEFAULT_MODEL.to_string());
    let endpoint = std::env::var("MINIMAX_IMAGE_URL").unwrap_or_else(|_| ENDPOINT.to_string());

    let body = json!({
        "model": model,
        "prompt": prompt,
        "n": 1,
        "response_format": "url",
        "aspect_ratio": ratio,
        "prompt_optimizer": true,
    });

    // 生图接口偶发限流/超时是常态(genimg.py 也是重试 4 次),退避重试;
    // 但 4xx 认证/参数错重试无意义,直接抛。
    let mut last = String::new();
    let mut url = String::new();
    let mut attempts = 0u32;
    for i in 0..4 {
        attempts = i + 1;
        match agent(GEN_TIMEOUT)
            .post(&endpoint)
            .set("Authorization", &format!("Bearer {key}"))
            .set("Content-Type", "application/json")
            .send_json(body.clone())
        {
            Ok(resp) => {
                let v: Value = resp
                    .into_json()
                    .map_err(|e| format!("响应不是合法 JSON: {e}"))?;
                if let Some(u) = v
                    .get("data")
                    .and_then(|d| d.get("image_urls"))
                    .and_then(|a| a.as_array())
                    .and_then(|a| a.first())
                    .and_then(|x| x.as_str())
                {
                    url = u.to_string();
                    break;
                }
                // MiniMax 把业务错误塞在 200 的 base_resp 里(status_code != 0),
                // 不看它会把「余额不足」当成空结果一路重试到超时。
                let br = v.get("base_resp").cloned().unwrap_or(v.clone());
                let code = br.get("status_code").and_then(|x| x.as_i64()).unwrap_or(-1);
                let msg = br
                    .get("status_msg")
                    .and_then(|x| x.as_str())
                    .unwrap_or("未知错误");
                last = format!("MiniMax 拒绝(status_code={code}): {msg}");
                if matches!(code, 1004 | 1008 | 1013 | 2013) {
                    // 鉴权失败 / 余额不足 / 参数非法 —— 重试也是白搭
                    return Err(last);
                }
            }
            Err(ureq::Error::Status(code, r)) => {
                let txt = r.into_string().unwrap_or_default();
                last = format!("HTTP {code}: {}", txt.chars().take(200).collect::<String>());
                if (400..500).contains(&code) && code != 429 {
                    return Err(last);
                }
            }
            Err(e) => last = format!("请求失败: {e}"),
        }
        std::thread::sleep(Duration::from_secs(2 + (i as u64) * 3));
    }
    if url.is_empty() {
        return Err(format!("生图失败(试了 {attempts} 次): {last}"));
    }

    if let Some(parent) = std::path::Path::new(out_path).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| format!("建目录失败: {e}"))?;
        }
    }
    // 下载:URL 是临时的,拿到就存。分开重试——生成成功但下载抖动时不该重新烧一次生图额度。
    let mut bytes: Vec<u8> = Vec::new();
    let mut derr = String::new();
    for i in 0..3 {
        match agent(DOWNLOAD_TIMEOUT).get(&url).call() {
            Ok(r) => {
                let mut buf: Vec<u8> = Vec::new();
                match std::io::Read::read_to_end(&mut r.into_reader(), &mut buf) {
                    Ok(_) if buf.len() > 1024 => {
                        bytes = buf;
                        break;
                    }
                    Ok(_) => derr = format!("下载内容过小({} 字节)", buf.len()),
                    Err(e) => derr = format!("读取失败: {e}"),
                }
            }
            Err(e) => derr = format!("下载失败: {e}"),
        }
        std::thread::sleep(Duration::from_secs(2 + i * 2));
    }
    if bytes.is_empty() {
        return Err(format!("图已生成但取不回来: {derr}"));
    }
    // 确认真是 PNG/JPEG 再落盘:网关出错时可能回一段 HTML/JSON,
    // 存成 .png 会一路带到 pptx 打包才炸,那时更难查。
    let format = if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        "png"
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "jpeg"
    } else {
        return Err("下载到的不是 PNG/JPEG(网关可能返回了错误页)".into());
    };
    // 按请求的路径原样存 —— **不**按真实格式改扩展名:spec 里引用的是这个路径,
    // 改名会让引用落空。MiniMax 现在回的其实是 JPEG(哪怕你写 out.png),故 pptx
    // 打包一侧按魔数认格式,不信后缀;`format` 字段把真相摆出来,别让它静默。
    std::fs::write(out_path, &bytes).map_err(|e| format!("写 {out_path} 失败: {e}"))?;

    Ok(json!({
        "ok": true,
        "out": std::path::Path::new(out_path)
            .canonicalize()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| out_path.to_string()),
        "bytes": bytes.len(),
        "format": format,
        "ratio": ratio,
        "model": model,
        "attempts": attempts,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_bad_input_before_touching_network() {
        // 空 prompt / 非法画幅必须本地就挡下,不浪费一次真实调用。
        assert!(generate("", "x.png", None).unwrap_err().contains("prompt"));
        let e = generate("猫", "x.png", Some("5:7")).unwrap_err();
        assert!(e.contains("不支持的画幅"), "{e}");
        assert!(e.contains("16:9"), "错误里应列出可用画幅: {e}");
    }
}

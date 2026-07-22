//! `.docx` → polaris.doc.json(Word 教案 spec)。`docx_native.rs` 的逆向。
//!
//! 为什么要自己解析而不是找个 crate:整条链路的铁律是「只准向下依赖 polaris-runtime,
//! 不加新依赖」。docx 的 `word/document.xml` 结构规整、我们只关心其中很窄的一个子集
//! (段落 / 表格 / run 属性 / oMath / drawing),自己写个几百行的只读 XML 扫描器
//! 比拖进一个通用 XML 库划算得多,也不会因为上游 API 变动而返工。
//!
//! **导入不是无损的,也不该是**:.docx 能表达的东西远多于 spec(样式继承、分节、
//! 文本框、域、批注……)。目标是「导进来再导出去,肉眼结构不走样」——
//! 标题还是标题、要点还是要点、表格还是表格、公式还是公式,而不是字节级还原。
//!
//! 块类型靠**启发式**判定(Word 文档里九成的「标题」根本没用 Heading 样式,而是
//! 手工加粗放大;真按 pStyle 认会把整份教案认成一堆正文):
//!   居中大字号 → title/subtitle;行首「■」或中文序号「一、」或加粗显著大字 → h1;
//!   「（1）/ 1.」这类 → h2;行首「· 」或 numPr(bullet)→ bullet;numPr(decimal)→ num;
//!   有首行缩进 → p(indent:first);其余 → p(indent:none)。
//!
//! **正文字号靠众数而不是 styles.xml**:实测教案 .docx 几乎每个 run 都写死了 `w:sz`,
//! docDefaults 里的默认值形同虚设 —— 按众数取「基准字号」才判得准哪个是标题。

use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::io::Read;

// ───────────────────────── 极简只读 XML 扫描器 ─────────────────────────

#[derive(Debug, Default, Clone)]
pub struct Node {
    pub name: String,
    pub attrs: Vec<(String, String)>,
    pub kids: Vec<Node>,
    /// 本元素的**直接**字符数据(不含子元素的)
    pub text: String,
}

impl Node {
    pub fn child(&self, name: &str) -> Option<&Node> {
        self.kids.iter().find(|k| k.name == name)
    }
    pub fn children<'a>(&'a self, name: &'a str) -> impl Iterator<Item = &'a Node> + 'a {
        self.kids.iter().filter(move |k| k.name == name)
    }
    pub fn attr(&self, name: &str) -> Option<&str> {
        self.attrs
            .iter()
            .find(|(k, _)| k == name)
            .map(|(_, v)| v.as_str())
    }
    /// 深度优先找第一个同名后代
    pub fn find(&self, name: &str) -> Option<&Node> {
        if self.name == name {
            return Some(self);
        }
        self.kids.iter().find_map(|k| k.find(name))
    }
    /// 所有后代的文字拼接
    pub fn all_text(&self) -> String {
        let mut s = self.text.clone();
        for k in &self.kids {
            s.push_str(&k.all_text());
        }
        s
    }
}

/// XML 实体解码。只认 XML 五个预定义实体 + 数字实体 —— OOXML 不会有别的。
fn xml_unescape(s: &str) -> String {
    if !s.contains('&') {
        return s.to_string();
    }
    let b: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] != '&' {
            out.push(b[i]);
            i += 1;
            continue;
        }
        let Some(semi) = (i + 1..(i + 12).min(b.len())).find(|&k| b[k] == ';') else {
            out.push('&');
            i += 1;
            continue;
        };
        let ent: String = b[i + 1..semi].iter().collect();
        let rep = match ent.as_str() {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            e if e.starts_with("#x") || e.starts_with("#X") => {
                u32::from_str_radix(&e[2..], 16).ok().and_then(char::from_u32)
            }
            e if e.starts_with('#') => e[1..].parse::<u32>().ok().and_then(char::from_u32),
            _ => None,
        };
        match rep {
            Some(c) => {
                out.push(c);
                i = semi + 1;
            }
            None => {
                out.push('&');
                i += 1;
            }
        }
    }
    out
}

fn parse_attrs(s: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let b: Vec<char> = s.chars().collect();
    let mut i = 0;
    while i < b.len() {
        while i < b.len() && b[i].is_whitespace() {
            i += 1;
        }
        let start = i;
        while i < b.len() && b[i] != '=' && !b[i].is_whitespace() {
            i += 1;
        }
        if i >= b.len() || start == i {
            break;
        }
        let key: String = b[start..i].iter().collect();
        while i < b.len() && b[i].is_whitespace() {
            i += 1;
        }
        if i >= b.len() || b[i] != '=' {
            continue;
        }
        i += 1;
        while i < b.len() && b[i].is_whitespace() {
            i += 1;
        }
        if i >= b.len() {
            break;
        }
        let q = b[i];
        if q != '"' && q != '\'' {
            continue;
        }
        i += 1;
        let vs = i;
        while i < b.len() && b[i] != q {
            i += 1;
        }
        let val: String = b[vs..i.min(b.len())].iter().collect();
        i = (i + 1).min(b.len());
        out.push((key, xml_unescape(&val)));
    }
    out
}

/// 解析成节点树。容错优先:遇到不认识的东西跳过而不是报错
/// (真实 .docx 里 mc:AlternateContent / VML 之类五花八门,报错等于整份导不进来)。
pub fn parse_xml(src: &str) -> Result<Node, String> {
    let mut stack: Vec<Node> = vec![Node {
        name: "#root".into(),
        ..Default::default()
    }];
    let b = src.as_bytes();
    let mut i = 0usize;
    while i < b.len() {
        if b[i] != b'<' {
            let start = i;
            while i < b.len() && b[i] != b'<' {
                i += 1;
            }
            let raw = &src[start..i];
            if let Some(top) = stack.last_mut() {
                top.text.push_str(&xml_unescape(raw));
            }
            continue;
        }
        // 声明 / 注释 / CDATA / DOCTYPE:整段跳过
        if src[i..].starts_with("<!--") {
            i = src[i..].find("-->").map(|k| i + k + 3).unwrap_or(b.len());
            continue;
        }
        if src[i..].starts_with("<![CDATA[") {
            let end = src[i..].find("]]>").map(|k| i + k).unwrap_or(b.len());
            let raw = &src[i + 9..end.min(src.len())];
            if let Some(top) = stack.last_mut() {
                top.text.push_str(raw);
            }
            i = (end + 3).min(b.len());
            continue;
        }
        if src[i..].starts_with("<?") || src[i..].starts_with("<!") {
            i = src[i..].find('>').map(|k| i + k + 1).unwrap_or(b.len());
            continue;
        }
        let Some(rel) = src[i..].find('>') else { break };
        let j = i + rel;
        let inner = &src[i + 1..j];
        i = j + 1;
        if let Some(name) = inner.strip_prefix('/') {
            let name = name.trim();
            // 错配就地容忍:一路弹到同名为止,弹空了就算了(绝不 panic)
            if let Some(pos) = stack.iter().rposition(|n| n.name == name) {
                while stack.len() > pos {
                    let done = stack.pop().unwrap();
                    if let Some(parent) = stack.last_mut() {
                        parent.kids.push(done);
                    }
                }
            }
            continue;
        }
        let self_closing = inner.ends_with('/');
        let inner = inner.trim_end_matches('/');
        let mut it = inner.splitn(2, |c: char| c.is_whitespace());
        let name = it.next().unwrap_or("").to_string();
        let attrs = it.next().map(parse_attrs).unwrap_or_default();
        if name.is_empty() {
            continue;
        }
        let node = Node {
            name,
            attrs,
            ..Default::default()
        };
        if self_closing {
            if let Some(top) = stack.last_mut() {
                top.kids.push(node);
            }
        } else {
            stack.push(node);
        }
    }
    while stack.len() > 1 {
        let done = stack.pop().unwrap();
        if let Some(parent) = stack.last_mut() {
            parent.kids.push(done);
        }
    }
    let root = stack.pop().ok_or("XML 解析栈为空")?;
    root.kids
        .into_iter()
        .next()
        .ok_or_else(|| "XML 没有根元素".to_string())
}

// ───────────────────────── OMML → LaTeX(DOC_SPEC §3 子集) ─────────────────────────

/// OMML 重音字符 → LaTeX 命令
fn accent_cmd(chr: &str) -> &'static str {
    match chr.chars().next().unwrap_or('\u{0304}') {
        '\u{20D7}' => "vec",
        '\u{0302}' | '^' => "hat",
        '\u{0303}' | '~' => "tilde",
        '\u{0307}' => "dot",
        '\u{0308}' => "ddot",
        _ => "bar",
    }
}

fn nary_cmd(chr: &str) -> &'static str {
    match chr.chars().next().unwrap_or('∑') {
        '∫' => "int",
        '∬' => "iint",
        '∮' => "oint",
        '∏' => "prod",
        '⋃' => "bigcup",
        '⋂' => "bigcap",
        _ => "sum",
    }
}

/// `m:e` / `m:num` 这类容器 → LaTeX
fn omml_seq(n: &Node) -> String {
    n.kids.iter().map(omml_node).collect()
}

fn wrap(s: String) -> String {
    // 单字符不必加括号,读起来更像人写的 LaTeX
    if s.chars().count() == 1 {
        s
    } else {
        format!("{{{s}}}")
    }
}

fn omml_node(n: &Node) -> String {
    match n.name.as_str() {
        "m:r" => n
            .children("m:t")
            .map(|t| t.all_text())
            .collect::<String>(),
        "m:t" => n.all_text(),
        "m:f" => {
            let num = n.child("m:num").map(omml_seq).unwrap_or_default();
            let den = n.child("m:den").map(omml_seq).unwrap_or_default();
            format!("\\frac{{{num}}}{{{den}}}")
        }
        "m:sSup" => {
            let e = n.child("m:e").map(omml_seq).unwrap_or_default();
            let s = n.child("m:sup").map(omml_seq).unwrap_or_default();
            format!("{}^{}", wrap_base(&e), wrap(s))
        }
        "m:sSub" => {
            let e = n.child("m:e").map(omml_seq).unwrap_or_default();
            let s = n.child("m:sub").map(omml_seq).unwrap_or_default();
            format!("{}_{}", wrap_base(&e), wrap(s))
        }
        "m:sSubSup" => {
            let e = n.child("m:e").map(omml_seq).unwrap_or_default();
            let sub = n.child("m:sub").map(omml_seq).unwrap_or_default();
            let sup = n.child("m:sup").map(omml_seq).unwrap_or_default();
            format!("{}_{}^{}", wrap_base(&e), wrap(sub), wrap(sup))
        }
        "m:rad" => {
            let e = n.child("m:e").map(omml_seq).unwrap_or_default();
            let deg = n.child("m:deg").map(omml_seq).unwrap_or_default();
            let hidden = n
                .child("m:radPr")
                .and_then(|p| p.child("m:degHide"))
                .and_then(|d| d.attr("m:val"))
                .map(|v| v == "1" || v == "true")
                .unwrap_or(false);
            if deg.is_empty() || hidden {
                format!("\\sqrt{{{e}}}")
            } else {
                format!("\\sqrt[{deg}]{{{e}}}")
            }
        }
        "m:d" => {
            let pr = n.child("m:dPr");
            let beg = pr
                .and_then(|p| p.child("m:begChr"))
                .and_then(|c| c.attr("m:val"))
                .unwrap_or("(");
            let end = pr
                .and_then(|p| p.child("m:endChr"))
                .and_then(|c| c.attr("m:val"))
                .unwrap_or(")");
            let e: String = n.children("m:e").map(omml_seq).collect::<Vec<_>>().join(",");
            format!("\\left{beg}{e}\\right{end}")
        }
        "m:nary" => {
            let pr = n.child("m:naryPr");
            let chr = pr
                .and_then(|p| p.child("m:chr"))
                .and_then(|c| c.attr("m:val"))
                .unwrap_or("∑");
            let sub = n.child("m:sub").map(omml_seq).unwrap_or_default();
            let sup = n.child("m:sup").map(omml_seq).unwrap_or_default();
            let e = n.child("m:e").map(omml_seq).unwrap_or_default();
            let mut s = format!("\\{}", nary_cmd(chr));
            if !sub.is_empty() {
                s.push_str(&format!("_{}", wrap(sub)));
            }
            if !sup.is_empty() {
                s.push_str(&format!("^{}", wrap(sup)));
            }
            s.push_str(&e);
            s
        }
        "m:func" => {
            let f = n.child("m:fName").map(omml_seq).unwrap_or_default();
            let e = n.child("m:e").map(omml_seq).unwrap_or_default();
            let f = f.trim();
            if f.chars().all(|c| c.is_ascii_alphabetic()) && !f.is_empty() {
                format!("\\{f} {e}")
            } else {
                format!("{f}{e}")
            }
        }
        "m:acc" => {
            let chr = n
                .child("m:accPr")
                .and_then(|p| p.child("m:chr"))
                .and_then(|c| c.attr("m:val"))
                .unwrap_or("\u{0304}");
            let e = n.child("m:e").map(omml_seq).unwrap_or_default();
            format!("\\{}{{{e}}}", accent_cmd(chr))
        }
        "m:bar" => {
            let e = n.child("m:e").map(omml_seq).unwrap_or_default();
            format!("\\bar{{{e}}}")
        }
        // 属性节点不产文字
        "m:rPr" | "m:ctrlPr" | "m:fPr" | "m:radPr" | "m:dPr" | "m:naryPr" | "m:accPr"
        | "m:sSupPr" | "m:sSubPr" | "m:sSubSupPr" | "m:funcPr" | "m:barPr" | "w:rPr" => {
            String::new()
        }
        // 子集之外的结构:降级取其纯文字,内容绝不丢
        _ => omml_seq(n),
    }
}

/// 上下标的底数:多字符要括起来,否则 `f(x)^2` 会变成 `f(x)^2` 里 `)` 带幂,语义走样
fn wrap_base(s: &str) -> String {
    if s.chars().count() <= 1 {
        s.to_string()
    } else {
        format!("{{{s}}}")
    }
}

/// `m:oMath` → `$latex$`(空公式返回空串)
fn omath_to_tex(n: &Node) -> String {
    let tex = omml_seq(n);
    let t = tex.trim();
    if t.is_empty() {
        String::new()
    } else {
        format!("${t}$")
    }
}

// ───────────────────────── 段落扫描 ─────────────────────────

#[derive(Default)]
struct RunInfo {
    text: String,
    bold: bool,
    italic: bool,
    underline: bool,
    strike: bool,
    /// 半磅
    sz: Option<i64>,
    /// 该 run 是纯公式(text 已是 `$..$`)
    math: bool,
    /// 内嵌图片的 rel id
    image: Option<String>,
    page_break: bool,
}

fn on_off(n: Option<&Node>) -> bool {
    match n {
        None => false,
        Some(x) => !matches!(x.attr("w:val"), Some("0") | Some("false") | Some("off")),
    }
}

/// 递归收集段落里的 run(hyperlink / sdt / ins 这些容器要穿透,否则超链接文字整段丢失)
fn collect_runs(n: &Node, out: &mut Vec<RunInfo>) {
    for k in &n.kids {
        match k.name.as_str() {
            "w:pPr" => {}
            "w:r" => out.push(scan_run(k)),
            "m:oMath" => {
                let tex = omath_to_tex(k);
                if !tex.is_empty() {
                    out.push(RunInfo {
                        text: tex,
                        math: true,
                        ..Default::default()
                    });
                }
            }
            "m:oMathPara" => {
                for om in k.children("m:oMath") {
                    let tex = omath_to_tex(om);
                    if !tex.is_empty() {
                        out.push(RunInfo {
                            text: tex,
                            math: true,
                            ..Default::default()
                        });
                    }
                }
            }
            "w:hyperlink" | "w:ins" | "w:sdt" | "w:sdtContent" | "w:smartTag" | "w:bookmarkStart" => {
                collect_runs(k, out)
            }
            _ => {}
        }
    }
}

fn scan_run(r: &Node) -> RunInfo {
    let pr = r.child("w:rPr");
    let mut info = RunInfo {
        bold: on_off(pr.and_then(|p| p.child("w:b"))),
        italic: on_off(pr.and_then(|p| p.child("w:i"))),
        underline: pr
            .and_then(|p| p.child("w:u"))
            .map(|u| !matches!(u.attr("w:val"), Some("none") | None))
            .unwrap_or(false),
        strike: on_off(pr.and_then(|p| p.child("w:strike"))),
        sz: pr
            .and_then(|p| p.child("w:sz"))
            .and_then(|s| s.attr("w:val"))
            .and_then(|v| v.parse::<i64>().ok()),
        ..Default::default()
    };
    for k in &r.kids {
        match k.name.as_str() {
            "w:t" => info.text.push_str(&k.all_text()),
            "w:tab" => info.text.push(' '),
            "w:br" => {
                if k.attr("w:type") == Some("page") {
                    info.page_break = true;
                } else {
                    info.text.push('\n');
                }
            }
            "w:drawing" | "w:pict" | "mc:AlternateContent" => {
                if let Some(blip) = k.find("a:blip") {
                    info.image = blip
                        .attr("r:embed")
                        .or_else(|| blip.attr("r:link"))
                        .map(str::to_string);
                }
            }
            _ => {}
        }
    }
    info
}

/// run 属性 → 行内标记。**只挂一种**:JS 侧的解析器不支持嵌套(`**__x__**` 会解析成
/// 字面量),挂两层等于导出后显示出一堆星号。优先级 粗 > 下划线 > 删除 > 斜。
fn mark(text: &str, r: &RunInfo, para_all_bold: bool) -> String {
    if text.is_empty() {
        return String::new();
    }
    if r.math {
        return text.to_string();
    }
    // 整段都加粗时,粗体由块类型/bold 字段承载,不再逐 run 打 `**`
    if r.bold && !para_all_bold {
        return format!("**{text}**");
    }
    if r.underline {
        return format!("__{text}__");
    }
    if r.strike {
        return format!("~~{text}~~");
    }
    if r.italic {
        return format!("*{text}*");
    }
    text.to_string()
}

struct Para {
    text: String,
    /// 最大 run 字号(磅)
    sz_pt: Option<f64>,
    all_bold: bool,
    jc: String,
    first_line: bool,
    /// numbering 格式:"bullet" / "decimal"
    numfmt: Option<String>,
    page_break: bool,
    border_bottom: bool,
    border_left_only: bool,
    shaded: bool,
    images: Vec<String>,
    fonts: Vec<String>,
    /// 被剥掉的行首装饰符(「·」→ bullet、「■」→ h1),不进 text
    lead_mark: String,
}

fn scan_para(p: &Node, numfmt_of: &HashMap<String, String>) -> Para {
    let pr = p.child("w:pPr");
    let mut runs: Vec<RunInfo> = Vec::new();
    collect_runs(p, &mut runs);

    // 先剥「装饰前缀 run」:教案里「■ 」「· 」几乎总是**独立的一个加粗 run**。
    // 不剥的话会出两个连锁问题:(1) 整段的 all_bold 被这个粗前缀带偏;
    // (2) mark() 把它包成 `**· **`,后面 strip_bullet 就再也认不出来了 ——
    // 15 份真教案实测:不剥则一个 bullet 都识别不出来,全掉进 p。
    let mut lead_mark = String::new();
    if let Some(pos) = runs.iter().position(|r| !r.text.trim().is_empty()) {
        let t = runs[pos].text.trim().to_string();
        if matches!(
            t.as_str(),
            "·" | "•" | "●" | "▪" | "‧" | "■" | "◆" | "▍" | "▎"
        ) {
            lead_mark = t;
            runs.remove(pos);
        }
    }

    let visible: Vec<&RunInfo> = runs.iter().filter(|r| !r.text.trim().is_empty()).collect();
    let all_bold = !visible.is_empty() && visible.iter().all(|r| r.bold || r.math);
    let sz_hp = visible.iter().filter_map(|r| r.sz).max();
    let text: String = runs
        .iter()
        .map(|r| mark(&r.text, r, all_bold))
        .collect::<String>();

    let bdr = pr.and_then(|x| x.child("w:pBdr"));
    let border_bottom = bdr.map(|b| b.child("w:bottom").is_some()).unwrap_or(false);
    let border_left_only = bdr
        .map(|b| {
            b.child("w:left").is_some()
                && b.child("w:top").is_none()
                && b.child("w:bottom").is_none()
        })
        .unwrap_or(false);
    let shaded = pr
        .and_then(|x| x.child("w:shd"))
        .and_then(|s| s.attr("w:fill"))
        .map(|f| !matches!(f.to_ascii_uppercase().as_str(), "AUTO" | "FFFFFF" | ""))
        .unwrap_or(false);

    let ind = pr.and_then(|x| x.child("w:ind"));
    let first_line = ind
        .map(|i| {
            i.attr("w:firstLine")
                .and_then(|v| v.parse::<i64>().ok())
                .unwrap_or(0)
                > 0
                || i.attr("w:firstLineChars")
                    .and_then(|v| v.parse::<i64>().ok())
                    .unwrap_or(0)
                    > 0
        })
        .unwrap_or(false);

    let numfmt = pr
        .and_then(|x| x.child("w:numPr"))
        .and_then(|n| n.child("w:numId"))
        .and_then(|n| n.attr("w:val"))
        .and_then(|id| numfmt_of.get(id).cloned());

    let mut fonts: Vec<String> = Vec::new();
    for r in &runs {
        if let Some(f) = r.text.is_empty().then_some(()).and(None::<&str>) {
            let _: &str = f;
        }
    }
    for r in p.kids.iter().filter(|k| k.name == "w:r") {
        if let Some(f) = r
            .child("w:rPr")
            .and_then(|x| x.child("w:rFonts"))
            .and_then(|x| x.attr("w:eastAsia").or_else(|| x.attr("w:ascii")))
        {
            fonts.push(f.to_string());
        }
    }

    Para {
        text,
        sz_pt: sz_hp.map(|h| h as f64 / 2.0),
        all_bold,
        jc: pr
            .and_then(|x| x.child("w:jc"))
            .and_then(|j| j.attr("w:val"))
            .unwrap_or("")
            .to_string(),
        first_line,
        numfmt,
        page_break: runs.iter().any(|r| r.page_break),
        border_bottom,
        border_left_only,
        shaded,
        images: runs.iter().filter_map(|r| r.image.clone()).collect(),
        fonts,
        lead_mark,
    }
}

// ───────────────────────── 启发式判块 ─────────────────────────

const CN_NUM: &[char] = &[
    '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '零', '壹', '贰',
];

/// 「一、」「（二）」这类中文序号开头 —— 中文教案里最常见的一级标题写法
fn starts_cn_section(s: &str) -> bool {
    let c: Vec<char> = s.chars().collect();
    if c.is_empty() {
        return false;
    }
    let mut i = 0;
    if c[0] == '（' || c[0] == '(' {
        return false; // 带括号的是二级,见 starts_sub_section
    }
    while i < c.len() && i < 3 && CN_NUM.contains(&c[i]) {
        i += 1;
    }
    i > 0 && i < c.len() && matches!(c[i], '、' | '．' | '.' | '：' | ':')
}

/// 「（1）」「1.」「1、」「①」这类二级序号
fn starts_sub_section(s: &str) -> bool {
    let c: Vec<char> = s.chars().collect();
    if c.is_empty() {
        return false;
    }
    if ('①'..='⑳').contains(&c[0]) {
        return true;
    }
    let mut i = 0;
    let bracket = c[0] == '（' || c[0] == '(';
    if bracket {
        i = 1;
    }
    let ds = i;
    while i < c.len() && (c[i].is_ascii_digit() || CN_NUM.contains(&c[i])) {
        i += 1;
    }
    if i == ds || i >= c.len() {
        return false;
    }
    // 带括号时,右括号可能远在标题末尾(真教案里「（1. 知识与技能）」很常见),
    // 所以数字后跟 `.`/`、` 同样算数,不强求紧跟 `）`
    if bracket {
        matches!(c[i], '）' | ')' | '.' | '．' | '、' | ' ')
    } else {
        matches!(c[i], '.' | '．' | '、')
    }
}

/// 行首的项目符号(导入后必须去掉写进 text —— DOC_SPEC 明令 bullet 的 text 里不带符号)
fn strip_bullet(s: &str) -> Option<String> {
    for mk in ["· ", "•", "●", "▪", "·", "‧", "- "] {
        if let Some(rest) = s.strip_prefix(mk) {
            return Some(rest.trim_start().to_string());
        }
    }
    None
}

/// 行首的「章节方块」标记。**「【」故意不在列**:教案里「【重点】xxx」这种是**行内强调**
/// 而不是章节标记,当成 h1 剥掉会把「【」吃掉、把整段正文提成标题 —— 15 份真教案实测踩到,
/// 表现是字数保留率 99.9% 而不是 100%(丢的就是那两个方括号)。
fn strip_h1_mark(s: &str) -> Option<String> {
    for mk in ["■", "◆", "▍", "▎"] {
        if let Some(rest) = s.strip_prefix(mk) {
            return Some(rest.trim_start().to_string());
        }
    }
    None
}

// ───────────────────────── 主流程 ─────────────────────────

/// `.docx` → spec。`img_dir` 是抽出的图片落盘目录(缺省 = docx 同级的 `img/`)。
pub fn docx_to_spec(path: &str, img_dir: Option<&str>) -> Result<Value, String> {
    let f = std::fs::File::open(path).map_err(|e| format!("打不开 {path}: {e}"))?;
    let mut zip = zip::ZipArchive::new(f).map_err(|e| format!("{path} 不是合法的 zip/docx: {e}"))?;
    let mut warnings: Vec<String> = Vec::new();

    let read = |zip: &mut zip::ZipArchive<std::fs::File>, name: &str| -> Option<String> {
        let mut s = String::new();
        zip.by_name(name).ok()?.read_to_string(&mut s).ok()?;
        Some(s)
    };

    let doc_xml = read(&mut zip, "word/document.xml")
        .ok_or("缺 word/document.xml,不是 Word 文档(.doc 请先另存为 .docx)")?;
    let doc = parse_xml(&doc_xml)?;
    let body = doc
        .child("w:body")
        .ok_or("word/document.xml 缺 w:body")?
        .clone();

    // numbering:numId → 格式(bullet / decimal)
    let mut numfmt_of: HashMap<String, String> = HashMap::new();
    if let Some(num_xml) = read(&mut zip, "word/numbering.xml") {
        if let Ok(n) = parse_xml(&num_xml) {
            let mut abs: HashMap<String, String> = HashMap::new();
            for a in n.children("w:abstractNum") {
                let id = a.attr("w:abstractNumId").unwrap_or("").to_string();
                let fmt = a
                    .children("w:lvl")
                    .find(|l| l.attr("w:ilvl") == Some("0"))
                    .or_else(|| a.child("w:lvl"))
                    .and_then(|l| l.child("w:numFmt"))
                    .and_then(|f| f.attr("w:val"))
                    .unwrap_or("decimal")
                    .to_string();
                abs.insert(id, fmt);
            }
            for m in n.children("w:num") {
                let nid = m.attr("w:numId").unwrap_or("").to_string();
                let aid = m
                    .child("w:abstractNumId")
                    .and_then(|x| x.attr("w:val"))
                    .unwrap_or("");
                let fmt = abs.get(aid).cloned().unwrap_or_else(|| "decimal".into());
                numfmt_of.insert(nid, if fmt == "bullet" { "bullet".into() } else { "decimal".into() });
            }
        }
    }

    // 图片 rel:rId → word/media/xxx
    let mut rel_target: HashMap<String, String> = HashMap::new();
    if let Some(rels) = read(&mut zip, "word/_rels/document.xml.rels") {
        if let Ok(n) = parse_xml(&rels) {
            for r in n.children("Relationship") {
                if let (Some(id), Some(t)) = (r.attr("Id"), r.attr("Target")) {
                    rel_target.insert(id.to_string(), t.trim_start_matches('/').to_string());
                }
            }
        }
    }

    // ── 先扫一遍全文,统计 run 字号众数作为「正文基准」──
    let mut sz_hist: HashMap<i64, usize> = HashMap::new();
    count_sizes(&body, &mut sz_hist);
    let base_pt = sz_hist
        .iter()
        .max_by_key(|(sz, n)| (*n, std::cmp::Reverse(**sz)))
        .map(|(sz, _)| *sz as f64 / 2.0)
        .unwrap_or(12.0);

    // ── 逐块转换 ──
    let mut blocks: Vec<Value> = Vec::new();
    let mut got_title = false;
    let mut img_seq = 0usize;
    let img_root = match img_dir {
        Some(d) => std::path::PathBuf::from(d),
        None => std::path::Path::new(path)
            .parent()
            .unwrap_or_else(|| std::path::Path::new("."))
            .join("img"),
    };
    // 待抽取的图片(rId → 落盘绝对路径),扫完段落再统一从 zip 里取字节
    let mut want_media: Vec<(String, std::path::PathBuf)> = Vec::new();

    let mut font_hist: HashMap<String, usize> = HashMap::new();

    for node in &body.kids {
        match node.name.as_str() {
            "w:p" => {
                let p = scan_para(node, &numfmt_of);
                for f in &p.fonts {
                    *font_hist.entry(f.clone()).or_default() += 1;
                }
                if p.page_break {
                    blocks.push(json!({ "type": "pagebreak" }));
                }
                // 图片段:一个 drawing 一个 image 块
                if !p.images.is_empty() {
                    for rid in &p.images {
                        let Some(target) = rel_target.get(rid) else {
                            warnings.push(format!("图片关系 {rid} 找不到目标,已跳过"));
                            continue;
                        };
                        img_seq += 1;
                        let ext = std::path::Path::new(target)
                            .extension()
                            .and_then(|e| e.to_str())
                            .unwrap_or("png");
                        let dst = img_root.join(format!("img{img_seq}.{ext}"));
                        want_media.push((format!("word/{target}"), dst.clone()));
                        let mut b = Map::new();
                        b.insert("type".into(), json!("image"));
                        b.insert("src".into(), json!(dst.to_string_lossy()));
                        b.insert("w".into(), json!(80));
                        let cap = p.text.trim();
                        if !cap.is_empty() {
                            b.insert("cap".into(), json!(cap));
                        }
                        blocks.push(Value::Object(b));
                    }
                    continue;
                }
                let raw = p.text.trim();
                if raw.is_empty() {
                    // 空段 + 下边框 = 分隔线;纯空段直接丢(Word 文档里空段满天飞)
                    if p.border_bottom {
                        blocks.push(json!({ "type": "hr" }));
                    }
                    continue;
                }
                blocks.push(classify(&p, raw, base_pt, &mut got_title));
            }
            "w:tbl" => blocks.push(table_block(node, &numfmt_of)),
            _ => {}
        }
    }

    // ── 图片落盘 ──
    if !want_media.is_empty() {
        let _ = std::fs::create_dir_all(&img_root);
        for (src, dst) in &want_media {
            match zip.by_name(src) {
                Ok(mut e) => {
                    let mut buf = Vec::new();
                    if e.read_to_end(&mut buf).is_ok() {
                        if let Err(err) = std::fs::write(dst, &buf) {
                            warnings.push(format!("图片写盘失败 {}: {err}", dst.display()));
                        }
                    }
                }
                Err(_) => warnings.push(format!("包内找不到 {src}")),
            }
        }
    }

    // ── 页面设置 ──
    let mut page = Map::new();
    if let Some(sect) = body.child("w:sectPr") {
        if let Some(sz) = sect.child("w:pgSz") {
            let w: f64 = sz.attr("w:w").and_then(|v| v.parse().ok()).unwrap_or(11906.0);
            // letter(12240 twips)与 a4(11906)差得远,阈值取中点足够分辨
            page.insert("size".into(), json!(if w > 12000.0 { "letter" } else { "a4" }));
        }
        if let Some(m) = sect.child("w:pgMar") {
            let mm = |k: &str, d: f64| -> f64 {
                m.attr(k)
                    .and_then(|v| v.parse::<f64>().ok())
                    .map(|tw| (tw / 56.6929 * 10.0).round() / 10.0)
                    .unwrap_or(d)
            };
            page.insert("mt".into(), json!(mm("w:top", 25.4)));
            page.insert("mr".into(), json!(mm("w:right", 31.7)));
            page.insert("mb".into(), json!(mm("w:bottom", 25.4)));
            page.insert("ml".into(), json!(mm("w:left", 31.7)));
        }
        // 页眉/页脚文字:PAGE 域还原成 `{page}` 占位(不还原就变成死数字「1」)
        for (rel_ty, key) in [("headerReference", "header"), ("footerReference", "footer")] {
            let tag = format!("w:{rel_ty}");
            let Some(rid) = sect.children(&tag).next().and_then(|h| h.attr("r:id")) else {
                continue;
            };
            let Some(target) = rel_target.get(rid) else {
                continue;
            };
            if let Some(x) = read(&mut zip, &format!("word/{target}")) {
                if let Ok(n) = parse_xml(&x) {
                    let t = hf_text(&n);
                    if !t.trim().is_empty() {
                        page.insert(key.into(), json!(t.trim()));
                    }
                }
            }
        }
    }

    // 主题按正文字体猜(猜错也只是外观,块结构不受影响)
    let top_font = font_hist
        .into_iter()
        .max_by_key(|(_, n)| *n)
        .map(|(f, _)| f)
        .unwrap_or_default();
    let theme = if top_font.contains("宋") || top_font.contains("Song") {
        "songti"
    } else if top_font.contains("楷") {
        "kaiti"
    } else {
        "qingjiao"
    };

    if blocks.is_empty() {
        return Err("文档里没有可识别的内容(可能是纯图片扫描件)".into());
    }

    let mut spec = Map::new();
    spec.insert("version".into(), json!(1));
    spec.insert("theme".into(), json!(theme));
    if !page.is_empty() {
        spec.insert("page".into(), Value::Object(page));
    }
    spec.insert("blocks".into(), Value::Array(blocks.clone()));

    Ok(json!({
        "ok": true,
        "src": path,
        "blocks": blocks.len(),
        "images": img_seq,
        "base_pt": base_pt,
        "spec": Value::Object(spec),
        "warnings": warnings,
    }))
}

/// 页眉/页脚里的文字,PAGE 域 → `{page}`
fn hf_text(n: &Node) -> String {
    let mut out = String::new();
    let mut pending_field = false;
    let mut in_result = false;
    walk_hf(n, &mut out, &mut pending_field, &mut in_result);
    out
}

fn walk_hf(n: &Node, out: &mut String, is_page_field: &mut bool, in_result: &mut bool) {
    for k in &n.kids {
        match k.name.as_str() {
            "w:instrText" => {
                if k.all_text().to_ascii_uppercase().contains("PAGE") {
                    *is_page_field = true;
                }
            }
            "w:fldChar" => match k.attr("w:fldCharType") {
                Some("separate") => {
                    if *is_page_field {
                        out.push_str("{page}");
                        *in_result = true;
                    }
                }
                Some("end") => {
                    *is_page_field = false;
                    *in_result = false;
                }
                _ => {}
            },
            "w:t" => {
                if !*in_result {
                    out.push_str(&k.all_text());
                }
            }
            _ => walk_hf(k, out, is_page_field, in_result),
        }
    }
}

fn count_sizes(n: &Node, hist: &mut HashMap<i64, usize>) {
    if n.name == "w:r" {
        let has_text = n.children("w:t").any(|t| !t.all_text().trim().is_empty());
        if has_text {
            if let Some(sz) = n
                .child("w:rPr")
                .and_then(|p| p.child("w:sz"))
                .and_then(|s| s.attr("w:val"))
                .and_then(|v| v.parse::<i64>().ok())
            {
                *hist.entry(sz).or_default() += 1;
            }
        }
    }
    for k in &n.kids {
        count_sizes(k, hist);
    }
}

/// 启发式判块。顺序即优先级,前面的规则更「确定」。
fn classify(p: &Para, raw: &str, base_pt: f64, got_title: &mut bool) -> Value {
    let sz = p.sz_pt.unwrap_or(base_pt);
    let centered = p.jc == "center";
    let mut b = Map::new();

    // 0) 行首装饰符已在 scan_para 剥出来了,它是最直白的意图声明
    match p.lead_mark.as_str() {
        "·" | "•" | "●" | "▪" | "‧" => {
            b.insert("type".into(), json!("bullet"));
            b.insert("text".into(), json!(raw));
            return Value::Object(b);
        }
        "■" | "◆" | "▍" | "▎" => {
            b.insert("type".into(), json!("h1"));
            b.insert("text".into(), json!(raw));
            return Value::Object(b);
        }
        _ => {}
    }
    // 1) numbering 是最硬的信号(Word 自己就这么标的)
    if let Some(fmt) = &p.numfmt {
        b.insert("type".into(), json!(if fmt == "bullet" { "bullet" } else { "num" }));
        b.insert("text".into(), json!(raw));
        return Value::Object(b);
    }
    // 2) 居中 + 显著大字 = 大标题;居中 + 略大 = 副标题
    if centered && sz >= base_pt * 1.35 && !*got_title {
        *got_title = true;
        b.insert("type".into(), json!("title"));
        b.insert("text".into(), json!(raw));
        return Value::Object(b);
    }
    if centered && sz > base_pt * 1.05 {
        b.insert("type".into(), json!("subtitle"));
        b.insert("text".into(), json!(strip_dash(raw)));
        return Value::Object(b);
    }
    // 3) 行首方块/中文序号 → 一级标题(text 里绝不保留「■」,导出时渲染器会再加)
    if let Some(rest) = strip_h1_mark(raw) {
        b.insert("type".into(), json!("h1"));
        b.insert("text".into(), json!(rest));
        return Value::Object(b);
    }
    if starts_cn_section(raw) && (p.all_bold || sz > base_pt) {
        b.insert("type".into(), json!("h1"));
        b.insert("text".into(), json!(raw));
        return Value::Object(b);
    }
    // 4) 加粗 + 明显大字 → h1
    if p.all_bold && sz >= base_pt * 1.2 {
        b.insert("type".into(), json!("h1"));
        b.insert("text".into(), json!(raw));
        return Value::Object(b);
    }
    // 5) 「（1）/ 1. / ①」+ 加粗或稍大 → h2
    if starts_sub_section(raw) && (p.all_bold || sz > base_pt) {
        b.insert("type".into(), json!("h2"));
        b.insert("text".into(), json!(raw));
        return Value::Object(b);
    }
    // 6) 行首项目符号 → bullet(符号去掉)
    if let Some(rest) = strip_bullet(raw) {
        b.insert("type".into(), json!("bullet"));
        b.insert("text".into(), json!(rest));
        return Value::Object(b);
    }
    // 7) 底色 = 提示框;左竖线 = 引文(视觉语义最强的两个)
    if p.shaded {
        b.insert("type".into(), json!("callout"));
        b.insert("text".into(), json!(raw));
        return Value::Object(b);
    }
    if p.border_left_only {
        b.insert("type".into(), json!("quote"));
        b.insert("text".into(), json!(raw));
        return Value::Object(b);
    }
    // 8) 短的整段加粗 → 三级标题(长句加粗多半只是强调,不是标题)
    if p.all_bold && raw.chars().count() <= 30 && !raw.ends_with('。') {
        b.insert("type".into(), json!("h3"));
        b.insert("text".into(), json!(raw));
        return Value::Object(b);
    }
    // 9) 其余都是正文;有无首行缩进决定 indent
    b.insert("type".into(), json!("p"));
    b.insert("text".into(), json!(raw));
    if !p.first_line {
        b.insert("indent".into(), json!("none"));
    }
    if !p.jc.is_empty() && p.jc != "left" && p.jc != "both" {
        b.insert("align".into(), json!(p.jc.clone()));
    }
    Value::Object(b)
}

/// 副标题常写成「——xxx」,破折号是装饰不是内容,但去掉会丢原貌 → 原样保留。
/// (留个函数是为了标明这里**故意**不动,免得后人再来「优化」一次。)
fn strip_dash(s: &str) -> String {
    s.to_string()
}

fn table_block(tbl: &Node, numfmt_of: &HashMap<String, String>) -> Value {
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut head_bold_all = true;
    let mut grid: Vec<f64> = tbl
        .child("w:tblGrid")
        .map(|g| {
            g.children("w:gridCol")
                .filter_map(|c| c.attr("w:w").and_then(|v| v.parse::<f64>().ok()))
                .collect()
        })
        .unwrap_or_default();

    for (ri, tr) in tbl.children("w:tr").enumerate() {
        let mut row: Vec<String> = Vec::new();
        for tc in tr.children("w:tc") {
            // 单元格里多个段落合成一格,用 \n 连 —— 导出端会再拆回多段(往返对称)
            let mut parts: Vec<String> = Vec::new();
            for p in tc.children("w:p") {
                let info = scan_para(p, numfmt_of);
                if ri == 0 && !info.text.trim().is_empty() && !info.all_bold {
                    head_bold_all = false;
                }
                let t = info.text.trim().to_string();
                if !t.is_empty() {
                    parts.push(t);
                }
            }
            // 合并单元格(gridSpan)会让列数对不上;补空格占位保证行长一致
            let span = tc
                .child("w:tcPr")
                .and_then(|p| p.child("w:gridSpan"))
                .and_then(|s| s.attr("w:val"))
                .and_then(|v| v.parse::<usize>().ok())
                .unwrap_or(1);
            row.push(parts.join("\n"));
            for _ in 1..span {
                row.push(String::new());
            }
        }
        if !row.is_empty() {
            rows.push(row);
        }
    }
    let cols = rows.iter().map(|r| r.len()).max().unwrap_or(0);
    for r in rows.iter_mut() {
        while r.len() < cols {
            r.push(String::new());
        }
    }
    grid.truncate(cols);
    let mut b = Map::new();
    b.insert("type".into(), json!("table"));
    b.insert("head0".into(), json!(head_bold_all && rows.len() > 1));
    if grid.len() == cols && cols > 0 && grid.iter().sum::<f64>() > 0.0 {
        b.insert("widths".into(), json!(grid));
    }
    b.insert("rows".into(), json!(rows));
    Value::Object(b)
}

// ───────────────────────── 测试 ─────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn xml_parser_handles_attrs_selfclose_entities() {
        let n = parse_xml(r#"<a x="1" y='2'><b/><c>&lt;hi&amp;&gt;</c></a>"#).unwrap();
        assert_eq!(n.name, "a");
        assert_eq!(n.attr("x"), Some("1"));
        assert_eq!(n.attr("y"), Some("2"));
        assert_eq!(n.kids.len(), 2);
        assert_eq!(n.child("c").unwrap().all_text(), "<hi&>");
    }

    #[test]
    fn omml_to_latex_covers_subset() {
        let frac = parse_xml("<m:f><m:num><m:r><m:t>a</m:t></m:r></m:num><m:den><m:r><m:t>b</m:t></m:r></m:den></m:f>").unwrap();
        assert_eq!(omml_node(&frac), "\\frac{a}{b}");
        let sup = parse_xml("<m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup>").unwrap();
        assert_eq!(omml_node(&sup), "x^2");
        let rad = parse_xml("<m:rad><m:radPr><m:degHide m:val=\"1\"/></m:radPr><m:deg/><m:e><m:r><m:t>2</m:t></m:r></m:e></m:rad>").unwrap();
        assert_eq!(omml_node(&rad), "\\sqrt{2}");
    }

    #[test]
    fn section_heuristics() {
        assert!(starts_cn_section("一、教学目标"));
        assert!(starts_cn_section("十、板书设计"));
        assert!(!starts_cn_section("一个苹果"));
        assert!(starts_sub_section("（1）先求导"));
        assert!(starts_sub_section("1. 先求导"));
        assert!(starts_sub_section("①先求导"));
        // 真教案里的写法:右括号在标题末尾,不紧跟数字
        assert!(starts_sub_section("（1. 知识与技能）"));
        assert!(!starts_sub_section("先求导"));
        assert_eq!(strip_bullet("· 要点").as_deref(), Some("要点"));
        assert_eq!(strip_h1_mark("■ 六、教学过程").as_deref(), Some("六、教学过程"));
    }

    /// 往返:spec → docx → spec,块数与文字不能塌掉。
    #[test]
    fn roundtrip_does_not_panic_and_keeps_text() {
        let spec = json!({
            "theme": "qingjiao",
            "blocks": [
                { "type": "title", "text": "圆锥曲线" },
                { "type": "h1", "text": "教学重点" },
                { "type": "p", "text": "重点是 $x^2+y^2=r^2$ 的应用。" },
                { "type": "bullet", "text": "理解定义" },
                { "type": "num", "text": "会算离心率" },
                { "type": "table", "rows": [["A", "B"], ["1", "2"]] }
            ]
        })
        .to_string();
        let dir = std::env::temp_dir().join("polaris_docx_test");
        let _ = std::fs::create_dir_all(&dir);
        let f1 = dir.join("rt1.docx");
        crate::forge::docx_native::build_docx_from_spec(&spec, f1.to_str().unwrap()).unwrap();
        let back = docx_to_spec(f1.to_str().unwrap(), None).unwrap();
        let s2 = back["spec"].clone();
        assert!(s2["blocks"].as_array().unwrap().len() >= 5, "块塌了: {s2}");
        let txt = s2.to_string();
        for want in ["圆锥曲线", "教学重点", "理解定义", "会算离心率"] {
            assert!(txt.contains(want), "「{want}」丢了");
        }
        // 再导出一次不能 panic / 报错
        let f2 = dir.join("rt2.docx");
        crate::forge::docx_native::build_docx_from_spec(&s2.to_string(), f2.to_str().unwrap())
            .unwrap();
        assert!(f2.is_file());
    }
}

//! polaris.doc.json(Word 教案 spec)→ 原生可编辑 `.docx`,纯 Rust 直写 OOXML。
//!
//! 与 `pptx_native.rs` 同构的一条路:零浏览器、零 Python、零新依赖(只用已在 Cargo.toml 的
//! `zip` + `serde_json` + `image`),Docker slim / mac / win 三平台恒可用。
//!
//! **契约真源**:`docs/DOC_SPEC.md`;**权威实现**:`src/lib/docSpec.ts`。
//! 本文件的 THEMES 表、块语义、行内标记规则逐字段抄自前端 —— 铁律是「预览即导出」,
//! 预览一个样、导出 .docx 另一个样是不可接受的回归。改这里必须同步改 docSpec.ts。
//!
//! 单位换算(DOC_SPEC §6,写 OOXML 时反复用):
//!   * `w:sz` = 磅 × 2(半磅制)
//!   * twips  = 磅 × 20;1 毫米 = 56.6929 twips
//!   * EMU    = 磅 × 12700(= twips × 635),图片尺寸用
//!   * 行距   = `w:line = 行距倍数 × 正文磅 × 20`,配 `w:lineRule="auto"`
//!
//! **踩过的坑(Word 对畸形包零容忍,一个坏字符整份打不开)**:
//!   1. 文本必须过 `xml_escape` —— 它同时滤掉 <0x20 的非法控制字符。模型写的 spec 里
//!      混进  之类是常事,不滤就是「Word 提示文件已损坏」。
//!   2. `w:t` 一律带 `xml:space="preserve"`,否则行首/行尾空格被吃掉(「· 」这种前缀最明显)。
//!   3. bullet/num 的符号**绝不写进文字**,走 numbering.xml —— 写进去的话用户在 Word 里
//!      回车换行会得到「··」两个点。
//!   4. `[Content_Types].xml` 里 png/jpeg 的 Default 声明必须与实际落包的扩展名一致
//!      (按魔数认,不信文件后缀)。

use serde_json::{json, Value};
use std::io::Write;
use zip::write::SimpleFileOptions;

use crate::forge::pptx::{xml_decl, xml_escape};

// ───────────────────────── 命名空间 ─────────────────────────

const NS_W: &str = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const NS_R: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_M: &str = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const NS_WP: &str = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const NS_A: &str = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_PIC: &str = "http://schemas.openxmlformats.org/drawingml/2006/picture";
const NS_CT: &str = "http://schemas.openxmlformats.org/package/2006/content-types";
const NS_REL: &str = "http://schemas.openxmlformats.org/package/2006/relationships";
const NS_RT: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/// 单份文档块数上限:防模型抽风写出百万块把内存吃干(与 pptx 侧 MAX_SLIDES 同思路)。
const MAX_BLOCKS: usize = 5000;

// ───────────────────────── 主题(逐字段对齐 docSpec.ts 的 DOC_THEMES) ─────────────────────────

pub struct DocTheme {
    pub id: &'static str,
    pub name: &'static str,
    /// 正文中文字体 / 标题中文字体
    pub font: &'static str,
    pub head_font: &'static str,
    pub ink: &'static str,
    pub accent: &'static str,
    pub muted: &'static str,
    pub line: &'static str,
    /// callout / 表头底色
    pub soft: &'static str,
    pub sz_title: f64,
    pub sz_subtitle: f64,
    pub sz_h1: f64,
    pub sz_h2: f64,
    pub sz_h3: f64,
    pub sz_body: f64,
    /// 正文行距倍数
    pub lh: f64,
}

pub const DOC_THEMES: &[DocTheme] = &[
    DocTheme {
        id: "qingjiao",
        name: "青教赛范式",
        font: "微软雅黑",
        head_font: "微软雅黑",
        ink: "#000000",
        accent: "#2C4661",
        muted: "#5A5A5A",
        line: "#BFBFBF",
        soft: "#F2F5F8",
        sz_title: 23.0,
        sz_subtitle: 14.0,
        sz_h1: 15.0,
        sz_h2: 12.5,
        sz_h3: 12.0,
        sz_body: 12.0,
        lh: 1.6,
    },
    DocTheme {
        id: "songti",
        name: "公文宋体",
        font: "宋体",
        head_font: "黑体",
        ink: "#000000",
        accent: "#8C2B2B",
        muted: "#555555",
        line: "#C8C8C8",
        soft: "#F7F3F0",
        sz_title: 22.0,
        sz_subtitle: 14.0,
        sz_h1: 16.0,
        sz_h2: 14.0,
        sz_h3: 12.0,
        sz_body: 12.0,
        lh: 1.75,
    },
    DocTheme {
        id: "kaiti",
        name: "楷体清雅",
        font: "楷体",
        head_font: "微软雅黑",
        ink: "#1A1A1A",
        accent: "#3E6B4F",
        muted: "#606060",
        line: "#CFD8D2",
        soft: "#F1F6F2",
        sz_title: 22.0,
        sz_subtitle: 14.0,
        sz_h1: 15.0,
        sz_h2: 13.0,
        sz_h3: 12.0,
        sz_body: 12.0,
        lh: 1.7,
    },
    DocTheme {
        id: "modern",
        name: "现代蓝",
        font: "微软雅黑",
        head_font: "微软雅黑",
        ink: "#1F2937",
        accent: "#2563EB",
        muted: "#6B7280",
        line: "#D6DDE8",
        soft: "#EFF4FF",
        sz_title: 24.0,
        sz_subtitle: 13.5,
        sz_h1: 15.0,
        sz_h2: 13.0,
        sz_h3: 12.0,
        sz_body: 11.5,
        lh: 1.65,
    },
    DocTheme {
        id: "warm",
        name: "暖橘手账",
        font: "微软雅黑",
        head_font: "微软雅黑",
        ink: "#33302C",
        accent: "#C2643A",
        muted: "#7A736B",
        line: "#E2D6C9",
        soft: "#FBF3EA",
        sz_title: 23.0,
        sz_subtitle: 14.0,
        sz_h1: 15.0,
        sz_h2: 13.0,
        sz_h3: 12.0,
        sz_body: 12.0,
        lh: 1.7,
    },
];

/// 取主题;未知 id 回退第一个(与 docSpec.ts 的 docTheme 同语义)。
pub fn doc_theme(id: &str) -> &'static DocTheme {
    DOC_THEMES
        .iter()
        .find(|t| t.id == id)
        .unwrap_or(&DOC_THEMES[0])
}

// ───────────────────────── 单位 ─────────────────────────

/// 毫米 → twips(1mm = 56.6929 twips,DOC_SPEC §6 硬性规定的换算常数)。
fn mm2tw(mm: f64) -> i64 {
    (mm * 56.6929).round() as i64
}
/// 磅 → twips
fn pt2tw(pt: f64) -> i64 {
    (pt * 20.0).round() as i64
}
/// 磅 → 半磅(w:sz)。字号可能是 12.5 这种半磅值,所以先 ×2 再取整才不丢精度。
fn pt2hp(pt: f64) -> i64 {
    (pt * 2.0).round().max(2.0) as i64
}
/// twips → EMU(1 twip = 635 EMU)
fn tw2emu(tw: i64) -> i64 {
    tw * 635
}

/// 纸张尺寸(毫米)。与 docSpec.ts 的 PAGE_SIZES 一致。
fn page_size_mm(size: &str) -> (f64, f64) {
    match size {
        "letter" => (215.9, 279.4),
        _ => (210.0, 297.0),
    }
}

/// `#RRGGBB` / 主题色词 → OOXML 的 6 位裸十六进制(不带 #)。认不出返回 None。
fn ooxml_color(v: &str, t: &DocTheme) -> Option<String> {
    let raw = match v {
        "" => return None,
        "ink" => t.ink,
        "accent" => t.accent,
        "muted" => t.muted,
        "line" => t.line,
        "soft" => t.soft,
        other => other,
    };
    let h = raw.trim_start_matches('#');
    // 支持 #RGB 简写(前端 CSS 允许),展开成 6 位
    let h = if h.len() == 3 {
        h.chars().flat_map(|c| [c, c]).collect::<String>()
    } else {
        h.to_string()
    };
    if h.len() >= 6 && h[..6].chars().all(|c| c.is_ascii_hexdigit()) {
        Some(h[..6].to_ascii_uppercase())
    } else {
        None
    }
}

fn hex(v: &str) -> String {
    v.trim_start_matches('#').to_ascii_uppercase()
}

fn s_str<'a>(v: &'a Value, k: &str) -> &'a str {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("")
}
fn s_f64(v: &Value, k: &str) -> Option<f64> {
    v.get(k).and_then(|x| x.as_f64())
}
fn s_bool(v: &Value, k: &str) -> bool {
    v.get(k).and_then(|x| x.as_bool()).unwrap_or(false)
}

// ───────────────────────── 行内标记 → run 片段 ─────────────────────────

/// 一个行内片段(= 一个 `w:r`,或一段 `m:oMath`)。
/// 故意不做富文本树:spec 的叶子必须是 string(点字直改的地基),标记就写在文字里。
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Seg {
    pub text: String,
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub strike: bool,
    /// 等宽代码(`` `x` ``)
    pub code: bool,
    /// text 是 LaTeX 源码(`$x^2$`),导出走 OMML
    pub math: bool,
}

/// 行内标记解析。**顺序必须与 docSpec.ts 的 inlineHtml 完全一致**:
/// 先切出 `` `code` `` 与 `$math$`(内部不再解析),再依次 `**` → `__` → `~~` → `*`。
/// 三端规则不一致 = 预览与导出显示不同 = 回归。
pub fn parse_inline(src: &str) -> Vec<Seg> {
    let ch: Vec<char> = src.chars().collect();
    let mut out: Vec<Seg> = Vec::new();
    let mut buf = String::new();
    let mut i = 0usize;
    while i < ch.len() {
        // `code` —— JS 的 /`[^`]*`/ 允许空内容,这里同样允许
        if ch[i] == '`' {
            if let Some(j) = (i + 1..ch.len()).find(|&k| ch[k] == '`') {
                flush_markers(&mut buf, &mut out);
                out.push(Seg {
                    text: ch[i + 1..j].iter().collect(),
                    code: true,
                    ..Default::default()
                });
                i = j + 1;
                continue;
            }
        }
        // $math$ —— JS 的 /\$[^$\n]+\$/:内容非空且不跨行
        if ch[i] == '$' {
            let mut j = i + 1;
            while j < ch.len() && ch[j] != '$' && ch[j] != '\n' {
                j += 1;
            }
            if j < ch.len() && ch[j] == '$' && j > i + 1 {
                flush_markers(&mut buf, &mut out);
                out.push(Seg {
                    text: ch[i + 1..j].iter().collect(),
                    math: true,
                    ..Default::default()
                });
                i = j + 1;
                continue;
            }
        }
        buf.push(ch[i]);
        i += 1;
    }
    flush_markers(&mut buf, &mut out);
    out.retain(|s| !s.text.is_empty() || s.code);
    out
}

fn flush_markers(buf: &mut String, out: &mut Vec<Seg>) {
    if buf.is_empty() {
        return;
    }
    let taken = std::mem::take(buf);
    parse_markers(&taken, out);
}

/// `**粗** __下划线__ ~~删除~~ *斜*` 的左到右单遍扫描。
/// 不支持嵌套 —— 与 JS 侧的 `[^*]+` 一类正则等价(它们同样不能嵌套)。
fn parse_markers(s: &str, out: &mut Vec<Seg>) {
    let ch: Vec<char> = s.chars().collect();
    let mut plain = String::new();
    let mut i = 0usize;
    // (开闭标记, 标记长度, 设置哪个属性)
    let marks: [(&str, usize, u8); 4] = [("**", 2, 0), ("__", 2, 2), ("~~", 2, 3), ("*", 1, 1)];
    'outer: while i < ch.len() {
        for (tok, len, kind) in marks {
            let t: Vec<char> = tok.chars().collect();
            if i + len <= ch.len() && ch[i..i + len] == t[..] {
                // `*斜*` 的内容不含 `*` 也不跨行;`**粗**` 的内容不含 `*`(与 JS 正则一致)
                let bad: &[char] = match kind {
                    0 | 1 => &['*'],
                    2 => &['_'],
                    _ => &['~'],
                };
                let mut j = i + len;
                let start = j;
                while j + len <= ch.len() {
                    if ch[j..j + len] == t[..] {
                        break;
                    }
                    if bad.contains(&ch[j]) || (kind == 1 && ch[j] == '\n') {
                        j = ch.len(); // 内容里混进禁用字符 → 本标记不成立
                        break;
                    }
                    j += 1;
                }
                if j + len <= ch.len() && j > start && ch[j..j + len] == t[..] {
                    if !plain.is_empty() {
                        out.push(Seg {
                            text: std::mem::take(&mut plain),
                            ..Default::default()
                        });
                    }
                    let mut seg = Seg {
                        text: ch[start..j].iter().collect(),
                        ..Default::default()
                    };
                    match kind {
                        0 => seg.bold = true,
                        1 => seg.italic = true,
                        2 => seg.underline = true,
                        _ => seg.strike = true,
                    }
                    out.push(seg);
                    i = j + len;
                    continue 'outer;
                }
            }
        }
        plain.push(ch[i]);
        i += 1;
    }
    if !plain.is_empty() {
        out.push(Seg {
            text: plain,
            ..Default::default()
        });
    }
}

// ───────────────────────── LaTeX → OMML(DOC_SPEC §3 子集) ─────────────────────────

/// 常见 LaTeX 符号 → Unicode。覆盖教案里真会出现的那些;认不出的原样输出成文字
/// (降级成纯文本 run,绝不吞掉内容 —— 公式渲染不出来是遗憾,内容丢了是事故)。
fn tex_symbol(name: &str) -> Option<&'static str> {
    Some(match name {
        "times" => "×",
        "div" => "÷",
        "pm" => "±",
        "mp" => "∓",
        "cdot" => "·",
        "cdots" => "⋯",
        "ldots" | "dots" => "…",
        "le" | "leq" => "≤",
        "ge" | "geq" => "≥",
        "ne" | "neq" => "≠",
        "approx" => "≈",
        "equiv" => "≡",
        "to" | "rightarrow" => "→",
        "leftarrow" => "←",
        "Rightarrow" => "⇒",
        "Leftrightarrow" => "⇔",
        "infty" => "∞",
        "in" => "∈",
        "notin" => "∉",
        "subset" => "⊂",
        "subseteq" => "⊆",
        "cup" => "∪",
        "cap" => "∩",
        "varnothing" | "emptyset" => "∅",
        "forall" => "∀",
        "exists" => "∃",
        "angle" => "∠",
        "perp" => "⊥",
        "parallel" => "∥",
        "degree" | "circ" => "°",
        "alpha" => "α",
        "beta" => "β",
        "gamma" => "γ",
        "delta" => "δ",
        "Delta" => "Δ",
        "epsilon" | "varepsilon" => "ε",
        "theta" => "θ",
        "lambda" => "λ",
        "mu" => "μ",
        "pi" => "π",
        "rho" => "ρ",
        "sigma" => "σ",
        "Sigma" => "Σ",
        "tau" => "τ",
        "phi" | "varphi" => "φ",
        "omega" => "ω",
        "Omega" => "Ω",
        "quad" | "qquad" | "," | ";" | "!" | " " => " ",
        _ => return None,
    })
}

const TEX_FUNCS: &[&str] = &[
    "sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos", "arctan", "log", "ln", "lg",
    "exp", "lim", "max", "min", "gcd", "det",
];

/// 重音符 `\vec{}` `\bar{}` … → OMML `m:acc` 的 chr
fn tex_accent(name: &str) -> Option<&'static str> {
    Some(match name {
        "vec" => "\u{20D7}",
        "bar" | "overline" => "\u{0304}",
        "hat" | "widehat" => "\u{0302}",
        "tilde" => "\u{0303}",
        "dot" => "\u{0307}",
        "ddot" => "\u{0308}",
        _ => return None,
    })
}

struct Tex {
    ch: Vec<char>,
    i: usize,
}

impl Tex {
    fn new(s: &str) -> Self {
        Tex {
            ch: s.chars().collect(),
            i: 0,
        }
    }
    fn peek(&self) -> Option<char> {
        self.ch.get(self.i).copied()
    }
    /// 读一个「组」:`{...}` 里的内容(平衡括号),否则单个 token。返回其 OMML。
    fn group(&mut self) -> String {
        self.skip_ws();
        if self.peek() == Some('{') {
            let start = self.i + 1;
            let mut depth = 1;
            let mut j = start;
            while j < self.ch.len() {
                match self.ch[j] {
                    '{' => depth += 1,
                    '}' => {
                        depth -= 1;
                        if depth == 0 {
                            break;
                        }
                    }
                    _ => {}
                }
                j += 1;
            }
            let inner: String = self.ch[start..j.min(self.ch.len())].iter().collect();
            self.i = (j + 1).min(self.ch.len());
            latex_to_omml_body(&inner)
        } else {
            self.atom()
        }
    }
    fn skip_ws(&mut self) {
        while matches!(self.peek(), Some(c) if c == ' ' || c == '\t') {
            self.i += 1;
        }
    }
    /// 读命令名(`\` 已消费)
    fn cmd_name(&mut self) -> String {
        let start = self.i;
        while matches!(self.peek(), Some(c) if c.is_ascii_alphabetic()) {
            self.i += 1;
        }
        if self.i == start {
            // `\,` `\;` `\{` 这类单字符命令
            if self.i < self.ch.len() {
                self.i += 1;
            }
        }
        self.ch[start..self.i].iter().collect()
    }

    /// 读一个原子(不含随后的 ^ / _)。
    fn atom(&mut self) -> String {
        self.skip_ws();
        let Some(c) = self.peek() else {
            return String::new();
        };
        if c == '{' {
            return self.group();
        }
        if c == '\\' {
            self.i += 1;
            let name = self.cmd_name();
            return self.command(&name);
        }
        self.i += 1;
        m_run(&c.to_string())
    }

    fn command(&mut self, name: &str) -> String {
        match name {
            "frac" | "dfrac" | "tfrac" => {
                let a = self.group();
                let b = self.group();
                format!("<m:f><m:fPr><m:type m:val=\"bar\"/></m:fPr><m:num>{a}</m:num><m:den>{b}</m:den></m:f>")
            }
            "sqrt" => {
                self.skip_ws();
                let deg = if self.peek() == Some('[') {
                    let start = self.i + 1;
                    let mut j = start;
                    while j < self.ch.len() && self.ch[j] != ']' {
                        j += 1;
                    }
                    let inner: String = self.ch[start..j].iter().collect();
                    self.i = (j + 1).min(self.ch.len());
                    Some(latex_to_omml_body(&inner))
                } else {
                    None
                };
                let e = self.group();
                match deg {
                    Some(d) => format!("<m:rad><m:deg>{d}</m:deg><m:e>{e}</m:e></m:rad>"),
                    None => format!("<m:rad><m:radPr><m:degHide m:val=\"1\"/></m:radPr><m:deg/><m:e>{e}</m:e></m:rad>"),
                }
            }
            "left" => {
                // \left( … \right)  → m:d
                self.skip_ws();
                let beg = self.peek().unwrap_or('(');
                self.i += 1;
                // 找配对的 \right
                let start = self.i;
                let mut depth = 0usize;
                let mut j = start;
                let mut endc = ')';
                while j < self.ch.len() {
                    if self.ch[j] == '\\' {
                        let rest: String = self.ch[j..].iter().take(6).collect();
                        if rest.starts_with("\\left") {
                            depth += 1;
                        } else if rest.starts_with("\\right") {
                            if depth == 0 {
                                endc = self.ch.get(j + 6).copied().unwrap_or(')');
                                break;
                            }
                            depth -= 1;
                        }
                    }
                    j += 1;
                }
                let inner: String = self.ch[start..j.min(self.ch.len())].iter().collect();
                self.i = (j + 7).min(self.ch.len());
                let e = latex_to_omml_body(&inner);
                let (b, en) = (norm_delim(beg), norm_delim(endc));
                format!(
                    "<m:d><m:dPr><m:begChr m:val=\"{}\"/><m:endChr m:val=\"{}\"/></m:dPr><m:e>{e}</m:e></m:d>",
                    xml_escape(&b),
                    xml_escape(&en)
                )
            }
            "sum" | "int" | "prod" | "oint" | "iint" | "bigcup" | "bigcap" => {
                let chr = match name {
                    "sum" => "∑",
                    "int" => "∫",
                    "iint" => "∬",
                    "oint" => "∮",
                    "prod" => "∏",
                    "bigcup" => "⋃",
                    _ => "⋂",
                };
                let (mut sub, mut sup) = (String::new(), String::new());
                loop {
                    self.skip_ws();
                    match self.peek() {
                        Some('_') if sub.is_empty() => {
                            self.i += 1;
                            sub = self.group();
                        }
                        Some('^') if sup.is_empty() => {
                            self.i += 1;
                            sup = self.group();
                        }
                        _ => break,
                    }
                }
                // nary 的被作用体 = 本序列剩下的全部(数学上正确,也是 Word 的写法)
                let rest: String = self.ch[self.i..].iter().collect();
                self.i = self.ch.len();
                let e = latex_to_omml_body(&rest);
                let hide_sub = if sub.is_empty() { "1" } else { "0" };
                let hide_sup = if sup.is_empty() { "1" } else { "0" };
                format!(
                    "<m:nary><m:naryPr><m:chr m:val=\"{}\"/><m:limLoc m:val=\"undOvr\"/><m:subHide m:val=\"{hide_sub}\"/><m:supHide m:val=\"{hide_sup}\"/></m:naryPr><m:sub>{sub}</m:sub><m:sup>{sup}</m:sup><m:e>{e}</m:e></m:nary>",
                    xml_escape(chr)
                )
            }
            n if tex_accent(n).is_some() => {
                let chr = tex_accent(n).unwrap();
                let e = self.group();
                format!(
                    "<m:acc><m:accPr><m:chr m:val=\"{}\"/></m:accPr><m:e>{e}</m:e></m:acc>",
                    xml_escape(chr)
                )
            }
            n if TEX_FUNCS.contains(&n) => {
                // m:func:函数名 + 作用体。`\lim_{x\to0}` 的下标挂在函数名上。
                // 函数名必须 m:sty="p"(正体),否则 Word 会按默认的数学斜体渲成
                // 「𝑠𝑖𝑛𝜃」三个变量相乘的样子 —— 数学上是错的。
                let mut fname = m_run_plain(n);
                self.skip_ws();
                if self.peek() == Some('_') {
                    self.i += 1;
                    let sub = self.group();
                    fname = format!("<m:sSub><m:e>{fname}</m:e><m:sub>{sub}</m:sub></m:sSub>");
                }
                let e = self.atom_with_scripts();
                format!("<m:func><m:fName>{fname}</m:fName><m:e>{e}</m:e></m:func>")
            }
            n => match tex_symbol(n) {
                Some(sym) => m_run(sym),
                // 认不出的命令 → 原样当文字(降级,不吞内容)
                None => m_run(&format!("\\{n}")),
            },
        }
    }

    /// 原子 + 紧随其后的上下标(`x^2` / `a_i` / `x_i^2`)
    fn atom_with_scripts(&mut self) -> String {
        let base = self.atom();
        self.scripts(base)
    }

    fn scripts(&mut self, base: String) -> String {
        self.skip_ws();
        match self.peek() {
            Some('^') => {
                self.i += 1;
                let sup = self.group();
                self.skip_ws();
                if self.peek() == Some('_') {
                    self.i += 1;
                    let sub = self.group();
                    format!("<m:sSubSup><m:e>{base}</m:e><m:sub>{sub}</m:sub><m:sup>{sup}</m:sup></m:sSubSup>")
                } else {
                    format!("<m:sSup><m:e>{base}</m:e><m:sup>{sup}</m:sup></m:sSup>")
                }
            }
            Some('_') => {
                self.i += 1;
                let sub = self.group();
                self.skip_ws();
                if self.peek() == Some('^') {
                    self.i += 1;
                    let sup = self.group();
                    format!("<m:sSubSup><m:e>{base}</m:e><m:sub>{sub}</m:sub><m:sup>{sup}</m:sup></m:sSubSup>")
                } else {
                    format!("<m:sSub><m:e>{base}</m:e><m:sub>{sub}</m:sub></m:sSub>")
                }
            }
            _ => base,
        }
    }
}

/// `\left\{` 这类带反斜杠的定界符归一成单字符
fn norm_delim(c: char) -> String {
    match c {
        '.' => " ".to_string(), // \left. = 不画
        c => c.to_string(),
    }
}

fn m_run(text: &str) -> String {
    format!(
        "<m:r><m:t xml:space=\"preserve\">{}</m:t></m:r>",
        xml_escape(text)
    )
}

/// 正体(非斜体)数学 run —— 函数名 `\sin` `\lim` 这类专用。
fn m_run_plain(text: &str) -> String {
    format!(
        "<m:r><m:rPr><m:sty m:val=\"p\"/></m:rPr><m:t xml:space=\"preserve\">{}</m:t></m:r>",
        xml_escape(text)
    )
}

/// LaTeX 片段 → OMML 内容(不含 `<m:oMath>` 外壳)。
fn latex_to_omml_body(tex: &str) -> String {
    let mut p = Tex::new(tex);
    let mut out = String::new();
    let mut guard = 0usize;
    while p.i < p.ch.len() {
        guard += 1;
        if guard > 20000 {
            break; // 死循环兜底:畸形输入不能把导出挂死
        }
        let before = p.i;
        let atom = p.atom_with_scripts();
        if p.i == before {
            p.i += 1; // 没吃进任何字符 → 强行推进,绝不空转
            continue;
        }
        out.push_str(&atom);
    }
    out
}

/// `$…$` 里的 LaTeX → 完整 `<m:oMath>`。
pub fn latex_to_omml(tex: &str) -> String {
    let body = latex_to_omml_body(tex);
    if body.is_empty() {
        return String::new();
    }
    format!("<m:oMath>{body}</m:oMath>")
}

// ───────────────────────── run / 段落 ─────────────────────────

/// 一段文字的公共排版属性(块级)。
#[derive(Clone)]
struct RunStyle {
    font: String,
    size_pt: f64,
    color: Option<String>,
    bold: bool,
    italic: bool,
}

fn run_props(st: &RunStyle, seg: &Seg) -> String {
    let mut s = String::from("<w:rPr>");
    let font = if seg.code { "Consolas" } else { &st.font };
    s.push_str(&format!(
        "<w:rFonts w:ascii=\"{f}\" w:hAnsi=\"{f}\" w:eastAsia=\"{f}\"/>",
        f = xml_escape(font)
    ));
    if st.bold || seg.bold {
        s.push_str("<w:b/>");
    }
    if st.italic || seg.italic {
        s.push_str("<w:i/>");
    }
    if seg.underline {
        s.push_str("<w:u w:val=\"single\"/>");
    }
    if seg.strike {
        s.push_str("<w:strike/>");
    }
    if let Some(c) = &st.color {
        s.push_str(&format!("<w:color w:val=\"{c}\"/>"));
    }
    s.push_str(&format!("<w:sz w:val=\"{}\"/>", pt2hp(st.size_pt)));
    s.push_str(&format!("<w:szCs w:val=\"{}\"/>", pt2hp(st.size_pt)));
    s.push_str("</w:rPr>");
    s
}

/// 文字 → 一串 `w:r`(公式段落变成 `m:oMath`)。
/// 换行符 `\n` 写成 `<w:br/>` —— 表格单元格里多段文字合并成一格时会用到。
fn runs_xml(text: &str, st: &RunStyle) -> String {
    let mut out = String::new();
    for seg in parse_inline(text) {
        if seg.math {
            let omml = latex_to_omml(&seg.text);
            if omml.is_empty() {
                // 公式解析不出东西 → 降级成纯文本 run,绝不留白
                out.push_str(&plain_run(&seg.text, st, &Seg::default()));
            } else {
                out.push_str(&omml);
            }
            continue;
        }
        out.push_str(&plain_run(&seg.text, st, &seg));
    }
    out
}

fn plain_run(text: &str, st: &RunStyle, seg: &Seg) -> String {
    let rpr = run_props(st, seg);
    let mut out = String::new();
    for (i, line) in text.split('\n').enumerate() {
        if i > 0 {
            out.push_str(&format!("<w:r>{rpr}<w:br/></w:r>"));
        }
        if line.is_empty() {
            continue;
        }
        out.push_str(&format!(
            "<w:r>{rpr}<w:t xml:space=\"preserve\">{}</w:t></w:r>",
            xml_escape(line)
        ));
    }
    out
}

/// 段落属性拼装。所有值都是**直接排版**(不靠 style 继承)——
/// 教案会被老师复制到别的模板里,带 style 依赖过去就全乱了。
#[allow(clippy::too_many_arguments)]
struct ParaOpt<'a> {
    jc: Option<&'a str>,
    before_pt: f64,
    after_pt: f64,
    line_mul: Option<f64>,
    body_pt: f64,
    /// 首行缩进(字符数)
    first_line_chars: f64,
    /// 整块左缩进(twips)
    ind_left: i64,
    hanging: i64,
    num_id: Option<u32>,
    /// 边框:(位置, 颜色, 粗细 1/8pt)
    borders: Vec<(&'a str, String, i64)>,
    shade: Option<String>,
    keep_next: bool,
}

impl<'a> Default for ParaOpt<'a> {
    fn default() -> Self {
        ParaOpt {
            jc: None,
            before_pt: 0.0,
            after_pt: 0.0,
            line_mul: None,
            body_pt: 12.0,
            first_line_chars: 0.0,
            ind_left: 0,
            hanging: 0,
            num_id: None,
            borders: Vec::new(),
            shade: None,
            keep_next: false,
        }
    }
}

fn para_props(o: &ParaOpt) -> String {
    let mut s = String::from("<w:pPr>");
    if let Some(n) = o.num_id {
        s.push_str(&format!(
            "<w:numPr><w:ilvl w:val=\"0\"/><w:numId w:val=\"{n}\"/></w:numPr>"
        ));
    }
    if !o.borders.is_empty() {
        s.push_str("<w:pBdr>");
        for (pos, color, sz) in &o.borders {
            s.push_str(&format!(
                "<w:{pos} w:val=\"single\" w:sz=\"{sz}\" w:space=\"4\" w:color=\"{color}\"/>"
            ));
        }
        s.push_str("</w:pBdr>");
    }
    if let Some(f) = &o.shade {
        s.push_str(&format!(
            "<w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"{f}\"/>"
        ));
    }
    let mut sp = format!(
        "<w:spacing w:before=\"{}\" w:after=\"{}\"",
        pt2tw(o.before_pt),
        pt2tw(o.after_pt)
    );
    if let Some(lm) = o.line_mul {
        sp.push_str(&format!(
            " w:line=\"{}\" w:lineRule=\"auto\"",
            pt2tw(lm * o.body_pt)
        ));
    }
    sp.push_str("/>");
    s.push_str(&sp);
    if o.ind_left != 0 || o.first_line_chars > 0.0 || o.hanging != 0 {
        let mut ind = format!("<w:ind w:left=\"{}\"", o.ind_left);
        if o.hanging != 0 {
            ind.push_str(&format!(" w:hanging=\"{}\"", o.hanging));
        } else if o.first_line_chars > 0.0 {
            // firstLineChars 是「百分之一个字符」,Word 按当前字号自动算 —— 中文排版
            // 「首行缩进 2 字符」必须用它,写死 twips 换主题字号后就不是 2 个字了。
            ind.push_str(&format!(
                " w:firstLineChars=\"{}\" w:firstLine=\"{}\"",
                (o.first_line_chars * 100.0).round() as i64,
                pt2tw(o.first_line_chars * o.body_pt)
            ));
        }
        ind.push_str("/>");
        s.push_str(&ind);
    }
    if let Some(j) = o.jc {
        s.push_str(&format!("<w:jc w:val=\"{j}\"/>"));
    }
    if o.keep_next {
        s.push_str("<w:keepNext/>");
    }
    s.push_str("</w:pPr>");
    s
}

/// spec 的 align 词 → OOXML 的 w:jc
fn jc_of(v: &str) -> Option<&'static str> {
    match v {
        "center" => Some("center"),
        "right" => Some("right"),
        "both" | "justify" => Some("both"),
        "left" => Some("left"),
        _ => None,
    }
}

// ───────────────────────── 图片 ─────────────────────────

struct DocImage {
    bytes: Vec<u8>,
    ext: &'static str,
    w: u32,
    h: u32,
}

/// 读图 + 按魔数嗅探格式 + 取原始尺寸。失败一律 Err,调用方降级成 warning,绝不中断导出。
fn load_image(path: &str) -> Result<DocImage, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("读不到 {path}: {e}"))?;
    if bytes.len() < 16 {
        return Err(format!("{path} 不像图片(仅 {} 字节)", bytes.len()));
    }
    let ext = if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        "png"
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "jpeg"
    } else {
        return Err(format!("{path} 既不是 PNG 也不是 JPEG,已跳过"));
    };
    let (w, h) = image::ImageReader::new(std::io::Cursor::new(&bytes))
        .with_guessed_format()
        .map_err(|e| format!("{path} 格式识别失败: {e}"))?
        .into_dimensions()
        .map_err(|e| format!("{path} 读尺寸失败: {e}"))?;
    if w == 0 || h == 0 {
        return Err(format!("{path} 尺寸为 0"));
    }
    Ok(DocImage { bytes, ext, w, h })
}

fn drawing_xml(rid: &str, id: u32, cx: i64, cy: i64) -> String {
    format!(
        "<w:r><w:drawing><wp:inline distT=\"0\" distB=\"0\" distL=\"0\" distR=\"0\">\
<wp:extent cx=\"{cx}\" cy=\"{cy}\"/><wp:effectExtent l=\"0\" t=\"0\" r=\"0\" b=\"0\"/>\
<wp:docPr id=\"{id}\" name=\"图片{id}\"/>\
<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect=\"1\"/></wp:cNvGraphicFramePr>\
<a:graphic><a:graphicData uri=\"{NS_PIC}\">\
<pic:pic><pic:nvPicPr><pic:cNvPr id=\"{id}\" name=\"图片{id}\"/><pic:cNvPicPr/></pic:nvPicPr>\
<pic:blipFill><a:blip r:embed=\"{rid}\"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>\
<pic:spPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"{cx}\" cy=\"{cy}\"/></a:xfrm>\
<a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></pic:spPr>\
</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>"
    )
}

// ───────────────────────── 主流程 ─────────────────────────

/// spec JSON 字符串 → `.docx`。返回 `{ok, out, blocks, theme, images, warnings}`。
pub fn build_docx_from_spec(spec_json: &str, out_path: &str) -> Result<Value, String> {
    let spec: Value =
        serde_json::from_str(spec_json).map_err(|e| format!("spec JSON 解析失败: {e}"))?;
    let blocks = spec
        .get("blocks")
        .and_then(|v| v.as_array())
        .ok_or("spec 缺 blocks 数组")?;
    if blocks.is_empty() {
        return Err("spec.blocks 为空,没有可生成的内容".into());
    }
    if blocks.len() > MAX_BLOCKS {
        return Err(format!("块数 {} 超过上限 {MAX_BLOCKS}", blocks.len()));
    }

    let mut warnings: Vec<String> = Vec::new();
    let requested = s_str(&spec, "theme");
    let th = doc_theme(requested);
    // 未知主题静默回退会让用户以为「换主题没生效」,与 pptx 侧同等待遇:出 warning。
    if !requested.is_empty() && th.id != requested {
        warnings.push(format!("未知主题 \"{requested}\",已回退 {}", th.name));
    }

    // ── 页面几何 ──
    let page = spec.get("page").cloned().unwrap_or(json!({}));
    let (pw_mm, ph_mm) = page_size_mm(s_str(&page, "size"));
    let mt = mm2tw(s_f64(&page, "mt").unwrap_or(25.4));
    let mr = mm2tw(s_f64(&page, "mr").unwrap_or(31.7));
    let mb = mm2tw(s_f64(&page, "mb").unwrap_or(25.4));
    let ml = mm2tw(s_f64(&page, "ml").unwrap_or(31.7));
    let pw = mm2tw(pw_mm);
    let ph = mm2tw(ph_mm);
    let body_tw = (pw - ml - mr).max(1000); // 正文可用宽,表格/图片按它算
    let header_txt = s_str(&page, "header").to_string();
    let footer_txt = s_str(&page, "footer").to_string();

    // ── 图片先载入(要先知道有没有图,才能决定 Content_Types 和 rels)──
    let mut media: Vec<DocImage> = Vec::new();
    let mut img_rid: Vec<Option<usize>> = Vec::with_capacity(blocks.len());
    for (i, b) in blocks.iter().enumerate() {
        if s_str(b, "type") != "image" {
            img_rid.push(None);
            continue;
        }
        let src = s_str(b, "src").trim();
        if src.is_empty() {
            img_rid.push(None);
            continue;
        }
        match load_image(src) {
            Ok(im) => {
                media.push(im);
                img_rid.push(Some(media.len() - 1));
            }
            Err(e) => {
                warnings.push(format!("第 {} 块配图不可用: {e}", i + 1));
                img_rid.push(None);
            }
        }
    }

    // rels 编号:固定 rId1=styles, rId2=numbering, rId3=header?, rId4=footer?, 图片从 rId10 起
    let has_header = !header_txt.is_empty();
    let has_footer = !footer_txt.is_empty();
    const RID_IMG_BASE: usize = 10;

    // ── 正文 ──
    let mut body = String::new();
    let mut doc_pr_id = 1u32;
    for (i, b) in blocks.iter().enumerate() {
        let rid = img_rid[i].map(|k| format!("rId{}", RID_IMG_BASE + k));
        body.push_str(&block_xml(
            b,
            th,
            body_tw,
            rid.as_deref(),
            media.get(img_rid[i].unwrap_or(usize::MAX)),
            &mut doc_pr_id,
            &mut warnings,
        ));
    }
    // sectPr 必须是 body 的最后一个子元素(放错位置 Word 直接判损坏)
    body.push_str("<w:sectPr>");
    if has_header {
        body.push_str("<w:headerReference w:type=\"default\" r:id=\"rId3\"/>");
    }
    if has_footer {
        body.push_str("<w:footerReference w:type=\"default\" r:id=\"rId4\"/>");
    }
    body.push_str(&format!(
        "<w:pgSz w:w=\"{pw}\" w:h=\"{ph}\"/>\
<w:pgMar w:top=\"{mt}\" w:right=\"{mr}\" w:bottom=\"{mb}\" w:left=\"{ml}\" w:header=\"720\" w:footer=\"720\" w:gutter=\"0\"/>\
<w:cols w:space=\"720\"/><w:docGrid w:linePitch=\"312\"/></w:sectPr>"
    ));

    let document = format!(
        "{decl}<w:document xmlns:w=\"{NS_W}\" xmlns:r=\"{NS_R}\" xmlns:m=\"{NS_M}\" \
xmlns:wp=\"{NS_WP}\" xmlns:a=\"{NS_A}\" xmlns:pic=\"{NS_PIC}\"><w:body>{body}</w:body></w:document>",
        decl = xml_decl()
    );

    // ── 落包 ──
    if let Some(parent) = std::path::Path::new(out_path).parent() {
        if !parent.as_os_str().is_empty() {
            let _ = std::fs::create_dir_all(parent);
        }
    }
    // 原子写:先 .tmp 再 rename —— 半路失败不毁旧文件(用户正在编辑的那份教案不能被写坏)
    let tmp_path = format!("{out_path}.tmp");
    let mut tmp_guard = crate::forge::pptx::TmpGuard(std::path::PathBuf::from(&tmp_path), true);
    let file = std::fs::File::create(&tmp_path).map_err(|e| format!("创建 {tmp_path} 失败: {e}"))?;
    let mut zip = zip::ZipWriter::new(file);
    let opt = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let put = |zip: &mut zip::ZipWriter<std::fs::File>,
               name: &str,
               data: &[u8]|
     -> Result<(), String> {
        zip.start_file(name, opt)
            .map_err(|e| format!("zip 写 {name} 失败: {e}"))?;
        zip.write_all(data)
            .map_err(|e| format!("zip 写入 {name} 失败: {e}"))?;
        Ok(())
    };

    // [Content_Types].xml
    let has_png = media.iter().any(|m| m.ext == "png");
    let has_jpg = media.iter().any(|m| m.ext == "jpeg");
    let mut ct = String::from(xml_decl());
    ct.push_str(&format!("<Types xmlns=\"{NS_CT}\">"));
    ct.push_str("<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>");
    ct.push_str("<Default Extension=\"xml\" ContentType=\"application/xml\"/>");
    if has_png {
        ct.push_str("<Default Extension=\"png\" ContentType=\"image/png\"/>");
    }
    if has_jpg {
        ct.push_str("<Default Extension=\"jpeg\" ContentType=\"image/jpeg\"/>");
    }
    ct.push_str("<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>");
    ct.push_str("<Override PartName=\"/word/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml\"/>");
    ct.push_str("<Override PartName=\"/word/numbering.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml\"/>");
    if has_header {
        ct.push_str("<Override PartName=\"/word/header1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml\"/>");
    }
    if has_footer {
        ct.push_str("<Override PartName=\"/word/footer1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml\"/>");
    }
    ct.push_str("<Override PartName=\"/docProps/core.xml\" ContentType=\"application/vnd.openxmlformats-package.core-properties+xml\"/>");
    ct.push_str("<Override PartName=\"/docProps/app.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.extended-properties+xml\"/>");
    ct.push_str("</Types>");
    put(&mut zip, "[Content_Types].xml", ct.as_bytes())?;

    // _rels/.rels
    put(
        &mut zip,
        "_rels/.rels",
        format!(
            "{decl}<Relationships xmlns=\"{NS_REL}\">\
<Relationship Id=\"rId1\" Type=\"{NS_RT}/officeDocument\" Target=\"word/document.xml\"/>\
<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties\" Target=\"docProps/core.xml\"/>\
<Relationship Id=\"rId3\" Type=\"{NS_RT}/extended-properties\" Target=\"docProps/app.xml\"/>\
</Relationships>",
            decl = xml_decl()
        )
        .as_bytes(),
    )?;

    // word/_rels/document.xml.rels
    let mut drels = String::from(xml_decl());
    drels.push_str(&format!("<Relationships xmlns=\"{NS_REL}\">"));
    drels.push_str(&format!(
        "<Relationship Id=\"rId1\" Type=\"{NS_RT}/styles\" Target=\"styles.xml\"/>"
    ));
    drels.push_str(&format!(
        "<Relationship Id=\"rId2\" Type=\"{NS_RT}/numbering\" Target=\"numbering.xml\"/>"
    ));
    if has_header {
        drels.push_str(&format!(
            "<Relationship Id=\"rId3\" Type=\"{NS_RT}/header\" Target=\"header1.xml\"/>"
        ));
    }
    if has_footer {
        drels.push_str(&format!(
            "<Relationship Id=\"rId4\" Type=\"{NS_RT}/footer\" Target=\"footer1.xml\"/>"
        ));
    }
    for (k, m) in media.iter().enumerate() {
        drels.push_str(&format!(
            "<Relationship Id=\"rId{}\" Type=\"{NS_RT}/image\" Target=\"media/image{}.{}\"/>",
            RID_IMG_BASE + k,
            k + 1,
            m.ext
        ));
    }
    drels.push_str("</Relationships>");
    put(&mut zip, "word/_rels/document.xml.rels", drels.as_bytes())?;

    put(&mut zip, "word/document.xml", document.as_bytes())?;
    put(&mut zip, "word/styles.xml", styles_xml(th).as_bytes())?;
    put(&mut zip, "word/numbering.xml", numbering_xml(th).as_bytes())?;
    if has_header {
        put(
            &mut zip,
            "word/header1.xml",
            hf_xml("hdr", &header_txt, th).as_bytes(),
        )?;
    }
    if has_footer {
        put(
            &mut zip,
            "word/footer1.xml",
            hf_xml("ftr", &footer_txt, th).as_bytes(),
        )?;
    }
    for (k, m) in media.iter().enumerate() {
        put(
            &mut zip,
            &format!("word/media/image{}.{}", k + 1, m.ext),
            &m.bytes,
        )?;
    }

    // docProps:标题取第一个 title 块,方便资源管理器/Word 属性面板一眼认出这份教案
    let title = blocks
        .iter()
        .find(|b| s_str(b, "type") == "title")
        .map(|b| plain_text(s_str(b, "text")))
        .unwrap_or_default();
    put(
        &mut zip,
        "docProps/core.xml",
        format!(
            "{decl}<cp:coreProperties xmlns:cp=\"http://schemas.openxmlformats.org/package/2006/metadata/core-properties\" \
xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:dcterms=\"http://purl.org/dc/terms/\" \
xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\">\
<dc:title>{t}</dc:title><dc:creator>Polaris</dc:creator><cp:lastModifiedBy>Polaris</cp:lastModifiedBy>\
</cp:coreProperties>",
            decl = xml_decl(),
            t = xml_escape(&title)
        )
        .as_bytes(),
    )?;
    put(
        &mut zip,
        "docProps/app.xml",
        format!(
            "{decl}<Properties xmlns=\"http://schemas.openxmlformats.org/officeDocument/2006/extended-properties\" \
xmlns:vt=\"http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes\">\
<Application>Polaris Forge</Application></Properties>",
            decl = xml_decl()
        )
        .as_bytes(),
    )?;

    zip.finish().map_err(|e| format!("zip 收尾失败: {e}"))?;
    // 目标被 Word 占用时 rename 会失败 —— 给明确提示,别让用户以为「导出没反应」
    std::fs::rename(&tmp_path, out_path).map_err(|e| {
        format!("写出 {out_path} 失败(文件可能正被 Word 打开,请关闭后重试): {e}")
    })?;
    tmp_guard.1 = false;

    Ok(json!({
        "ok": true,
        "out": out_path,
        "blocks": blocks.len(),
        "theme": th.id,
        "images": media.len(),
        "editable": true,
        "warnings": warnings,
    }))
}

/// 去掉行内标记拿纯文字(与 docSpec.ts 的 plainText 同义,给 docProps 标题用)。
fn plain_text(s: &str) -> String {
    parse_inline(s).iter().map(|x| x.text.as_str()).collect()
}

// ───────────────────────── 单块 → OOXML ─────────────────────────

fn block_xml(
    b: &Value,
    th: &DocTheme,
    body_tw: i64,
    img_rid: Option<&str>,
    img: Option<&DocImage>,
    doc_pr_id: &mut u32,
    warnings: &mut Vec<String>,
) -> String {
    let ty = s_str(b, "type");
    let text = s_str(b, "text");
    let align = jc_of(s_str(b, "align"));
    let color_override = ooxml_color(s_str(b, "color"), th);
    let size_override = s_f64(b, "size").filter(|v| *v > 0.0);
    let pad_em = s_f64(b, "pad").unwrap_or(0.0).max(0.0);
    let bold_ov = s_bool(b, "bold");
    let italic_ov = s_bool(b, "italic");
    let lh = th.lh;
    let body = th.sz_body;

    // 块左缩进(pad,单位 em)→ twips。em 按正文字号算,与预览的 padding-left:Nem 同源。
    let pad_tw = pt2tw(pad_em * body);

    // 每种块的默认 (字体, 字号, 颜色, 粗, 斜) —— 逐条对齐 docPaperCss。
    let mk = |font: &str, size: f64, color: Option<String>, bold: bool, italic: bool| RunStyle {
        font: font.to_string(),
        size_pt: size_override.unwrap_or(size),
        color: color_override.clone().or(color),
        bold: bold || bold_ov,
        italic: italic || italic_ov,
    };

    match ty {
        "title" => {
            let st = mk(th.head_font, th.sz_title, Some(hex(th.ink)), true, false);
            para(
                &runs_xml(text, &st),
                ParaOpt {
                    jc: align.or(Some("center")),
                    after_pt: 6.0,
                    line_mul: Some(lh),
                    body_pt: st.size_pt,
                    ind_left: pad_tw,
                    ..Default::default()
                },
            )
        }
        "subtitle" => {
            // 副标题固定楷体灰(与 .d-sub 的 font-family:"楷体" 一致)
            let st = mk("楷体", th.sz_subtitle, Some(hex(th.muted)), false, false);
            para(
                &runs_xml(text, &st),
                ParaOpt {
                    jc: align.or(Some("center")),
                    after_pt: 14.0,
                    line_mul: Some(lh),
                    body_pt: st.size_pt,
                    ind_left: pad_tw,
                    ..Default::default()
                },
            )
        }
        "h1" => {
            // 主题色方块前缀由**导出端加**(spec 的 text 里绝不写「■」——写了就会双份)
            let st = mk(th.head_font, th.sz_h1, Some(hex(th.ink)), true, false);
            let mark_st = RunStyle {
                color: Some(hex(th.accent)),
                ..st.clone()
            };
            let mut runs = plain_run("■ ", &mark_st, &Seg::default());
            runs.push_str(&runs_xml(text, &st));
            para(
                &runs,
                ParaOpt {
                    jc: align,
                    before_pt: 14.0,
                    after_pt: 8.0,
                    line_mul: Some(lh),
                    body_pt: st.size_pt,
                    ind_left: pad_tw,
                    borders: vec![("bottom", hex(th.line), 6)],
                    keep_next: true, // 标题不该单独落在页尾
                    ..Default::default()
                },
            )
        }
        "h2" => {
            let st = mk(th.head_font, th.sz_h2, Some(hex(th.accent)), true, false);
            para(
                &runs_xml(text, &st),
                ParaOpt {
                    jc: align,
                    before_pt: 10.0,
                    after_pt: 6.0,
                    line_mul: Some(lh),
                    body_pt: st.size_pt,
                    ind_left: pad_tw,
                    keep_next: true,
                    ..Default::default()
                },
            )
        }
        "h3" => {
            let st = mk(th.font, th.sz_h3, Some(hex(th.ink)), true, false);
            para(
                &runs_xml(text, &st),
                ParaOpt {
                    jc: align,
                    before_pt: 8.0,
                    after_pt: 4.0,
                    line_mul: Some(lh),
                    body_pt: st.size_pt,
                    ind_left: pad_tw,
                    keep_next: true,
                    ..Default::default()
                },
            )
        }
        "p" => {
            let st = mk(th.font, body, Some(hex(th.ink)), false, false);
            // p 默认首行缩进 2 字符(indent:"none" 取消)——中文教案的硬规矩
            let first = if s_str(b, "indent") == "none" {
                0.0
            } else {
                2.0
            };
            para(
                &runs_xml(text, &st),
                ParaOpt {
                    jc: align.or(Some("both")),
                    after_pt: 8.0,
                    line_mul: Some(lh),
                    body_pt: st.size_pt,
                    first_line_chars: first,
                    ind_left: pad_tw,
                    ..Default::default()
                },
            )
        }
        "bullet" | "num" => {
            let st = mk(th.font, body, Some(hex(th.ink)), false, false);
            let hang = pt2tw(1.6 * st.size_pt);
            para(
                &runs_xml(text, &st),
                ParaOpt {
                    jc: align.or(Some("both")),
                    after_pt: 6.0,
                    line_mul: Some(lh),
                    body_pt: st.size_pt,
                    ind_left: pad_tw + hang,
                    hanging: hang,
                    num_id: Some(if ty == "bullet" { 1 } else { 2 }),
                    ..Default::default()
                },
            )
        }
        "quote" => {
            let st = mk("楷体", body, Some(hex(th.muted)), false, false);
            para(
                &runs_xml(text, &st),
                ParaOpt {
                    jc: align,
                    before_pt: 8.0,
                    after_pt: 8.0,
                    line_mul: Some(lh),
                    body_pt: st.size_pt,
                    ind_left: pad_tw + pt2tw(12.0),
                    borders: vec![("left", hex(th.accent), 18)],
                    ..Default::default()
                },
            )
        }
        "callout" => {
            // 提示框 = 连续两个同边框同底色的段落,Word 会把它们并成一个框
            let head = s_str(b, "head");
            let borders = vec![
                ("top", hex(th.line), 6),
                ("left", hex(th.line), 6),
                ("bottom", hex(th.line), 6),
                ("right", hex(th.line), 6),
            ];
            let mut out = String::new();
            if !head.is_empty() {
                let hs = mk(th.font, body, Some(hex(th.accent)), true, false);
                out.push_str(&para(
                    &runs_xml(head, &hs),
                    ParaOpt {
                        jc: align,
                        before_pt: 8.0,
                        after_pt: 3.0,
                        line_mul: Some(lh),
                        body_pt: hs.size_pt,
                        ind_left: pad_tw + pt2tw(6.0),
                        borders: borders.clone(),
                        shade: Some(hex(th.soft)),
                        keep_next: true,
                        ..Default::default()
                    },
                ));
            }
            let st = mk(th.font, body, Some(hex(th.ink)), false, false);
            out.push_str(&para(
                &runs_xml(text, &st),
                ParaOpt {
                    jc: align,
                    before_pt: if head.is_empty() { 8.0 } else { 0.0 },
                    after_pt: 8.0,
                    line_mul: Some(lh),
                    body_pt: st.size_pt,
                    ind_left: pad_tw + pt2tw(6.0),
                    borders,
                    shade: Some(hex(th.soft)),
                    ..Default::default()
                },
            ));
            out
        }
        "table" => table_xml(b, th, body_tw - pad_tw, size_override, color_override),
        "image" => {
            let pct = s_f64(b, "w").filter(|v| *v > 0.0 && *v <= 100.0).unwrap_or(100.0);
            let mut out = String::new();
            match (img_rid, img) {
                (Some(rid), Some(im)) => {
                    let cx = tw2emu(((body_tw as f64) * pct / 100.0).round() as i64);
                    let cy = (cx as f64 * im.h as f64 / im.w as f64).round() as i64;
                    *doc_pr_id += 1;
                    out.push_str(&para(
                        &drawing_xml(rid, *doc_pr_id, cx, cy.max(1)),
                        ParaOpt {
                            jc: Some("center"),
                            before_pt: 8.0,
                            after_pt: 3.0,
                            ..Default::default()
                        },
                    ));
                }
                _ => {
                    // 图缺失只降级本块(占位文字),绝不中断整份导出
                    let st = mk(th.font, body, Some(hex(th.muted)), false, true);
                    out.push_str(&para(
                        &runs_xml("(配图缺失)", &st),
                        ParaOpt {
                            jc: Some("center"),
                            before_pt: 8.0,
                            after_pt: 3.0,
                            body_pt: st.size_pt,
                            ..Default::default()
                        },
                    ));
                }
            }
            if let Some(cap) = b.get("cap").and_then(|v| v.as_str()) {
                let cs = RunStyle {
                    font: th.font.to_string(),
                    size_pt: (body - 1.5).max(9.0),
                    color: Some(hex(th.muted)),
                    bold: false,
                    italic: false,
                };
                out.push_str(&para(
                    &runs_xml(cap, &cs),
                    ParaOpt {
                        jc: Some("center"),
                        after_pt: 8.0,
                        body_pt: cs.size_pt,
                        ..Default::default()
                    },
                ));
            }
            out
        }
        "hr" => para(
            "",
            ParaOpt {
                before_pt: 10.0,
                after_pt: 10.0,
                borders: vec![("bottom", hex(th.line), 6)],
                ..Default::default()
            },
        ),
        "pagebreak" => "<w:p><w:r><w:br w:type=\"page\"/></w:r></w:p>".to_string(),
        other => {
            if !other.is_empty() && other != "p" {
                warnings.push(format!("未知块类型 \"{other}\",已按正文段处理"));
            }
            let st = mk(th.font, body, Some(hex(th.ink)), false, false);
            para(
                &runs_xml(text, &st),
                ParaOpt {
                    jc: align,
                    after_pt: 8.0,
                    line_mul: Some(lh),
                    body_pt: st.size_pt,
                    ..Default::default()
                },
            )
        }
    }
}

fn para(runs: &str, o: ParaOpt) -> String {
    format!("<w:p>{}{}</w:p>", para_props(&o), runs)
}

// ───────────────────────── 表格 ─────────────────────────

fn table_xml(
    b: &Value,
    th: &DocTheme,
    body_tw: i64,
    size_override: Option<f64>,
    color_override: Option<String>,
) -> String {
    let empty: Vec<Value> = Vec::new();
    let rows = b.get("rows").and_then(|v| v.as_array()).unwrap_or(&empty);
    if rows.is_empty() {
        return String::new();
    }
    let cols = rows
        .iter()
        .map(|r| r.as_array().map(|a| a.len()).unwrap_or(0))
        .max()
        .unwrap_or(0)
        .max(1);
    // widths 长度必须等于列数才认(与前端 blockHtml 的判定一致),否则等分
    let ws: Vec<f64> = match b.get("widths").and_then(|v| v.as_array()) {
        Some(a) if a.len() == cols => a
            .iter()
            .map(|v| v.as_f64().unwrap_or(0.0).max(0.0))
            .collect(),
        _ => vec![1.0; cols],
    };
    let sum: f64 = ws.iter().sum();
    let ws = if sum > 0.0 { ws } else { vec![1.0; cols] };
    let sum: f64 = ws.iter().sum();
    // 归一化到正文宽的 dxa;最后一列吃掉舍入误差,保证总和刚好 = body_tw(差 1 twip
    // Word 也会自己拉伸,但对不齐时表格右边缘会毛,肉眼可见)
    let mut grid: Vec<i64> = ws
        .iter()
        .map(|w| ((w / sum) * body_tw as f64).round() as i64)
        .collect();
    let drift = body_tw - grid.iter().sum::<i64>();
    if let Some(last) = grid.last_mut() {
        *last += drift;
    }

    let head0 = b.get("head0").and_then(|v| v.as_bool()).unwrap_or(true);
    let size = size_override.unwrap_or(th.sz_body);
    let line = hex(th.line);

    let mut s = String::from("<w:tbl><w:tblPr>");
    s.push_str(&format!("<w:tblW w:w=\"{body_tw}\" w:type=\"dxa\"/>"));
    s.push_str("<w:tblLayout w:type=\"fixed\"/>"); // 与预览的 table-layout:fixed 一致
    s.push_str(&format!(
        "<w:tblBorders>\
<w:top w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"{line}\"/>\
<w:left w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"{line}\"/>\
<w:bottom w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"{line}\"/>\
<w:right w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"{line}\"/>\
<w:insideH w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"{line}\"/>\
<w:insideV w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"{line}\"/>\
</w:tblBorders>"
    ));
    s.push_str("<w:tblCellMar><w:top w:w=\"60\" w:type=\"dxa\"/><w:left w:w=\"90\" w:type=\"dxa\"/><w:bottom w:w=\"60\" w:type=\"dxa\"/><w:right w:w=\"90\" w:type=\"dxa\"/></w:tblCellMar>");
    s.push_str("</w:tblPr><w:tblGrid>");
    for g in &grid {
        s.push_str(&format!("<w:gridCol w:w=\"{g}\"/>"));
    }
    s.push_str("</w:tblGrid>");

    for (ri, r) in rows.iter().enumerate() {
        let is_head = head0 && ri == 0;
        s.push_str("<w:tr>");
        if is_head {
            // tblHeader = 跨页时自动重复表头。教案的教学过程表动辄两三页,少了它翻页就不知道哪列是哪列
            s.push_str("<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>");
        }
        let cells = r.as_array();
        for ci in 0..cols {
            let raw = cells
                .and_then(|a| a.get(ci))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let st = RunStyle {
                font: th.font.to_string(),
                size_pt: size,
                color: color_override.clone().or(Some(hex(th.ink))),
                bold: is_head,
                italic: false,
            };
            s.push_str("<w:tc><w:tcPr>");
            s.push_str(&format!("<w:tcW w:w=\"{}\" w:type=\"dxa\"/>", grid[ci]));
            if is_head {
                s.push_str(&format!(
                    "<w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"{}\"/>",
                    hex(th.soft)
                ));
            }
            s.push_str("<w:vAlign w:val=\"top\"/></w:tcPr>");
            // 单元格里的 \n 拆成多个段落(导入时也是这么合的,往返对称)
            let lines: Vec<&str> = raw.split('\n').collect();
            for l in &lines {
                s.push_str(&para(
                    &runs_xml(l, &st),
                    ParaOpt {
                        jc: Some(if is_head { "center" } else { "left" }),
                        after_pt: 2.0,
                        line_mul: Some(th.lh.min(1.4)), // 表内收紧,否则一页塞不下
                        body_pt: size,
                        ..Default::default()
                    },
                ));
            }
            s.push_str("</w:tc>");
        }
        s.push_str("</w:tr>");
    }
    s.push_str("</w:tbl>");
    // 表格后必须跟一个段落:两张表直接相邻 Word 会把它们合成一张
    s.push_str("<w:p><w:pPr><w:spacing w:after=\"120\"/></w:pPr></w:p>");
    s
}

// ───────────────────────── 附属 part ─────────────────────────

fn styles_xml(th: &DocTheme) -> String {
    format!(
        "{decl}<w:styles xmlns:w=\"{NS_W}\">\
<w:docDefaults><w:rPrDefault><w:rPr>\
<w:rFonts w:ascii=\"{f}\" w:hAnsi=\"{f}\" w:eastAsia=\"{f}\" w:cs=\"{f}\"/>\
<w:sz w:val=\"{sz}\"/><w:szCs w:val=\"{sz}\"/><w:lang w:val=\"zh-CN\" w:eastAsia=\"zh-CN\"/>\
</w:rPr></w:rPrDefault>\
<w:pPrDefault><w:pPr><w:spacing w:line=\"{line}\" w:lineRule=\"auto\"/></w:pPr></w:pPrDefault>\
</w:docDefaults>\
<w:style w:type=\"paragraph\" w:default=\"1\" w:styleId=\"Normal\"><w:name w:val=\"Normal\"/><w:qFormat/></w:style>\
<w:style w:type=\"character\" w:default=\"1\" w:styleId=\"DefaultParagraphFont\"><w:name w:val=\"Default Paragraph Font\"/></w:style>\
<w:style w:type=\"table\" w:default=\"1\" w:styleId=\"TableNormal\"><w:name w:val=\"Normal Table\"/>\
<w:tblPr><w:tblCellMar><w:top w:w=\"0\" w:type=\"dxa\"/><w:left w:w=\"108\" w:type=\"dxa\"/>\
<w:bottom w:w=\"0\" w:type=\"dxa\"/><w:right w:w=\"108\" w:type=\"dxa\"/></w:tblCellMar></w:tblPr></w:style>\
</w:styles>",
        decl = xml_decl(),
        f = xml_escape(th.font),
        sz = pt2hp(th.sz_body),
        line = pt2tw(th.lh * th.sz_body)
    )
}

/// 两套 abstractNum:0=无序(「·」,与预览的 .d-mk 一致)、1=有序(decimal)。
/// **符号绝不写进正文文字** —— 否则用户在 Word 里回车会得到「··」。
fn numbering_xml(th: &DocTheme) -> String {
    let ind = pt2tw(1.6 * th.sz_body);
    let mut s = String::from(xml_decl());
    s.push_str(&format!("<w:numbering xmlns:w=\"{NS_W}\">"));
    for (aid, fmt, txt, font) in [
        (0u32, "bullet", "·", "宋体"),
        (1u32, "decimal", "%1.", th.font),
    ] {
        s.push_str(&format!(
            "<w:abstractNum w:abstractNumId=\"{aid}\"><w:nsid w:val=\"0000000{}\"/><w:multiLevelType w:val=\"hybridMultilevel\"/>",
            aid + 1
        ));
        // 9 层全写:只写 ilvl=0 时部分 Word 版本会对 numbering.xml 报结构告警
        for lv in 0..9u32 {
            s.push_str(&format!(
                "<w:lvl w:ilvl=\"{lv}\"><w:start w:val=\"1\"/><w:numFmt w:val=\"{fmt}\"/>\
<w:lvlText w:val=\"{txt}\"/><w:lvlJc w:val=\"left\"/>\
<w:pPr><w:ind w:left=\"{left}\" w:hanging=\"{ind}\"/></w:pPr>\
<w:rPr><w:rFonts w:ascii=\"{f}\" w:hAnsi=\"{f}\" w:eastAsia=\"{f}\" w:hint=\"eastAsia\"/></w:rPr></w:lvl>",
                txt = xml_escape(if lv == 0 { txt } else if fmt == "bullet" { "·" } else { "%1." }),
                left = ind * (lv as i64 + 1),
                f = xml_escape(font)
            ));
        }
        s.push_str("</w:abstractNum>");
    }
    s.push_str("<w:num w:numId=\"1\"><w:abstractNumId w:val=\"0\"/></w:num>");
    s.push_str("<w:num w:numId=\"2\"><w:abstractNumId w:val=\"1\"/></w:num>");
    s.push_str("</w:numbering>");
    s
}

/// 页眉/页脚。`{page}` → Word 的 PAGE 域(真页码,不是死数字)。
fn hf_xml(tag: &str, text: &str, th: &DocTheme) -> String {
    let st = RunStyle {
        font: th.font.to_string(),
        size_pt: 9.0,
        color: Some(hex(th.muted)),
        bold: false,
        italic: false,
    };
    let rpr = run_props(&st, &Seg::default());
    let mut runs = String::new();
    let mut first = true;
    for part in text.split("{page}") {
        if !first {
            runs.push_str(&format!(
                "<w:r>{rpr}<w:fldChar w:fldCharType=\"begin\"/></w:r>\
<w:r>{rpr}<w:instrText xml:space=\"preserve\"> PAGE </w:instrText></w:r>\
<w:r>{rpr}<w:fldChar w:fldCharType=\"separate\"/></w:r>\
<w:r>{rpr}<w:t>1</w:t></w:r>\
<w:r>{rpr}<w:fldChar w:fldCharType=\"end\"/></w:r>"
            ));
        }
        first = false;
        if !part.is_empty() {
            runs.push_str(&format!(
                "<w:r>{rpr}<w:t xml:space=\"preserve\">{}</w:t></w:r>",
                xml_escape(part)
            ));
        }
    }
    let para = format!(
        "<w:p><w:pPr><w:jc w:val=\"center\"/><w:spacing w:before=\"0\" w:after=\"0\"/></w:pPr>{runs}</w:p>"
    );
    format!(
        "{decl}<w:{tag} xmlns:w=\"{NS_W}\" xmlns:r=\"{NS_R}\">{para}</w:{tag}>",
        decl = xml_decl()
    )
}

// ───────────────────────── 测试 ─────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    fn tmp(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join("polaris_docx_test");
        let _ = std::fs::create_dir_all(&d);
        d.join(name)
    }

    pub(crate) fn read_part(path: &std::path::Path, part: &str) -> String {
        let f = std::fs::File::open(path).unwrap();
        let mut z = zip::ZipArchive::new(f).unwrap();
        let mut s = String::new();
        z.by_name(part).unwrap().read_to_string(&mut s).unwrap();
        s
    }

    /// 极简标签配平校验:只认 `<a>` / `</a>` / `<a/>`,够抓「少写一个闭合」这类致命错。
    pub(crate) fn well_formed(xml: &str) -> Result<(), String> {
        let b = xml.as_bytes();
        let mut stack: Vec<String> = Vec::new();
        let mut i = 0usize;
        while i < b.len() {
            if b[i] != b'<' {
                i += 1;
                continue;
            }
            if xml[i..].starts_with("<?") || xml[i..].starts_with("<!") {
                let j = xml[i..].find('>').ok_or("未闭合的声明")? + i;
                i = j + 1;
                continue;
            }
            let j = xml[i..].find('>').ok_or("未闭合的标签")? + i;
            let inner = &xml[i + 1..j];
            if let Some(name) = inner.strip_prefix('/') {
                let top = stack.pop().ok_or_else(|| format!("多余闭合 </{name}>"))?;
                if top != name.trim() {
                    return Err(format!("标签错配: 期待 </{top}>,实得 </{name}>"));
                }
            } else if !inner.ends_with('/') {
                let name = inner
                    .split([' ', '\t', '\n'])
                    .next()
                    .unwrap_or("")
                    .to_string();
                stack.push(name);
            }
            i = j + 1;
        }
        if stack.is_empty() {
            Ok(())
        } else {
            Err(format!("未闭合: {stack:?}"))
        }
    }

    fn demo_spec() -> String {
        json!({
            "version": 1,
            "theme": "qingjiao",
            "page": { "size": "a4", "footer": "第 {page} 页" },
            "blocks": [
                { "type": "title", "text": "勾股定理" },
                { "type": "subtitle", "text": "——八年级下册" },
                { "type": "h1", "text": "教学目标" },
                { "type": "p", "text": "本节课要求掌握 **勾股定理** 与 $a^2+b^2=c^2$ 的关系。" },
                { "type": "bullet", "text": "理解定理的~~证明~~推导" },
                { "type": "num", "text": "会用 `code` 求边长" },
                { "type": "quote", "text": "数缺形时少直觉" },
                { "type": "callout", "head": "重点", "text": "__直角__三角形" },
                { "type": "table", "head0": true, "widths": [1, 2, 1],
                  "rows": [["环节", "教师活动", "时长"], ["导入", "提问\n板书", "5′"]] },
                { "type": "hr" },
                { "type": "pagebreak" },
                { "type": "p", "text": "分式 $\\frac{a}{b}$ 与根式 $\\sqrt{2}$ 与求和 $\\sum_{i=1}^{n} i$", "indent": "none" }
            ]
        })
        .to_string()
    }

    #[test]
    fn spec_to_docx_is_readable_zip_and_well_formed() {
        let out = tmp("demo.docx");
        let v = build_docx_from_spec(&demo_spec(), out.to_str().unwrap()).unwrap();
        assert_eq!(v["ok"], true);
        assert!(out.is_file());
        // 必备 part 全在
        for p in [
            "[Content_Types].xml",
            "_rels/.rels",
            "word/document.xml",
            "word/styles.xml",
            "word/numbering.xml",
            "word/_rels/document.xml.rels",
            "word/footer1.xml",
            "docProps/core.xml",
            "docProps/app.xml",
        ] {
            let s = read_part(&out, p);
            assert!(!s.is_empty(), "{p} 为空");
            well_formed(&s).unwrap_or_else(|e| panic!("{p} 不良构: {e}"));
        }
        let doc = read_part(&out, "word/document.xml");
        assert!(doc.contains("勾股定理"), "标题丢了");
        assert!(doc.contains("■ "), "h1 方块前缀丢了");
        assert!(doc.contains("<m:oMath>"), "公式没转 OMML");
        assert!(doc.contains("<m:f>"), "\\frac 没转分式");
        assert!(doc.contains("<m:rad>"), "\\sqrt 没转根式");
        assert!(doc.contains("<m:nary>"), "\\sum 没转 nary");
        assert!(doc.contains("<w:tbl>"), "表格丢了");
        assert!(doc.contains("<w:tblHeader/>"), "表头跨页重复没设");
        assert!(doc.contains("w:numId w:val=\"1\""), "bullet 没走 numbering");
        assert!(doc.contains("w:numId w:val=\"2\""), "num 没走 numbering");
        assert!(doc.contains("<w:br w:type=\"page\"/>"), "分页符丢了");
        // bullet 的「·」绝不能出现在正文 w:t 里
        assert!(!doc.contains("<w:t xml:space=\"preserve\">· "), "bullet 符号被写进了正文");
        let ftr = read_part(&out, "word/footer1.xml");
        assert!(ftr.contains(" PAGE "), "页脚页码域丢了");
    }

    #[test]
    fn inline_markup_matches_frontend_rules() {
        let s = parse_inline("普通**粗**与*斜*和__下__及~~删~~带`码`与$x^2$");
        let joined: Vec<(&str, bool, bool, bool, bool, bool, bool)> = s
            .iter()
            .map(|x| {
                (
                    x.text.as_str(),
                    x.bold,
                    x.italic,
                    x.underline,
                    x.strike,
                    x.code,
                    x.math,
                )
            })
            .collect();
        assert!(joined.contains(&("粗", true, false, false, false, false, false)));
        assert!(joined.contains(&("斜", false, true, false, false, false, false)));
        assert!(joined.contains(&("下", false, false, true, false, false, false)));
        assert!(joined.contains(&("删", false, false, false, true, false, false)));
        assert!(joined.contains(&("码", false, false, false, false, true, false)));
        assert!(joined.contains(&("x^2", false, false, false, false, false, true)));
    }

    #[test]
    fn illegal_control_chars_are_stripped() {
        // Word 对非法控制字符零容忍:一个 \u{1} 就能让整份打不开
        let spec = json!({ "blocks": [{ "type": "p", "text": "正常\u{1}文字" }] }).to_string();
        let out = tmp("ctrl.docx");
        build_docx_from_spec(&spec, out.to_str().unwrap()).unwrap();
        let doc = read_part(&out, "word/document.xml");
        assert!(!doc.contains('\u{1}'));
        assert!(doc.contains("正常文字") || doc.contains("正常") && doc.contains("文字"));
    }

    #[test]
    fn unknown_theme_warns_and_falls_back() {
        let spec =
            json!({ "theme": "nope", "blocks": [{ "type": "p", "text": "x" }] }).to_string();
        let out = tmp("theme.docx");
        let v = build_docx_from_spec(&spec, out.to_str().unwrap()).unwrap();
        assert_eq!(v["theme"], "qingjiao");
        assert!(!v["warnings"].as_array().unwrap().is_empty());
    }

    #[test]
    fn latex_subset_degrades_instead_of_dropping() {
        // 超出子集的命令必须降级成文字,绝不吞掉内容
        let o = latex_to_omml("\\weirdcmd{x}");
        assert!(o.contains("weirdcmd"), "未知命令被吞了: {o}");
        // 畸形输入不能挂死
        assert!(!latex_to_omml("\\frac{").is_empty());
    }
}

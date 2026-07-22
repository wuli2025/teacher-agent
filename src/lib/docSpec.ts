/**
 * polaris.doc.json(Word 教案 spec)→ 预览 HTML 的确定性渲染器。
 *
 * 与 PPT 侧 slidesSpec.ts 逐条同构(同一套心智):
 *   宽容解析 parseDocLoose  ←→ parseSpecLoose(边写边亮)
 *   点字直改 data-e/setDocText ←→ setSpecText
 *   块级操作 DocOp/applyDocOp  ←→ SlideOp/applySlideOp
 *   渲染 docBlocksRender       ←→ specSlidesRender
 * 与 Rust 端 forge/docx_native.rs 同源同构:同一套 THEMES / 块类型 / 字号磅值,
 * 「预览即导出」—— 预览一个样、导出 .docx 另一个样是绝对不可接受的回归。
 *
 * 与 PPT 的**唯一本质差异**:PPT 每页是固定 1280×720 画布,Word 是**流式文档**。
 * 故本模块只负责「块 → 块 HTML」,**不做分页**;分页(把块流切成一张张 A4 纸)由
 * DocViewer 在浏览器里实测块高后完成 —— 只有实测才能所见即所得地对上 Word 的分页。
 *
 * 行内标记(纯文本里的轻量语法,故意不做富文本树:点字直改要求叶子必须是 string):
 *   **粗** *斜* __下划线__ ~~删除~~ `代码` $行内公式$ 。写盘就是这几个字符,
 *   Rust 端按同一套规则拆 run —— 双端各自实现,规则见 docs/DOC_SPEC.md。
 * 公式渲染成 `<span class="dm" data-tex="…">` 占位,由 DocViewer 异步喂 KaTeX
 * (与 markdown.ts 同策略:katex 懒加载,不拖累首屏)。
 */

// ───────────────────────── 数据模型 ─────────────────────────

export interface DocSpec {
  version?: number;
  /** 主题 id,见 DOC_THEMES */
  theme?: string;
  /** 纸张与页边距;缺省 a4 + 常规边距 */
  page?: DocPage;
  blocks: DocBlock[];
}

export interface DocPage {
  /** a4(默认) | letter */
  size?: string;
  /** 页边距(毫米)。缺省 25.4 / 31.7 —— 与青教赛教案范式一致 */
  mt?: number;
  mr?: number;
  mb?: number;
  ml?: number;
  /** 页眉文字(每页顶部,导出时写进 header1.xml) */
  header?: string;
  /** 页脚文字;`{page}` 会被替换成页码域 */
  footer?: string;
}

/**
 * 块类型(与 Rust docx_native.rs 的 BlockKind 一一对应):
 *   title    文档大标题(居中,主题标题字号)
 *   subtitle 副标题(居中,楷体灰)
 *   h1/h2/h3 各级小标题(h1 带主题色方块前缀「■」的视觉,由渲染器加,**不写进 text**)
 *   p        正文段(默认首行缩进 2 字符,indent:"none" 可取消)
 *   bullet   无序要点(渲染「·」,导出走 numbering 无序列表)
 *   num      有序要点(1. 2. 3.,导出走 numbering 有序列表)
 *   quote    引文/寄语(左侧主题色竖条,楷体)
 *   callout  提示框(浅底圆角,用于「重点/难点/易错」)
 *   table    表格
 *   image    插图
 *   hr       分隔线
 *   pagebreak 硬分页
 */
export type DocBlockType =
  | "title" | "subtitle" | "h1" | "h2" | "h3"
  | "p" | "bullet" | "num" | "quote" | "callout"
  | "table" | "image" | "hr" | "pagebreak";

export interface DocBlock {
  type: DocBlockType;
  /** 文字块的正文(含行内标记)。table/image/hr/pagebreak 不用 */
  text?: string;
  /** callout 的小标题(如「重点」) */
  head?: string;
  /** 对齐:left(默认) | center | right | both(两端对齐) */
  align?: string;
  /** 首行缩进:"first"(默认,仅 p) | "none" */
  indent?: string;
  /** 整块左缩进(字符数,bullet 默认 1) */
  pad?: number;
  /** 覆盖主题字号(磅)。不填走主题 */
  size?: number;
  /** 覆盖颜色:主题色词(ink/accent/muted/line/soft)或 #RRGGBB */
  color?: string;
  bold?: boolean;
  italic?: boolean;
  /** table:行数据(每格是含行内标记的字符串) */
  rows?: string[][];
  /** table:首行是否表头(默认 true) */
  head0?: boolean;
  /** table:各列宽占比(和不必为 1,内部归一化);缺省等分 */
  widths?: number[];
  /** image:本地绝对路径;预览前会被换成 data URL(见 resolveDocImages) */
  src?: string;
  /** image:显示宽度占正文宽的百分比(1-100,默认 100) */
  w?: number;
  /** image:图注 */
  cap?: string;
}

// ───────────────────────── 主题 ─────────────────────────
// 与 Rust docx_native.rs 的 THEMES 表逐字段对齐。字号单位=磅(pt)。

export interface DocTheme {
  id: string;
  name: string;
  /** 正文中文字体 / 标题中文字体 */
  font: string;
  headFont: string;
  ink: string;
  accent: string;
  muted: string;
  line: string;
  /** callout/表头底色 */
  soft: string;
  /** 字号:标题/副标题/h1/h2/h3/正文 */
  sz: { title: number; subtitle: number; h1: number; h2: number; h3: number; body: number };
  /** 正文行距倍数 */
  lh: number;
}

export const DOC_THEMES: DocTheme[] = [
  {
    id: "qingjiao", name: "青教赛范式", font: "微软雅黑", headFont: "微软雅黑",
    ink: "#000000", accent: "#2C4661", muted: "#5A5A5A", line: "#BFBFBF", soft: "#F2F5F8",
    sz: { title: 23, subtitle: 14, h1: 15, h2: 12.5, h3: 12, body: 12 }, lh: 1.6,
  },
  {
    id: "songti", name: "公文宋体", font: "宋体", headFont: "黑体",
    ink: "#000000", accent: "#8C2B2B", muted: "#555555", line: "#C8C8C8", soft: "#F7F3F0",
    sz: { title: 22, subtitle: 14, h1: 16, h2: 14, h3: 12, body: 12 }, lh: 1.75,
  },
  {
    id: "kaiti", name: "楷体清雅", font: "楷体", headFont: "微软雅黑",
    ink: "#1A1A1A", accent: "#3E6B4F", muted: "#606060", line: "#CFD8D2", soft: "#F1F6F2",
    sz: { title: 22, subtitle: 14, h1: 15, h2: 13, h3: 12, body: 12 }, lh: 1.7,
  },
  {
    id: "modern", name: "现代蓝", font: "微软雅黑", headFont: "微软雅黑",
    ink: "#1F2937", accent: "#2563EB", muted: "#6B7280", line: "#D6DDE8", soft: "#EFF4FF",
    sz: { title: 24, subtitle: 13.5, h1: 15, h2: 13, h3: 12, body: 11.5 }, lh: 1.65,
  },
  {
    id: "warm", name: "暖橘手账", font: "微软雅黑", headFont: "微软雅黑",
    ink: "#33302C", accent: "#C2643A", muted: "#7A736B", line: "#E2D6C9", soft: "#FBF3EA",
    sz: { title: 23, subtitle: 14, h1: 15, h2: 13, h3: 12, body: 12 }, lh: 1.7,
  },
];

export function docTheme(id?: string): DocTheme {
  return DOC_THEMES.find((t) => t.id === id) ?? DOC_THEMES[0];
}

/** 纸张尺寸(毫米)。 */
export const PAGE_SIZES: Record<string, { w: number; h: number }> = {
  a4: { w: 210, h: 297 },
  letter: { w: 215.9, h: 279.4 },
};

export function pageGeom(p?: DocPage) {
  const size = PAGE_SIZES[String(p?.size ?? "a4")] ?? PAGE_SIZES.a4;
  const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    w: size.w, h: size.h,
    mt: num(p?.mt, 25.4), mr: num(p?.mr, 31.7),
    mb: num(p?.mb, 25.4), ml: num(p?.ml, 31.7),
  };
}

// ───────────────────────── 宽容解析 ─────────────────────────

/**
 * 宽容解析:模型边写边存时 spec 常是「半个 JSON」。严格 parse 失败就打捞 ——
 * 扫 blocks 数组里**已经完整闭合**的块对象逐个 parse,坏一块跳一块。
 * 这是「生成中逐段点亮」的地基(与 parseSpecLoose 同构)。
 */
export function parseDocLoose(text: string): { spec: DocSpec | null; partial: boolean } {
  try {
    const s = JSON.parse(text);
    if (s && Array.isArray(s.blocks)) return { spec: s, partial: false };
  } catch {
    /* fallthrough → 打捞 */
  }
  const themeM = /"theme"\s*:\s*"([^"]*)"/.exec(text);
  const head = text.search(/"blocks"\s*:\s*\[/);
  if (head < 0) return { spec: null, partial: true };
  const arrStart = text.indexOf("[", head);
  const blocks: DocBlock[] = [];
  let depth = 0, inStr = false, escaped = false, objStart = -1;
  for (let i = arrStart + 1; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{") { if (depth === 0) objStart = i; depth++; }
    else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart >= 0) {
        try { blocks.push(JSON.parse(text.slice(objStart, i + 1))); } catch { /* 坏块跳过 */ }
        objStart = -1;
      }
    } else if (ch === "]" && depth === 0) break;
  }
  if (!blocks.length) return { spec: null, partial: true };
  return { spec: { theme: themeM?.[1], blocks }, partial: true };
}

// ───────────────────────── 点字直改 ─────────────────────────

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * 可编辑标记:给承载文字的元素打 `data-e="<字段路径>"`,DocViewer 据此把用户改的
 * 文字回写进该块 spec 的对应字段(见 setDocText)。路径**相对单块**(blocks[i] 之内),
 * 块号由组件自己知道 —— 与 PPT 侧 de() 完全同义。
 */
function de(path: string): string {
  return ` data-e="${path}"`;
}

/**
 * 把用户编辑的文字写回单块 spec 的 `path` 字段。返回是否真的改动了。
 * 只写字符串叶子;路径不存在/类型不符就拒绝(宁可不改,也不要把 spec 写坏)。
 */
export function setDocText(block: any, path: string, value: string): boolean {
  const keys = path.split(".");
  const last = keys.pop();
  if (!last) return false;
  const host = keys.reduce((o, k) => (o == null ? o : o[k]), block);
  if (host == null || typeof host !== "object") return false;
  const old = host[last];
  if (old !== undefined && typeof old !== "string") return false;
  if (String(old ?? "") === value) return false;
  host[last] = value;
  return true;
}

export function getDocText(block: any, path: string): string {
  const v = path.split(".").reduce((o: any, k) => (o == null ? o : o[k]), block);
  return typeof v === "string" ? v : "";
}

// ───────────────────────── 行内标记 → HTML ─────────────────────────

/**
 * 行内标记解析。顺序要紧:先切出 `代码` 与 $公式$(它们内部不再解析标记),
 * 再处理 ** / __ / ~~ / *。转义后再插标签,永远不把用户文字当 HTML。
 */
export function inlineHtml(src: string): string {
  const raw = String(src ?? "");
  if (!raw) return "";
  // 1) 先按「不可再解析」的片段切开:`code` 与 $math$
  const parts = raw.split(/(`[^`]*`|\$[^$\n]+\$)/g);
  return parts
    .map((seg) => {
      if (/^`[^`]*`$/.test(seg)) return `<code>${esc(seg.slice(1, -1))}</code>`;
      if (/^\$[^$\n]+\$$/.test(seg)) {
        const tex = seg.slice(1, -1);
        // KaTeX 由 DocViewer 异步补渲染;裸文本先顶上,永远不出现空白
        return `<span class="dm" data-tex="${esc(tex)}">${esc(tex)}</span>`;
      }
      let s = esc(seg);
      s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
      s = s.replace(/__([^_]+)__/g, "<u>$1</u>");
      s = s.replace(/~~([^~]+)~~/g, "<s>$1</s>");
      s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>");
      return s;
    })
    .join("");
}

/** 去掉行内标记,拿纯文字(算字数、做大纲用)。 */
export function plainText(src: string): string {
  return String(src ?? "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\$([^$\n]+)\$/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1");
}

// ───────────────────────── 块 → HTML ─────────────────────────

const ALIGN_CSS: Record<string, string> = {
  left: "left", center: "center", right: "right", both: "justify", justify: "justify",
};

function colorOf(v: string | undefined, t: DocTheme): string | null {
  if (!v) return null;
  const map: Record<string, string> = {
    ink: t.ink, accent: t.accent, muted: t.muted, line: t.line, soft: t.soft,
  };
  if (map[v]) return map[v];
  return /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : null;
}

/** 块自定义样式(字号/颜色/粗斜/对齐/缩进)→ 内联 style 串。 */
function blockStyle(b: DocBlock, t: DocTheme, base: number): string {
  const out: string[] = [];
  const sz = Number(b.size);
  out.push(`font-size:${Number.isFinite(sz) && sz > 0 ? sz : base}pt`);
  const c = colorOf(b.color, t);
  if (c) out.push(`color:${c}`);
  if (b.bold) out.push("font-weight:700");
  if (b.italic) out.push("font-style:italic");
  const al = ALIGN_CSS[String(b.align ?? "")];
  if (al) out.push(`text-align:${al}`);
  const pad = Number(b.pad);
  if (Number.isFinite(pad) && pad > 0) out.push(`padding-left:${pad}em`);
  return out.join(";");
}

/**
 * 单块 → HTML(不含纸张外框)。`i` 只用于生成稳定的 data-b 锚,
 * 字段路径(data-e)一律**相对本块**。
 *
 * `rowWin`(仅 table 有意义)= 只渲染 `[from, to)` 这段数据行,用于**表格跨页拆行**:
 * 续页会自动重复表头(与导出端给表头行写 `w:tblHeader` 同语义)。注意 data-e 里的行号
 * 始终是**原始行号**,否则在续页上改一个字会写错行(这是拆行最容易踩的坑)。
 */
export function blockHtml(b: DocBlock, i: number, spec?: DocSpec, rowWin?: [number, number]): string {
  const t = docTheme(spec?.theme);
  const S = t.sz;
  const type = String(b?.type ?? "p") as DocBlockType;
  const at = ` data-b="${i}"`;

  switch (type) {
    case "title":
      return `<h1 class="d-title"${at} style="${blockStyle(b, t, S.title)}"${de("text")}>${inlineHtml(b.text ?? "")}</h1>`;

    case "subtitle":
      return `<p class="d-sub"${at} style="${blockStyle(b, t, S.subtitle)}"${de("text")}>${inlineHtml(b.text ?? "")}</p>`;

    case "h1":
      return (
        `<h2 class="d-h1"${at} style="${blockStyle(b, t, S.h1)}">` +
        `<span class="d-h1-mark"></span><span${de("text")}>${inlineHtml(b.text ?? "")}</span></h2>`
      );

    case "h2":
      return `<h3 class="d-h2"${at} style="${blockStyle(b, t, S.h2)}"${de("text")}>${inlineHtml(b.text ?? "")}</h3>`;

    case "h3":
      return `<h4 class="d-h3"${at} style="${blockStyle(b, t, S.h3)}"${de("text")}>${inlineHtml(b.text ?? "")}</h4>`;

    case "p": {
      const ind = String(b.indent ?? "first") === "none" ? "" : " d-ind";
      return `<p class="d-p${ind}"${at} style="${blockStyle(b, t, S.body)}"${de("text")}>${inlineHtml(b.text ?? "")}</p>`;
    }

    case "bullet":
      return (
        `<p class="d-li d-bullet"${at} style="${blockStyle(b, t, S.body)}">` +
        `<span class="d-mk">·</span><span class="d-tx"${de("text")}>${inlineHtml(b.text ?? "")}</span></p>`
      );

    case "num":
      // 序号由渲染层用 CSS 计数器给,spec 里不存死数字(增删块后自动重排)
      return (
        `<p class="d-li d-num"${at} style="${blockStyle(b, t, S.body)}">` +
        `<span class="d-mk"></span><span class="d-tx"${de("text")}>${inlineHtml(b.text ?? "")}</span></p>`
      );

    case "quote":
      return `<blockquote class="d-quote"${at} style="${blockStyle(b, t, S.body)}"${de("text")}>${inlineHtml(b.text ?? "")}</blockquote>`;

    case "callout":
      return (
        `<div class="d-callout"${at} style="${blockStyle(b, t, S.body)}">` +
        (b.head ? `<div class="d-callout-h"${de("head")}>${inlineHtml(b.head)}</div>` : "") +
        `<div class="d-callout-b"${de("text")}>${inlineHtml(b.text ?? "")}</div></div>`
      );

    case "table": {
      const rows = Array.isArray(b.rows) ? b.rows : [];
      const cols = rows.reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 0), 0);
      const wsRaw = Array.isArray(b.widths) && b.widths.length === cols ? b.widths.map(Number) : null;
      const sum = wsRaw?.reduce((a, v) => a + (Number.isFinite(v) ? v : 0), 0) ?? 0;
      const cg =
        wsRaw && sum > 0
          ? `<colgroup>${wsRaw.map((w) => `<col style="width:${((w / sum) * 100).toFixed(3)}%">`).join("")}</colgroup>`
          : "";
      const head0 = b.head0 !== false;
      const row = (r: string[], ri: number) => {
        const cells = Array.from({ length: cols }, (_, ci) => {
          const v = Array.isArray(r) ? (r[ci] ?? "") : "";
          const tag = head0 && ri === 0 ? "th" : "td";
          return `<${tag}${de(`rows.${ri}.${ci}`)}>${inlineHtml(String(v))}</${tag}>`;
        }).join("");
        return `<tr>${cells}</tr>`;
      };
      let body: string;
      if (rowWin) {
        const [from, to] = rowWin;
        // 续页(from>0)先补一行表头,读者翻页后仍知道每列是什么 —— Word 的重复表头同义
        const head = head0 && from > 0 && rows[0] ? row(rows[0], 0) : "";
        body = head + rows.slice(from, to).map((r, k) => row(r, from + k)).join("");
      } else {
        body = rows.map(row).join("");
      }
      return `<table class="d-table"${at} style="${blockStyle(b, t, S.body)}">${cg}<tbody>${body}</tbody></table>`;
    }

    case "image": {
      const w = Number(b.w);
      const pct = Number.isFinite(w) && w > 0 && w <= 100 ? w : 100;
      const src = String(b.src ?? "");
      const img = src
        ? `<img src="${esc(src)}" style="width:${pct}%" alt="">`
        : `<div class="d-img-ph" style="width:${pct}%">配图待载入</div>`;
      return (
        `<figure class="d-fig"${at}>${img}` +
        (b.cap !== undefined ? `<figcaption${de("cap")}>${inlineHtml(b.cap)}</figcaption>` : "") +
        `</figure>`
      );
    }

    case "hr":
      return `<div class="d-hr"${at}></div>`;

    case "pagebreak":
      // 分页是**布局意图**,不是可见元素:DocViewer 分页时读 data-br 强制断页
      return `<div class="d-br"${at} data-br="1"></div>`;

    default:
      return `<p class="d-p"${at}${de("text")}>${inlineHtml(b?.text ?? "")}</p>`;
  }
}

/** 整份 spec → 逐块 HTML(顺序同 blocks)。DocViewer 拿去实测高度做分页。 */
export function docBlocksRender(spec: DocSpec): string[] {
  const blocks = Array.isArray(spec?.blocks) ? spec.blocks : [];
  return blocks.map((b, i) => blockHtml(b, i, spec));
}

/**
 * 纸张与文字样式表(注入 DocViewer 的 shadow-less 容器,类名统一 `d-` 前缀避免串味)。
 * 与导出端的字号/行距/边距同源 —— 改这里必须同步改 docx_native.rs。
 */
export function docPaperCss(spec: DocSpec): string {
  const t = docTheme(spec?.theme);
  const g = pageGeom(spec?.page);
  return `
.d-paper{background:#fff;color:${t.ink};font-family:"${t.font}",system-ui,sans-serif;
  width:${g.w}mm;padding:${g.mt}mm ${g.mr}mm ${g.mb}mm ${g.ml}mm;box-sizing:border-box;
  line-height:${t.lh};counter-reset:dnum;}
.d-paper *{box-sizing:border-box}
.d-title{font-family:"${t.headFont}";font-size:${t.sz.title}pt;font-weight:700;text-align:center;margin:0 0 6pt}
.d-sub{font-family:"楷体";font-size:${t.sz.subtitle}pt;color:${t.muted};text-align:center;margin:0 0 14pt}
.d-h1{font-family:"${t.headFont}";font-size:${t.sz.h1}pt;font-weight:700;margin:14pt 0 8pt;display:flex;align-items:center;gap:.5em}
.d-h1-mark{display:inline-block;width:.62em;height:.62em;background:${t.accent};flex:none}
.d-h2{font-family:"${t.headFont}";font-size:${t.sz.h2}pt;font-weight:700;color:${t.accent};margin:10pt 0 6pt}
.d-h3{font-size:${t.sz.h3}pt;font-weight:700;margin:8pt 0 4pt}
.d-p{font-size:${t.sz.body}pt;margin:0 0 8pt;text-align:justify}
.d-ind{text-indent:2em}
.d-li{font-size:${t.sz.body}pt;margin:0 0 6pt;padding-left:1.6em;position:relative;text-align:justify}
.d-li .d-mk{position:absolute;left:.3em;color:${t.accent};font-weight:700}
.d-num{counter-increment:dnum}
.d-num .d-mk::before{content:counter(dnum) "."}
.d-quote{font-family:"楷体";font-size:${t.sz.body}pt;margin:8pt 0;padding:2pt 0 2pt 12pt;
  border-left:3px solid ${t.accent};color:${t.muted}}
.d-callout{background:${t.soft};border:1px solid ${t.line};border-radius:4px;padding:8pt 10pt;margin:8pt 0}
.d-callout-h{font-weight:700;color:${t.accent};margin-bottom:3pt}
.d-table{width:100%;border-collapse:collapse;margin:8pt 0;font-size:${t.sz.body}pt;table-layout:fixed}
.d-table th,.d-table td{border:1px solid ${t.line};padding:4pt 6pt;vertical-align:top;word-break:break-word}
.d-table th{background:${t.soft};font-weight:700;text-align:center}
.d-fig{margin:8pt 0;text-align:center}
.d-fig img{max-width:100%}
.d-fig figcaption{font-size:${Math.max(9, t.sz.body - 1.5)}pt;color:${t.muted};margin-top:3pt}
.d-img-ph{display:inline-flex;align-items:center;justify-content:center;height:120px;
  border:1px dashed ${t.line};color:${t.muted};font-size:10pt}
.d-hr{border-top:1px solid ${t.line};margin:10pt 0}
.d-br{height:0;overflow:hidden}
.d-paper code{font-family:Consolas,monospace;background:${t.soft};padding:0 .25em;border-radius:2px}
/* 行内公式:允许在窄列里换行。KaTeX 自带 .katex{white-space:nowrap},在教学过程表这种
   4cm 宽的单元格里会让长公式**冲出格子压住邻列文字**(真踩过,整行糊成一片)。
   宁可公式在原子之间断行,也不能盖住别人的字。 */
.d-paper .dm{display:inline-block;max-width:100%;vertical-align:baseline}
.d-paper .dm .katex{white-space:normal}
`;
}

// ───────────────────────── 块级操作 ─────────────────────────
// 全部是**纯 spec 变换**:改的是 blocks 数组本身。编辑器只负责发意图(DocOp),
// 写盘/重转 .docx 由调用方(useSpecEdit)做 —— 与 PPT 侧 SlideOp 完全同构。

export type DocOp =
  | { kind: "dup"; index: number }
  | { kind: "del"; index: number }
  | { kind: "move"; index: number; to: number }
  /** 在 index 位置插入一个新块(模板见 NEW_BLOCKS) */
  | { kind: "add"; index: number; block: string }
  /** 改块的任意属性(align/size/color/bold/indent/w…);值为 null/undefined 即删字段 */
  | { kind: "set"; index: number; patch: Partial<DocBlock> }
  /** 改块类型(正文↔要点↔标题的一键转换,保留 text) */
  | { kind: "retype"; index: number; to: DocBlockType }
  /** 表格:增删行列 */
  | { kind: "row-add"; index: number; at: number }
  | { kind: "row-del"; index: number; at: number }
  | { kind: "col-add"; index: number; at: number }
  | { kind: "col-del"; index: number; at: number }
  /** 换主题(整份) */
  | { kind: "theme"; value: string }
  /** 改页面设置 */
  | { kind: "page"; patch: Partial<DocPage> }
  /** 多选批量删:一次删除 = 一步撤销(拆成 N 个单块 op 会灌爆撤销栈+重转 N 次) */
  | { kind: "blocks-del"; blocks: number[] }
  | { kind: "blocks-move"; blocks: number[]; to: number };

/** 「插入」可选的块模板(加完即可点字改)。 */
export const NEW_BLOCKS: { id: string; name: string; make: () => DocBlock }[] = [
  { id: "h1", name: "一级标题", make: () => ({ type: "h1", text: "新章节" }) },
  { id: "h2", name: "二级标题", make: () => ({ type: "h2", text: "新小节" }) },
  { id: "p", name: "正文段", make: () => ({ type: "p", text: "在这里写正文。" }) },
  { id: "bullet", name: "要点", make: () => ({ type: "bullet", text: "要点内容" }) },
  { id: "num", name: "编号项", make: () => ({ type: "num", text: "步骤内容" }) },
  { id: "callout", name: "提示框", make: () => ({ type: "callout", head: "重点", text: "在这里写要强调的内容。" }) },
  { id: "quote", name: "引文", make: () => ({ type: "quote", text: "在这里写一句话。" }) },
  {
    id: "table", name: "表格",
    make: () => ({
      type: "table", head0: true,
      rows: [["表头一", "表头二", "表头三"], ["", "", ""], ["", "", ""]],
    }),
  },
  { id: "image", name: "插图", make: () => ({ type: "image", src: "", w: 80, cap: "图注" }) },
  { id: "hr", name: "分隔线", make: () => ({ type: "hr" }) },
  { id: "pagebreak", name: "分页符", make: () => ({ type: "pagebreak" }) },
];

/** 表格块的列数(按最长行算)。 */
function tblCols(b: DocBlock): number {
  return (b.rows ?? []).reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 0), 0);
}

/**
 * 把一次块操作应用到 spec 对象(**原地改**)。返回是否真的改动了。
 * 越界/无意义的操作(把第一块上移、删到零块)一律拒绝 —— 宁可不改,也不要把 spec 写坏。
 */
export function applyDocOp(spec: any, op: DocOp): boolean {
  if (op.kind === "theme") {
    if (spec?.theme === op.value) return false;
    spec.theme = op.value;
    return true;
  }
  if (op.kind === "page") {
    if (!spec.page || typeof spec.page !== "object") spec.page = {};
    let changed = false;
    for (const [k, v] of Object.entries(op.patch)) {
      if ((spec.page as any)[k] === v) continue;
      if (v === undefined || v === null) delete (spec.page as any)[k];
      else (spec.page as any)[k] = v;
      changed = true;
    }
    return changed;
  }

  const blocks: DocBlock[] = spec?.blocks;
  if (!Array.isArray(blocks)) return false;

  if (op.kind === "blocks-del") {
    // 降序删,下标才不会互相踩
    const hit = [...new Set(op.blocks.filter((i) => i >= 0 && i < blocks.length))].sort((a, b) => b - a);
    if (!hit.length || hit.length >= blocks.length) return false;
    for (const i of hit) blocks.splice(i, 1);
    return true;
  }
  if (op.kind === "blocks-move") {
    const hit = [...new Set(op.blocks.filter((i) => i >= 0 && i < blocks.length))].sort((a, b) => a - b);
    if (!hit.length) return false;
    const moved = hit.map((i) => blocks[i]);
    for (const i of [...hit].reverse()) blocks.splice(i, 1);
    const before = hit.filter((i) => i < op.to).length;
    const to = Math.max(0, Math.min(op.to - before, blocks.length));
    blocks.splice(to, 0, ...moved);
    return true;
  }

  const i = op.index;
  if (op.kind !== "add" && (i < 0 || i >= blocks.length)) return false;

  switch (op.kind) {
    case "dup":
      // 深拷贝:浅拷贝会让两块共享 rows 数组,改一处另一处跟着变
      blocks.splice(i + 1, 0, JSON.parse(JSON.stringify(blocks[i])));
      return true;

    case "del":
      if (blocks.length <= 1) return false; // 空 spec 渲染不出东西,留最后一块
      blocks.splice(i, 1);
      return true;

    case "move": {
      const to = Math.max(0, Math.min(op.to, blocks.length - 1));
      if (to === i) return false;
      blocks.splice(to, 0, blocks.splice(i, 1)[0]);
      return true;
    }

    case "add": {
      const tpl = NEW_BLOCKS.find((b) => b.id === op.block) ?? NEW_BLOCKS[2];
      blocks.splice(Math.max(0, Math.min(i, blocks.length)), 0, tpl.make());
      return true;
    }

    case "set": {
      const b = blocks[i] as any;
      let changed = false;
      for (const [k, v] of Object.entries(op.patch)) {
        if (b[k] === v) continue;
        if (v === undefined || v === null || v === "") delete b[k];
        else b[k] = v;
        changed = true;
      }
      return changed;
    }

    case "retype": {
      const b = blocks[i];
      if (b.type === op.to) return false;
      const keep = b.text ?? "";
      // 换类型即换语义:表格/图片专属字段跟着走会渲染出鬼东西,一律丢弃
      const next: DocBlock = { type: op.to };
      if (op.to === "table") {
        next.head0 = true;
        next.rows = [["表头一", "表头二"], ["", ""]];
      } else if (op.to === "image") {
        next.src = "";
        next.w = 80;
      } else if (op.to !== "hr" && op.to !== "pagebreak") {
        next.text = keep;
        if (b.align) next.align = b.align;
        if (b.color) next.color = b.color;
        if (b.size) next.size = b.size;
        if (op.to === "callout" && b.head) next.head = b.head;
      }
      blocks[i] = next;
      return true;
    }

    case "row-add": {
      const b = blocks[i];
      if (b.type !== "table" || !Array.isArray(b.rows)) return false;
      const cols = Math.max(1, tblCols(b));
      const at = Math.max(0, Math.min(op.at, b.rows.length));
      b.rows.splice(at, 0, Array.from({ length: cols }, () => ""));
      return true;
    }
    case "row-del": {
      const b = blocks[i];
      if (b.type !== "table" || !Array.isArray(b.rows) || b.rows.length <= 1) return false;
      if (op.at < 0 || op.at >= b.rows.length) return false;
      b.rows.splice(op.at, 1);
      return true;
    }
    case "col-add": {
      const b = blocks[i];
      if (b.type !== "table" || !Array.isArray(b.rows)) return false;
      const cols = tblCols(b);
      const at = Math.max(0, Math.min(op.at, cols));
      for (const r of b.rows) {
        while (r.length < cols) r.push("");
        r.splice(at, 0, "");
      }
      if (Array.isArray(b.widths) && b.widths.length === cols) {
        const avg = b.widths.reduce((a, v) => a + v, 0) / Math.max(1, cols);
        b.widths.splice(at, 0, avg);
      }
      return true;
    }
    case "col-del": {
      const b = blocks[i];
      if (b.type !== "table" || !Array.isArray(b.rows)) return false;
      const cols = tblCols(b);
      if (cols <= 1 || op.at < 0 || op.at >= cols) return false;
      for (const r of b.rows) if (op.at < r.length) r.splice(op.at, 1);
      if (Array.isArray(b.widths) && op.at < b.widths.length) b.widths.splice(op.at, 1);
      return true;
    }
  }
}

// ───────────────────────── 大纲 ─────────────────────────

export interface DocOutlineItem {
  index: number;
  level: number;
  text: string;
}

/** 标题块 → 左栏大纲(与 PPT 侧缩略图栏同位)。 */
export function docOutline(spec: DocSpec): DocOutlineItem[] {
  const lv: Partial<Record<DocBlockType, number>> = { title: 0, h1: 1, h2: 2, h3: 3 };
  const out: DocOutlineItem[] = [];
  (spec?.blocks ?? []).forEach((b, index) => {
    const level = lv[b.type as DocBlockType];
    if (level === undefined) return;
    out.push({ index, level, text: plainText(b.text ?? "") || "(空标题)" });
  });
  return out;
}

/** 全文字数(去行内标记、含表格文字)——编辑器状态栏用。 */
export function docWordCount(spec: DocSpec): number {
  let n = 0;
  for (const b of spec?.blocks ?? []) {
    n += plainText(b.text ?? "").length + plainText(b.head ?? "").length;
    for (const r of b.rows ?? []) for (const c of r) n += plainText(c).length;
  }
  return n;
}

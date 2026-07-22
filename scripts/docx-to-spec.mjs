#!/usr/bin/env node
/**
 * docx-to-spec.mjs —— 把青教赛范式的 .docx 教案批量转成 polaris.doc.json（教案范例库资产）。
 *
 * 零依赖：docx 就是个 zip，用内置 zlib.inflateRawSync 解条目；document.xml 用手写扫描器解析
 * （仓库刻意不引任何前端 office 库，别 npm install）。
 *
 * 产出（全部幂等，可反复重跑，同名覆盖）：
 *   public/sample-docs/<docId>.json        转好的 spec（契约见 docs/DOC_SPEC.md）
 *   public/sample-doc-files/<docId>.docx   原始 docx 副本（「做同款」当附件喂对话）
 *   public/sample-covers/<docId>.svg       480×270 封面（纸感白底 + 学科主色）
 *   scripts/sample-docs.manifest.json      清单（docId/标题/学科/块数/字数/提示词）
 *
 * 用法：
 *   node scripts/docx-to-spec.mjs                       # 用默认源目录（桌面高中教案库）
 *   node scripts/docx-to-spec.mjs --src="D:\\某目录"      # 换源目录
 *   node scripts/docx-to-spec.mjs --dry                 # 只解析报统计，不落盘
 *
 * 源目录**只读**：脚本只 readFileSync / copyFileSync，绝不写回源目录。
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import os from "node:os";
import { fileURLToPath } from "node:url";

// ─────────────────────────── 路径 ───────────────────────────

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SRC = path.join(os.homedir(), "Desktop", "高中教案库(青教赛范式15篇)");

const argv = process.argv.slice(2);
const argOf = (k) => {
  const hit = argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : null;
};
const SRC_DIR = argOf("src") ?? DEFAULT_SRC;
const DRY = argv.includes("--dry");

const OUT_SPEC = path.join(ROOT, "public", "sample-docs");
const OUT_FILE = path.join(ROOT, "public", "sample-doc-files");
const OUT_COVER = path.join(ROOT, "public", "sample-covers");
const OUT_MANIFEST = path.join(ROOT, "scripts", "sample-docs.manifest.json");

// ─────────────────────────── zip 读取 ───────────────────────────

/** 从 zip buffer 里取出一个条目（只支持 store/deflate，docx 只用这两种）。 */
function unzipEntry(buf, want) {
  // 从尾部倒着找「中央目录结束记录」EOCD（0x06054b50）
  let eocd = -1;
  const floor = Math.max(0, buf.length - 66000);
  for (let i = buf.length - 22; i >= floor; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("不是合法 zip：找不到 EOCD");
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error("中央目录头损坏");
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const cmtLen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
    if (name === want) {
      // 本地文件头的 name/extra 长度可能与中央目录不同，必须重新读
      const lnLen = buf.readUInt16LE(lho + 26);
      const leLen = buf.readUInt16LE(lho + 28);
      const start = lho + 30 + lnLen + leLen;
      const raw = buf.subarray(start, start + compSize);
      return method === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw);
    }
    off += 46 + nameLen + extraLen + cmtLen;
  }
  return null;
}

// ─────────────────────────── XML 小工具 ───────────────────────────

const XML_ENT = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
function xmlText(s) {
  return String(s).replace(/&(lt|gt|amp|quot|apos|#x?[0-9a-fA-F]+);/g, (m, e) => {
    if (XML_ENT[e]) return XML_ENT[e];
    if (e[0] === "#") return String.fromCodePoint(parseInt(e[1] === "x" || e[1] === "X" ? e.slice(2) : e.slice(1), e[1] === "x" || e[1] === "X" ? 16 : 10));
    return m;
  });
}

/** 取某元素的属性值（在给定标签片段里）。 */
function attr(tagStr, name) {
  const m = new RegExp(`\\s${name.replace(":", "\\:")}\\s*=\\s*"([^"]*)"`).exec(tagStr);
  return m ? m[1] : null;
}

/**
 * 从 xml 的 pos 处（必须正好是 `<tag` 的 `<`）扫到该元素闭合，返回 [完整片段, 结束下标]。
 * 支持自闭合与同名嵌套。
 */
function sliceElement(xml, pos, tag) {
  const open = new RegExp(`<${tag}(?=[\\s/>])`, "g");
  const close = `</${tag}>`;
  // 先判断首个标签是不是自闭合
  const headEnd = xml.indexOf(">", pos);
  if (headEnd < 0) return [xml.slice(pos), xml.length];
  if (xml[headEnd - 1] === "/") return [xml.slice(pos, headEnd + 1), headEnd + 1];
  let depth = 1;
  let i = headEnd + 1;
  while (i < xml.length && depth > 0) {
    const nOpen = (() => { open.lastIndex = i; const m = open.exec(xml); return m ? m.index : -1; })();
    const nClose = xml.indexOf(close, i);
    if (nClose < 0) break;
    if (nOpen >= 0 && nOpen < nClose) {
      // 自闭合的同名标签不增加深度
      const he = xml.indexOf(">", nOpen);
      if (he > 0 && xml[he - 1] !== "/") depth++;
      i = he + 1;
    } else {
      depth--;
      i = nClose + close.length;
    }
  }
  return [xml.slice(pos, i), i];
}

/** 把某元素的直接子元素按出现顺序列出：[{tag, xml}]。 */
function children(elXml) {
  const out = [];
  const bodyStart = elXml.indexOf(">") + 1;
  if (elXml[bodyStart - 2] === "/") return out; // 自闭合
  const endTag = elXml.lastIndexOf("</");
  let i = bodyStart;
  const end = endTag > 0 ? endTag : elXml.length;
  while (i < end) {
    const lt = elXml.indexOf("<", i);
    if (lt < 0 || lt >= end) break;
    const m = /^<([A-Za-z0-9:_.-]+)/.exec(elXml.slice(lt, lt + 40));
    if (!m) { i = lt + 1; continue; }
    const [frag, next] = sliceElement(elXml, lt, m[1]);
    out.push({ tag: m[1], xml: frag });
    i = next;
  }
  return out;
}

// ─────────────────────── OMML → LaTeX ───────────────────────
// 覆盖 DOC_SPEC.md §3 列出的子集；超出的降级成纯文字（把里面的 m:t 抠出来直排）。

/** 常见数学 Unicode → LaTeX 命令（KaTeX 对部分 unicode 不认，统一转掉更稳）。 */
const UNI2TEX = {
  "≥": "\\ge ", "≤": "\\le ", "≠": "\\ne ", "≈": "\\approx ", "≡": "\\equiv ",
  "×": "\\times ", "÷": "\\div ", "±": "\\pm ", "∓": "\\mp ", "⋅": "\\cdot ", "·": "\\cdot ",
  "∈": "\\in ", "∉": "\\notin ", "⊂": "\\subset ", "⊆": "\\subseteq ", "∪": "\\cup ", "∩": "\\cap ",
  "∞": "\\infty ", "∅": "\\varnothing ", "∀": "\\forall ", "∃": "\\exists ",
  "→": "\\to ", "←": "\\leftarrow ", "⇒": "\\Rightarrow ", "⇔": "\\Leftrightarrow ", "↔": "\\leftrightarrow ",
  "√": "\\sqrt ", "∑": "\\sum ", "∏": "\\prod ", "∫": "\\int ", "∂": "\\partial ", "∇": "\\nabla ",
  "−": "-", "－": "-", "＋": "+", "＝": "=",
  "°": "^{\\circ}", "′": "'", "″": "''", "…": "\\dots ", "⋯": "\\cdots ", "⋮": "\\vdots ", "⋱": "\\ddots ", "∠": "\\angle ", "⊥": "\\perp ", "∥": "\\parallel ",
  "α": "\\alpha ", "β": "\\beta ", "γ": "\\gamma ", "δ": "\\delta ", "ε": "\\varepsilon ", "ζ": "\\zeta ",
  "η": "\\eta ", "θ": "\\theta ", "ι": "\\iota ", "κ": "\\kappa ", "λ": "\\lambda ", "μ": "\\mu ",
  "ν": "\\nu ", "ξ": "\\xi ", "π": "\\pi ", "ρ": "\\rho ", "σ": "\\sigma ", "τ": "\\tau ",
  "υ": "\\upsilon ", "φ": "\\varphi ", "χ": "\\chi ", "ψ": "\\psi ", "ω": "\\omega ",
  "Γ": "\\Gamma ", "Δ": "\\Delta ", "Θ": "\\Theta ", "Λ": "\\Lambda ", "Ξ": "\\Xi ",
  "Π": "\\Pi ", "Σ": "\\Sigma ", "Φ": "\\Phi ", "Ψ": "\\Psi ", "Ω": "\\Omega ",
  "{": "\\{", "}": "\\}", "$": "\\$", "%": "\\%", "&": "\\&", "#": "\\#", "_": "\\_",
};

/**
 * 源 docx 里被吃掉反斜杠的 LaTeX 命令名（长的排前面，正则择优先匹配 arcsin 而非 sin）。
 * 只放「在中学数学语境下不可能是变量名」的词，免得把 `ab` 之类正常字母串改坏。
 */
const LOST_CMDS = [
  "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh",
  "sin", "cos", "tan", "cot", "sec", "csc",
  "log", "lim", "ln", "lg", "exp", "max", "min", "det", "gcd",
  "left", "right", "sim", "cdot", "quad", "approx", "infty", "times",
];
const LOST_CMD_RE = new RegExp(`(?:${LOST_CMDS.join("|")})`, "g");

/**
 * 补回被吃掉的反斜杠。**必须先把已有的 `\xxx` 命令切出来保护起来** ——
 * 否则 `\Leftrightarrow` 里的 right 会被再插一根反斜杠，炸成 `\Left\rightarrow`。
 */
function restoreLostCmds(tex) {
  return tex
    .split(/(\\[A-Za-z]+)/) // 奇数段 = 已有命令，原样放行
    .map((seg, i) => (i % 2 ? seg : seg.replace(LOST_CMD_RE, (m) => `\\${m} `)))
    .join("");
}

/** m:t 的裸文字 → LaTeX 片段。 */
function texEscape(s) {
  let out = "";
  for (const ch of String(s)) out += UNI2TEX[ch] ?? ch;
  return out;
}

/** 兜底：把任意 OMML 片段里的 m:t 抠出来拼成纯文字（降级路径）。 */
function ommlPlain(xml) {
  return Array.from(xml.matchAll(/<m:t[^>]*>([\s\S]*?)<\/m:t>/g)).map((m) => xmlText(m[1])).join("");
}

/** 取 OMML 元素里所有 `m:e` 直接子元素的 LaTeX（多数结构的「本体」槽）。 */
function slot(elXml, name) {
  const kid = children(elXml).find((c) => c.tag === name);
  return kid ? ommlNodes(children(kid.xml)) : "";
}

/**
 * 大括号包裹。**一律包**：`\frac` 后面裸跟字母会粘成 `\fracax` 这种不存在的命令
 * （只有纯数字才安全，但省这两个花括号不值当）。
 */
function brace(s) {
  return `{${String(s)}}`;
}

/** 一串 OMML 子节点 → LaTeX。 */
function ommlNodes(kids) {
  let out = "";
  for (const k of kids) out += ommlNode(k);
  return out;
}

function ommlNode(node) {
  const { tag, xml } = node;
  switch (tag) {
    case "m:r": // 裸符号：把所有 m:t 连起来
      return Array.from(xml.matchAll(/<m:t[^>]*>([\s\S]*?)<\/m:t>/g)).map((m) => texEscape(xmlText(m[1]))).join("");
    case "m:f": // 分式
      return `\\frac${brace(slot(xml, "m:num"))}${brace(slot(xml, "m:den"))}`;
    case "m:sSup":
      return `${brace(slot(xml, "m:e"))}^${brace(slot(xml, "m:sup"))}`;
    case "m:sSub":
      return `${brace(slot(xml, "m:e"))}_${brace(slot(xml, "m:sub"))}`;
    case "m:sSubSup":
      return `${brace(slot(xml, "m:e"))}_${brace(slot(xml, "m:sub"))}^${brace(slot(xml, "m:sup"))}`;
    case "m:rad": {
      const hide = /<m:degHide[^>]*w?:?val="(?:1|true|on)"/.test(xml) || /<m:degHide[^>]*\/>/.test(xml) && !/<m:deg>\s*<m:r>/.test(xml);
      const deg = slot(xml, "m:deg");
      const e = slot(xml, "m:e");
      return deg && !hide ? `\\sqrt[${deg}]{${e}}` : `\\sqrt{${e}}`;
    }
    case "m:d": { // 括号对
      const pr = children(xml).find((c) => c.tag === "m:dPr")?.xml ?? "";
      const beg = attr(/<m:begChr[^>]*>/.exec(pr)?.[0] ?? "", "m:val") ?? "(";
      const end = attr(/<m:endChr[^>]*>/.exec(pr)?.[0] ?? "", "m:val") ?? ")";
      const inner = children(xml).filter((c) => c.tag === "m:e").map((c) => ommlNodes(children(c.xml))).join(",");
      const L = { "(": "(", "[": "[", "{": "\\{", "|": "|", "⟨": "\\langle" }[beg] ?? "(";
      const R = { ")": ")", "]": "]", "}": "\\}", "|": "|", "⟩": "\\rangle" }[end] ?? ")";
      return `\\left${L}${inner}\\right${R}`;
    }
    case "m:nary": { // ∑ ∫ ∏ 带上下限
      const pr = children(xml).find((c) => c.tag === "m:naryPr")?.xml ?? "";
      const chr = attr(/<m:chr[^>]*>/.exec(pr)?.[0] ?? "", "m:val") ?? "∑";
      const op = { "∑": "\\sum", "∏": "\\prod", "∫": "\\int", "∬": "\\iint", "∮": "\\oint", "⋃": "\\bigcup", "⋂": "\\bigcap" }[chr] ?? "\\sum";
      const sub = slot(xml, "m:sub");
      const sup = slot(xml, "m:sup");
      return `${op}${sub ? `_${brace(sub)}` : ""}${sup ? `^${brace(sup)}` : ""}${slot(xml, "m:e")}`;
    }
    case "m:func": { // sin/cos/lim…
      const fn = children(xml).find((c) => c.tag === "m:fName");
      const name = fn ? ommlNodes(children(fn.xml)) : "";
      const known = ["sin", "cos", "tan", "cot", "sec", "csc", "log", "ln", "lg", "lim", "exp", "max", "min", "arcsin", "arccos", "arctan"];
      const head = known.includes(name.trim()) ? `\\${name.trim()}` : `\\operatorname{${name}}`;
      return `${head} ${slot(xml, "m:e")}`;
    }
    case "m:acc": { // 向量/均值符号
      const pr = children(xml).find((c) => c.tag === "m:accPr")?.xml ?? "";
      const chr = attr(/<m:chr[^>]*>/.exec(pr)?.[0] ?? "", "m:val") ?? "̂";
      const cmd = { "⃗": "\\vec", "̄": "\\bar", "̂": "\\hat", "̃": "\\tilde", "̇": "\\dot" }[chr] ?? "\\hat";
      return `${cmd}{${slot(xml, "m:e")}}`;
    }
    case "m:bar":
      return `\\overline{${slot(xml, "m:e")}}`;
    case "m:e":
    case "m:oMath":
    case "m:oMathPara":
      return ommlNodes(children(xml));
    // 结构性/样式性节点：跳过
    case "m:fPr": case "m:sSupPr": case "m:sSubPr": case "m:sSubSupPr":
    case "m:radPr": case "m:dPr": case "m:naryPr": case "m:accPr": case "m:funcPr":
    case "m:ctrlPr": case "m:barPr": case "m:rPr":
      return "";
    default:
      // 超出契约子集 → 降级成纯文字
      return texEscape(ommlPlain(xml));
  }
}

/** <m:oMath> 片段 → `$latex$`（空则返回空串）。 */
function ommlToInline(xml) {
  let tex = ommlNodes(children(xml)).trim();
  if (!tex) return "";
  // 源文是「LaTeX → OMML 时把反斜杠吃掉了」的产物：sin/ln/left/right/sim 全成了裸字母，
  // 直排会被 KaTeX 当成 s·i·n 三个斜体变量。这里把已知命令名的反斜杠补回来
  // （已带反斜杠的用 (?<!\\) 挡住；\Leftrightarrow 里的 Left 是大写，天然不撞）。
  tex = restoreLostCmds(tex);
  // 同一类残缺：\; \, 的反斜杠也丢了，留下裸的 ; 与 ,,
  tex = tex.replace(/,,/g, ",\\,").replace(/(^|[^\\]);/g, "$1\\;");
  // \left( \right) 后面不该跟空格（\left ( 是合法但难看），顺手收一下
  tex = tex.replace(/\\(left|right)\s+/g, "\\$1");
  // 行内公式语法是 $...$，内部不能再有裸 $ 或换行
  tex = tex.replace(/\$/g, "\\$").replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ");
  return `$${tex}$`;
}

// ─────────────────────── 段落 / 表格解析 ───────────────────────

/** 解析 w:rPr 的样式开关。 */
function runStyle(rXml) {
  const prM = /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(rXml);
  const pr = prM ? prM[0] : "";
  const on = (tag) => {
    const m = new RegExp(`<w:${tag}(\\s[^>]*)?/?>`).exec(pr);
    if (!m) return false;
    const v = attr(m[0], "w:val");
    return v == null ? true : !["0", "false", "off", "none"].includes(v);
  };
  const szM = /<w:sz\s[^>]*w:val="(\d+)"/.exec(pr);
  return {
    b: on("b"),
    i: on("i"),
    u: on("u"),
    s: on("strike") || on("dstrike"),
    sz: szM ? Number(szM[1]) : 0,
  };
}

/** 一个 w:r 的可见文字（w:t / w:tab / w:br；不含公式）。 */
function runText(rXml) {
  let out = "";
  for (const c of children(rXml)) {
    if (c.tag === "w:t") {
      const inner = c.xml.slice(c.xml.indexOf(">") + 1, c.xml.lastIndexOf("</"));
      out += xmlText(inner);
    } else if (c.tag === "w:tab") out += "\t";
    else if (c.tag === "w:br" || c.tag === "w:cr") out += "\n";
    else if (c.tag === "w:noBreakHyphen") out += "-";
  }
  return out;
}

/**
 * 解析一个 w:p → { text, jc, firstLine, left, maxSz, allBold, empty }
 * text 已带行内标记（粗、斜、下划线、删除线与 $公式$）。
 * 行内标记只在「段内粗/斜不一致」时才写 —— 整段同粗（标题、表头）属块级样式，写 ** 是噪音。
 */
function parsePara(pXml) {
  const kids = children(pXml);
  const pPr = kids.find((c) => c.tag === "w:pPr")?.xml ?? "";
  const jc = attr(/<w:jc\s[^>]*\/?>/.exec(pPr)?.[0] ?? "", "w:val");
  const indTag = /<w:ind\s[^>]*\/?>/.exec(pPr)?.[0] ?? "";
  const firstLine = Number(attr(indTag, "w:firstLine") ?? 0);
  const left = Number(attr(indTag, "w:left") ?? 0);

  // 先收集「片段」：文字片段带样式，公式片段原样
  const segs = [];
  const walk = (list) => {
    for (const c of list) {
      if (c.tag === "w:r") {
        const t = runText(c.xml);
        const om = Array.from(c.xml.matchAll(/<m:oMath[\s>][\s\S]*?<\/m:oMath>/g));
        if (t) segs.push({ kind: "t", text: t, st: runStyle(c.xml) });
        for (const m of om) segs.push({ kind: "m", text: ommlToInline(m[0]) });
      } else if (c.tag === "m:oMath") {
        segs.push({ kind: "m", text: ommlToInline(c.xml) });
      } else if (c.tag === "m:oMathPara") {
        for (const g of children(c.xml)) if (g.tag === "m:oMath") segs.push({ kind: "m", text: ommlToInline(g.xml) });
      } else if (c.tag === "w:hyperlink" || c.tag === "w:smartTag" || c.tag === "w:ins" || c.tag === "w:sdt" || c.tag === "w:sdtContent") {
        walk(children(c.xml));
      }
    }
  };
  walk(kids);

  // 「■ 」「· 」这种项目符号在源文里是**独立的加粗 run**（正文不粗）。
  // 不摘出来的话，段内粗细不一致会给它套上 **，前缀正则就认不出了 —— 先摘掉，
  // 并且不让它参与「段内粗斜是否一致」的判定。
  let marker = "";
  const first = segs.find((s) => s.kind !== "t" || s.text.trim());
  if (first && first.kind === "t" && /^\s*[■·•▪●○]\s*$/.test(first.text) && segs.length > 1) {
    marker = first.text.trim();
    segs.splice(segs.indexOf(first), 1);
  }

  const txtSegs = segs.filter((s) => s.kind === "t" && s.text.trim());
  const maxSz = txtSegs.reduce((m, s) => Math.max(m, s.st.sz), 0);
  const boldVals = new Set(txtSegs.map((s) => s.st.b));
  const italVals = new Set(txtSegs.map((s) => s.st.i));
  const markBold = boldVals.size > 1;   // 段内粗细不一致 → 才写 **
  const markItal = italVals.size > 1;

  let text = "";
  for (const s of segs) {
    if (s.kind === "m") { text += s.text; continue; }
    let t = s.text;
    if (!t) continue;
    // 标记只包非空白主体，前后空白留在外面（**  粗** 会渲染失败）
    const lead = /^\s*/.exec(t)[0];
    const tail = /\s*$/.exec(t)[0];
    let core = t.slice(lead.length, t.length - tail.length);
    if (core) {
      if (s.st.s) core = `~~${core}~~`;
      if (s.st.u) core = `__${core}__`;
      if (markItal && s.st.i) core = `*${core}*`;
      if (markBold && s.st.b) core = `**${core}**`;
    }
    text += lead + core + tail;
  }
  text = text.replace(/\t/g, " ").replace(/[ 　]+$/g, "").replace(/^\n+|\n+$/g, "");

  // 项目符号也可能与正文同在一个 run 里，兜底再剥一次
  if (!marker) {
    const mm = /^([■·•▪●○])\s+/.exec(text);
    if (mm) { marker = mm[1]; text = text.slice(mm[0].length); }
  }

  return {
    text,
    marker,
    jc: jc ?? "",
    firstLine,
    left,
    maxSz,
    allBold: txtSegs.length > 0 && txtSegs.every((s) => s.st.b),
    empty: !text.trim(),
  };
}

/** 解析 w:tbl → { rows, widths, head0 } */
function parseTable(tXml) {
  const kids = children(tXml);
  const grid = kids.find((c) => c.tag === "w:tblGrid");
  const widths = grid
    ? children(grid.xml).filter((c) => c.tag === "w:gridCol").map((c) => Number(attr(c.xml, "w:w") || 1))
    : [];
  const rows = [];
  const boldFlags = [];
  for (const tr of kids.filter((c) => c.tag === "w:tr")) {
    const cells = [];
    const bolds = [];
    for (const tc of children(tr.xml).filter((c) => c.tag === "w:tc")) {
      const paras = children(tc.xml).filter((c) => c.tag === "w:p").map((c) => parsePara(c.xml));
      const lines = paras.map((p) => p.text.trim()).filter(Boolean);
      cells.push(lines.join("\n"));
      bolds.push(paras.some((p) => p.text.trim()) && paras.filter((p) => p.text.trim()).every((p) => p.allBold));
    }
    if (cells.length) { rows.push(cells); boldFlags.push(bolds); }
  }
  // 首行是否表头：整行都加粗才算（4×4 基本信息表首行「学科|数学|…」半粗半不粗 → head0:false）
  const head0 = boldFlags.length > 0 && boldFlags[0].length > 0 && boldFlags[0].every(Boolean);
  const cols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return {
    rows: rows.map((r) => (r.length === cols ? r : [...r, ...Array(cols - r.length).fill("")])),
    widths: widths.length === cols ? widths : null,
    head0,
  };
}

// ─────────────────────── 段落 → 块 ───────────────────────

/** 允许当 callout 头的方括号词（【提升】【挑战】是作业要点，不算 callout）。 */
const CALLOUT_HEADS = new Set(["重点", "难点", "易错", "注意", "关键", "提示", "警示"]);

/**
 * 整段被一对中文括号包住 → 返回去掉外层括号的内容；否则返回 null。
 * 括号配对扫描：首个「（」必须与末尾的「）」配对，中间的内层括号不算数。
 */
function stripOuterParen(s) {
  if (!s.startsWith("（") || !s.endsWith("）") || s.length < 3) return null;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "（") depth++;
    else if (s[i] === "）") {
      depth--;
      if (depth === 0 && i !== s.length - 1) return null; // 首括号在中途就闭合了
    }
  }
  return depth === 0 ? s.slice(1, -1).trim() : null;
}

function docxToSpec(xml) {
  const bodyStart = xml.indexOf("<w:body>");
  const body = xml.slice(bodyStart + 8, xml.lastIndexOf("</w:body>"));
  const blocks = [];
  let sawTitle = false;
  let sawSubtitle = false;

  let i = 0;
  while (i < body.length) {
    const lt = body.indexOf("<", i);
    if (lt < 0) break;
    const m = /^<([A-Za-z0-9:_.-]+)/.exec(body.slice(lt, lt + 30));
    if (!m) { i = lt + 1; continue; }
    const [frag, next] = sliceElement(body, lt, m[1]);
    i = next;

    if (m[1] === "w:tbl") {
      const t = parseTable(frag);
      if (!t.rows.length) continue;
      const b = { type: "table", rows: t.rows, head0: t.head0 };
      if (t.widths) b.widths = t.widths;
      blocks.push(b);
      continue;
    }
    if (m[1] !== "w:p") continue;

    const p = parsePara(frag);
    if (p.empty) continue; // 空段一律丢弃
    const raw = p.text;
    const flat = raw.trim();

    // 1) 大标题：居中 + 字号 ≥ 40 半磅（=20pt）
    if (!sawTitle && p.jc === "center" && p.maxSz >= 40) {
      blocks.push({ type: "title", text: flat });
      sawTitle = true;
      continue;
    }
    // 2) 副标题：标题后紧跟的居中小字
    if (sawTitle && !sawSubtitle && p.jc === "center" && p.maxSz < 40) {
      blocks.push({ type: "subtitle", text: flat });
      sawSubtitle = true;
      continue;
    }
    // 3) 「■ 一、xxx」→ h1（方块由渲染器加，text 里不留）
    if (p.marker === "■") {
      blocks.push({ type: "h1", text: flat });
      continue;
    }
    // 4) 「· xxx」→ bullet（圆点由渲染器加）
    if (p.marker) {
      blocks.push({ type: "bullet", text: flat });
      continue;
    }
    // 5) 「（1. 知识与技能）」整段被中文括号包住 → h2（去外层括号）
    //    内层还可能再套括号（「（2. 过程与方法（核心素养落点））」），要配对判断而不是 [^（）]
    const inner = stripOuterParen(flat);
    if (inner !== null) {
      blocks.push({ type: "h2", text: inner });
      continue;
    }
    // 6) 「【重点】…」→ callout
    const co = /^【([^】]{1,4})】\s*([\s\S]*)$/.exec(flat);
    if (co && CALLOUT_HEADS.has(co[1])) {
      blocks.push({ type: "callout", head: co[1], text: co[2].trim() });
      continue;
    }
    // 7) 正文：有 firstLine 缩进走默认，其余显式取消缩进
    const b = { type: "p", text: flat };
    if (!(p.firstLine > 0)) b.indent = "none";
    if (p.jc === "center") b.align = "center";
    else if (p.jc === "right") b.align = "right";
    blocks.push(b);
  }

  return { version: 1, theme: "qingjiao", page: { size: "a4" }, blocks };
}

// ─────────────────────── 统计 ───────────────────────

/** 与 docSpec.ts 的 plainText 同规则：剥掉行内标记拿纯字。 */
function plainText(src) {
  return String(src ?? "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\$([^$\n]+)\$/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1");
}

function specStats(spec) {
  let words = 0, tables = 0, formulas = 0;
  const countF = (s) => (String(s).match(/\$[^$\n]+\$/g) ?? []).length;
  for (const b of spec.blocks) {
    words += plainText(b.text ?? "").length + plainText(b.head ?? "").length;
    formulas += countF(b.text ?? "") + countF(b.head ?? "");
    if (b.type === "table") {
      tables++;
      for (const r of b.rows ?? []) for (const c of r) { words += plainText(c).length; formulas += countF(c); }
    }
  }
  return { blocks: spec.blocks.length, words, tables, formulas };
}

// ─────────────────────── docId / 学科 / 封面 ───────────────────────

/** 文件序号 → 稳定 docId（全小写下划线；改名请同步 manifest 与前端引用）。 */
const DOC_IDS = {
  "01": "lesson_math_derivative",
  "02": "lesson_math_ellipse_chord",
  "03": "lesson_math_series_sum",
  "04": "lesson_math_trig_identity",
  "05": "lesson_math_distribution",
  "06": "lesson_english_continuation",
  "07": "lesson_english_grammar_fill",
  "08": "lesson_english_inference",
  "09": "lesson_english_summary",
  "10": "lesson_chinese_poetry_diction",
  "11": "lesson_chinese_classical_translation",
  "12": "lesson_politics_contradiction",
  "13": "lesson_history_xinhai",
  "14": "lesson_geography_weather_system",
  "15": "lesson_physics_magnetic_field",
};

/** 学科主色（同学科同色；与 docSpec 的主题色系同调，都是低饱和「墨」系）。 */
const SUBJECT_COLOR = {
  语文: { main: "#8C2B2B", soft: "#F7EFEF", tag: "#FBE9E9" },
  数学: { main: "#2C4661", soft: "#EDF2F7", tag: "#E6EEF6" },
  英语: { main: "#1F6F63", soft: "#EAF4F1", tag: "#E2F1ED" },
  政治: { main: "#B0533A", soft: "#FAF0EC", tag: "#FBE9E2" },
  历史: { main: "#7A5230", soft: "#F7F1E9", tag: "#F5EADC" },
  地理: { main: "#3E6B4F", soft: "#EDF4EF", tag: "#E5F0E8" },
  物理: { main: "#4E4A85", soft: "#F0EFF7", tag: "#E9E7F5" },
};
const FALLBACK_COLOR = { main: "#2C4661", soft: "#EDF2F7", tag: "#E6EEF6" };

/** 给 AI 的一句话提示词（点范例卡时预填进输入框）。 */
function makePrompt(subject, title) {
  return `写一份高中${subject}《${title}》的青教赛范式教案，含课标考情、学情分析、教学目标、重难点、教学过程表与分层作业。`;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const isCjk = (ch) => /[⺀-鿿豈-﫿＀-￯　-〿]/.test(ch);
/** 视觉宽度（以「一个汉字 = 1」计；西文按 0.55 折算）。 */
const visWidth = (s) => Array.from(s).reduce((n, ch) => n + (isCjk(ch) ? 1 : 0.55), 0);
/** 不能出现在行首的字符（闭括号、点号）；不能出现在行尾的字符（开括号）。 */
const NO_LINE_START = "）」』】》〉〕｝、。，；：？！·…—～)]}%,.;:?!";
const NO_LINE_END = "（「『【《〈〔｛([{“‘";

/**
 * 标题折行：中文按字断、西文按词断，并遵守中文避头尾规则
 * （闭括号/点号不落行首，开括号不落行尾）—— 不做的话会出现「…低压（ / 气旋）…」这种断法。
 */
function wrapTitle(title, perLine, maxLines = 3) {
  const t = String(title).trim();
  // 切词：汉字/全角标点各自成词，连续西文字母数字成一词
  const tokens = [];
  let buf = "";
  for (const ch of t) {
    if (isCjk(ch)) { if (buf) { tokens.push(buf); buf = ""; } tokens.push(ch); }
    else if (/\s/.test(ch)) { if (buf) { tokens.push(buf); buf = ""; } }
    else buf += ch;
  }
  if (buf) tokens.push(buf);

  const lines = [];
  let cur = "";
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    const sep = cur && !isCjk(tk[0]) && !isCjk(cur[cur.length - 1]) ? " " : "";
    const over = cur && visWidth(cur + sep + tk) > perLine;
    // 避头：本该换行，但下一个字是闭括号/点号 → 让它挤在本行末尾
    if (over && NO_LINE_START.includes(tk)) { cur += tk; continue; }
    if (over) {
      // 避尾：本行以开括号结尾 → 把它挪到下一行
      let carry = "";
      while (cur && NO_LINE_END.includes(cur[cur.length - 1])) {
        carry = cur[cur.length - 1] + carry;
        cur = cur.slice(0, -1);
      }
      lines.push(cur);
      cur = carry + tk;
    } else cur += sep + tk;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const keep = lines.slice(0, maxLines);
    keep[maxLines - 1] = keep[maxLines - 1].replace(/.$/, "…");
    return keep;
  }
  return lines;
}

/**
 * 封面 SVG（480×270）：纸感白底 + 学科主色左侧色条 + 课题（自动折行）+ 底部学科/年级。
 * 纯静态 SVG，无外链资源，前端 <img src="/sample-covers/x.svg"> 直出。
 */
function coverSvg({ title, subtitle, subject, grade, id }) {
  const c = SUBJECT_COLOR[subject] ?? FALLBACK_COLOR;
  // 字号按「视觉宽度」定（西文按 0.55 字宽折算），不能按字符数——英文课题会被误判成超长
  const w = visWidth(title);
  const fs = w <= 11 ? 34 : w <= 15 ? 30 : w <= 22 ? 26 : w <= 30 ? 23 : 21;
  const perLine = 352 / fs; // 正文可用宽 352px（x 从 62 到 414）
  const lines = wrapTitle(title, perLine);
  const lh = Math.round(fs * 1.38);
  const blockH = lines.length * lh;
  const top = 112 - blockH / 2 + fs * 0.78; // 以 y≈112 为标题块视觉中心
  const titleTspans = lines
    .map((l, i) => `<tspan x="62" y="${Math.round(top + i * lh)}">${esc(l)}</tspan>`)
    .join("");
  let sub = String(subtitle || "").replace(/^[—–\-\s]+/, "").trim();
  if (visWidth(sub) > 25) { // 底部副标题只有一行位置，超宽就截断
    let acc = "";
    for (const ch of sub) { if (visWidth(acc + ch) > 24) break; acc += ch; }
    sub = acc.replace(/[（【《「,，、]$/, "") + "…";
  }
  const mark = Array.from(subject)[0];

  // 稿纸横线（极淡），做纸质感
  const rules = Array.from({ length: 9 }, (_, i) => 40 + i * 26)
    .map((y) => `<line x1="46" y1="${y}" x2="452" y2="${y}"/>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270" role="img" aria-label="${esc(title)}">
  <title>${esc(title)}</title>
  <defs>
    <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#F7F5F1"/>
    </linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.main}"/><stop offset="1" stop-color="${c.main}" stop-opacity=".72"/>
    </linearGradient>
    <clipPath id="clip"><rect x="0" y="0" width="480" height="270"/></clipPath>
  </defs>
  <g clip-path="url(#clip)">
    <rect width="480" height="270" fill="url(#pg)"/>
    <g stroke="${c.main}" stroke-opacity=".055" stroke-width="1">${rules}</g>
    <text x="392" y="238" font-family="KaiTi,楷体,STKaiti,serif" font-size="150" fill="${c.main}" fill-opacity=".05" text-anchor="middle">${esc(mark)}</text>
    <rect x="0" y="0" width="14" height="270" fill="url(#bar)"/>
    <rect x="14" y="0" width="3" height="270" fill="${c.main}" opacity=".18"/>
    <rect x="46" y="32" width="52" height="20" rx="3" fill="${c.tag}"/>
    <text x="72" y="46.5" font-family="'Microsoft YaHei',微软雅黑,sans-serif" font-size="12" fill="${c.main}" text-anchor="middle" letter-spacing="1">${esc(subject)}</text>
    <text x="110" y="46.5" font-family="'Microsoft YaHei',微软雅黑,sans-serif" font-size="11.5" fill="#9A948B" letter-spacing="1.2">高中 · 青教赛范式教案</text>
    <text x="62" y="0" font-family="'Microsoft YaHei',微软雅黑,sans-serif" font-size="${fs}" font-weight="700" fill="#1E2A33">${titleTspans}</text>
    <rect x="62" y="${Math.round(top + (lines.length - 1) * lh + fs * 0.55)}" width="46" height="3" fill="${c.main}"/>
    <text x="62" y="${Math.round(top + (lines.length - 1) * lh + fs * 0.55) + 28}" font-family="KaiTi,楷体,STKaiti,serif" font-size="14.5" fill="#6E6862">${esc(sub)}</text>
    <line x1="46" y1="228" x2="434" y2="228" stroke="${c.main}" stroke-opacity=".16" stroke-width="1"/>
    <text x="46" y="249" font-family="'Microsoft YaHei',微软雅黑,sans-serif" font-size="12" fill="#8A857E">${esc(subject)} · ${esc(grade)} · 教案</text>
    <text x="434" y="249" font-family="'Microsoft YaHei',微软雅黑,sans-serif" font-size="11" fill="#B3ADA5" text-anchor="end" letter-spacing=".5">${esc(id)}</text>
  </g>
</svg>
`;
}

// ─────────────────────── 主流程 ───────────────────────

function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`源目录不存在：${SRC_DIR}\n用 --src="路径" 指定。`);
    process.exit(1);
  }
  const files = fs.readdirSync(SRC_DIR).filter((f) => f.toLowerCase().endsWith(".docx") && !f.startsWith("~$")).sort();
  if (!files.length) { console.error(`源目录里没有 .docx：${SRC_DIR}`); process.exit(1); }

  if (!DRY) for (const d of [OUT_SPEC, OUT_FILE, OUT_COVER]) fs.mkdirSync(d, { recursive: true });

  const manifest = [];
  const stats = [];
  for (const fileName of files) {
    const full = path.join(SRC_DIR, fileName);
    const buf = fs.readFileSync(full); // 只读，源目录纹丝不动
    const xml = unzipEntry(buf, "word/document.xml")?.toString("utf8");
    if (!xml) { console.error(`× ${fileName}：解不出 word/document.xml`); continue; }

    const spec = docxToSpec(xml);
    const num = (/^(\d{2})/.exec(fileName) ?? [])[1];
    const docId = DOC_IDS[num] ?? `lesson_${path.parse(fileName).name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
    const subject = (/^\d{2}_([^_]+)_/.exec(fileName) ?? [])[1] ?? "综合";
    const title = spec.blocks[0]?.type === "title" ? spec.blocks[0].text : path.parse(fileName).name;
    const subtitle = spec.blocks[1]?.type === "subtitle" ? spec.blocks[1].text : "";
    const st = specStats(spec);

    if (!DRY) {
      fs.writeFileSync(path.join(OUT_SPEC, `${docId}.json`), JSON.stringify(spec, null, 2) + "\n", "utf8");
      fs.copyFileSync(full, path.join(OUT_FILE, `${docId}.docx`));
      fs.writeFileSync(
        path.join(OUT_COVER, `${docId}.svg`),
        coverSvg({ title, subtitle, subject, grade: "高中", id: docId }),
        "utf8",
      );
    }

    manifest.push({
      docId, fileName, title, subtitle, subject, grade: "高中",
      blocks: st.blocks, words: st.words,
      prompt: makePrompt(subject, title),
    });
    stats.push({ docId, fileName, ...st });
    console.log(
      `√ ${docId.padEnd(38)} 块 ${String(st.blocks).padStart(3)} · 字 ${String(st.words).padStart(5)} · 表 ${String(st.tables).padStart(2)} · 式 ${String(st.formulas).padStart(3)}  ← ${fileName}`,
    );
  }

  if (!DRY) fs.writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  const sum = stats.reduce((a, s) => ({ blocks: a.blocks + s.blocks, words: a.words + s.words, tables: a.tables + s.tables, formulas: a.formulas + s.formulas }), { blocks: 0, words: 0, tables: 0, formulas: 0 });
  console.log(`\n共 ${stats.length} 份：块 ${sum.blocks} · 字 ${sum.words} · 表 ${sum.tables} · 式 ${sum.formulas}${DRY ? "（--dry 未落盘）" : ""}`);
}

main();

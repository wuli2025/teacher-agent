#!/usr/bin/env node
/**
 * check-sample-docs.mjs —— 教案范例库资产的自检闸。
 *
 * 校验 public/sample-docs/*.json 是否真能被 src/lib/docSpec.ts 正确渲染：
 *   1. JSON.parse 通过、blocks 非空
 *   2. 每块 type 在契约的 14 种之内、字段类型合法
 *   3. table 的 rows 必须是二维字符串数组、行长齐、widths 长度等于列数
 *   4. 没有块的 text 还残留「■」前缀或行首「· 」（那是渲染器自己加的）
 *   5. 行内标记成对、$公式$ 里花括号配平
 *   6. manifest 与磁盘上的 spec/docx/封面三件套一一对上
 *
 * 用法：node scripts/check-sample-docs.mjs
 * 退出码非 0 = 有硬错误。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPEC_DIR = path.join(ROOT, "public", "sample-docs");
const FILE_DIR = path.join(ROOT, "public", "sample-doc-files");
const COVER_DIR = path.join(ROOT, "public", "sample-covers");
const MANIFEST = path.join(ROOT, "scripts", "sample-docs.manifest.json");

/** 契约里的 14 种块类型（docSpec.ts 的 DocBlockType）。 */
const TYPES = new Set([
  "title", "subtitle", "h1", "h2", "h3",
  "p", "bullet", "num", "quote", "callout",
  "table", "image", "hr", "pagebreak",
]);

const errors = [];
const warns = [];
const err = (f, msg) => errors.push(`${f}: ${msg}`);
const warn = (f, msg) => warns.push(`${f}: ${msg}`);

/** 花括号是否配平（KaTeX 遇到不配平直接抛错，预览就红一片）。 */
function braceBalanced(tex) {
  let d = 0;
  for (let i = 0; i < tex.length; i++) {
    if (tex[i] === "\\") { i++; continue; }
    if (tex[i] === "{") d++;
    else if (tex[i] === "}") { d--; if (d < 0) return false; }
  }
  return d === 0;
}

function checkText(f, where, t) {
  if (typeof t !== "string") { err(f, `${where} 不是字符串`); return; }
  if (t.includes("■")) err(f, `${where} 残留「■」：${t.slice(0, 40)}`);
  if (/^\s*[·•]\s/.test(t)) err(f, `${where} 行首残留「· 」：${t.slice(0, 40)}`);
  // 行内标记成对
  for (const [mk, name] of [["\\*\\*", "**"], ["__", "__"], ["~~", "~~"]]) {
    const n = (t.match(new RegExp(mk, "g")) ?? []).length;
    if (n % 2) warn(f, `${where} 的 ${name} 标记不成对`);
  }
  if ((t.match(/(?<!\\)\$/g) ?? []).length % 2) err(f, `${where} 的 $ 数量为奇数（公式没闭合）`);
  for (const m of t.matchAll(/\$([^$\n]+)\$/g)) {
    if (!braceBalanced(m[1])) err(f, `公式花括号不配平：$${m[1]}$`);
  }
}

function checkSpec(f, spec) {
  if (spec.version !== 1) warn(f, `version 不是 1（${spec.version}）`);
  if (spec.theme !== "qingjiao") warn(f, `theme 不是 qingjiao（${spec.theme}）`);
  if (!Array.isArray(spec.blocks) || !spec.blocks.length) { err(f, "blocks 为空"); return null; }

  const kinds = {};
  spec.blocks.forEach((b, i) => {
    const at = `blocks[${i}]`;
    if (!b || typeof b !== "object") { err(f, `${at} 不是对象`); return; }
    if (!TYPES.has(b.type)) { err(f, `${at}.type 非法：${b.type}`); return; }
    kinds[b.type] = (kinds[b.type] ?? 0) + 1;

    if (b.text !== undefined) checkText(f, `${at}.text`, b.text);
    if (b.head !== undefined) checkText(f, `${at}.head`, b.head);
    if (b.indent !== undefined && !["first", "none"].includes(b.indent)) err(f, `${at}.indent 非法：${b.indent}`);
    if (b.align !== undefined && !["left", "center", "right", "both", "justify"].includes(b.align)) err(f, `${at}.align 非法：${b.align}`);

    if (b.type === "table") {
      if (!Array.isArray(b.rows) || !b.rows.length) { err(f, `${at}.rows 空`); return; }
      let cols = -1;
      b.rows.forEach((r, ri) => {
        if (!Array.isArray(r)) { err(f, `${at}.rows[${ri}] 不是数组`); return; }
        if (cols < 0) cols = r.length;
        else if (r.length !== cols) err(f, `${at}.rows[${ri}] 列数 ${r.length} ≠ ${cols}`);
        r.forEach((c, ci) => {
          if (typeof c !== "string") err(f, `${at}.rows[${ri}][${ci}] 不是字符串`);
          else checkText(f, `${at}.rows[${ri}][${ci}]`, c);
        });
      });
      if (b.widths !== undefined) {
        if (!Array.isArray(b.widths) || b.widths.length !== cols) err(f, `${at}.widths 长度 ${b.widths?.length} ≠ 列数 ${cols}`);
        else if (!b.widths.every((w) => Number.isFinite(w) && w > 0)) err(f, `${at}.widths 有非正数`);
      }
      if (typeof b.head0 !== "boolean") warn(f, `${at}.head0 缺失`);
    } else if (b.rows !== undefined) {
      err(f, `${at} 非表格却带 rows`);
    }

    if (b.type === "callout" && !b.head) warn(f, `${at} callout 无 head`);
  });

  if (spec.blocks[0]?.type !== "title") warn(f, "首块不是 title");
  return kinds;
}

// ─────────────────────── 跑 ───────────────────────

const files = fs.readdirSync(SPEC_DIR).filter((f) => f.endsWith(".json")).sort();
if (!files.length) { console.error("public/sample-docs 下没有 json，先跑 docx-to-spec.mjs"); process.exit(1); }

const table = [];
for (const f of files) {
  let spec;
  try {
    spec = JSON.parse(fs.readFileSync(path.join(SPEC_DIR, f), "utf8"));
  } catch (e) {
    err(f, `JSON.parse 失败：${e.message}`);
    continue;
  }
  const kinds = checkSpec(f, spec);
  const id = path.parse(f).name;
  if (!fs.existsSync(path.join(FILE_DIR, `${id}.docx`))) err(f, "缺原始 docx 副本");
  if (!fs.existsSync(path.join(COVER_DIR, `${id}.svg`))) err(f, "缺封面 svg");
  else {
    const svg = fs.readFileSync(path.join(COVER_DIR, `${id}.svg`), "utf8");
    if (!svg.startsWith("<svg") || !svg.includes("</svg>")) err(f, "封面 svg 不良构");
    if (/https?:\/\/(?!www\.w3\.org)/.test(svg)) err(f, "封面 svg 含外链资源");
  }
  if (kinds) table.push({ id, ...kinds });
}

// manifest 一致性
if (!fs.existsSync(MANIFEST)) err("manifest", "不存在");
else {
  const man = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  if (!Array.isArray(man)) err("manifest", "不是数组");
  else {
    if (man.length !== files.length) err("manifest", `条目 ${man.length} ≠ spec 数 ${files.length}`);
    for (const m of man) {
      for (const k of ["docId", "fileName", "title", "subject", "grade", "blocks", "words", "prompt"]) {
        if (m[k] === undefined || m[k] === "") err("manifest", `${m.docId ?? "?"} 缺字段 ${k}`);
      }
      const p = path.join(SPEC_DIR, `${m.docId}.json`);
      if (!fs.existsSync(p)) { err("manifest", `${m.docId} 没有对应 spec`); continue; }
      const spec = JSON.parse(fs.readFileSync(p, "utf8"));
      if (spec.blocks.length !== m.blocks) err("manifest", `${m.docId} blocks ${m.blocks} ≠ 实际 ${spec.blocks.length}`);
      if (spec.blocks[0]?.text !== m.title) err("manifest", `${m.docId} title 与 spec 首块不符`);
      if (spec.blocks[1]?.type === "subtitle" && spec.blocks[1].text !== m.subtitle) err("manifest", `${m.docId} subtitle 与 spec 次块不符`);
    }
  }
}

// ─────────────────────── 报告 ───────────────────────

const cols = ["title", "subtitle", "h1", "h2", "h3", "p", "bullet", "callout", "table"];
console.log(["docId".padEnd(38), ...cols.map((c) => c.padStart(8))].join(""));
for (const r of table) console.log([r.id.padEnd(38), ...cols.map((c) => String(r[c] ?? 0).padStart(8))].join(""));

console.log(`\n校验 ${files.length} 份：错误 ${errors.length}，警告 ${warns.length}`);
for (const w of warns) console.log(`  ! ${w}`);
for (const e of errors) console.log(`  × ${e}`);
process.exit(errors.length ? 1 : 0);

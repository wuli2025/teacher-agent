#!/usr/bin/env node
/**
 * KaTeX → 高清透明 PNG 批量渲染器（零依赖：Node 内置 WebSocket + 本地 Chrome 裸 CDP）
 *
 * 为什么不用 Manim/LaTeX：本机没有 TeX 发行版，装 MiKTeX+manim 是几百 MB 的运行时依赖；
 * 而 node_modules/katex 已经在仓库里，KaTeX 覆盖高中/竞赛全部排版需求
 * （\frac \int \sum \lim \begin{cases} \begin{bmatrix} \vec \xrightarrow ∀∃εδ …），
 * 用 Chrome 按元素包围盒截图 → 像素级紧致、字形来自 KaTeX 自带字体，绝不会缺字或乱码。
 *
 * 用法：node render_tex.mjs <manifest.json>
 * manifest = {
 *   outDir: "绝对路径",
 *   scale:  3,                       // 截图倍率，默认 3（≈4K 级线宽）
 *   items: [ { id, tex, display?:true, color?:"#1B2A4A", fontPx?:44, maxWidthPx?:1600 } ]
 * }
 * 产出：<outDir>/<id>.png + <outDir>/_render_report.json
 *      report 里每条含 {id, ok, file, w, h, error}，任何一条 ok:false 都不静默跳过。
 */
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

// 仓库路径含中文，必须走 fileURLToPath 解码，不能直接用 URL.pathname
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const KATEX_DIR = path.join(REPO, "node_modules", "katex", "dist");

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

function findChrome() {
  for (const c of CHROME_CANDIDATES) if (existsSync(c)) return c;
  throw new Error("找不到 Chrome/Edge，无法渲染公式");
}

// ───────────────────────── 极简 CDP 客户端 ─────────────────────────
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.waits = new Map(); }
  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = (e) => rej(new Error("CDP 连接失败")); });
    const c = new CDP(ws);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && c.waits.has(m.id)) {
        const { res, rej } = c.waits.get(m.id); c.waits.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      }
    };
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.waits.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.waits.has(id)) { this.waits.delete(id); rej(new Error(method + " 超时")); } }, 60000);
    });
  }
  close() { try { this.ws.close(); } catch { } }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────────────────────── HTML 页面 ─────────────────────────
function buildHtml(items) {
  // KaTeX 的 css/js 直接内联进页面：跨目录加载 file:// 子资源会被 Chrome 拦掉（katex is not defined）。
  // 内联后 CSS 里的相对字体路径要改写成绝对 file:// URL，否则字体取不到会掉回系统字形。
  const fontsBase = pathToFileURL(path.join(KATEX_DIR, "fonts")).href;
  const css = readFileSync(path.join(KATEX_DIR, "katex.min.css"), "utf8")
    .replace(/url\((['"]?)fonts\//g, `url($1${fontsBase}/`);
  const js = readFileSync(path.join(KATEX_DIR, "katex.min.js"), "utf8");
  const blocks = items.map((it) => {
    const fp = it.fontPx || 44;
    const col = it.color || "#1B2A4A";
    // 刻意不给 max-width：公式一旦被容器夹窄就会溢出容器 → 截图按容器裁剪 = 公式被切掉。
    // 宽度问题交给 Python 侧 place() 等比缩放 + 字号下限报错来处理。
    return `<div class="wrap" id="w_${it.id}" style="font-size:${fp}px;color:${col}">
  <span class="slot" id="s_${it.id}" data-tex="${escapeAttr(it.tex)}" data-display="${it.display === false ? 0 : 1}"></span>
</div>`;
  }).join("\n");

  return `<!doctype html><html><head><meta charset="utf-8">
<style>${css}</style>
<style>
  html,body{margin:0;padding:0;background:transparent;}
  body{padding:40px;width:max-content;}
  /* 每条公式一行独占，block + 留白，保证包围盒完整包住斜体/向量箭头的出挑 */
  /* 留白只留够护住斜体出挑与向量箭头即可；留太多会白占 PPT 的竖直空间 */
  .wrap{display:block;width:max-content;padding:6px 12px;line-height:1.0;margin-bottom:24px;}
  /* KaTeX 里的中文走 text 模式，补一条 CJK 字体回退链，避免出现豆腐块 */
  .katex .cjk_fallback, .katex .mord.text, .katex .text{
    font-family: KaTeX_Main, "Noto Serif SC", "Source Han Serif SC", "Microsoft YaHei", SimSun, serif;
  }
  .katex-display{margin:0 !important;}
  .katex{line-height:1.25;}
</style>
<script>${js}</script>
</head><body>
${blocks}
<script>
window.__render = function(){
  var out = {};
  document.querySelectorAll('.slot').forEach(function(el){
    var id = el.id.slice(2);
    try{
      katex.render(el.dataset.tex, el, {
        displayMode: el.dataset.display === '1',
        throwOnError: true,      // 宏不支持就报错，绝不静默出错字
        strict: 'ignore',
        output: 'html',
        fleqn: false,
        macros: {
          "\\\\dif": "\\\\mathrm{d}",
          "\\\\R": "\\\\mathbb{R}",
          "\\\\N": "\\\\mathbb{N}",
          "\\\\Z": "\\\\mathbb{Z}",
          "\\\\eps": "\\\\varepsilon"
        }
      });
      out[id] = {ok:true};
    }catch(e){
      out[id] = {ok:false, error:String(e && e.message || e)};
      el.textContent = '';
    }
  });
  return JSON.stringify(out);
};
window.__measure = function(){
  var out = {};
  document.querySelectorAll('.wrap').forEach(function(el){
    var id = el.id.slice(2);
    var r = el.getBoundingClientRect();
    out[id] = {x:r.x + window.scrollX, y:r.y + window.scrollY, w:r.width, h:r.height};
  });
  return JSON.stringify(out);
};
</script>
</body></html>`;
}

const escapeAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ───────────────────────── 主流程 ─────────────────────────
async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) { console.error("用法: node render_tex.mjs <manifest.json>"); process.exit(2); }
  const man = JSON.parse(readFileSync(manifestPath, "utf8"));
  const items = man.items || [];
  const outDir = man.outDir;
  const scale = man.scale || 3;
  mkdirSync(outDir, { recursive: true });
  if (!items.length) { writeFileSync(path.join(outDir, "_render_report.json"), "[]"); return; }

  const work = mkdtempSync(path.join(tmpdir(), "texkit-"));
  const htmlPath = path.join(work, "page.html");
  writeFileSync(htmlPath, buildHtml(items), "utf8");

  const port = 9500 + (process.pid % 400);
  const chrome = spawn(findChrome(), [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(work, "ud")}`,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars",
    "--force-device-scale-factor=1", "--disable-lcd-text", "--font-render-hinting=none",
    "--allow-file-access-from-files", pathToFileURL(htmlPath).href,
  ], { stdio: "ignore" });

  let wsUrl = null;
  for (let i = 0; i < 100 && !wsUrl; i++) {
    await sleep(120);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) wsUrl = page.webSocketDebuggerUrl;
    } catch { }
  }
  if (!wsUrl) { chrome.kill(); throw new Error("Chrome 未就绪"); }

  const cdp = await CDP.connect(wsUrl);
  const report = [];
  try {
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    // 视口给足够宽，任何公式都不许换行；真正的宽度约束在 Python 侧判定
    await cdp.send("Emulation.setDeviceMetricsOverride",
      { width: 6000, height: 2400, deviceScaleFactor: 1, mobile: false });
    await cdp.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });

    // 等 KaTeX 脚本与字体；等不到就报错，绝不带着「katex is not defined」往下跑
    let ready = false;
    for (let i = 0; i < 100 && !ready; i++) {
      const r = await cdp.send("Runtime.evaluate", { expression: "typeof katex !== 'undefined' && typeof window.__render === 'function'", returnByValue: true });
      ready = !!r.result.value;
      if (!ready) await sleep(100);
    }
    if (!ready) throw new Error("KaTeX 未在页面中就绪");
    await cdp.send("Runtime.evaluate", { expression: "document.fonts.ready", awaitPromise: true });

    const rr = await cdp.send("Runtime.evaluate", { expression: "window.__render()", returnByValue: true });
    const status = JSON.parse(rr.result.value);
    await cdp.send("Runtime.evaluate", { expression: "document.fonts.ready", awaitPromise: true });
    await sleep(150);
    const mm = await cdp.send("Runtime.evaluate", { expression: "window.__measure()", returnByValue: true });
    const boxes = JSON.parse(mm.result.value);

    for (const it of items) {
      const st = status[it.id] || { ok: false, error: "未渲染" };
      if (!st.ok) { report.push({ id: it.id, ok: false, error: st.error, tex: it.tex }); continue; }
      const b = boxes[it.id];
      if (!b || b.w < 2 || b.h < 2) { report.push({ id: it.id, ok: false, error: "包围盒为空", tex: it.tex }); continue; }
      // 裁剪框取整数 CSS px，PNG 尺寸 = 整数 × scale。
      // 记录的必须是这两个**同源**的数，否则 PNG 实际宽高比和登记的比例差千分之几，
      // 贴进 PPT 后会被变形检测判成「拉伸」。
      const cw = Math.ceil(b.w), chh = Math.ceil(b.h);
      const shot = await cdp.send("Page.captureScreenshot", {
        format: "png",
        clip: { x: b.x, y: b.y, width: cw, height: chh, scale },
        captureBeyondViewport: true,
      });
      const file = path.join(outDir, it.id + ".png");
      writeFileSync(file, Buffer.from(shot.data, "base64"));
      report.push({
        id: it.id, ok: true, file,
        w: cw * scale, h: chh * scale, cssW: cw, cssH: chh, scale, tex: it.tex,
      });
    }
  } finally {
    cdp.close();
    chrome.kill();
    try { rmSync(work, { recursive: true, force: true }); } catch { }
  }

  writeFileSync(path.join(outDir, "_render_report.json"), JSON.stringify(report, null, 1), "utf8");
  const bad = report.filter((r) => !r.ok);
  console.log(`texkit: ${report.length - bad.length}/${report.length} 条公式渲染成功 → ${outDir}`);
  for (const b of bad) console.error(`  ✗ ${b.id}: ${b.error}\n     ${b.tex}`);
  process.exit(bad.length ? 1 : 0);
}

main().catch((e) => { console.error("texkit 失败:", e.message); process.exit(1); });

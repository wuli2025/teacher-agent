<script setup lang="ts">
// 豆包式 Word 教案播放器:左大纲栏 + 纸张舞台 + 逐块操作。DocEditor 与 RightDrawer 共用。
//
// 与 DeckViewer 的唯一本质差异是**分页**:PPT 每页是固定 1280×720 画布,页数由 spec 决定;
// Word 是流式文档,页数只能实测出来 —— 本组件把所有块渲进一张隐藏「量纸」,读每块的
// offsetTop/offsetHeight,再按 A4 正文高度贪心切成一张张纸。只有实测才能所见即所得地
// 对上 Word 的分页(纯算字数估行的做法在中英混排 + 表格面前必然翻车,别走回头路)。
//
// 为什么是组件而不是 srcdoc iframe:与 DeckViewer 同因 —— Tauri 主文档 CSP 会被 srcdoc
// 继承。页面 HTML 走 v-html,docSpec 渲染的标记全部经 esc() 转义,不含脚本,安全由构造保证。
import { computed, ref, watch, onBeforeUnmount, onMounted, nextTick } from "vue";
import {
  ChevronLeft, ChevronRight, Loader, Copy, Trash2,
  ArrowUp, ArrowDown, Plus, Undo2, X, ListTree,
} from "@lucide/vue";
import {
  docBlocksRender, blockHtml, docPaperCss, docOutline, docWordCount, pageGeom,
  setDocText, getDocText, NEW_BLOCKS,
  type DocSpec, type DocOp,
} from "../lib/docSpec";

const props = defineProps<{
  /** 已把插图换成 dataURL 的 spec 对象(resolveDocImages 之后)。 */
  spec: DocSpec | null;
  /** 生成中:尾部脉动占位 + 无人滚动时自动跟随最新块。 */
  generating?: boolean;
  /** 允许点字直改 / 增删块(生成中不给)。 */
  editable?: boolean;
  /** 父组件的撤销栈还有货 → 亮出撤销按钮。 */
  canUndo?: boolean;
}>();
const emit = defineEmits<{
  (e: "edit", block: number, path: string, value: string): void;
  (e: "op", op: DocOp): void;
  (e: "undo"): void;
}>();

const MM_PX = 96 / 25.4; // CSS 里 1mm 的物理像素数(与浏览器 mm 单位同源)

const canOp = computed(() => !!props.editable && !props.generating);
const blocks = computed(() => props.spec?.blocks ?? []);
const html = computed(() => (props.spec ? docBlocksRender(props.spec) : []));
const outline = computed(() => (props.spec ? docOutline(props.spec) : []));
const words = computed(() => (props.spec ? docWordCount(props.spec) : 0));
const geom = computed(() => pageGeom(props.spec?.page));

// ───────── KaTeX:行内公式异步补渲染 ─────────
// 与 markdown.ts 同策略(懒加载,不拖累首屏)。渲染器已经把裸 LaTeX 当文本顶上了,
// 这里只是「锦上添花」—— 拉不到 katex 也不会出现空白公式。
// 【必须先于分页】量纸里若还是裸 LaTeX,而真纸上是 KaTeX,公式行会高出一截:
// 数学教案每页系统性低估,纸就被撑破(真踩过,页高 1191 > A4 1123)。
let katexMod: Promise<any> | null = null;
function getKatex() {
  // 与 markdown.ts 同一套加载法:模块 + CSS 一起懒加载。
  // 【CSS 不能漏】少了 katex.min.css,KaTeX 输出里的 MathML 备份不会被隐藏,
  // 公式会**显示两遍**(「f'(x)≥0f'(x)≥0」)。这里再叠一道 output:"html" 双保险。
  if (!katexMod) {
    katexMod = Promise.all([import("katex"), import("katex/dist/katex.min.css" as any)]).then(
      ([m]) => (m as any).default ?? m
    );
  }
  return katexMod;
}
async function renderMath(root: HTMLElement | null) {
  if (!root) return;
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(".dm[data-tex]:not([data-done])"));
  if (!nodes.length) return;
  const katex = await getKatex();
  for (const n of nodes) {
    try {
      n.innerHTML = katex.renderToString(n.dataset.tex ?? "", {
        throwOnError: false,
        displayMode: false,
        output: "html",
      });
    } catch {
      /* 公式写坏了就留裸文本,别让整页崩 */
    }
    n.dataset.done = "1";
  }
}

// ───────── 实测分页 ─────────
// 一页 = 一串「摆件」。摆件要么是整块,要么是**表格的一段行**(表格跨页必须拆行,
// 否则一张 6 行的教学过程表就会把纸撑成两页高 —— Word 从来不这么排)。
// 量纸与真纸用同一份 CSS、同一个纸宽,量出来的高度才作数(字体、行距、列宽任何一处
// 不同,分页就会偏)。
interface PageItem {
  /** 块下标 */
  b: number;
  /** 表格拆行时的数据行窗口 [from, to)(不含表头行 0) */
  win?: [number, number];
}
const measureEl = ref<HTMLElement | null>(null);
const pages_ = ref<PageItem[][]>([]);
const measuring = ref(false);

async function paginate() {
  const host = measureEl.value;
  if (!host || !props.spec) {
    pages_.value = blocks.value.length ? [blocks.value.map((_, b) => ({ b }))] : [];
    return;
  }
  measuring.value = true;
  await nextTick();
  await renderMath(host); // 量之前先把公式渲成 KaTeX,量到的高度才是真纸上的高度
  const kids = Array.from(host.children) as HTMLElement[];
  // 量纸还没渲出来(块数对不上):这一趟量到的是空的,保持现状等下一次触发 —— 绝不能
  // 把「量到 0 块」当成「只有一页」写进 pages_,那会让整篇塌成一张长纸(真踩过)。
  if (!kids.length && blocks.value.length) {
    measuring.value = false;
    return;
  }
  const g = geom.value;
  const contentH = (g.h - g.mt - g.mb) * MM_PX;
  const out: PageItem[][] = [];
  let cur: PageItem[] = [];
  let used = 0;
  const flush = () => {
    if (cur.length) out.push(cur);
    cur = [];
    used = 0;
  };

  for (let i = 0; i < kids.length; i++) {
    const el = kids[i];
    // 量的是 .dwv-blk 包裹层(与真纸逐字同构 + flow-root),块内段落的上下外边距已经
    // 算进 offsetHeight。直接量裸块再手工补 margin 会漏掉「相邻块外边距折叠」,
    // 越往后量越浅、最后一页塞爆 —— 唯一可靠的做法就是量与真纸完全相同的结构。
    const h = el.offsetHeight;

    if (el.querySelector("[data-br]")) {
      // 分页符:自己留在上一页(它不可见、高度为 0),下一块从新纸开始
      cur.push({ b: i });
      flush();
      continue;
    }

    if (used + h <= contentH) {
      cur.push({ b: i });
      used += h;
      continue;
    }

    const blk = blocks.value[i];
    const trs = Array.from(el.querySelectorAll("tbody tr")) as HTMLElement[];
    if (blk?.type === "table" && trs.length > 1) {
      // 表格拆行:表头行不单独占页,续页由渲染器自动补一份(与导出的 tblHeader 同义)。
      // 用真实 <tr> 高度而不是平均值 —— 单元格文字多少不一,平均值会让长行溢出。
      const head0 = blk.head0 !== false;
      const headH = head0 ? trs[0].offsetHeight : 0;
      const dataStart = head0 ? 1 : 0;
      // 表格自身的上下外边距(8pt+8pt)也占纸,按包裹层与行高之差摊进来
      const chrome = Math.max(0, h - trs.reduce((s, r) => s + r.offsetHeight, 0));
      let r = dataStart;
      while (r < trs.length) {
        const first = r === dataStart;
        // 本页留给行的高度：整页余量 - 表头(续页要重复) - 表格外边距
        let room = contentH - used - chrome - (first ? headH : headH);
        let to = r;
        while (to < trs.length && room - trs[to].offsetHeight >= 0) {
          room -= trs[to].offsetHeight;
          to++;
        }
        if (to === r) {
          // 一行都放不下:本页已有内容就翻页重试;空页也放不下(超高单行)就让它溢出,绝不丢
          if (used > 0) {
            flush();
            continue;
          }
          to = r + 1;
        }
        cur.push({ b: i, win: [r, to] });
        used = contentH; // 拆过的表格必然填满本页,余下的行去下一页
        r = to;
        if (r < trs.length) flush();
      }
      continue;
    }

    // 非表格的超大块(超长段落 / 大图):本页放不下就翻页;空页仍放不下就独占并允许溢出
    if (used > 0) flush();
    cur.push({ b: i });
    used += h;
  }
  flush();
  pages_.value = out.length ? out : [blocks.value.map((_, b) => ({ b }))];
  measuring.value = false;
}

/** 摆件 → HTML:整块直接用预渲染结果,拆行的表格现算(带原始行号,改字才不会写错行)。 */
function itemHtml(it: PageItem): string {
  if (!it.win) return html.value[it.b] ?? "";
  const blk = blocks.value[it.b];
  return blk ? blockHtml(blk, it.b, props.spec ?? undefined, it.win) : "";
}

// 内容/纸张变了都要重量。html 是 computed 出来的字符串数组,引用变化即内容变化。
watch([html, geom], () => void paginate(), { immediate: true, deep: false });
// 【必须】挂载后再量一次:spec 早于组件就位时(首页范例「看 Word 版」就是这样),
// 上面那个 immediate watch 在 setup 期就跑完了 —— 那时量纸还没进 DOM,量到 0 块,
// 于是回退成「全文一页」再也不会重量。真踩过:39 块的教案渲成一张 4.6 米长的纸。
onMounted(() => {
  void paginate();
  // 中文字体(微软雅黑/楷体)加载完行高会变,字体到位再量一次才对得上最终排版
  (document as any).fonts?.ready?.then(() => paginate());
});

const pages = computed(() => pages_.value.length);

// ───────── 当前页(由滚动位置推出来,而不是自己维护一个「翻页」状态) ─────────
const scrollEl = ref<HTMLElement | null>(null);
const page = ref(0);
const userNav = ref(false);

function onScroll() {
  const sc = scrollEl.value;
  if (!sc) return;
  const papers = Array.from(sc.querySelectorAll<HTMLElement>(".dw-paper"));
  const mid = sc.scrollTop + sc.clientHeight * 0.35;
  let cur = 0;
  for (let i = 0; i < papers.length; i++) if (papers[i].offsetTop <= mid) cur = i;
  page.value = cur;
}

function goPage(i: number, user = false) {
  const sc = scrollEl.value;
  if (!sc) return;
  const n = pages.value;
  if (!n) return;
  const t = Math.max(0, Math.min(i, n - 1));
  const paper = sc.querySelectorAll<HTMLElement>(".dw-paper")[t];
  if (paper) sc.scrollTo({ top: paper.offsetTop - 12, behavior: "smooth" });
  if (user) userNav.value = true;
}

/** 大纲点击 → 滚到那一块(不是那一页:标题往往在页中间)。 */
function goBlock(i: number, user = true) {
  const sc = scrollEl.value;
  const el = sc?.querySelector<HTMLElement>(`.dw-paper [data-b="${i}"]`);
  if (!sc || !el) return;
  sc.scrollTo({ top: el.offsetTop - 24, behavior: "smooth" });
  if (user) userNav.value = true;
  selBlock.value = i;
}

// 生成中逐段点亮:用户没滚过就跟着最新内容走
watch(
  () => blocks.value.length,
  async (n) => {
    if (!n || !props.generating || userNav.value) return;
    await nextTick();
    const sc = scrollEl.value;
    if (sc) sc.scrollTop = sc.scrollHeight;
  }
);
// 生成结束且用户全程没动 → 回第一页,从头看成品
watch(
  () => props.generating,
  (now, was) => {
    if (was && !now && !userNav.value) scrollEl.value?.scrollTo({ top: 0 });
  }
);

// ───────── 缩放 ─────────
const zoom = ref(100);
function setZoom(v: number) {
  zoom.value = Math.max(40, Math.min(200, Math.round(v)));
}
function onWheel(e: WheelEvent) {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  setZoom(zoom.value + (e.deltaY < 0 ? 10 : -10));
}

// ───────── 选中块(格式面板读它) ─────────
const selBlock = ref<number | null>(null);
function selectBlock(i: number | null) {
  selBlock.value = i;
}

// ───────── 块级操作 ─────────
const addOpen = ref(false);
function addBlock(id: string) {
  addOpen.value = false;
  const at = (selBlock.value ?? blocks.value.length - 1) + 1;
  emit("op", { kind: "add", index: at, block: id });
}
function dupBlock(i: number) {
  emit("op", { kind: "dup", index: i });
}
function delBlock(i: number) {
  if (selBlock.value === i) selBlock.value = null;
  emit("op", { kind: "del", index: i });
}
function moveBlock(i: number, d: number) {
  const to = i + d;
  if (to < 0 || to >= blocks.value.length) return;
  emit("op", { kind: "move", index: i, to });
  selBlock.value = to;
}

// ───────── 阅读模式(对标 PPT 的放映) ─────────
const presenting = ref(false);
const showEl = ref<HTMLElement | null>(null);
async function present() {
  presenting.value = true;
  await nextTick();
  showEl.value?.focus();
  try {
    await showEl.value?.requestFullscreen?.();
  } catch {
    /* 全屏被拒也照样有沉浸层,不算失败 */
  }
}
async function exitPresent() {
  presenting.value = false;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    /* 已退出 */
  }
}
function onFsChange() {
  if (!document.fullscreenElement) presenting.value = false;
}
document.addEventListener("fullscreenchange", onFsChange);
onBeforeUnmount(() => document.removeEventListener("fullscreenchange", onFsChange));

function onKey(e: KeyboardEvent) {
  // 正在改字:方向键归输入框,别在背后翻页
  const t = e.target as HTMLElement | null;
  if (t?.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t?.tagName ?? "")) return;
  if (e.key === "Escape" && presenting.value) {
    e.preventDefault();
    void exitPresent();
  } else if (e.key === "F5") {
    e.preventDefault();
    void present();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    if (props.canUndo) emit("undo");
  } else if (["PageDown"].includes(e.key)) {
    e.preventDefault();
    goPage(page.value + 1, true);
  } else if (["PageUp"].includes(e.key)) {
    e.preventDefault();
    goPage(page.value - 1, true);
  }
}

// ───────── 点字直改 ─────────
// 与 DeckViewer 同一套:带 data-e="<字段路径>" 的元素点一下变 contenteditable,失焦/Enter 落盘。
// 差别是 Word 的段落天然多行,故 Enter 不落盘而是**拆成新块**(Word 里回车就是新段,
// 用户的肌肉记忆在这儿),Ctrl+Enter 才强制落盘。
const editing = computed(() => canOp.value);
const dirty = ref(false);

/** 点击坐标 → 文本光标位置(元素是点了才变 contenteditable,浏览器默认把光标落最左)。 */
function placeCaretAt(el: HTMLElement, x: number, y: number): boolean {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const probe = document.createRange();
  let best: { node: Text; offset: number; score: number } | null = null;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    for (let i = 0; i <= n.length; i++) {
      probe.setStart(n, i);
      probe.setEnd(n, i);
      const r = probe.getClientRects()[0] ?? probe.getBoundingClientRect();
      if (!r || (!r.height && !r.width && !r.x && !r.y)) continue;
      const cy = r.y + r.height / 2;
      const score = Math.abs(cy - y) * 1000 + Math.abs(r.x - x); // 先比行,同行再比水平
      if (!best || score < best.score) best = { node: n, offset: i, score };
    }
  }
  if (!best) return false;
  const range = document.createRange();
  range.setStart(best.node, best.offset);
  range.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  return true;
}

function onPaperClick(e: MouseEvent) {
  const host = (e.target as HTMLElement)?.closest?.("[data-b]") as HTMLElement | null;
  if (host) selBlock.value = Number(host.dataset.b);
  if (!editing.value) return;
  const el = (e.target as HTMLElement)?.closest?.("[data-e]") as HTMLElement | null;
  if (!el || el.isContentEditable) return;
  e.stopPropagation();
  beginEdit(el, e.clientX, e.clientY);
}

function blockIndexOf(el: HTMLElement): number {
  const host = el.closest("[data-b]") as HTMLElement | null;
  return host ? Number(host.dataset.b) : -1;
}

function beginEdit(el: HTMLElement, x?: number, y?: number) {
  const bi = blockIndexOf(el);
  if (bi < 0) return;
  el.contentEditable = "true";
  el.spellcheck = false;
  el.focus();
  if (x !== undefined && y !== undefined && !placeCaretAt(el, x, y)) {
    requestAnimationFrame(() => requestAnimationFrame(() => placeCaretAt(el, x, y)));
  }
  const path = el.dataset.e!;
  const before = props.spec ? getDocText(blocks.value[bi], path) : "";
  let splitAfter = false;
  const finish = () => {
    el.contentEditable = "false";
    el.removeEventListener("blur", finish);
    el.removeEventListener("keydown", onKeyEdit);
    const now = (el.innerText ?? "").replace(/ /g, " ").replace(/\n{2,}/g, "\n").trim();
    if (now !== before) {
      emit("edit", bi, path, now);
      dirty.value = true;
    }
    // Enter = Word 里的「新起一段」:在本块之后插一个同类型空块,并选中它
    if (splitAfter) {
      const type = blocks.value[bi]?.type ?? "p";
      const tpl = NEW_BLOCKS.find((b) => b.id === type) ? type : "p";
      emit("op", { kind: "add", index: bi + 1, block: tpl });
      selBlock.value = bi + 1;
    }
  };
  const onKeyEdit = (ev: KeyboardEvent) => {
    ev.stopPropagation();
    if (ev.key === "Escape") {
      el.innerText = before;
      el.blur();
    } else if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      splitAfter = !ev.ctrlKey && !ev.metaKey; // Ctrl+Enter 只落盘不拆段
      el.blur();
    }
  };
  el.addEventListener("blur", finish, { once: true });
  el.addEventListener("keydown", onKeyEdit);
}

const paperHost = ref<HTMLElement | null>(null);
watch(
  [pages_, html],
  async () => {
    await nextTick();
    void renderMath(paperHost.value);
    void renderMath(showEl.value);
  },
  { flush: "post" }
);

// ───────── 纸张 CSS:注入 document.head,选择器加实例级 scope 前缀,卸载时移除 ─────────
// docPaperCss 输出 .d-title/.d-p… 这类通用选择器,直接进全局必然污染 App 样式。
const SCOPE = `dwv-${Math.random().toString(36).slice(2, 8)}`;
function scopeCss(css: string, scope: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\})([^@{}]+)\{/g, (_m, close: string, sel: string) =>
      `${close}${sel
        .split(",")
        .map((s) => `${scope} ${s.trim()}`)
        .filter((s) => s.trim())
        .join(",")}{`
    );
}
let styleEl: HTMLStyleElement | null = null;
watch(
  () => (props.spec ? docPaperCss(props.spec) : ""),
  (css) => {
    if (!css) return;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.dataset.dwv = SCOPE;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = scopeCss(css, `.${SCOPE}`);
    void paginate(); // 换肤会改字号行距 → 必须重量,否则分页停在旧主题上
  },
  { immediate: true }
);
onBeforeUnmount(() => {
  styleEl?.remove();
  styleEl = null;
});

// 父组件顶栏/格式面板/工具条要用的
defineExpose({ present, page, pages, zoom, setZoom, selBlock, selectBlock, goBlock, addBlock, words });
</script>

<template>
  <div class="dwv" :class="SCOPE" tabindex="0" @keydown="onKey">
    <!-- 左栏:大纲(对标 PPT 的缩略图栏) -->
    <aside class="dwv-rail">
      <div v-if="canOp" class="dwv-add">
        <button class="dwv-add-btn" @click.stop="addOpen = !addOpen"><Plus :size="12" /> 插入内容</button>
        <div v-if="addOpen" class="dwv-add-menu">
          <button v-for="b in NEW_BLOCKS" :key="b.id" @click="addBlock(b.id)">{{ b.name }}</button>
        </div>
      </div>
      <div class="dwv-rail-t"><ListTree :size="11" /> 文档大纲</div>
      <button
        v-for="o in outline"
        :key="o.index"
        class="dwv-ol"
        :class="[`lv${o.level}`, { on: selBlock === o.index }]"
        :title="o.text"
        @click="goBlock(o.index)"
      >{{ o.text }}</button>
      <div v-if="!outline.length" class="dwv-ol-empty">还没有标题</div>
      <div v-if="generating" class="dwv-pending">下一段生成中…</div>
    </aside>

    <main class="dwv-main">
      <div ref="scrollEl" class="dwv-scroll" @scroll="onScroll" @wheel="onWheel">
        <div
          ref="paperHost"
          class="dwv-papers"
          :style="{ transform: `scale(${zoom / 100})`, width: `${geom.w}mm` }"
          @click="onPaperClick"
        >
          <div
            v-for="(items, pi) in pages_"
            :key="pi"
            class="dwv-paper d-paper"
            :class="{ editing }"
            :style="{ minHeight: `${geom.h}mm` }"
          >
            <div v-if="spec?.page?.header" class="dwv-hf top">{{ spec.page.header }}</div>
            <div
              v-for="(it, k) in items"
              :key="`${it.b}-${it.win?.[0] ?? ''}-${k}`"
              class="dwv-blk"
              :class="{ on: selBlock === it.b }"
            >
              <div v-html="itemHtml(it)"></div>
              <!-- 块操作:hover 才浮出来,平时不打扰版面 -->
              <div v-if="canOp" class="dwv-blk-ops" @click.stop>
                <button title="上移" :disabled="it.b === 0" @click="moveBlock(it.b, -1)"><ArrowUp :size="11" /></button>
                <button title="下移" :disabled="it.b === blocks.length - 1" @click="moveBlock(it.b, 1)"><ArrowDown :size="11" /></button>
                <button title="复制本块" @click="dupBlock(it.b)"><Copy :size="11" /></button>
                <button class="del" title="删除本块" :disabled="blocks.length <= 1" @click="delBlock(it.b)"><Trash2 :size="11" /></button>
              </div>
            </div>
            <div class="dwv-hf bot">
              <span v-if="spec?.page?.footer">{{ String(spec.page.footer).replace("{page}", String(pi + 1)) }}</span>
              <span v-else class="dim">{{ pi + 1 }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="dwv-bar">
        <button class="dwv-btn" :disabled="page <= 0" @click.stop="goPage(page - 1, true)">
          <ChevronLeft :size="14" /> 上一页
        </button>
        <span class="dwv-num">{{ pages ? page + 1 : 0 }} / {{ pages }}</span>
        <button class="dwv-btn" :disabled="page >= pages - 1" @click.stop="goPage(page + 1, true)">
          下一页 <ChevronRight :size="14" />
        </button>
        <span class="dwv-num">{{ words }} 字</span>
        <button
          v-if="editable && !generating"
          class="dwv-btn"
          title="撤销上一步（Ctrl+Z）"
          :disabled="!canUndo"
          @click.stop="emit('undo')"
        >
          <Undo2 :size="12" /> 撤销
        </button>
        <span v-if="editing" class="dwv-tip">点文字直接改 · Enter 新起一段 · Esc 撤销</span>
        <span v-else-if="dirty" class="dwv-tip ok">已保存改动</span>
        <span v-if="generating" class="dwv-gen"><Loader :size="12" class="dwv-spin" /> 生成中…</span>
      </div>
    </main>

    <!-- 量纸:与真纸同宽、同 CSS、同包裹结构的隐藏容器,只用来读高度。绝不显示,不参与点击。 -->
    <div class="dwv-measure d-paper" :style="{ width: `${geom.w}mm` }" aria-hidden="true">
      <div ref="measureEl">
        <div v-for="(h, i) in html" :key="i" class="dwv-blk" v-html="h"></div>
      </div>
    </div>

    <!-- 阅读模式:全屏白纸,沉浸通读 -->
    <div v-if="presenting" ref="showEl" class="dwv-show" tabindex="0" @keydown.stop="onKey">
      <div class="dwv-show-scroll">
        <div class="dwv-paper d-paper" :style="{ width: `${geom.w}mm` }" v-html="html.join('')"></div>
      </div>
      <div class="dwv-show-bar" @click.stop>
        <span>{{ words }} 字 · {{ pages }} 页</span>
        <button title="退出阅读（Esc）" @click="exitPresent"><X :size="13" /></button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dwv { flex: 1; min-height: 0; min-width: 0; display: flex; background: #3a3a3f; outline: none; position: relative; overflow: hidden; }

/* 左大纲栏 */
.dwv-rail { width: 176px; flex-shrink: 0; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 3px; background: #2b2b30; border-right: 1px solid rgba(255,255,255,.07); }
.dwv-add { position: relative; margin-bottom: 4px; }
.dwv-add-btn { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 7px; border: 1px dashed rgba(255,255,255,.24); border-radius: 7px; background: transparent; color: rgba(255,255,255,.78); font-size: 11.5px; cursor: pointer; }
.dwv-add-btn:hover { border-color: var(--primary); color: #fff; }
.dwv-add-menu { position: absolute; left: 0; right: 0; top: calc(100% + 4px); z-index: 20; display: flex; flex-direction: column; gap: 2px; padding: 4px; border-radius: 8px; background: var(--panel); border: 1px solid var(--border); box-shadow: 0 8px 26px rgba(0,0,0,.28); max-height: 260px; overflow-y: auto; }
.dwv-add-menu button { padding: 6px 9px; border: none; border-radius: 5px; background: transparent; color: var(--text-2); font-size: 12px; text-align: left; cursor: pointer; }
.dwv-add-menu button:hover { background: var(--primary-soft); color: var(--primary-deep); }
.dwv-rail-t { display: flex; align-items: center; gap: 4px; padding: 4px 2px; font-size: 10px; letter-spacing: .08em; color: rgba(255,255,255,.4); }
.dwv-ol { padding: 5px 8px; border: none; border-left: 2px solid transparent; border-radius: 0 5px 5px 0; background: transparent; color: rgba(255,255,255,.72); font-size: 11.5px; text-align: left; cursor: pointer; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.dwv-ol:hover { background: rgba(255,255,255,.07); color: #fff; }
.dwv-ol.on { border-left-color: var(--primary); background: rgba(255,255,255,.1); color: #fff; }
.dwv-ol.lv0 { font-weight: 700; font-size: 12px; }
.dwv-ol.lv2 { padding-left: 18px; color: rgba(255,255,255,.6); }
.dwv-ol.lv3 { padding-left: 28px; color: rgba(255,255,255,.5); font-size: 11px; }
.dwv-ol-empty { padding: 8px; font-size: 11px; color: rgba(255,255,255,.32); }
.dwv-pending { margin-top: 6px; padding: 8px; border-radius: 6px; background: rgba(255,255,255,.06); color: rgba(255,255,255,.5); font-size: 11px; text-align: center; animation: dwv-pulse 1.4s ease-in-out infinite; }
@keyframes dwv-pulse { 50% { opacity: .45; } }

/* 纸张舞台 */
.dwv-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.dwv-scroll { flex: 1; min-height: 0; overflow: auto; padding: 20px; display: flex; justify-content: center; }
.dwv-papers { transform-origin: top center; display: flex; flex-direction: column; gap: 16px; height: max-content; }
.dwv-paper { position: relative; box-shadow: 0 4px 22px rgba(0,0,0,.34); }
.dwv-paper.editing [data-e] { cursor: text; }
.dwv-paper.editing [data-e]:hover { background: rgba(44,70,97,.07); border-radius: 2px; }
/* flow-root:块内段落的外边距不再穿透包裹层,offsetHeight 才等于它真正占的纸高
   （量纸与真纸用同一个类，所以「量到的」永远等于「排出来的」）。 */
.dwv-blk { position: relative; display: flow-root; }
.dwv-blk.on > div:first-child { outline: 1.5px solid var(--primary); outline-offset: 3px; border-radius: 2px; }
.dwv-blk-ops { position: absolute; right: 100%; top: 0; margin-right: 5px; display: none; flex-direction: column; gap: 2px; padding: 3px; border-radius: 7px; background: var(--panel); border: 1px solid var(--border); box-shadow: 0 6px 20px rgba(0,0,0,.2); }
.dwv-blk:hover .dwv-blk-ops { display: flex; }
.dwv-blk-ops button { display: inline-flex; padding: 3px; border: none; border-radius: 4px; background: transparent; color: var(--muted); cursor: pointer; }
.dwv-blk-ops button:hover:not(:disabled) { background: var(--primary-soft); color: var(--primary-deep); }
.dwv-blk-ops button.del:hover:not(:disabled) { background: var(--vermilion-soft); color: var(--vermilion); }
.dwv-blk-ops button:disabled { opacity: .3; cursor: default; }
.dwv-hf { position: absolute; left: 0; right: 0; text-align: center; font-size: 9pt; color: #9a9a9a; }
.dwv-hf.top { top: 10mm; }
.dwv-hf.bot { bottom: 10mm; }
.dwv-hf .dim { opacity: .55; }

/* 底部状态条 */
.dwv-bar { flex-shrink: 0; display: flex; align-items: center; gap: 8px; padding: 7px 12px; background: #2b2b30; border-top: 1px solid rgba(255,255,255,.07); }
.dwv-btn { display: inline-flex; align-items: center; gap: 4px; padding: 5px 10px; border: 1px solid rgba(255,255,255,.16); border-radius: 7px; background: transparent; color: rgba(255,255,255,.8); font-size: 11.5px; cursor: pointer; }
.dwv-btn:hover:not(:disabled) { border-color: var(--primary); color: #fff; }
.dwv-btn:disabled { opacity: .35; cursor: default; }
.dwv-num { font-size: 11.5px; color: rgba(255,255,255,.55); font-variant-numeric: tabular-nums; }
.dwv-tip { margin-left: auto; font-size: 11px; color: rgba(255,255,255,.4); }
.dwv-tip.ok { color: #7fd0a0; }
.dwv-gen { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: rgba(255,255,255,.6); }
.dwv-spin { animation: dwv-spin .9s linear infinite; }
@keyframes dwv-spin { to { transform: rotate(360deg); } }

/* 量纸:占位不占视觉。visibility:hidden 而非 display:none —— display:none 量不出高度。 */
.dwv-measure { position: absolute; left: -99999px; top: 0; visibility: hidden; pointer-events: none; box-shadow: none; }

/* 阅读模式 */
.dwv-show { position: fixed; inset: 0; z-index: 9999; background: #2a2a2e; outline: none; overflow: hidden; display: flex; flex-direction: column; }
.dwv-show-scroll { flex: 1; overflow: auto; display: flex; justify-content: center; padding: 24px; }
.dwv-show-scroll .dwv-paper { height: max-content; }
.dwv-show-bar { flex-shrink: 0; display: flex; align-items: center; justify-content: center; gap: 12px; padding: 8px; background: rgba(0,0,0,.4); color: rgba(255,255,255,.75); font-size: 12px; }
.dwv-show-bar button { display: inline-flex; padding: 4px; border: none; border-radius: 6px; background: transparent; color: rgba(255,255,255,.75); cursor: pointer; }
.dwv-show-bar button:hover { background: rgba(255,255,255,.12); color: #fff; }
</style>

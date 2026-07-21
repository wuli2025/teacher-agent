<script setup lang="ts">
// 豆包式演示播放器:左缩略图栏 + 大舞台 + 翻页。DeckStudio 与 RightDrawer 共用。
//
// 为什么是组件而不是 srcdoc iframe:Tauri 主文档 CSP 会被 srcdoc 继承,内联脚本
// 一律被拦,iframe 里的播放器 runtime 根本不执行(排查过:壳在、页全空)。组件由
// Vue 管翻页状态,页面 HTML 走 v-html —— slidesSpec 渲染的标记全部经 esc() 转义,
// 不含任何脚本,安全由构造保证。附带红利:轮询更新 spec 时只是 pages 数组变化,
// 不再有 iframe 整体重载,页码天然保持。
import { computed, ref, watch, onBeforeUnmount, nextTick } from "vue";
import {
  ChevronLeft, ChevronRight, Loader, Copy, Trash2,
  ArrowUp, ArrowDown, Plus, Undo2, StickyNote, X,
} from "@lucide/vue";
import {
  specSlidesRender, setSpecText, getSpecText, NEW_SLIDE_LAYOUTS,
  type SlideSpec, type SlideOp, type FreeBox,
} from "../lib/slidesSpec";
import FreeformEditor from "./FreeformEditor.vue";

const props = defineProps<{
  /** 已把图片换成 dataURL 的 spec 对象(resolveSpecImages 之后)。 */
  spec: SlideSpec | null;
  /** 生成中:缩略图尾部脉动占位 + 无人翻页时自动跟随最新页。 */
  generating?: boolean;
  /** 允许点字直改 / 增删页 / 改备注(生成中不给)。 */
  editable?: boolean;
  /** 父组件的撤销栈还有货 → 亮出撤销按钮。 */
  canUndo?: boolean;
}>();
// 用户改完一处文字 → 抛给父组件写盘(父持有 specPath)。
const emit = defineEmits<{
  (e: "edit", slide: number, path: string, value: string): void;
  /** 页面级操作(增/删/复制/重排/备注),父组件用 applySlideOp 落盘。 */
  (e: "op", op: SlideOp): void;
  (e: "undo"): void;
}>();

const page = ref(0);
const userNav = ref(false);

const rendered = computed(() => (props.spec ? specSlidesRender(props.spec) : null));
const pages = computed(() => rendered.value?.pages ?? []);

// 生成中逐页点亮:用户没翻过页就跟随最新页;页数缩水(重生成)时钳回界内
watch(
  () => pages.value.length,
  (n) => {
    if (!n) return;
    if (props.generating && !userNav.value) page.value = n - 1;
    else if (page.value > n - 1) page.value = n - 1;
  },
  { immediate: true }
);
// 生成结束且用户全程没翻页 → 回封面,从头看成品
watch(
  () => props.generating,
  (now, was) => {
    if (was && !now && !userNav.value) page.value = 0;
  }
);

function go(i: number, user = false) {
  const n = pages.value.length;
  if (!n) return;
  page.value = Math.max(0, Math.min(i, n - 1));
  if (user) userNav.value = true;
}
function onKey(e: KeyboardEvent) {
  // 正在改字/写备注:方向键归输入框,别在背后翻页
  const t = e.target as HTMLElement | null;
  if (t?.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t?.tagName ?? "")) return;
  if (e.key === "F5" || (e.key === "Enter" && !presenting.value)) {
    e.preventDefault();
    void present();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    if (props.canUndo) emit("undo");
  } else if ([" ", "ArrowRight", "ArrowDown", "PageDown"].includes(e.key)) {
    e.preventDefault();
    if (presenting.value && advanceShow()) return; // 放映中:先把本页的分步动画走完
    go(page.value + 1, true);
  } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
    e.preventDefault();
    go(page.value - 1, true);
  } else if (e.key === "Home") {
    e.preventDefault();
    go(0, true);
  } else if (e.key === "End") {
    e.preventDefault();
    go(pages.value.length - 1, true);
  }
}

// ───────── 放映:页面切换动画(与导出的 <p:transition> 同构) ─────────
// 单层舞台没有「旧页」可动:cover 近似成 push、uncover 近似成 fade —— 导出到 PowerPoint
// 放映才是完整效果,这里保证「有动、方向对、时长对」。
const curTransition = computed(() => (props.spec as any)?.slides?.[page.value]?.transition ?? null);
const showFitClass = computed(() => {
  const t = curTransition.value;
  if (!t?.type) return "";
  const base: Record<string, string> = {
    fade: "t-fade", "fade-black": "t-fade", push: "t-push", cover: "t-push", uncover: "t-fade", zoom: "t-zoom",
  };
  const cls = base[t.type] ?? "";
  return cls === "t-push" ? `t-push t-${t.dir ?? "up"}` : cls;
});
const showDur = computed(
  () => (({ fast: "0.35s", slow: "1s" }) as Record<string, string>)[curTransition.value?.speed ?? ""] ?? "0.6s"
);

// ───────── 放映:元素动画分步播放 ─────────
// 与引擎 build_timing_rich 同一套步骤模型:legacy data-click 组(升序)在前,
// data-anim 的盒子按 DOM 顺序在后;click 开新步,with/after 并入上一步。
// 进入类元素初始隐藏,推进到那一步才带 CSS 效果显现;强调类原地播;退出类播完隐藏。
type ShowFx = { el: HTMLElement; effect: string; dur: number; dir: string };
const showSteps = ref<ShowFx[][]>([]);
const showStepIdx = ref(0);
const ENTR = new Set(["appear", "fade", "fly-in", "float-in", "wipe", "zoom"]);
const EXIT = new Set(["fade-out", "fly-out", "zoom-out", "disappear"]);
/** 从渲染 DOM 收集分步动画(放映与舞台内预览共用同一套步骤模型)。 */
function buildAnimSteps(host: HTMLElement): ShowFx[][] {
  const steps: ShowFx[][] = [];
  // legacy click 组
  const clicked = [...host.querySelectorAll<HTMLElement>("[data-click]")];
  const nums = [...new Set(clicked.map((el) => Number(el.dataset.click) || 0))].filter((n) => n > 0).sort((a, b) => a - b);
  for (const n of nums)
    steps.push(clicked.filter((el) => Number(el.dataset.click) === n).map((el) => ({ el, effect: "fade", dur: 400, dir: "" })));
  // 富动画盒子(DOM 顺序 = boxes 顺序)
  for (const el of host.querySelectorAll<HTMLElement>("[data-anim]")) {
    const fx: ShowFx = {
      el,
      effect: el.dataset.anim ?? "fade",
      dur: Number(el.dataset.animdur) || 500,
      dir: el.dataset.animdir ?? "up",
    };
    const trig = el.dataset.animtrig ?? "click";
    if (trig === "click" || !steps.length) steps.push([fx]);
    else steps[steps.length - 1].push(fx);
  }
  return steps;
}
/** 进入类初始隐藏(visibility 保占位,与引擎 set style.visibility 同义)。 */
function hideEntrances(steps: ShowFx[][]) {
  for (const group of steps)
    for (const fx of group) if (ENTR.has(fx.effect) || fx.el.dataset.click) fx.el.style.visibility = "hidden";
}
/** 播一组效果(放映推进与预览自动播共用)。 */
function playGroup(group: ShowFx[]) {
  for (const fx of group) {
    const el = fx.el;
    el.style.setProperty("--kdur", `${fx.dur}ms`);
    if (ENTR.has(fx.effect) || el.dataset.click) el.style.visibility = "";
    el.classList.remove(...[...el.classList].filter((c) => c.startsWith("kfx")));
    // 强制重排,同一元素连续两次动画(强调)才会重播
    void el.offsetWidth;
    el.classList.add("kfx", `kfx-${fx.effect}`, `kdir-${fx.dir || "up"}`);
    if (EXIT.has(fx.effect)) {
      const dur = fx.effect === "disappear" ? 0 : fx.dur;
      window.setTimeout(() => (el.style.visibility = "hidden"), dur);
    }
  }
}
function prepShowAnims() {
  showSteps.value = [];
  showStepIdx.value = 0;
  const host = showEl.value?.querySelector(".dkv-show-fit") as HTMLElement | null;
  if (!host) return;
  const steps = buildAnimSteps(host);
  hideEntrances(steps);
  showSteps.value = steps;
}
/** 推进一步;没有剩余步骤返回 false(调用方翻页)。 */
function advanceShow(): boolean {
  const i = showStepIdx.value;
  if (i >= showSteps.value.length) return false;
  playGroup(showSteps.value[i]);
  showStepIdx.value = i + 1;
  return true;
}
function onShowNext() {
  if (!advanceShow()) go(page.value + 1, true);
}

// ── 舞台内动画预览(动画面板「预览」按钮):不进全屏,原位自动播完并复原 ──
const previewingAnims = ref(false);
async function previewAnims() {
  if (previewingAnims.value) return;
  const host = stageEl.value?.querySelector(".dkv-fit") as HTMLElement | null;
  if (!host) return;
  const steps = buildAnimSteps(host);
  if (!steps.length) return;
  previewingAnims.value = true;
  hideEntrances(steps);
  const wait = (ms: number) => new Promise((res) => window.setTimeout(res, ms));
  await wait(280); // 先让「都藏起来」被看见,预览才有起点感
  for (const group of steps) {
    playGroup(group);
    const dur = Math.max(...group.map((g) => g.dur), 300);
    await wait(dur + 380);
  }
  // 复原:清效果类与内联可见性(退出类藏掉的也一并恢复 —— 预览不是放映,不留终态)
  for (const group of steps)
    for (const fx of group) {
      fx.el.classList.remove(...[...fx.el.classList].filter((c) => c.startsWith("kfx") || c.startsWith("kdir")));
      fx.el.style.visibility = "";
    }
  previewingAnims.value = false;
}

// ───────── 放映 ─────────
// 全屏只放当前页那一张 .sl —— 复用同一份页面 HTML(cqw 字号自动等比撑满),
// 不需要另做一套放映渲染。翻页/退出走同一个 onKey,所以放映态天然继承所有快捷键。
const presenting = ref(false);
const showEl = ref<HTMLElement | null>(null);
// 进入放映/放映中换页:重建分步动画(旧页残留的 kfx 类随 :key 重建自然消失)
watch([presenting, page], async ([p]) => {
  if (!p) return;
  await nextTick();
  prepShowAnims();
});
async function present() {
  if (!pages.value.length) return;
  presenting.value = true;
  await nextTick();
  try {
    await showEl.value?.requestFullscreen?.();
    showEl.value?.focus();
  } catch {
    presenting.value = false; // 全屏被拒(如权限/嵌套 iframe):干脆别留个假放映壳
  }
}
function exitPresent() {
  if (document.fullscreenElement) void document.exitFullscreen?.();
  presenting.value = false;
}
// ESC / F11 等外部退出全屏也要把放映态收回来,否则壳还盖在页面上
function onFsChange() {
  if (!document.fullscreenElement) presenting.value = false;
}
document.addEventListener("fullscreenchange", onFsChange);
onBeforeUnmount(() => document.removeEventListener("fullscreenchange", onFsChange));

// ───────── 页面操作 ─────────
// 全部只发意图,父组件读盘改盘 —— 播放器不持有真源(内存 spec 的图已是 dataURL,
// 回写会把 base64 灌进文件)。
const canOp = computed(() => !!props.editable && !props.generating);
function op(o: SlideOp) {
  if (!canOp.value) return;
  emit("op", o);
}
function dupSlide(i: number) {
  op({ kind: "dup", index: i });
  go(i + 1, true); // 复制出来的那页正是用户想接着改的
}
function delSlide(i: number) {
  if (pages.value.length <= 1) return;
  op({ kind: "del", index: i });
  go(Math.min(i, pages.value.length - 2), true);
}
function moveSlide(i: number, d: -1 | 1) {
  const to = i + d;
  if (to < 0 || to >= pages.value.length) return;
  op({ kind: "move", index: i, to });
  go(to, true); // 跟着被挪走的那页,不然选中框会跳到邻居身上
}
const addOpen = ref(false);
function addSlide(layout: string) {
  addOpen.value = false;
  const at = pages.value.length ? page.value + 1 : 0;
  op({ kind: "add", index: at, layout });
  go(at, true);
}

// 缩略图拖拽重排:HTML5 draggable,落点即插入位
const dragIdx = ref<number | null>(null);
const dragOver = ref<number | null>(null);
function onDragStart(i: number, e: DragEvent) {
  if (!canOp.value) return;
  dragIdx.value = i;
  e.dataTransfer?.setData("text/plain", String(i)); // Firefox 不给 data 就不触发 drop
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}
function onDragOver(i: number, e: DragEvent) {
  if (dragIdx.value === null) return;
  e.preventDefault();
  dragOver.value = i;
}
function onDrop(i: number) {
  const from = dragIdx.value;
  dragIdx.value = null;
  dragOver.value = null;
  if (from === null || from === i) return;
  op({ kind: "move", index: from, to: i });
  go(i, true);
}
function onDragEnd() {
  dragIdx.value = null;
  dragOver.value = null;
}

// ───────── 舞台缩放(豆包式 − % +,Ctrl+滚轮) ─────────
const zoom = ref(100);
function setZoom(v: number) {
  zoom.value = Math.max(50, Math.min(200, Math.round(v)));
}
function onStageWheel(e: WheelEvent) {
  if (!e.ctrlKey) return; // 普通滚轮留给放大后的画布滚动
  e.preventDefault();
  setZoom(zoom.value + (e.deltaY > 0 ? -10 : 10));
}
// 100cqh 基准宽 × zoom;超出舞台就地滚动(.dkv-stage overflow:auto + margin:auto 居中)
const stageFitStyle = computed(() => ({
  width: `calc(min(100%, (100cqh - 32px) * 1.77778) * ${zoom.value / 100})`,
  flexShrink: 0 as const,
}));

// ───────── 演讲者备注 ─────────
// spec 每页本就有 notes(口播稿),教师场景里它是一等公民 → 常驻可折叠(默认开)。
const notesOpen = ref(true);
const notesDraft = ref("");
const curNotes = computed(() => String((props.spec as any)?.slides?.[page.value]?.notes ?? ""));
// 切页/换 spec 时把草稿同步过来(用户正在打字时不抢,否则会吞掉刚敲的字)
const notesFocused = ref(false);
watch(
  [curNotes, page],
  () => {
    if (!notesFocused.value) notesDraft.value = curNotes.value;
  },
  { immediate: true }
);
function saveNotes() {
  notesFocused.value = false;
  if (notesDraft.value.trim() === curNotes.value.trim()) return;
  op({ kind: "notes", index: page.value, value: notesDraft.value });
}

// ───────── 自由编辑(元素级) ─────────
// 语义页点「编辑」即**静默**展开成 freeform(不再弹确认 —— 用户要的就是点开就能拖)。
// 这一步仍是一步 op,Ctrl+Z 可整步撤回。
const curSlide = computed(() => (props.spec as any)?.slides?.[page.value] as any);
const curIsFreeform = computed(() => String(curSlide.value?.layout ?? "") === "freeform");
const curBoxes = computed<FreeBox[]>(() => (Array.isArray(curSlide.value?.boxes) ? curSlide.value.boxes : []));
// 常开编辑(豆包式):不再有「编辑/完成编辑」开关 —— freeform 页手柄自动出现,
// 语义页点字直改。生成中 canOp 为 false,两种编辑随之自动关闭。
const freeEdit = computed(() => canOp.value && curIsFreeform.value);
const ffeRef = ref<InstanceType<typeof FreeformEditor> | null>(null);
/** 把当前语义页解锁成自由版式(不可逆,一步 op 可撤销);解锁后拖拽手柄自动出现。 */
// ── 自由页双模式:文本(点字直改) / 排版(单击拖+双击改字自动识别) ──
// 排版是默认:单击/拖动整盒任意位置=移动缩放,双击文本/表格盒=直接改字。
// 「文本」模式是显式兜底:整层覆盖层收起,全页只改字(点哪儿都不会误拖)。
const ffMode = ref<"text" | "layout">("layout");
function setFfMode(m: "text" | "layout") {
  ffMode.value = m;
}
/** 排版模式生效中:覆盖层接管鼠标,只拖不改字。 */
const layoutActive = computed(() => freeEdit.value && ffMode.value === "layout");

function toggleFreeEdit() {
  if (!canOp.value) return;
  ffMode.value = "layout"; // 解锁的意图就是要挪 → 直接进排版模式
  if (curIsFreeform.value) return;
  op({ kind: "freeform", index: page.value });
}
function onFfPatch(i: number, patch: Partial<FreeBox>) {
  op({ kind: "box-set", index: page.value, box: i, patch });
}
function onFfMove(boxes: number[], dx: number, dy: number) {
  op({ kind: "boxes-move", index: page.value, boxes, dx, dy });
}
function onFfDel(boxes: number[]) {
  op({ kind: "boxes-del", index: page.value, boxes });
  ffeRef.value?.select(null);
}
function onFfDup(i: number) {
  const b = curBoxes.value[i];
  if (!b) return;
  const copy = JSON.parse(JSON.stringify(b));
  if (typeof copy.x === "number") copy.x += 16;
  if (typeof copy.y === "number") copy.y += 16;
  if (typeof copy.x2 === "number") copy.x2 += 16;
  if (typeof copy.y2 === "number") copy.y2 += 16;
  if (Array.isArray(copy.points)) copy.points = copy.points.map((p: any) => (Array.isArray(p) ? [p[0] + 16, p[1] + 16] : p));
  op({ kind: "box-add", index: page.value, boxSpec: copy });
}
function onFfZ(i: number, dir: "up" | "down" | "top" | "bottom") {
  op({ kind: "box-z", index: page.value, box: i, dir });
}
/** 插入新元素(顶部工具条调):落画布中央,插完自动选中。 */
function addBox(box: FreeBox) {
  if (!canOp.value || !curIsFreeform.value) return;
  op({ kind: "box-add", index: page.value, boxSpec: box });
}
/** 选中盒子的下标(格式面板读)。 */
const selBoxIdx = computed(() => (layoutActive.value ? ffeRef.value?.sel ?? null : null));

/** 动画面板顺序列表点行选中对应盒子(仅自由编辑态)。 */
function selectBox(i: number) {
  if (layoutActive.value) ffeRef.value?.select(i);
}

// 标题栏(父组件)要调放映/缩放/进出自由编辑,格式面板要读当前页号/选中盒子,工具条要插元素,
// 动画面板要预览/按序选中
defineExpose({ present, page, zoom, setZoom, freeEdit, curIsFreeform, toggleFreeEdit, ffMode, setFfMode, layoutActive, selBoxIdx, addBox, previewAnims, previewingAnims, selectBox });

// ───────── 点字直改 ─────────
// 只改文字,不动版式 —— autofit 仍然生效,所以用户**改不坏排版**(这正是"版式态"的红利:
// 豆包没有重排引擎、改字就溢出,我们改完自动重算字号)。
// 舞台里带 data-e="<字段路径>" 的元素点一下变 contenteditable,失焦/Enter 落盘。
const editing = computed(() => canOp.value && !layoutActive.value); // 文本模式常开:点字直改
const dirty = ref(false); // 有未落盘的改动(纯提示)
const stageEl = ref<HTMLElement | null>(null);

function onStageClick(e: MouseEvent) {
  if (layoutActive.value) return; // 排版模式:点击交给覆盖层,不翻页
  if (!editing.value) {
    go(page.value + 1, true); // 非编辑态:点击翻页(原行为)
    return;
  }
  const el = (e.target as HTMLElement)?.closest?.("[data-e]") as HTMLElement | null;
  if (!el || el.isContentEditable) return;
  e.stopPropagation();
  beginEdit(el, e.clientX, e.clientY);
}

// 点击坐标 → 文本光标位置。元素是点了才变 contenteditable 的,浏览器不会替我们把
// 光标落在点击处(默认落最左)。不能用 caretRangeFromPoint:自由版式的拖拽覆盖层
// 罩在文字上,命中测试永远打在覆盖层上。改为遍历 el 的文本节点,逐字符量矩形,
// 取离点击点最近的位置 —— 与层叠无关,怎么盖都能落对。
function placeCaretAt(el: HTMLElement, x: number, y: number): boolean {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const probe = document.createRange();
  let best: { node: Text; offset: number; score: number } | null = null;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const len = n.length;
    for (let i = 0; i <= len; i++) {
      probe.setStart(n, i);
      probe.setEnd(n, i);
      const r = probe.getClientRects()[0] ?? probe.getBoundingClientRect();
      if (!r || (!r.height && !r.width && !r.x && !r.y)) continue;
      const cy = r.y + r.height / 2;
      // 先比行(垂直距离),同一行里再比水平距离
      const score = Math.abs(cy - y) * 1000 + Math.abs(r.x - x);
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

function beginEdit(el: HTMLElement, x?: number, y?: number) {
  el.contentEditable = "true";
  el.spellcheck = false;
  el.focus();
  // 光标落到点击处(不全选),改错别字更顺手。自由版式双击进来时,覆盖层的
  // pointer-events:none 要等 Vue 下一帧才刷上,立即取点会命中覆盖层 → 等一帧重试
  if (x !== undefined && y !== undefined && !placeCaretAt(el, x, y)) {
    requestAnimationFrame(() => requestAnimationFrame(() => placeCaretAt(el, x, y)));
  }
  const path = el.dataset.e!;
  const before = props.spec ? getSpecText((props.spec as any).slides?.[page.value], path) : "";
  const finish = () => {
    el.contentEditable = "false";
    el.removeEventListener("blur", finish);
    el.removeEventListener("keydown", onKeyEdit);
    // innerText 保留换行(compare.body / timeline.body 是整块多行文本)
    const now = (el.innerText ?? "").replace(/ /g, " ").replace(/\n{2,}/g, "\n").trim();
    if (now === before) return; // 没改就不写盘
    emit("edit", page.value, path, now);
    dirty.value = true;
  };
  const onKeyEdit = (ev: KeyboardEvent) => {
    ev.stopPropagation(); // 别让 ←→ 冒泡去翻页
    if (ev.key === "Escape") {
      el.innerText = before; // 撤销本次
      el.blur();
    } else if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      el.blur(); // Enter 落盘;Shift+Enter 才换行
    }
  };
  el.addEventListener("blur", finish, { once: true });
  el.addEventListener("keydown", onKeyEdit);
}

// 选中缩略图滚进视野
const railEl = ref<HTMLElement | null>(null);
watch(page, () => {
  const th = railEl.value?.children[page.value] as HTMLElement | undefined;
  th?.scrollIntoView?.({ block: "nearest" });
});

// ── 色板 CSS:注入 document.head,所有选择器加实例级 scope 前缀,卸载时移除 ──
// slideBaseCss 输出 .sl/.pts/.card… 这类通用选择器,直接进全局必然污染 App 样式。
const SCOPE = `dkv-${Math.random().toString(36).slice(2, 8)}`;
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
  () => rendered.value?.css,
  (css) => {
    if (!css) return;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.dataset.dkv = SCOPE;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = scopeCss(css, `.${SCOPE}`);
  },
  { immediate: true }
);
onBeforeUnmount(() => {
  styleEl?.remove();
  styleEl = null;
});
</script>

<template>
  <div class="dkv" :class="SCOPE" tabindex="0" @keydown="onKey">
    <aside ref="railEl" class="dkv-rail">
      <!-- 新建幻灯片:豆包位(栏顶)。选版式后插在当前页之后,占位内容直接点字改 -->
      <div v-if="canOp" class="dkv-add">
        <button class="dkv-add-btn" @click.stop="addOpen = !addOpen"><Plus :size="12" /> 新建幻灯片</button>
        <div v-if="addOpen" class="dkv-add-menu">
          <button v-for="l in NEW_SLIDE_LAYOUTS" :key="l.id" @click="addSlide(l.id)">{{ l.name }}</button>
        </div>
      </div>
      <div
        v-for="(h, i) in pages"
        :key="i"
        class="dkv-th"
        :class="{ on: i === page, over: dragOver === i && dragIdx !== i, dragging: dragIdx === i }"
        role="button"
        :title="canOp ? `第 ${i + 1} 页 · 可拖拽调整页序` : `第 ${i + 1} 页`"
        :draggable="canOp"
        @click="go(i, true)"
        @dragstart="onDragStart(i, $event)"
        @dragover="onDragOver(i, $event)"
        @drop="onDrop(i)"
        @dragend="onDragEnd"
      >
        <span class="dkv-n">{{ i + 1 }}</span>
        <div class="dkv-fit" v-html="h"></div>
        <!-- 页操作:只在可编辑态出现,hover 才浮出来 —— 平时不打扰缩略图本身 -->
        <div v-if="canOp" class="dkv-th-ops" @click.stop>
          <button title="上移" :disabled="i === 0" @click="moveSlide(i, -1)"><ArrowUp :size="11" /></button>
          <button title="下移" :disabled="i === pages.length - 1" @click="moveSlide(i, 1)"><ArrowDown :size="11" /></button>
          <button title="复制本页" @click="dupSlide(i)"><Copy :size="11" /></button>
          <button class="del" title="删除本页" :disabled="pages.length <= 1" @click="delSlide(i)"><Trash2 :size="11" /></button>
        </div>
      </div>
      <div v-if="generating" class="dkv-pending">下一页生成中…</div>
    </aside>
    <main class="dkv-main">
      <div
        ref="stageEl"
        class="dkv-stage"
        :class="{ editing }"
        :title="layoutActive ? '排版模式：拖拽移动 · 拉手柄缩放 · 双击文字直接改 · Del 删除' : editing ? '点任意文字即可修改 · Enter 保存 · Esc 撤销' : '点击翻下一页 · ←→ 翻页 · Ctrl+滚轮缩放'"
        @click="onStageClick"
        @wheel="onStageWheel"
      >
        <div class="dkv-fit stage rel" :style="stageFitStyle">
          <div v-html="pages[page] ?? ''"></div>
          <FreeformEditor
            v-if="layoutActive && curIsFreeform && canOp"
            ref="ffeRef"
            :boxes="curBoxes"
            :stage-host="stageEl"
            @patch="onFfPatch"
            @move="onFfMove"
            @del="onFfDel"
            @dup="onFfDup"
            @z="onFfZ"
            @text-edit="beginEdit"
          />
        </div>
      </div>
      <!-- 演讲者备注:spec 里本就有 notes(口播稿),此前只进导出、界面上摸不着 -->
      <div v-if="notesOpen" class="dkv-notes">
        <StickyNote :size="12" class="dkv-notes-ic" />
        <textarea
          v-model="notesDraft"
          class="dkv-notes-ta"
          :readonly="!canOp"
          :placeholder="canOp ? '这一页的口播稿…（离开输入框即保存，随 PPT 一起导出为演讲者备注）' : '本页没有演讲者备注'"
          @focus="notesFocused = true"
          @blur="saveNotes"
        />
        <button class="dkv-notes-x" title="收起备注" @click="notesOpen = false"><X :size="12" /></button>
      </div>
      <div class="dkv-bar">
        <button class="dkv-btn" :disabled="page <= 0" @click.stop="go(page - 1, true)">
          <ChevronLeft :size="14" /> 上一页
        </button>
        <span class="dkv-num">{{ pages.length ? page + 1 : 0 }} / {{ pages.length }}</span>
        <button class="dkv-btn" :disabled="page >= pages.length - 1" @click.stop="go(page + 1, true)">
          下一页 <ChevronRight :size="14" />
        </button>
        <button
          class="dkv-btn"
          :class="{ on: notesOpen }"
          :title="curNotes ? '演讲者备注（本页已有）' : '演讲者备注'"
          @click.stop="notesOpen = !notesOpen"
        >
          <StickyNote :size="12" /> 备注<span v-if="curNotes" class="dkv-dot" />
        </button>
        <button
          v-if="editable && !generating"
          class="dkv-btn"
          title="撤销上一步（Ctrl+Z）"
          :disabled="!canUndo"
          @click.stop="emit('undo')"
        >
          <Undo2 :size="12" /> 撤销
        </button>
        <span v-if="editing" class="dkv-tip">点文字直接改 · Enter 保存 · Esc 撤销</span>
        <span v-else-if="dirty" class="dkv-tip ok">已保存改动</span>
        <span v-if="generating" class="dkv-gen"><Loader :size="12" class="dkv-spin" /> 生成中…</span>
      </div>
    </main>

    <!-- 放映:全屏只放当前页那一张,复用同一份页面 HTML(cqw 字号自动等比撑满) -->
    <div
      v-if="presenting"
      ref="showEl"
      class="dkv-show"
      tabindex="0"
      @keydown.stop="onKey"
      @click="onShowNext"
    >
      <!-- :key=page → 换页重建元素,切换动画随之重播 -->
      <div
        :key="page"
        class="dkv-fit dkv-show-fit"
        :class="showFitClass"
        :style="{ '--tdur': showDur }"
        v-html="pages[page] ?? ''"
      ></div>
      <div class="dkv-show-bar" @click.stop>
        <span>{{ page + 1 }} / {{ pages.length }}</span>
        <button title="退出放映（Esc）" @click="exitPresent"><X :size="13" /></button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dkv { display: flex; height: 100%; min-height: 0; background: #26262b; border-radius: 10px; overflow: hidden; outline: none; }
.dkv-rail { width: 150px; flex-shrink: 0; overflow-y: auto; padding: 12px 10px; display: flex; flex-direction: column; gap: 10px; background: rgba(0, 0, 0, 0.22); }
.dkv-rail::-webkit-scrollbar { width: 6px; }
.dkv-rail::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.18); border-radius: 3px; }
.dkv-th { position: relative; cursor: pointer; border-radius: 8px; outline: 2px solid transparent; outline-offset: 1px; border: none; background: transparent; padding: 0; transition: outline-color 0.15s; flex-shrink: 0; text-align: left; }
.dkv-th:hover { outline-color: rgba(255, 255, 255, 0.35); }
.dkv-th.on { outline-color: var(--primary, #7fa8d4); }
.dkv-th.dragging { opacity: 0.4; }
/* 拖拽落点:上缘一条亮线,比整块高亮更能说明「插到这里」 */
.dkv-th.over::before { content: ""; position: absolute; left: 0; right: 0; top: -5px; height: 3px; border-radius: 2px; background: var(--primary, #7fa8d4); z-index: 3; }
/* 页操作:hover 才浮出,平时不挡缩略图 */
.dkv-th-ops { position: absolute; right: 4px; top: 4px; z-index: 3; display: none; gap: 2px; padding: 2px; border-radius: 6px; background: rgba(0, 0, 0, 0.72); }
.dkv-th:hover .dkv-th-ops { display: flex; }
.dkv-th-ops button { display: inline-flex; padding: 3px; border: none; border-radius: 4px; background: transparent; color: #d8d8de; cursor: pointer; }
.dkv-th-ops button:hover:not(:disabled) { background: rgba(255, 255, 255, 0.18); color: #fff; }
.dkv-th-ops button.del:hover:not(:disabled) { background: #b3402e; color: #fff; }
.dkv-th-ops button:disabled { opacity: 0.3; cursor: default; }
.dkv-add { position: relative; flex-shrink: 0; }
.dkv-add-btn { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 4px; padding: 7px; border: 1px dashed rgba(255, 255, 255, 0.28); border-radius: 7px; background: transparent; color: #c9c9cf; font-size: 11.5px; cursor: pointer; }
.dkv-add-btn:hover { border-color: var(--primary, #7fa8d4); color: #fff; }
.dkv-add-menu { position: absolute; left: 0; right: 0; top: calc(100% + 4px); z-index: 5; display: grid; grid-template-columns: 1fr 1fr; gap: 2px; padding: 4px; border-radius: 7px; background: #33333a; border: 1px solid rgba(255, 255, 255, 0.14); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5); }
.dkv-add-menu button { padding: 6px 4px; border: none; border-radius: 5px; background: transparent; color: #d8d8de; font-size: 11px; cursor: pointer; }
.dkv-add-menu button:hover { background: var(--primary, #7fa8d4); color: #fff; }
.dkv-n { position: absolute; left: 5px; top: 5px; z-index: 2; font-size: 10px; line-height: 1; padding: 3px 6px; border-radius: 4px; background: rgba(0, 0, 0, 0.55); color: #fff; font-weight: 600; }
.dkv-pending { aspect-ratio: 16/9; border-radius: 6px; border: 1.5px dashed rgba(255, 255, 255, 0.32); display: flex; align-items: center; justify-content: center; color: rgba(255, 255, 255, 0.6); font-size: 11px; animation: dkv-pulse 1.25s ease-in-out infinite; flex-shrink: 0; }
@keyframes dkv-pulse { 50% { opacity: 0.4; } }
.dkv-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
/* container-type:size → 100cqh 可用容器高算出 16:9 下的最大宽,宽高双约束下不溢出。
   flex + margin:auto 而非 grid place-items:缩放超过 100% 时内容大于容器要能滚动,
   grid 居中会把左上角剪出视野,margin:auto 双向都安全。 */
.dkv-stage { flex: 1; min-height: 0; cursor: pointer; container-type: size; display: flex; overflow: auto; padding: 16px; }
.dkv-stage .dkv-fit { width: min(100%, calc((100cqh - 32px) * 1.77778)); margin: auto; }
/* 抽屉窄时也绝不换行:按钮一律 nowrap + 不收缩,提示语可省略号截断 */
.dkv-bar { height: 44px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; gap: 10px; padding: 0 10px; color: #c9c9cf; font-size: 12.5px; user-select: none; overflow: hidden; }
.dkv-btn { display: inline-flex; align-items: center; gap: 3px; border: 1px solid rgba(255, 255, 255, 0.22); background: rgba(255, 255, 255, 0.06); color: #e4e4e8; border-radius: 7px; padding: 5px 12px; font-size: 12px; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
.dkv-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.14); }
.dkv-btn:disabled { opacity: 0.35; cursor: default; }
.dkv-num { min-width: 52px; text-align: center; white-space: nowrap; flex-shrink: 0; }
.dkv-gen { display: inline-flex; align-items: center; gap: 5px; color: var(--primary, #7fa8d4); font-weight: 600; white-space: nowrap; flex-shrink: 0; }
.dkv-btn.edit { display: inline-flex; align-items: center; gap: 4px; }
.dkv-btn.edit.on { background: var(--primary, #7fa8d4); border-color: var(--primary, #7fa8d4); color: #fff; }
/* 提示语是唯一可牺牲的:空间不够就截断,不许把按钮挤换行 */
.dkv-tip { font-size: 11.5px; color: #9a9aa2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.dkv-tip.ok { color: #6cbf8f; font-weight: 600; }
/* 编辑态:可改的文字给虚线底提示,hover 高亮 —— 让「哪里能点」一眼可见 */
.dkv-stage.editing { cursor: default; }
.dkv-stage.editing .dkv-fit :deep([data-e]) {
  outline: 1px dashed rgba(127, 168, 212, 0.55);
  outline-offset: 2px;
  cursor: text;
  border-radius: 2px;
}
.dkv-stage.editing .dkv-fit :deep([data-e]:hover) { outline-color: var(--primary, #7fa8d4); background: rgba(127, 168, 212, 0.1); }
.dkv-stage.editing .dkv-fit :deep([contenteditable="true"]) {
  outline: 2px solid var(--primary, #7fa8d4);
  background: rgba(127, 168, 212, 0.14);
}
.dkv-btn.on { background: var(--primary, #7fa8d4); border-color: var(--primary, #7fa8d4); color: #fff; }
/* v-html 渲染区 + 自由编辑覆盖层的公共定位锚 */
.dkv-fit.rel { position: relative; }
/* 解锁确认:锚在 .dkv-main(position:relative)上,贴底栏上缘居中 —— 不进底栏子树,
   否则被 .dkv-bar 的 overflow:hidden 整个剪没 */
.dkv-main { position: relative; }
/* 本页已有备注的小红点:不用数字、不用文案,一眼可见哪页写过口播稿 */
.dkv-dot { display: inline-block; width: 5px; height: 5px; margin-left: 4px; border-radius: 50%; background: #6cbf8f; vertical-align: middle; }
/* 备注条:舞台与工具条之间的一横条,不抢舞台高度 */
.dkv-notes { flex-shrink: 0; display: flex; align-items: flex-start; gap: 7px; margin: 0 10px; padding: 8px 10px; border-radius: 8px; background: rgba(0, 0, 0, 0.28); }
.dkv-notes-ic { color: #9a9aa2; flex-shrink: 0; margin-top: 3px; }
.dkv-notes-ta { flex: 1; min-width: 0; height: 62px; resize: none; border: none; background: transparent; color: #e4e4e8; font-size: 12px; line-height: 1.6; font-family: inherit; }
.dkv-notes-ta:focus { outline: none; }
.dkv-notes-ta::placeholder { color: #77777f; }
.dkv-notes-x { border: none; background: transparent; color: #9a9aa2; cursor: pointer; display: inline-flex; padding: 2px; flex-shrink: 0; }
.dkv-notes-x:hover { color: #fff; }
/* 放映:全屏纯黑,只有页面本体 + 一条会自动淡出的角标 */
.dkv-show { position: fixed; inset: 0; z-index: 60; background: #000; display: grid; place-items: center; cursor: pointer; outline: none; container-type: size; }
.dkv-show-fit { width: min(100%, calc(100cqh * 1.77778)); }
.dkv-show-fit :deep(.sl) { border-radius: 0; }
/* 页面切换动画(与导出 <p:transition> 同构;--tdur 由 speed 字段给) */
.dkv-show-fit.t-fade { animation: dkv-t-fade var(--tdur, 0.6s) ease both; }
.dkv-show-fit.t-zoom { animation: dkv-t-zoom var(--tdur, 0.6s) ease both; }
.dkv-show-fit.t-push.t-up { animation: dkv-t-up var(--tdur, 0.6s) cubic-bezier(0.2, 0.7, 0.3, 1) both; }
.dkv-show-fit.t-push.t-down { animation: dkv-t-down var(--tdur, 0.6s) cubic-bezier(0.2, 0.7, 0.3, 1) both; }
.dkv-show-fit.t-push.t-left { animation: dkv-t-left var(--tdur, 0.6s) cubic-bezier(0.2, 0.7, 0.3, 1) both; }
.dkv-show-fit.t-push.t-right { animation: dkv-t-right var(--tdur, 0.6s) cubic-bezier(0.2, 0.7, 0.3, 1) both; }
@keyframes dkv-t-fade { from { opacity: 0; } }
@keyframes dkv-t-zoom { from { opacity: 0; transform: scale(0.82); } }
/* ── 元素动画播放(与引擎 anim 效果同构;--kdur 由 data-animdur 给) ── */
.dkv :deep(.kfx) { animation-duration: var(--kdur, 0.5s); animation-fill-mode: both; animation-timing-function: ease; }
.dkv :deep(.kfx-appear) { animation: none; }
.dkv :deep(.kfx-fade) { animation-name: kfx-fade; }
.dkv :deep(.kfx-float-in) { animation-name: kfx-float; }
.dkv :deep(.kfx-zoom) { animation-name: kfx-zoom; }
.dkv :deep(.kfx-fly-in.kdir-up) { animation-name: kfx-fly-up; }
.dkv :deep(.kfx-fly-in.kdir-down) { animation-name: kfx-fly-down; }
.dkv :deep(.kfx-fly-in.kdir-left) { animation-name: kfx-fly-left; }
.dkv :deep(.kfx-fly-in.kdir-right) { animation-name: kfx-fly-right; }
.dkv :deep(.kfx-wipe.kdir-up) { animation-name: kfx-wipe-up; }
.dkv :deep(.kfx-wipe.kdir-down) { animation-name: kfx-wipe-down; }
.dkv :deep(.kfx-wipe.kdir-left) { animation-name: kfx-wipe-left; }
.dkv :deep(.kfx-wipe.kdir-right) { animation-name: kfx-wipe-right; }
.dkv :deep(.kfx-pulse) { animation-name: kfx-pulse; }
.dkv :deep(.kfx-grow) { animation-name: kfx-grow; }
.dkv :deep(.kfx-transparency) { animation-name: kfx-transp; }
.dkv :deep(.kfx-fade-out) { animation-name: kfx-fade-out; }
.dkv :deep(.kfx-zoom-out) { animation-name: kfx-zoom-out; }
.dkv :deep(.kfx-fly-out.kdir-up) { animation-name: kfx-flyout-up; }
.dkv :deep(.kfx-fly-out.kdir-down) { animation-name: kfx-flyout-down; }
.dkv :deep(.kfx-fly-out.kdir-left) { animation-name: kfx-flyout-left; }
.dkv :deep(.kfx-fly-out.kdir-right) { animation-name: kfx-flyout-right; }
@keyframes kfx-fade { from { opacity: 0; } }
@keyframes kfx-float { from { opacity: 0; transform: translateY(8%); } }
@keyframes kfx-zoom { from { opacity: 0; transform: scale(0); } }
@keyframes kfx-fly-up { from { transform: translateY(120vh); } }
@keyframes kfx-fly-down { from { transform: translateY(-120vh); } }
@keyframes kfx-fly-left { from { transform: translateX(120vw); } }
@keyframes kfx-fly-right { from { transform: translateX(-120vw); } }
@keyframes kfx-wipe-up { from { clip-path: inset(100% 0 0 0); } to { clip-path: inset(0); } }
@keyframes kfx-wipe-down { from { clip-path: inset(0 0 100% 0); } to { clip-path: inset(0); } }
@keyframes kfx-wipe-left { from { clip-path: inset(0 0 0 100%); } to { clip-path: inset(0); } }
@keyframes kfx-wipe-right { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0); } }
@keyframes kfx-pulse { 50% { transform: scale(1.08); } }
@keyframes kfx-grow { to { transform: scale(1.25); } }
@keyframes kfx-transp { to { opacity: 0.4; } }
@keyframes kfx-fade-out { to { opacity: 0; } }
@keyframes kfx-zoom-out { to { opacity: 0; transform: scale(0); } }
@keyframes kfx-flyout-up { to { transform: translateY(120vh); } }
@keyframes kfx-flyout-down { to { transform: translateY(-120vh); } }
@keyframes kfx-flyout-left { to { transform: translateX(120vw); } }
@keyframes kfx-flyout-right { to { transform: translateX(-120vw); } }
@keyframes dkv-t-up { from { opacity: 0.4; transform: translateY(55%); } }
@keyframes dkv-t-down { from { opacity: 0.4; transform: translateY(-55%); } }
@keyframes dkv-t-left { from { opacity: 0.4; transform: translateX(55%); } }
@keyframes dkv-t-right { from { opacity: 0.4; transform: translateX(-55%); } }
.dkv-show-bar { position: absolute; right: 18px; bottom: 16px; display: flex; align-items: center; gap: 10px; padding: 6px 12px; border-radius: 20px; background: rgba(0, 0, 0, 0.55); color: #c9c9cf; font-size: 12.5px; opacity: 0; transition: opacity 0.2s; cursor: default; }
.dkv-show:hover .dkv-show-bar { opacity: 1; }
.dkv-show-bar button { display: inline-flex; border: none; background: transparent; color: #c9c9cf; cursor: pointer; padding: 2px; }
.dkv-show-bar button:hover { color: #fff; }
.dkv-spin { animation: dkv-rot 0.9s linear infinite; }
@keyframes dkv-rot { to { transform: rotate(360deg); } }
/* v-html 内容里的 .sl 尺寸约束(须 :deep 穿透) */
.dkv-fit { width: 100%; }
.dkv-fit :deep(.sl) { width: 100%; }
.dkv-th .dkv-fit :deep(.sl) { border-radius: 6px; pointer-events: none; }
.dkv-stage .dkv-fit :deep(.sl) { box-shadow: 0 12px 36px rgba(0, 0, 0, 0.45); }
</style>

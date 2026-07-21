<script setup lang="ts">
import { ref, computed, watch, nextTick } from "vue";
import {
  FileText, Shapes, Image as ImageIcon, Table2, BarChart3,
  SlidersHorizontal, Play, X, Loader, Move,
} from "@lucide/vue";
import {
  NATIVE_THEME_META, TRANSITIONS, BOX_ANIMS,
  type SlideSpec, type SlideOp, type FreeBox,
} from "../lib/slidesSpec";
import DeckViewer from "./DeckViewer.vue";

// 豆包式演示编辑器外壳:插入工具条 + 舞台(DeckViewer)+ 格式面板 + 图表数据弹层。
// 本组件不持有真源、不碰盘 —— 一切改动都以 op/edit/undo/theme 事件抛给父组件的 specEdit
// 事务处理(读盘→改对象→写盘→刷预览→重转 pptx)。演示工坊与右抽屉共用这一套编辑 chrome,
// 避免两处各写一遍再各自跑偏。
defineOptions({ name: "DeckEditor" });

const props = defineProps<{
  spec: SlideSpec;
  generating?: boolean;
  editable?: boolean;
  canUndo?: boolean;
  full?: boolean; // 全屏态:默认展开格式面板;紧凑(抽屉)态默认收起,把宽度让给画布
}>();
const emit = defineEmits<{
  (e: "edit", slideIdx: number, path: string, value: string): void;
  (e: "op", op: SlideOp): void;
  (e: "undo"): void;
  (e: "theme", id: string): void;
}>();

const viewerRef = ref<InstanceType<typeof DeckViewer> | null>(null);
const panelOpen = ref(!!props.full);
watch(() => props.full, (v) => (panelOpen.value = v)); // 切全屏自动展开面板,退出自动收起
const error = ref<string | null>(null);

const deck = computed(() => props.spec);
const specPages = computed(() => deck.value?.slides?.length ?? 0);
const specTheme = computed(() => String(deck.value?.theme ?? ""));
const curPage = computed(() => viewerRef.value?.page ?? 0);

// 父组件顶栏(放映/解锁拖拽)复用这些 —— viewer 实例现在住在本组件里
defineExpose({
  present: () => viewerRef.value?.present(),
  toggleFreeEdit: () => viewerRef.value?.toggleFreeEdit(),
  get curIsFreeform() {
    return viewerRef.value?.curIsFreeform ?? false;
  },
  get page() {
    return viewerRef.value?.page ?? 0;
  },
});

function onDeckOp(op: SlideOp) {
  error.value = null;
  emit("op", op);
}
// DeckViewer 冒上来的原生编辑意图,原样转给父组件的 specEdit 事务
function onViewerEdit(slideIdx: number, path: string, value: string) {
  emit("edit", slideIdx, path, value);
}
function onViewerOp(op: SlideOp) {
  emit("op", op);
}

const LAYOUT_NAMES: Record<string, string> = {
  title: "封面", section: "章节", bullets: "要点", "two-col": "两栏", compare: "对比",
  stats: "数据", timeline: "时间线", quote: "引用", closing: "结尾",
  "image-full": "全幅图", "image-text": "图文", freeform: "自由版式",
};
const curLayoutName = computed(() => {
  const l = String(deck.value?.slides?.[curPage.value]?.layout ?? "bullets");
  return LAYOUT_NAMES[l] ?? l;
});

// ───────── 选中元素(格式面板) ─────────
const freeEditing = computed(() => !!viewerRef.value?.freeEdit && !!viewerRef.value?.curIsFreeform);
const selIdx = computed<number | null>(() => (viewerRef.value?.selBoxIdx as number | null) ?? null);
const selBox = computed<FreeBox | null>(() => {
  const i = selIdx.value;
  if (i === null) return null;
  const boxes = (deck.value as any)?.slides?.[curPage.value]?.boxes;
  return Array.isArray(boxes) ? boxes[i] ?? null : null;
});
const BOX_NAMES: Record<string, string> = {
  text: "文本", rect: "矩形", bar: "矩形", card: "卡片", scrim: "蒙版", image: "图片", pic: "图片",
  line: "直线", arrow: "箭头", axis: "坐标轴", polyline: "折线", curve: "曲线", polygon: "多边形",
  ellipse: "椭圆", circle: "圆形", point: "标记点", dot: "标记点",
};
const selBoxName = computed(() => BOX_NAMES[String(selBox.value?.type ?? "")] ?? String(selBox.value?.type ?? ""));
const selIsText = computed(() => String(selBox.value?.type ?? "") === "text");
const selIsImage = computed(() => ["image", "pic"].includes(String(selBox.value?.type ?? "")));
const selIsLine = computed(() =>
  ["line", "arrow", "axis", "polyline", "curve", "polygon"].includes(String(selBox.value?.type ?? ""))
);
const selRotatable = computed(() => ["text", "rect", "bar", "card", "scrim", "image", "pic"].includes(String(selBox.value?.type ?? "")));
function patchSel(patch: Partial<FreeBox>) {
  const i = selIdx.value;
  if (i === null) return;
  onDeckOp({ kind: "box-set", index: curPage.value, box: i, patch });
}
function numPatch(key: keyof FreeBox, e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  if (Number.isFinite(v)) patchSel({ [key]: Math.round(v) } as Partial<FreeBox>);
}
const COLOR_WORDS = [
  { id: "ink", name: "正文色" }, { id: "muted", name: "次要色" }, { id: "accent", name: "强调色" },
  { id: "card", name: "卡片色" }, { id: "white", name: "白" }, { id: "black", name: "黑" },
];
function colorPatch(key: "color" | "fill", e: Event) {
  const v = (e.target as HTMLSelectElement).value;
  if (v === "__custom") return;
  patchSel({ [key]: v || undefined } as Partial<FreeBox>);
}
function hexPatch(key: "color" | "fill", e: Event) {
  const v = (e.target as HTMLInputElement).value.trim();
  if (/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(v)) patchSel({ [key]: v.startsWith("#") ? v : `#${v}` } as Partial<FreeBox>);
}

// ───────── 插入元素 ─────────
// 语义页(非自由版式)插元素前先自动解锁本页 —— 豆包式:点「文本」直接就能加,
// 不用先手动点「解锁拖拽」。解锁是发 op 给父组件改盘、异步生效,所以把真正的插入
// 挂起,等本页 layout 变成 freeform 再补执行。
const pendingInsert = ref<null | (() => void)>(null);
function withFreeform(fn: () => void) {
  if (viewerRef.value?.curIsFreeform) {
    viewerRef.value?.setFfMode("layout"); // 插完就能拖 → 切到排版模式出手柄
    fn();
    return;
  }
  pendingInsert.value = fn;
  viewerRef.value?.toggleFreeEdit();
}

// ── 文本 / 排版 双模式 ──
// 「文本」= 点文字直接改(语义页天生如此;自由页收起拖拽覆盖层)。
// 「排版」= 单击拖拽移动/拉手柄缩放,双击文字直接改字(语义页先自动解锁成自由版式,不可逆)。
const ffLayoutOn = computed(() => !!viewerRef.value?.layoutActive);
function modeText() {
  viewerRef.value?.setFfMode("text");
}
function modeLayout() {
  viewerRef.value?.toggleFreeEdit(); // 内部:置排版模式;语义页顺带解锁成 freeform
}
watch(
  () => viewerRef.value?.curIsFreeform,
  (isFree) => {
    if (isFree && pendingInsert.value) {
      const f = pendingInsert.value;
      pendingInsert.value = null;
      nextTick(() => f());
    }
  }
);
const shapeMenu = ref(false);
function insertBox(box: FreeBox) {
  shapeMenu.value = false;
  tableMenu.value = false;
  chartMenu.value = false;
  withFreeform(() => viewerRef.value?.addBox(box));
}
const SHAPES: { name: string; make: () => FreeBox }[] = [
  { name: "文本框", make: () => ({ type: "text", x: 490, y: 320, w: 300, h: 80, text: "新文本：双击这里改字", size: 20, color: "ink" }) },
  { name: "矩形", make: () => ({ type: "rect", x: 540, y: 310, w: 200, h: 100, color: "accent" }) },
  { name: "卡片", make: () => ({ type: "card", x: 490, y: 280, w: 300, h: 160 }) },
  { name: "圆形", make: () => ({ type: "circle", x: 640, y: 360, r: 60, color: "accent", width: 3 }) },
  { name: "直线", make: () => ({ type: "line", x: 490, y: 360, x2: 790, y2: 360, color: "ink", width: 3 }) },
  { name: "箭头", make: () => ({ type: "arrow", x: 490, y: 360, x2: 790, y2: 360, color: "ink", width: 3 }) },
];
async function insertImage() {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const sel = await open({ multiple: false, filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }] });
    if (!sel || Array.isArray(sel)) return;
    insertBox({ type: "image", x: 440, y: 210, w: 400, h: 300, image: sel, cover: true });
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  }
}
const tableMenu = ref(false);
const tableHover = ref<[number, number]>([0, 0]);
function insertTable(rows: number, cols: number) {
  tableMenu.value = false;
  const body = Array.from({ length: rows - 1 }, () => Array(cols).fill("内容"));
  const head = Array.from({ length: cols }, (_, c) => `列 ${c + 1}`);
  const h = Math.min(460, 48 * rows);
  insertBox({ type: "table", x: 240, y: 190, w: 800, h, rows: [head, ...body], header: true, size: 14 });
}
const chartMenu = ref(false);
const CHART_TYPES = [
  { id: "bar", name: "柱状图" }, { id: "line", name: "折线图" },
  { id: "pie", name: "饼图" }, { id: "donut", name: "环形图" },
];
function insertChart(kind: string) {
  chartMenu.value = false;
  insertBox({
    type: "chart", chartType: kind, x: 340, y: 160, w: 600, h: 400,
    labels: ["项目一", "项目二", "项目三", "项目四"], series: [[40, 65, 50, 80]],
  });
}
const selIsChart = computed(() => String(selBox.value?.type ?? "") === "chart");
const chartDraft = ref<{ labels: string[]; series: number[][]; names: string[] } | null>(null);
function openChartEditor() {
  const b = selBox.value;
  if (!b) return;
  const labels = Array.isArray(b.labels) ? b.labels.map(String) : [];
  const raw = Array.isArray(b.series) ? b.series : [];
  const series: number[][] = (raw as unknown[]).every((v) => typeof v === "number")
    ? [(raw as number[]).slice()]
    : (raw as number[][]).map((r) => (Array.isArray(r) ? r.slice() : []));
  const names = Array.isArray(b.names) ? b.names.map(String) : [];
  while (names.length < series.length) names.push("");
  chartDraft.value = JSON.parse(JSON.stringify({ labels, series, names }));
}
function chartDraftCell(si: number, li: number, e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  if (chartDraft.value && Number.isFinite(v)) chartDraft.value.series[si][li] = v;
}
function chartAddLabel() {
  const d = chartDraft.value;
  if (!d) return;
  d.labels.push(`项目${d.labels.length + 1}`);
  d.series.forEach((s) => s.push(0));
}
function chartDelLabel(li: number) {
  const d = chartDraft.value;
  if (!d || d.labels.length <= 1) return;
  d.labels.splice(li, 1);
  d.series.forEach((s) => s.splice(li, 1));
}
function chartAddSeries() {
  const d = chartDraft.value;
  if (!d || d.series.length >= 6) return;
  d.series.push(Array(d.labels.length).fill(0));
  d.names.push(`系列${d.series.length}`);
}
function chartDelSeries() {
  const d = chartDraft.value;
  if (!d || d.series.length <= 1) return;
  d.series.pop();
  d.names.pop();
}
function applyChartEdit() {
  const d = chartDraft.value;
  if (!d) return;
  patchSel({
    labels: d.labels,
    series: d.series.length === 1 ? d.series[0] : d.series,
    names: d.names.some((n) => n.trim()) ? d.names : undefined,
  });
  chartDraft.value = null;
}

// ───────── 元素动画 ─────────
const ANIM_GROUPS = [
  { cls: "entr", name: "进入" },
  { cls: "emph", name: "强调" },
  { cls: "exit", name: "退出" },
] as const;
const selAnim = computed(() => selBox.value?.anim ?? null);
function setAnim(effect: string) {
  if (!effect) {
    patchSel({ anim: undefined });
    return;
  }
  const cur = selAnim.value;
  patchSel({ anim: { effect, trigger: cur?.trigger, dur: cur?.dur, delay: cur?.delay, dir: cur?.dir } });
}
function animField(patch: Partial<NonNullable<FreeBox["anim"]>>) {
  const cur = selAnim.value;
  if (!cur) return;
  patchSel({ anim: { ...cur, ...patch } });
}
const ANIM_TRIGGERS = [
  { id: "click", name: "单击时" }, { id: "with", name: "与上个同时" }, { id: "after", name: "上个之后" },
];
const animSeq = computed(() => {
  const sl = (deck.value as any)?.slides?.[curPage.value];
  const boxes: FreeBox[] = Array.isArray(sl?.boxes) ? sl.boxes : [];
  const rows: { step: number; box: number; label: string }[] = [];
  let step = 0;
  const clicks = [...new Set(boxes.map((b) => Number(b.click) || 0))].filter((n) => n > 0).sort((a, b) => a - b);
  for (const n of clicks) {
    step++;
    boxes.forEach((b, i) => {
      if ((Number(b.click) || 0) === n && !b.anim?.effect)
        rows.push({ step, box: i, label: `${BOX_NAMES[String(b.type ?? "")] ?? b.type} · 淡化` });
    });
  }
  boxes.forEach((b, i) => {
    if (!b.anim?.effect) return;
    const trig = b.anim.trigger ?? "click";
    if (trig === "click" || step === 0) step++;
    const fx = BOX_ANIMS.find((a) => a.id === b.anim!.effect)?.name ?? b.anim.effect;
    rows.push({ step, box: i, label: `${BOX_NAMES[String(b.type ?? "")] ?? b.type} · ${fx}${trig !== "click" ? (trig === "with" ? "（同时）" : "（之后）") : ""}` });
  });
  return rows;
});

// ───────── 页面切换 ─────────
const curTransition = computed(
  () => (deck.value as any)?.slides?.[curPage.value]?.transition ?? null
);
function setTransition(patch: { type?: string; dir?: string; speed?: string }) {
  const pg = curPage.value;
  const cur = curTransition.value;
  const type = patch.type !== undefined ? patch.type : (cur?.type ?? "");
  if (!type) {
    onDeckOp({ kind: "transition", index: pg, value: null });
    return;
  }
  onDeckOp({
    kind: "transition",
    index: pg,
    value: { type, dir: patch.dir ?? cur?.dir, speed: patch.speed ?? cur?.speed },
  });
}
function transitionAll() {
  const cur = curTransition.value;
  onDeckOp({ kind: "transition", index: curPage.value, value: cur ? { ...cur } : null, all: true });
}
const TR_DIRS = [
  { id: "up", name: "从底部" }, { id: "down", name: "从顶部" },
  { id: "left", name: "从右侧" }, { id: "right", name: "从左侧" },
];
const TR_SPEEDS = [
  { id: "fast", name: "快" }, { id: "med", name: "中" }, { id: "slow", name: "慢" },
];

// ───────── 表格行列 ─────────
const selIsTable = computed(() => String(selBox.value?.type ?? "") === "table");
function tableMod(fn: (rows: string[][]) => void) {
  const rows = selBox.value?.rows;
  if (!Array.isArray(rows)) return;
  const copy: string[][] = JSON.parse(JSON.stringify(rows));
  fn(copy);
  if (copy.length && copy[0].length) patchSel({ rows: copy });
}
const tableAddRow = () => tableMod((r) => r.push(Array(r[0]?.length ?? 1).fill("")));
const tableDelRow = () => tableMod((r) => { if (r.length > 1) r.pop(); });
const tableAddCol = () => tableMod((r) => r.forEach((row) => row.push("")));
const tableDelCol = () => tableMod((r) => { if ((r[0]?.length ?? 0) > 1) r.forEach((row) => row.pop()); });

// ───────── 主题换肤(deck 级,发 theme 事件让父组件改 spec.theme) ─────────
const skinning = ref<string | null>(null);
function applyTheme(id: string) {
  if (props.generating || specTheme.value === id) return;
  skinning.value = id;
  emit("theme", id);
}
// 父组件写盘、spec 主题真的变了 → 收起 busy 态
watch(specTheme, () => (skinning.value = null));
</script>

<template>
  <div class="de">
    <!-- 插入工具条(格式/缩放常驻;插入按钮仅自由编辑态) -->
    <div class="de-tools">
      <template v-if="editable && !generating">
        <button
          class="de-tool"
          :class="{ on: !ffLayoutOn }"
          title="文本模式：点任意文字直接修改（不动版式）"
          @click="modeText"
        ><FileText :size="13" /> 文本</button>
        <button
          class="de-tool"
          :class="{ on: ffLayoutOn }"
          title="排版模式：拖拽移动、拉手柄缩放，双击文字直接改（语义页会先解锁成自由版式，不可逆）"
          @click="modeLayout"
        ><Move :size="13" /> 排版</button>
        <span class="de-tools-sep" />
      </template>
      <template v-if="(freeEditing || full) && !generating">
        <span class="de-shape-wrap">
          <button class="de-tool" :class="{ on: shapeMenu }" title="插入图形" @click="shapeMenu = !shapeMenu">
            <Shapes :size="13" /> 图形
          </button>
          <div v-if="shapeMenu" class="de-shape-menu">
            <button v-for="s in SHAPES" :key="s.name" @click="insertBox(s.make())">{{ s.name }}</button>
          </div>
        </span>
        <button class="de-tool" title="插入本地图片" @click="insertImage"><ImageIcon :size="13" /> 图片</button>
        <span class="de-shape-wrap">
          <button class="de-tool" :class="{ on: chartMenu }" title="插入图表（导出为可选中的形状组）" @click="chartMenu = !chartMenu">
            <BarChart3 :size="13" /> 图表
          </button>
          <div v-if="chartMenu" class="de-shape-menu">
            <button v-for="c in CHART_TYPES" :key="c.id" @click="insertChart(c.id)">{{ c.name }}</button>
          </div>
        </span>
        <span class="de-shape-wrap">
          <button class="de-tool" :class="{ on: tableMenu }" title="插入表格（PowerPoint 里仍是真表格）" @click="tableMenu = !tableMenu">
            <Table2 :size="13" /> 表格
          </button>
          <div v-if="tableMenu" class="de-tbl-pick" @mouseleave="tableHover = [0, 0]">
            <div class="de-tbl-lab">插入表格 <b>{{ tableHover[0] || "-" }} × {{ tableHover[1] || "-" }}</b></div>
            <div class="de-tbl-grid">
              <button
                v-for="n in 42"
                :key="n"
                :class="{ lit: Math.ceil(n / 7) <= tableHover[0] && ((n - 1) % 7) + 1 <= tableHover[1] }"
                @mouseenter="tableHover = [Math.ceil(n / 7), ((n - 1) % 7) + 1]"
                @click="insertTable(Math.ceil(n / 7), ((n - 1) % 7) + 1)"
              />
            </div>
          </div>
        </span>
        <span class="de-tools-sep" />
      </template>
      <button class="de-tool" :class="{ on: panelOpen }" title="格式面板" @click="panelOpen = !panelOpen">
        <SlidersHorizontal :size="13" /> 格式
      </button>
      <div class="de-zoom">
        <button title="缩小" @click="viewerRef?.setZoom((viewerRef?.zoom ?? 100) - 10)">−</button>
        <span>{{ viewerRef?.zoom ?? 100 }}%</span>
        <button title="放大" @click="viewerRef?.setZoom((viewerRef?.zoom ?? 100) + 10)">+</button>
      </div>
    </div>

    <div v-if="error" class="de-error">{{ error }}</div>

    <!-- 图表数据编辑弹层 -->
    <div v-if="chartDraft" class="de-chart-sheet" @click.self="chartDraft = null">
      <div class="de-chart-card">
        <div class="de-chart-head">
          编辑图表数据
          <button class="de-ic" title="关闭" @click="chartDraft = null"><X :size="14" /></button>
        </div>
        <div class="de-chart-grid-wrap">
          <table class="de-chart-grid">
            <thead>
              <tr>
                <th>类目</th>
                <th v-for="(n, si) in chartDraft.series" :key="si">
                  <input v-model="chartDraft.names[si]" type="text" :placeholder="`系列${si + 1}`" />
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(lab, li) in chartDraft.labels" :key="li">
                <td><input v-model="chartDraft.labels[li]" type="text" /></td>
                <td v-for="(sv, si) in chartDraft.series" :key="si">
                  <input type="number" :value="sv[li] ?? 0" @change="chartDraftCell(si, li, $event)" />
                </td>
                <td>
                  <button class="de-ic" title="删这一行" :disabled="chartDraft.labels.length <= 1" @click="chartDelLabel(li)"><X :size="12" /></button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="de-chart-acts">
          <button class="de-ghost" @click="chartAddLabel">+ 行</button>
          <button class="de-ghost" :disabled="chartDraft.series.length >= 6" @click="chartAddSeries">+ 系列</button>
          <button class="de-ghost" :disabled="chartDraft.series.length <= 1" @click="chartDelSeries">− 系列</button>
          <span style="flex:1"></span>
          <button class="de-ghost" @click="chartDraft = null">取消</button>
          <button class="de-primary sm" @click="applyChartEdit">应用</button>
        </div>
      </div>
    </div>

    <div class="de-body">
      <div class="de-stage">
        <!-- 浮动文字格式条(豆包/Word 式):选中文本框即浮出,就地改字体/字号/加粗/对齐/颜色 -->
        <div v-if="selIsText" class="de-fmt" @mousedown.prevent>
          <select
            class="de-fmt-font"
            :value="selBox!.font === 'serif' ? 'serif' : 'sans'"
            title="字体"
            @change="patchSel({ font: ($event.target as HTMLSelectElement).value === 'serif' ? 'serif' : undefined })"
          >
            <option value="sans">黑体</option>
            <option value="serif">衬线</option>
          </select>
          <div class="de-fmt-num">
            <button title="调小" @click="patchSel({ size: Math.max(4, (selBox!.size ?? 18) - 2) })">−</button>
            <span>{{ selBox!.size ?? 18 }}</span>
            <button title="调大" @click="patchSel({ size: Math.min(400, (selBox!.size ?? 18) + 2) })">+</button>
          </div>
          <span class="de-fmt-sep" />
          <button class="de-fmt-ic" :class="{ on: !!selBox!.bold }" title="加粗" @click="patchSel({ bold: !selBox!.bold || undefined })"><b>B</b></button>
          <button class="de-fmt-ic" :class="{ on: !!selBox!.italic }" title="斜体" @click="patchSel({ italic: !selBox!.italic || undefined })"><i>I</i></button>
          <span class="de-fmt-sep" />
          <button
            v-for="a in [['left','左'],['center','中'],['right','右']]" :key="a[0]"
            class="de-fmt-ic"
            :class="{ on: (selBox!.align ?? 'left') === a[0] || (a[0]==='left' && !selBox!.align) }"
            :title="`对齐:${a[1]}`"
            @click="patchSel({ align: a[0] === 'left' ? undefined : a[0] })"
          >{{ a[1] }}</button>
          <span class="de-fmt-sep" />
          <select
            class="de-fmt-color"
            title="颜色"
            :value="COLOR_WORDS.some(c => c.id === selBox!.color) ? selBox!.color : (selBox!.color ? '__custom' : 'ink')"
            @change="colorPatch('color', $event)"
          >
            <option v-for="c in COLOR_WORDS" :key="c.id" :value="c.id">{{ c.name }}</option>
            <option value="__custom">自定义…</option>
          </select>
        </div>
        <DeckViewer
          ref="viewerRef"
          class="de-viewer"
          :spec="deck"
          :generating="generating"
          :editable="editable"
          :can-undo="canUndo"
          @edit="onViewerEdit"
          @op="onViewerOp"
          @undo="emit('undo')"
        />
      </div>

      <!-- 格式面板 -->
      <aside v-if="panelOpen" class="de-panel">
        <!-- 选中元素属性 -->
        <div v-if="selBox" class="de-panel-sec">
          <div class="de-panel-title">元素 · {{ selBoxName }}</div>
          <div class="de-xywh" v-if="!selIsLine">
            <label>X<input type="number" :value="selBox.x ?? 0" @change="numPatch('x', $event)" /></label>
            <label>Y<input type="number" :value="selBox.y ?? 0" @change="numPatch('y', $event)" /></label>
            <template v-if="selBox.r === undefined">
              <label>宽<input type="number" :value="selBox.w ?? 100" @change="numPatch('w', $event)" /></label>
              <label>高<input type="number" :value="selBox.h ?? 100" @change="numPatch('h', $event)" /></label>
            </template>
            <label v-else>半径<input type="number" :value="selBox.r" @change="numPatch('r', $event)" /></label>
          </div>
          <label v-if="selRotatable" class="de-prop-row">
            旋转
            <input type="number" min="0" max="359" :value="selBox.rot ?? 0" @change="numPatch('rot', $event)" />
          </label>
          <label v-if="!selIsImage" class="de-prop-row">
            不透明
            <input type="number" min="0" max="100" :value="selBox.opacity ?? 100" @change="numPatch('opacity', $event)" />
          </label>
          <template v-if="selIsText">
            <label class="de-prop-row">
              字号
              <input type="number" min="4" max="400" :value="selBox.size ?? 18" @change="numPatch('size', $event)" />
            </label>
            <div class="de-seg">
              <button :class="{ on: !!selBox.bold }" title="加粗" @click="patchSel({ bold: !selBox.bold || undefined })"><b>B</b></button>
              <button :class="{ on: !!selBox.italic }" title="斜体" @click="patchSel({ italic: !selBox.italic || undefined })"><i>I</i></button>
            </div>
            <div class="de-seg">
              <button v-for="a in [['left','左'],['center','中'],['right','右']]" :key="a[0]"
                :class="{ on: (selBox.align ?? 'left') === a[0] || (a[0]==='left' && !selBox.align) }"
                @click="patchSel({ align: a[0] === 'left' ? undefined : a[0] })">{{ a[1] }}</button>
            </div>
            <div class="de-seg">
              <button :class="{ on: !selBox.font }" @click="patchSel({ font: undefined })">黑体</button>
              <button :class="{ on: selBox.font === 'serif' }" @click="patchSel({ font: 'serif' })">衬线</button>
            </div>
          </template>
          <label v-if="selIsLine" class="de-prop-row">
            线宽
            <input type="number" min="1" max="40" :value="selBox.width ?? 3" @change="numPatch('width', $event)" />
          </label>
          <template v-if="selIsChart">
            <label class="de-prop-row">
              类型
              <select :value="selBox.chartType" @change="patchSel({ chartType: ($event.target as HTMLSelectElement).value })">
                <option v-for="c in CHART_TYPES" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
            </label>
            <label class="de-prop-row">
              标题
              <input type="text" :value="selBox.title ?? ''" @change="patchSel({ title: ($event.target as HTMLInputElement).value || undefined })" />
            </label>
            <button class="de-ghost" style="justify-content:center" @click="openChartEditor">编辑数据</button>
            <label class="de-check">
              <input type="checkbox" :checked="!!selBox.native" @change="patchSel({ native: ($event.target as HTMLInputElement).checked || undefined })" />
              原生图表
            </label>
            <span class="de-note">
              {{ selBox.native
                ? "导出为真 PowerPoint 图表：可在 PowerPoint 里「编辑数据」。预览为近似。"
                : "导出为形状组：处处同一个样、可选中改色，但 PowerPoint 里不能改数。" }}
            </span>
          </template>
          <template v-if="selIsTable">
            <div class="de-panel-row"><span>表格</span><b>{{ selBox.rows?.length ?? 0 }} 行 × {{ selBox.rows?.[0]?.length ?? 0 }} 列</b></div>
            <div class="de-seg">
              <button title="加一行" @click="tableAddRow">行 +</button>
              <button title="删末行" @click="tableDelRow">行 −</button>
              <button title="加一列" @click="tableAddCol">列 +</button>
              <button title="删末列" @click="tableDelCol">列 −</button>
            </div>
            <label class="de-check"><input type="checkbox" :checked="selBox.header !== false" @change="patchSel({ header: ($event.target as HTMLInputElement).checked ? undefined : false })" /> 首行作表头</label>
            <label class="de-prop-row">
              字号
              <input type="number" min="6" max="40" :value="selBox.size ?? 14" @change="numPatch('size', $event)" />
            </label>
            <span class="de-note">双击任意单元格直接改字。</span>
          </template>
          <label class="de-prop-row">
            颜色
            <select :value="COLOR_WORDS.some(c => c.id === selBox!.color) ? selBox!.color : (selBox!.color ? '__custom' : 'ink')" @change="colorPatch('color', $event)">
              <option v-for="c in COLOR_WORDS" :key="c.id" :value="c.id">{{ c.name }}</option>
              <option value="__custom">自定义…</option>
            </select>
          </label>
          <input
            v-if="selBox.color && !COLOR_WORDS.some(c => c.id === selBox!.color)"
            class="de-hex" type="text" placeholder="#RRGGBB" :value="selBox.color" @change="hexPatch('color', $event)"
          />
        </div>
        <!-- 元素动画 -->
        <div v-if="selBox" class="de-panel-sec">
          <div class="de-panel-title">元素动画</div>
          <button class="de-tr-none" :class="{ on: !selAnim }" @click="setAnim('')">无动画</button>
          <template v-for="g in ANIM_GROUPS" :key="g.cls">
            <div class="de-group-label">{{ g.name }}</div>
            <div class="de-tr-grid three">
              <button
                v-for="a in BOX_ANIMS.filter(a => a.cls === g.cls)"
                :key="a.id"
                :class="{ on: selAnim?.effect === a.id }"
                @click="setAnim(a.id)"
              >{{ a.name }}</button>
            </div>
          </template>
          <template v-if="selAnim">
            <label class="de-prop-row">
              触发
              <select :value="selAnim.trigger ?? 'click'" @change="animField({ trigger: ($event.target as HTMLSelectElement).value })">
                <option v-for="t in ANIM_TRIGGERS" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
            </label>
            <label class="de-prop-row">
              时长 ms
              <input type="number" min="50" max="10000" step="50" :value="selAnim.dur ?? 500"
                @change="animField({ dur: Number(($event.target as HTMLInputElement).value) || 500 })" />
            </label>
            <div v-if="BOX_ANIMS.find(a => a.id === selAnim!.effect)?.hasDir" class="de-seg">
              <button v-for="d in TR_DIRS" :key="d.id" :class="{ on: (selAnim.dir ?? 'up') === d.id }"
                @click="animField({ dir: d.id })">{{ d.name }}</button>
            </div>
          </template>
          <template v-if="animSeq.length">
            <div class="de-group-label">播放顺序</div>
            <div class="de-anim-seq">
              <button v-for="(r, ri) in animSeq" :key="ri" class="de-anim-row" :class="{ on: selIdx === r.box }" @click="viewerRef?.selectBox(r.box)">
                <span class="de-anim-step">{{ r.step }}</span>{{ r.label }}
              </button>
            </div>
            <button class="de-ghost" style="justify-content:center" :disabled="viewerRef?.previewingAnims" @click="viewerRef?.previewAnims()">
              <Play :size="12" /> {{ viewerRef?.previewingAnims ? "播放中…" : "预览本页动画" }}
            </button>
          </template>
          <span class="de-note">放映时按序播放；导出后 PowerPoint 里是真动画。</span>
        </div>
        <div class="de-panel-sec">
          <div class="de-panel-title">文档</div>
          <div class="de-panel-row"><span>页数</span><b>{{ specPages }}</b></div>
          <div class="de-panel-row"><span>当前页</span><b>第 {{ curPage + 1 }} 页 · {{ curLayoutName }}</b></div>
        </div>
        <!-- 页面切换 -->
        <div v-if="!generating" class="de-panel-sec">
          <div class="de-panel-title">页面切换</div>
          <div class="de-tr-grid">
            <button
              v-for="t in TRANSITIONS"
              :key="t.id"
              :class="{ on: (curTransition?.type ?? '') === t.id }"
              @click="setTransition({ type: t.id })"
            >{{ t.name }}</button>
          </div>
          <template v-if="TRANSITIONS.find(t => t.id === (curTransition?.type ?? ''))?.hasDir">
            <div class="de-seg">
              <button
                v-for="d in TR_DIRS"
                :key="d.id"
                :class="{ on: (curTransition?.dir ?? 'up') === d.id }"
                @click="setTransition({ dir: d.id })"
              >{{ d.name }}</button>
            </div>
          </template>
          <div v-if="curTransition" class="de-seg">
            <button
              v-for="sp in TR_SPEEDS"
              :key="sp.id"
              :class="{ on: (curTransition?.speed ?? 'med') === sp.id }"
              @click="setTransition({ speed: sp.id })"
            >{{ sp.name }}</button>
          </div>
          <button class="de-ghost" style="justify-content:center" @click="transitionAll">应用到全部页</button>
          <span class="de-note">放映与导出的 PowerPoint 均生效。</span>
        </div>
        <!-- 主题换肤 -->
        <div class="de-panel-sec">
          <div class="de-panel-title">主题换肤</div>
          <div class="de-skin wrap">
            <button
              v-for="t in NATIVE_THEME_META"
              :key="t.id"
              class="de-skin-sw"
              :class="{ on: specTheme === t.id, busy: skinning === t.id }"
              :title="`${t.name}（内容不变，预览与导出同步换色）`"
              :disabled="!!skinning || generating"
              :style="{ background: t.bg }"
              @click="applyTheme(t.id)"
            >
              <span class="de-skin-acc" :style="{ background: t.accent }"></span>
            </button>
            <Loader v-if="skinning" :size="12" class="spin" />
          </div>
          <span class="de-note">内容不变，预览与导出同步换色。</span>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.de { flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; overflow: hidden; position: relative; }
.de-tools { display: flex; align-items: center; gap: 8px; padding: 7px 12px; border-bottom: 1px solid var(--border-soft); background: var(--panel); flex-shrink: 0; }
.de-tool { display: inline-flex; align-items: center; gap: 5px; padding: 5px 11px; border: 1px solid var(--border); border-radius: 7px; background: var(--bg); color: var(--text-2); font-size: 12px; font-weight: 600; cursor: pointer; }
.de-tool:hover { border-color: var(--primary); color: var(--primary); }
.de-tool.on { border-color: var(--primary); background: var(--primary-soft); color: var(--primary-deep); }
.de-zoom { margin-left: auto; display: flex; align-items: center; gap: 2px; }
.de-zoom button { width: 24px; height: 24px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-2); font-size: 14px; line-height: 1; cursor: pointer; }
.de-zoom button:hover { border-color: var(--primary); color: var(--primary); }
.de-zoom span { min-width: 44px; text-align: center; font-size: 11.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
.de-tools-sep { width: 1px; height: 18px; background: var(--border-soft); margin: 0 4px; }
.de-shape-wrap { position: relative; display: inline-flex; }
.de-shape-menu { position: absolute; left: 0; top: calc(100% + 5px); z-index: 20; display: flex; flex-direction: column; gap: 2px; padding: 4px; min-width: 96px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); box-shadow: 0 8px 26px rgba(0,0,0,.16); }
.de-shape-menu button { padding: 6px 10px; border: none; border-radius: 5px; background: transparent; color: var(--text-2); font-size: 12px; text-align: left; cursor: pointer; }
.de-shape-menu button:hover { background: var(--primary-soft); color: var(--primary-deep); }
.de-tbl-pick { position: absolute; left: 0; top: calc(100% + 5px); z-index: 20; padding: 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); box-shadow: 0 8px 26px rgba(0,0,0,.16); }
.de-tbl-lab { font-size: 11px; color: var(--muted); margin-bottom: 6px; white-space: nowrap; }
.de-tbl-lab b { color: var(--primary-deep); }
.de-tbl-grid { display: grid; grid-template-columns: repeat(7, 16px); gap: 3px; }
.de-tbl-grid button { width: 16px; height: 16px; padding: 0; border: 1px solid var(--border); border-radius: 3px; background: var(--bg); cursor: pointer; }
.de-tbl-grid button.lit { background: var(--primary); border-color: var(--primary); }

.de-chart-sheet { position: absolute; inset: 0; z-index: 30; display: flex; align-items: flex-end; justify-content: center; background: rgba(0,0,0,.28); }
.de-chart-card { width: min(680px, calc(100% - 32px)); max-height: 70%; margin-bottom: 16px; display: flex; flex-direction: column; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 16px 48px rgba(0,0,0,.3); overflow: hidden; }
.de-chart-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; font-size: 13px; font-weight: 700; color: var(--text); border-bottom: 1px solid var(--border-soft); }
.de-chart-grid-wrap { overflow: auto; padding: 10px 14px; }
.de-chart-grid { border-collapse: collapse; width: 100%; }
.de-chart-grid th, .de-chart-grid td { border: 1px solid var(--border-soft); padding: 2px; }
.de-chart-grid th { background: var(--bg-soft); font-size: 11px; color: var(--muted); font-weight: 600; }
.de-chart-grid input { width: 100%; min-width: 64px; border: none; background: transparent; color: var(--text); font-size: 12px; padding: 5px 7px; }
.de-chart-grid input:focus { outline: 2px solid var(--primary); border-radius: 3px; }
.de-chart-acts { display: flex; align-items: center; gap: 6px; padding: 10px 14px; border-top: 1px solid var(--border-soft); }

.de-body { flex: 1; min-height: 0; display: flex; }
.de-stage { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 12px; position: relative; }
/* 浮动文字格式条 */
.de-fmt { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: 40; display: flex; align-items: center; gap: 4px; padding: 5px 8px; border-radius: 10px; background: var(--panel); border: 1px solid var(--border); box-shadow: 0 8px 28px rgba(0,0,0,.22); }
.de-fmt select { padding: 4px 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); font-size: 12px; cursor: pointer; }
.de-fmt-font { min-width: 58px; }
.de-fmt-color { min-width: 68px; }
.de-fmt-num { display: inline-flex; align-items: center; gap: 2px; }
.de-fmt-num button { width: 22px; height: 24px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-2); font-size: 14px; line-height: 1; cursor: pointer; }
.de-fmt-num button:hover { border-color: var(--primary); color: var(--primary); }
.de-fmt-num span { min-width: 26px; text-align: center; font-size: 12px; color: var(--text); font-variant-numeric: tabular-nums; }
.de-fmt-ic { min-width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-2); font-size: 12.5px; cursor: pointer; }
.de-fmt-ic:hover { border-color: var(--primary); color: var(--primary); }
.de-fmt-ic.on { border-color: var(--primary); background: var(--primary-soft); color: var(--primary-deep); }
.de-fmt-sep { width: 1px; height: 18px; background: var(--border-soft); margin: 0 2px; }
.de-viewer { flex: 1; min-height: 0; border: 1px solid var(--border); box-shadow: var(--shadow, 0 6px 24px rgba(0,0,0,.08)); }

.de-panel { width: 208px; flex-shrink: 0; overflow-y: auto; border-left: 1px solid var(--border-soft); background: var(--bg-soft); padding: 12px; display: flex; flex-direction: column; gap: 16px; }
.de-panel-sec { display: flex; flex-direction: column; gap: 7px; }
.de-panel-title { font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--dim); }
.de-panel-row { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--muted); }
.de-panel-row b { color: var(--text); font-weight: 600; }
.de-group-label { font-size: 10.5px; color: var(--dim); margin-top: 2px; }

.de-xywh { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
.de-xywh label, .de-prop-row { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--muted); }
.de-prop-row { justify-content: space-between; }
.de-xywh input, .de-prop-row input { width: 100%; max-width: 76px; padding: 4px 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); font-size: 11.5px; }
.de-prop-row select { max-width: 100px; padding: 4px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); font-size: 11.5px; }
.de-hex { padding: 4px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); font-size: 11.5px; font-family: var(--mono); }
.de-xywh input:focus, .de-prop-row input:focus, .de-hex:focus { outline: none; border-color: var(--primary); }

.de-seg { display: flex; gap: 4px; }
.de-seg button { flex: 1; padding: 6px 4px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-2); font-size: 11.5px; cursor: pointer; }
.de-seg button.on { border-color: var(--primary); background: var(--primary-soft); color: var(--primary-deep); font-weight: 600; }
.de-check { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--muted); cursor: pointer; user-select: none; }
.de-check input { accent-color: var(--primary); }
.de-note { font-size: 10.5px; color: var(--muted); line-height: 1.5; }

.de-tr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.de-tr-grid button { padding: 7px 4px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-2); font-size: 11px; cursor: pointer; }
.de-tr-grid button:hover { border-color: var(--primary); }
.de-tr-grid button.on { border-color: var(--primary); background: var(--primary-soft); color: var(--primary-deep); font-weight: 600; }
.de-tr-grid.three { grid-template-columns: 1fr 1fr 1fr; }
.de-tr-none { padding: 6px; border: 1px dashed var(--border); border-radius: 6px; background: transparent; color: var(--muted); font-size: 11px; cursor: pointer; }
.de-tr-none.on { border-color: var(--primary); color: var(--primary-deep); border-style: solid; background: var(--primary-soft); }
.de-anim-seq { display: flex; flex-direction: column; gap: 3px; max-height: 150px; overflow-y: auto; }
.de-anim-row { display: flex; align-items: center; gap: 6px; padding: 4px 7px; border: 1px solid var(--border-soft); border-radius: 6px; background: var(--bg); color: var(--text-2); font-size: 11px; text-align: left; cursor: pointer; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.de-anim-row:hover { border-color: var(--primary); }
.de-anim-row.on { border-color: var(--primary); background: var(--primary-soft); color: var(--primary-deep); }
.de-anim-step { flex-shrink: 0; width: 16px; height: 16px; border-radius: 50%; background: var(--primary); color: #fff; font-size: 9.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }

.de-skin { display: flex; align-items: center; gap: 5px; }
.de-skin.wrap { flex-wrap: wrap; }
.de-skin-sw { position: relative; width: 24px; height: 24px; border-radius: 6px; border: 1.5px solid var(--border); cursor: pointer; overflow: hidden; padding: 0; }
.de-skin-sw:hover:not(:disabled) { border-color: var(--primary); }
.de-skin-sw.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }
.de-skin-sw.busy { animation: de-spin 1s linear infinite; }
.de-skin-sw:disabled { cursor: default; opacity: .7; }
.de-skin-acc { position: absolute; left: 0; right: 0; bottom: 0; height: 34%; display: block; }

.de-ghost { display: inline-flex; align-items: center; gap: 4px; padding: 6px 9px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--text-2); font-size: 11.5px; cursor: pointer; }
.de-ghost:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
.de-ghost:disabled { opacity: .5; cursor: default; }
.de-primary { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 11px 26px; border: none; border-radius: 10px; background: var(--primary); color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; }
.de-primary.sm { padding: 8px 16px; font-size: 12.5px; }
.de-ic { display: inline-flex; padding: 4px; border: none; border-radius: 6px; background: transparent; color: var(--muted); cursor: pointer; }
.de-ic:hover { background: var(--bg); color: var(--primary); }
.de-error { margin: 8px 12px 0; padding: 8px 11px; border-radius: 8px; background: var(--vermilion-soft); color: var(--vermilion); font-size: 12px; flex-shrink: 0; }
.spin { animation: de-spin .9s linear infinite; }
@keyframes de-spin { to { transform: rotate(360deg); } }
</style>

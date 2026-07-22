<script setup lang="ts">
import { ref, computed, watch } from "vue";
import {
  Type, Image as ImageIcon, Table2, ListOrdered, Quote,
  SlidersHorizontal, BookOpen, Loader, SquareSplitVertical,
} from "@lucide/vue";
import {
  DOC_THEMES, NEW_BLOCKS, PAGE_SIZES,
  type DocSpec, type DocOp, type DocBlock, type DocBlockType,
} from "../lib/docSpec";
import DocViewer from "./DocViewer.vue";

// 豆包式 Word 教案编辑器外壳:插入工具条 + 纸张舞台(DocViewer)+ 格式面板。
// 与 DeckEditor 逐处同构 —— 本组件同样**不持有真源、不碰盘**,一切改动都以 op/edit/undo
// 事件抛给父组件的 specEdit 事务(读盘→改对象→写盘→刷预览→重转 .docx)。
// 教案工坊与右抽屉共用这一套编辑 chrome,避免两处各写一遍再各自跑偏。
defineOptions({ name: "DocEditor" });

const props = defineProps<{
  spec: DocSpec;
  generating?: boolean;
  editable?: boolean;
  canUndo?: boolean;
  /** 全屏态:默认展开格式面板;紧凑(抽屉)态默认收起,把宽度让给纸张 */
  full?: boolean;
}>();
const emit = defineEmits<{
  (e: "edit", blockIdx: number, path: string, value: string): void;
  (e: "op", op: DocOp): void;
  (e: "undo"): void;
}>();

const viewerRef = ref<InstanceType<typeof DocViewer> | null>(null);
const panelOpen = ref(!!props.full);
watch(() => props.full, (v) => (panelOpen.value = v));
const error = ref<string | null>(null);

const doc = computed(() => props.spec);
const specTheme = computed(() => String(doc.value?.theme ?? DOC_THEMES[0].id));

// 父组件顶栏(阅读模式)复用这些 —— viewer 实例住在本组件里
defineExpose({
  present: () => viewerRef.value?.present(),
  get page() {
    return viewerRef.value?.page ?? 0;
  },
  get pages() {
    return viewerRef.value?.pages ?? 0;
  },
});

function onOp(op: DocOp) {
  error.value = null;
  emit("op", op);
}

// ───────── 选中块(格式面板) ─────────
const selIdx = computed<number | null>(() => (viewerRef.value?.selBlock as number | null) ?? null);
const selBlock = computed<DocBlock | null>(() => {
  const i = selIdx.value;
  if (i === null) return null;
  return doc.value?.blocks?.[i] ?? null;
});
const BLOCK_NAMES: Record<string, string> = {
  title: "文档标题", subtitle: "副标题", h1: "一级标题", h2: "二级标题", h3: "三级标题",
  p: "正文段", bullet: "要点", num: "编号项", quote: "引文", callout: "提示框",
  table: "表格", image: "插图", hr: "分隔线", pagebreak: "分页符",
};
const selName = computed(() => BLOCK_NAMES[String(selBlock.value?.type ?? "")] ?? "未选中");
/** 承载文字的块才给字号/对齐/颜色 —— 表格/图片/分隔线给它们各自的那套 */
const selIsText = computed(() =>
  ["title", "subtitle", "h1", "h2", "h3", "p", "bullet", "num", "quote", "callout"].includes(
    String(selBlock.value?.type ?? "")
  )
);
const selIsTable = computed(() => String(selBlock.value?.type ?? "") === "table");
const selIsImage = computed(() => String(selBlock.value?.type ?? "") === "image");
const selIsPara = computed(() => String(selBlock.value?.type ?? "") === "p");

function patchSel(patch: Partial<DocBlock>) {
  const i = selIdx.value;
  if (i === null) return;
  onOp({ kind: "set", index: i, patch });
}
function numPatch(key: keyof DocBlock, e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  if (Number.isFinite(v)) patchSel({ [key]: v } as Partial<DocBlock>);
}
function retype(to: DocBlockType) {
  const i = selIdx.value;
  if (i === null) return;
  onOp({ kind: "retype", index: i, to });
}

const COLOR_WORDS = [
  { id: "ink", name: "正文色" }, { id: "muted", name: "次要色" },
  { id: "accent", name: "强调色" }, { id: "line", name: "线条色" },
];
function colorPatch(e: Event) {
  const v = (e.target as HTMLSelectElement).value;
  if (v === "__custom") return;
  patchSel({ color: v || undefined });
}
function hexPatch(e: Event) {
  const v = (e.target as HTMLInputElement).value.trim();
  if (/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(v)) patchSel({ color: v.startsWith("#") ? v : `#${v}` });
}

// ───────── 插入 ─────────
// 插在**选中块之后**(没选中就落到文末),与 Word 的「光标处插入」同义。
function insertAt(): number {
  const n = doc.value?.blocks?.length ?? 0;
  return (selIdx.value ?? n - 1) + 1;
}
const textMenu = ref(false);
const TEXT_KINDS: { id: string; name: string }[] = [
  { id: "h1", name: "一级标题" }, { id: "h2", name: "二级标题" },
  { id: "p", name: "正文段" }, { id: "quote", name: "引文" }, { id: "callout", name: "提示框" },
];
function insert(id: string) {
  textMenu.value = false;
  tableMenu.value = false;
  onOp({ kind: "add", index: insertAt(), block: id });
}
const tableMenu = ref(false);
const tableHover = ref<[number, number]>([0, 0]);
function insertTable(rows: number, cols: number) {
  tableMenu.value = false;
  const at = insertAt();
  onOp({ kind: "add", index: at, block: "table" });
  // 模板是 3×2,再按用户选的行列补齐 —— 加块与改块分两步,是因为 op 只能表达一种意图
  const head = Array.from({ length: cols }, (_, c) => `表头 ${c + 1}`);
  const body = Array.from({ length: Math.max(1, rows - 1) }, () => Array.from({ length: cols }, () => ""));
  onOp({ kind: "set", index: at, patch: { rows: [head, ...body], head0: true } });
}
async function insertImage() {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const sel = await open({ multiple: false, filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }] });
    if (!sel || Array.isArray(sel)) return;
    const at = insertAt();
    onOp({ kind: "add", index: at, block: "image" });
    onOp({ kind: "set", index: at, patch: { src: sel, w: 80 } });
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  }
}

// ───────── 表格行列 ─────────
function tableOp(kind: "row-add" | "row-del" | "col-add" | "col-del", at: number) {
  const i = selIdx.value;
  if (i === null) return;
  onOp({ kind, index: i, at });
}
const selRows = computed(() => selBlock.value?.rows?.length ?? 0);
const selCols = computed(() =>
  (selBlock.value?.rows ?? []).reduce((m, r) => Math.max(m, Array.isArray(r) ? r.length : 0), 0)
);

// ───────── 页面设置 / 换肤 ─────────
function pagePatch(patch: Record<string, unknown>) {
  onOp({ kind: "page", patch: patch as any });
}
const skinning = ref<string | null>(null);
async function applyTheme(id: string) {
  if (id === specTheme.value || skinning.value) return;
  skinning.value = id;
  onOp({ kind: "theme", value: id });
  // 换肤是父组件异步落盘 + 重转 .docx;这里只做「按钮转圈」的观感,盘上真结果由 spec 变化反映
  setTimeout(() => (skinning.value = null), 900);
}
</script>

<template>
  <div class="dw">
    <!-- 插入工具条(格式/缩放常驻) -->
    <div class="dw-tools">
      <template v-if="!generating && editable">
        <span class="dw-menu-wrap">
          <button class="dw-tool" :class="{ on: textMenu }" title="插入文字块" @click="textMenu = !textMenu">
            <Type :size="13" /> 文字
          </button>
          <div v-if="textMenu" class="dw-menu">
            <button v-for="k in TEXT_KINDS" :key="k.id" @click="insert(k.id)">{{ k.name }}</button>
          </div>
        </span>
        <button class="dw-tool" title="插入要点" @click="insert('bullet')"><ListOrdered :size="13" /> 要点</button>
        <span class="dw-menu-wrap">
          <button class="dw-tool" :class="{ on: tableMenu }" title="插入表格（Word 里仍是真表格）" @click="tableMenu = !tableMenu">
            <Table2 :size="13" /> 表格
          </button>
          <div v-if="tableMenu" class="dw-tbl-pick" @mouseleave="tableHover = [0, 0]">
            <div class="dw-tbl-lab">插入表格 <b>{{ tableHover[0] || "-" }} × {{ tableHover[1] || "-" }}</b></div>
            <div class="dw-tbl-grid">
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
        <button class="dw-tool" title="插入本地图片" @click="insertImage"><ImageIcon :size="13" /> 图片</button>
        <button class="dw-tool" title="插入引文" @click="insert('quote')"><Quote :size="13" /> 引文</button>
        <button class="dw-tool" title="插入分页符" @click="insert('pagebreak')"><SquareSplitVertical :size="13" /> 分页</button>
        <span class="dw-tools-sep" />
      </template>
      <button class="dw-tool" :class="{ on: panelOpen }" title="格式面板" @click="panelOpen = !panelOpen">
        <SlidersHorizontal :size="13" /> 格式
      </button>
      <button class="dw-tool" title="全屏通读（F5）" @click="viewerRef?.present()"><BookOpen :size="13" /> 阅读</button>
      <div class="dw-zoom">
        <button title="缩小" @click="viewerRef?.setZoom((viewerRef?.zoom ?? 100) - 10)">−</button>
        <span>{{ viewerRef?.zoom ?? 100 }}%</span>
        <button title="放大" @click="viewerRef?.setZoom((viewerRef?.zoom ?? 100) + 10)">+</button>
      </div>
    </div>

    <div v-if="error" class="dw-error">{{ error }}</div>

    <div class="dw-body">
      <div class="dw-stage">
        <!-- 浮动文字格式条(豆包/Word 式):选中文字块即浮出,就地改块型/加粗/对齐 -->
        <div v-if="selIsText && editable && !generating" class="dw-fmt" @mousedown.prevent>
          <select class="dw-fmt-sel" :value="selBlock!.type" title="段落样式" @change="retype(($event.target as HTMLSelectElement).value as DocBlockType)">
            <option v-for="(n, k) in BLOCK_NAMES" :key="k" :value="k">{{ n }}</option>
          </select>
          <span class="dw-fmt-sep" />
          <button class="dw-fmt-ic" :class="{ on: !!selBlock!.bold }" title="加粗" @click="patchSel({ bold: !selBlock!.bold || undefined })"><b>B</b></button>
          <button class="dw-fmt-ic" :class="{ on: !!selBlock!.italic }" title="斜体" @click="patchSel({ italic: !selBlock!.italic || undefined })"><i>I</i></button>
          <span class="dw-fmt-sep" />
          <button
            v-for="a in [['left','左'],['center','中'],['right','右'],['both','两端']]" :key="a[0]"
            class="dw-fmt-ic"
            :class="{ on: (selBlock!.align ?? 'left') === a[0] || (a[0] === 'left' && !selBlock!.align) }"
            :title="`对齐:${a[1]}`"
            @click="patchSel({ align: a[0] === 'left' ? undefined : a[0] })"
          >{{ a[1] }}</button>
        </div>

        <DocViewer
          ref="viewerRef"
          class="dw-viewer"
          :spec="doc"
          :generating="generating"
          :editable="editable"
          :can-undo="canUndo"
          @edit="(b, p, v) => emit('edit', b, p, v)"
          @op="onOp"
          @undo="emit('undo')"
        />
      </div>

      <!-- 格式面板 -->
      <aside v-if="panelOpen" class="dw-panel">
        <!-- 选中块属性 -->
        <div v-if="selBlock" class="dw-panel-sec">
          <div class="dw-panel-title">段落 · {{ selName }}</div>
          <label class="dw-prop-row">
            样式
            <select :value="selBlock.type" @change="retype(($event.target as HTMLSelectElement).value as DocBlockType)">
              <option v-for="(n, k) in BLOCK_NAMES" :key="k" :value="k">{{ n }}</option>
            </select>
          </label>
          <template v-if="selIsText">
            <label class="dw-prop-row">
              字号 pt
              <input type="number" min="6" max="72" step="0.5" :value="selBlock.size ?? ''" placeholder="跟主题" @change="numPatch('size', $event)" />
            </label>
            <div class="dw-seg">
              <button :class="{ on: !!selBlock.bold }" title="加粗" @click="patchSel({ bold: !selBlock.bold || undefined })"><b>B</b></button>
              <button :class="{ on: !!selBlock.italic }" title="斜体" @click="patchSel({ italic: !selBlock.italic || undefined })"><i>I</i></button>
            </div>
            <div class="dw-seg">
              <button
                v-for="a in [['left','左'],['center','中'],['right','右'],['both','两端']]" :key="a[0]"
                :class="{ on: (selBlock.align ?? 'left') === a[0] || (a[0] === 'left' && !selBlock.align) }"
                @click="patchSel({ align: a[0] === 'left' ? undefined : a[0] })"
              >{{ a[1] }}</button>
            </div>
            <label v-if="selIsPara" class="dw-check">
              <input
                type="checkbox"
                :checked="String(selBlock.indent ?? 'first') !== 'none'"
                @change="patchSel({ indent: ($event.target as HTMLInputElement).checked ? undefined : 'none' })"
              />
              首行缩进 2 字符
            </label>
            <label class="dw-prop-row">
              左缩进
              <input type="number" min="0" max="10" step="0.5" :value="selBlock.pad ?? 0" @change="numPatch('pad', $event)" />
            </label>
            <label class="dw-prop-row">
              颜色
              <select :value="COLOR_WORDS.some(c => c.id === selBlock!.color) ? selBlock!.color : (selBlock!.color ? '__custom' : 'ink')" @change="colorPatch">
                <option v-for="c in COLOR_WORDS" :key="c.id" :value="c.id">{{ c.name }}</option>
                <option value="__custom">自定义…</option>
              </select>
            </label>
            <input
              v-if="selBlock.color && !COLOR_WORDS.some(c => c.id === selBlock!.color)"
              class="dw-hex" type="text" placeholder="#RRGGBB" :value="selBlock.color" @change="hexPatch"
            />
          </template>

          <template v-if="selIsTable">
            <div class="dw-panel-row"><span>表格</span><b>{{ selRows }} 行 × {{ selCols }} 列</b></div>
            <div class="dw-seg">
              <button title="在末尾加一行" @click="tableOp('row-add', selRows)">行 +</button>
              <button title="删末行" :disabled="selRows <= 1" @click="tableOp('row-del', selRows - 1)">行 −</button>
              <button title="在末尾加一列" @click="tableOp('col-add', selCols)">列 +</button>
              <button title="删末列" :disabled="selCols <= 1" @click="tableOp('col-del', selCols - 1)">列 −</button>
            </div>
            <label class="dw-check">
              <input type="checkbox" :checked="selBlock.head0 !== false" @change="patchSel({ head0: ($event.target as HTMLInputElement).checked ? undefined : false })" />
              首行作表头
            </label>
            <span class="dw-note">点任意单元格直接改字；表头会在跨页时自动重复。</span>
          </template>

          <template v-if="selIsImage">
            <label class="dw-prop-row">
              宽度 %
              <input type="number" min="10" max="100" :value="selBlock.w ?? 100" @change="numPatch('w', $event)" />
            </label>
            <button class="dw-ghost" style="justify-content:center" @click="insertImage">换一张图</button>
            <span class="dw-note">点图注可直接改字。</span>
          </template>
        </div>
        <div v-else class="dw-panel-sec">
          <div class="dw-panel-title">段落</div>
          <span class="dw-note">点纸上任意一段，这里出现它的格式选项。</span>
        </div>

        <!-- 插入 -->
        <div v-if="editable && !generating" class="dw-panel-sec">
          <div class="dw-panel-title">插入</div>
          <div class="dw-grid">
            <button v-for="b in NEW_BLOCKS" :key="b.id" @click="insert(b.id)">{{ b.name }}</button>
          </div>
        </div>

        <!-- 文档 -->
        <div class="dw-panel-sec">
          <div class="dw-panel-title">文档</div>
          <div class="dw-panel-row"><span>页数</span><b>{{ viewerRef?.pages ?? 0 }}</b></div>
          <div class="dw-panel-row"><span>字数</span><b>{{ viewerRef?.words ?? 0 }}</b></div>
          <div class="dw-panel-row"><span>段落</span><b>{{ doc?.blocks?.length ?? 0 }}</b></div>
        </div>

        <!-- 页面设置 -->
        <div v-if="!generating" class="dw-panel-sec">
          <div class="dw-panel-title">页面设置</div>
          <div class="dw-seg">
            <button
              v-for="(v, k) in PAGE_SIZES" :key="k"
              :class="{ on: String(doc?.page?.size ?? 'a4') === k }"
              @click="pagePatch({ size: k })"
            >{{ String(k).toUpperCase() }}</button>
          </div>
          <label class="dw-prop-row">
            上下边距 mm
            <input type="number" min="10" max="60" step="0.1" :value="doc?.page?.mt ?? 25.4"
              @change="pagePatch({ mt: Number(($event.target as HTMLInputElement).value), mb: Number(($event.target as HTMLInputElement).value) })" />
          </label>
          <label class="dw-prop-row">
            左右边距 mm
            <input type="number" min="10" max="60" step="0.1" :value="doc?.page?.ml ?? 31.7"
              @change="pagePatch({ ml: Number(($event.target as HTMLInputElement).value), mr: Number(($event.target as HTMLInputElement).value) })" />
          </label>
          <label class="dw-prop-row">
            页脚
            <input type="text" placeholder="第 {page} 页" :value="doc?.page?.footer ?? ''"
              @change="pagePatch({ footer: ($event.target as HTMLInputElement).value })" />
          </label>
          <span class="dw-note">页边距与纸张同步进导出的 .docx。</span>
        </div>

        <!-- 主题换肤 -->
        <div class="dw-panel-sec">
          <div class="dw-panel-title">主题换肤</div>
          <div class="dw-skin">
            <button
              v-for="t in DOC_THEMES"
              :key="t.id"
              class="dw-skin-sw"
              :class="{ on: specTheme === t.id, busy: skinning === t.id }"
              :title="`${t.name}（内容不变，预览与导出同步换样）`"
              :disabled="!!skinning || generating"
              :style="{ background: t.soft }"
              @click="applyTheme(t.id)"
            >
              <span class="dw-skin-acc" :style="{ background: t.accent }"></span>
            </button>
            <Loader v-if="skinning" :size="12" class="spin" />
          </div>
          <span class="dw-note">{{ DOC_THEMES.find(t => t.id === specTheme)?.name }} · 内容不变，字体版式同步换。</span>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.dw { flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; overflow: hidden; position: relative; }
.dw-tools { display: flex; align-items: center; gap: 8px; padding: 7px 12px; border-bottom: 1px solid var(--border-soft); background: var(--panel); flex-shrink: 0; }
.dw-tool { display: inline-flex; align-items: center; gap: 5px; padding: 5px 11px; border: 1px solid var(--border); border-radius: 7px; background: var(--bg); color: var(--text-2); font-size: 12px; font-weight: 600; cursor: pointer; }
.dw-tool:hover { border-color: var(--primary); color: var(--primary); }
.dw-tool.on { border-color: var(--primary); background: var(--primary-soft); color: var(--primary-deep); }
.dw-zoom { margin-left: auto; display: flex; align-items: center; gap: 2px; }
.dw-zoom button { width: 24px; height: 24px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-2); font-size: 14px; line-height: 1; cursor: pointer; }
.dw-zoom button:hover { border-color: var(--primary); color: var(--primary); }
.dw-zoom span { min-width: 44px; text-align: center; font-size: 11.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
.dw-tools-sep { width: 1px; height: 18px; background: var(--border-soft); margin: 0 4px; }
.dw-menu-wrap { position: relative; display: inline-flex; }
.dw-menu { position: absolute; left: 0; top: calc(100% + 5px); z-index: 20; display: flex; flex-direction: column; gap: 2px; padding: 4px; min-width: 104px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); box-shadow: 0 8px 26px rgba(0,0,0,.16); }
.dw-menu button { padding: 6px 10px; border: none; border-radius: 5px; background: transparent; color: var(--text-2); font-size: 12px; text-align: left; cursor: pointer; }
.dw-menu button:hover { background: var(--primary-soft); color: var(--primary-deep); }
.dw-tbl-pick { position: absolute; left: 0; top: calc(100% + 5px); z-index: 20; padding: 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); box-shadow: 0 8px 26px rgba(0,0,0,.16); }
.dw-tbl-lab { font-size: 11px; color: var(--muted); margin-bottom: 6px; white-space: nowrap; }
.dw-tbl-lab b { color: var(--primary-deep); }
.dw-tbl-grid { display: grid; grid-template-columns: repeat(7, 16px); gap: 3px; }
.dw-tbl-grid button { width: 16px; height: 16px; padding: 0; border: 1px solid var(--border); border-radius: 3px; background: var(--bg); cursor: pointer; }
.dw-tbl-grid button.lit { background: var(--primary); border-color: var(--primary); }

.dw-body { flex: 1; min-height: 0; display: flex; }
.dw-stage { flex: 1; min-width: 0; display: flex; flex-direction: column; position: relative; }
.dw-fmt { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: 40; display: flex; align-items: center; gap: 4px; padding: 5px 8px; border-radius: 10px; background: var(--panel); border: 1px solid var(--border); box-shadow: 0 8px 28px rgba(0,0,0,.22); }
.dw-fmt-sel { padding: 4px 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); font-size: 12px; cursor: pointer; min-width: 88px; }
.dw-fmt-ic { min-width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-2); font-size: 12.5px; cursor: pointer; }
.dw-fmt-ic:hover { border-color: var(--primary); color: var(--primary); }
.dw-fmt-ic.on { border-color: var(--primary); background: var(--primary-soft); color: var(--primary-deep); }
.dw-fmt-sep { width: 1px; height: 18px; background: var(--border-soft); margin: 0 2px; }
.dw-viewer { flex: 1; min-height: 0; }

.dw-panel { width: 208px; flex-shrink: 0; overflow-y: auto; border-left: 1px solid var(--border-soft); background: var(--bg-soft); padding: 12px; display: flex; flex-direction: column; gap: 16px; }
.dw-panel-sec { display: flex; flex-direction: column; gap: 7px; }
.dw-panel-title { font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--dim); }
.dw-panel-row { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--muted); }
.dw-panel-row b { color: var(--text); font-weight: 600; }
.dw-prop-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 11.5px; color: var(--muted); }
.dw-prop-row input { width: 100%; max-width: 86px; padding: 4px 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); font-size: 11.5px; }
.dw-prop-row select { max-width: 104px; padding: 4px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); font-size: 11.5px; }
.dw-hex { padding: 4px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); font-size: 11.5px; font-family: var(--mono); }
.dw-prop-row input:focus, .dw-hex:focus { outline: none; border-color: var(--primary); }

.dw-seg { display: flex; gap: 4px; }
.dw-seg button { flex: 1; padding: 6px 4px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-2); font-size: 11.5px; cursor: pointer; }
.dw-seg button.on { border-color: var(--primary); background: var(--primary-soft); color: var(--primary-deep); font-weight: 600; }
.dw-seg button:disabled { opacity: .4; cursor: default; }
.dw-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.dw-grid button { padding: 7px 4px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-2); font-size: 11px; cursor: pointer; }
.dw-grid button:hover { border-color: var(--primary); color: var(--primary); }
.dw-check { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--muted); cursor: pointer; user-select: none; }
.dw-check input { accent-color: var(--primary); }
.dw-note { font-size: 10.5px; color: var(--muted); line-height: 1.5; }

.dw-skin { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.dw-skin-sw { position: relative; width: 24px; height: 24px; border-radius: 6px; border: 1.5px solid var(--border); cursor: pointer; overflow: hidden; padding: 0; }
.dw-skin-sw:hover:not(:disabled) { border-color: var(--primary); }
.dw-skin-sw.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }
.dw-skin-sw.busy { animation: dw-spin 1s linear infinite; }
.dw-skin-sw:disabled { cursor: default; opacity: .7; }
.dw-skin-acc { position: absolute; left: 0; right: 0; bottom: 0; height: 34%; display: block; }

.dw-ghost { display: inline-flex; align-items: center; gap: 4px; padding: 6px 9px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--text-2); font-size: 11.5px; cursor: pointer; }
.dw-ghost:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
.dw-error { margin: 8px 12px 0; padding: 8px 11px; border-radius: 8px; background: var(--vermilion-soft); color: var(--vermilion); font-size: 12px; flex-shrink: 0; }
.spin { animation: dw-spin .9s linear infinite; }
@keyframes dw-spin { to { transform: rotate(360deg); } }
</style>

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
  ChevronLeft, ChevronRight, Loader, PencilLine, Check, Play, Copy, Trash2,
  ArrowUp, ArrowDown, Plus, Undo2, StickyNote, X,
} from "@lucide/vue";
import {
  specSlidesRender, setSpecText, getSpecText, NEW_SLIDE_LAYOUTS,
  type SlideSpec, type SlideOp,
} from "../lib/slidesSpec";

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

// ───────── 放映 ─────────
// 全屏只放当前页那一张 .sl —— 复用同一份页面 HTML(cqw 字号自动等比撑满),
// 不需要另做一套放映渲染。翻页/退出走同一个 onKey,所以放映态天然继承所有快捷键。
const presenting = ref(false);
const showEl = ref<HTMLElement | null>(null);
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

// ───────── 演讲者备注 ─────────
// spec 每页本就有 notes(口播稿),此前只进导出、界面上看不见也改不了。
const notesOpen = ref(false);
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

// ───────── 点字直改 ─────────
// 只改文字,不动版式 —— autofit 仍然生效,所以用户**改不坏排版**(这正是"版式态"的红利:
// 豆包没有重排引擎、改字就溢出,我们改完自动重算字号)。
// 舞台里带 data-e="<字段路径>" 的元素点一下变 contenteditable,失焦/Enter 落盘。
const editing = ref(false); // 编辑模式开关(工具条按钮)
const dirty = ref(false); // 有未落盘的改动(纯提示)
const stageEl = ref<HTMLElement | null>(null);

function onStageClick(e: MouseEvent) {
  if (!editing.value) {
    go(page.value + 1, true); // 非编辑态:点击翻页(原行为)
    return;
  }
  const el = (e.target as HTMLElement)?.closest?.("[data-e]") as HTMLElement | null;
  if (!el || el.isContentEditable) return;
  e.stopPropagation();
  beginEdit(el);
}

function beginEdit(el: HTMLElement) {
  el.contentEditable = "true";
  el.spellcheck = false;
  el.focus();
  // 光标落到点击处即可(不全选),改错别字更顺手
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

// 退出编辑模式前先把正在编辑的那处收尾(否则改了字却没落盘)
function toggleEdit() {
  if (editing.value) {
    (stageEl.value?.querySelector("[contenteditable='true']") as HTMLElement | null)?.blur();
  }
  editing.value = !editing.value;
}
// 生成中不许编辑(spec 每 3s 被重写,改了也会被覆盖)
watch(
  () => props.generating,
  (g) => {
    if (g) editing.value = false;
  }
);

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
      <!-- 加页:选版式后插在当前页之后,占位内容直接点字改 -->
      <div v-if="canOp" class="dkv-add">
        <button class="dkv-add-btn" @click.stop="addOpen = !addOpen"><Plus :size="12" /> 加一页</button>
        <div v-if="addOpen" class="dkv-add-menu">
          <button v-for="l in NEW_SLIDE_LAYOUTS" :key="l.id" @click="addSlide(l.id)">{{ l.name }}</button>
        </div>
      </div>
    </aside>
    <main class="dkv-main">
      <div
        ref="stageEl"
        class="dkv-stage"
        :class="{ editing }"
        :title="editing ? '点任意文字即可修改 · Enter 保存 · Esc 撤销' : '点击翻下一页 · ←→ 翻页'"
        @click="onStageClick"
      >
        <div class="dkv-fit stage" v-html="pages[page] ?? ''"></div>
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
        <button class="dkv-btn" :disabled="!pages.length" title="全屏放映（F5 · Esc 退出）" @click.stop="present">
          <Play :size="12" /> 放映
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
          class="dkv-btn edit"
          :class="{ on: editing }"
          :title="editing ? '完成编辑' : '改字：点任意文字直接改，排版自动重算'"
          @click.stop="toggleEdit"
        >
          <component :is="editing ? Check : PencilLine" :size="13" />
          {{ editing ? "完成" : "改字" }}
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
      @keydown="onKey"
      @click="go(page + 1, true)"
    >
      <div class="dkv-fit dkv-show-fit" v-html="pages[page] ?? ''"></div>
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
.dkv-add-menu { position: absolute; left: 0; right: 0; bottom: calc(100% + 4px); z-index: 5; display: grid; grid-template-columns: 1fr 1fr; gap: 2px; padding: 4px; border-radius: 7px; background: #33333a; border: 1px solid rgba(255, 255, 255, 0.14); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5); }
.dkv-add-menu button { padding: 6px 4px; border: none; border-radius: 5px; background: transparent; color: #d8d8de; font-size: 11px; cursor: pointer; }
.dkv-add-menu button:hover { background: var(--primary, #7fa8d4); color: #fff; }
.dkv-n { position: absolute; left: 5px; top: 5px; z-index: 2; font-size: 10px; line-height: 1; padding: 3px 6px; border-radius: 4px; background: rgba(0, 0, 0, 0.55); color: #fff; font-weight: 600; }
.dkv-pending { aspect-ratio: 16/9; border-radius: 6px; border: 1.5px dashed rgba(255, 255, 255, 0.32); display: flex; align-items: center; justify-content: center; color: rgba(255, 255, 255, 0.6); font-size: 11px; animation: dkv-pulse 1.25s ease-in-out infinite; flex-shrink: 0; }
@keyframes dkv-pulse { 50% { opacity: 0.4; } }
.dkv-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
/* container-type:size → 100cqh 可用容器高算出 16:9 下的最大宽,宽高双约束下不溢出 */
.dkv-stage { flex: 1; min-height: 0; cursor: pointer; container-type: size; display: grid; place-items: center; padding: 16px; }
.dkv-stage .dkv-fit { width: min(100%, calc((100cqh - 32px) * 1.77778)); }
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

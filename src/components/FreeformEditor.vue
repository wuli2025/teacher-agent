<script setup lang="ts">
// 自由版式编辑覆盖层:铺在 DeckViewer 舞台的 .sl 之上,每个 freeform 盒子一块可点区域。
// 坐标体系与渲染器同源 —— 全部用「画布 1280×720 的百分比」定位,所以与 v-html 渲染的
// 真实盒子像素对齐,舞台缩放到任何尺寸都不漂。
//
// 选择模型:selSet 多选(空白处框选 / Shift+点选加减),最后选中的是「主选」(属性面板对象)。
// 拖拽/缩放期间**只改本地样式**(覆盖层 + 直接操作 v-html 里的真实元素),松手才 emit
// 一次批量操作 —— 撤销粒度是「一次拖动」,pptx 也只重转一次(每帧写盘会把撤销栈灌爆)。
// 移动时带轻量吸附:页边缘/页中线/相邻元素边缘 三种对齐线(规划 M2-B 的约定,不做完整标尺)。
import { computed, ref, watch } from "vue";
import { Copy, Trash2, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown } from "@lucide/vue";
import type { FreeBox } from "../lib/slidesSpec";

const props = defineProps<{
  boxes: FreeBox[];
  /** v-html 渲染区的根元素(找 [data-bi] 直接操作真实 DOM 做实时反馈)。 */
  stageHost: HTMLElement | null;
}>();
const emit = defineEmits<{
  /** 单盒字段修改(缩放手柄用)。 */
  (e: "patch", box: number, patch: Partial<FreeBox>): void;
  /** 批量平移(单选也走这条:一次拖动 = 一步撤销)。 */
  (e: "move", boxes: number[], dx: number, dy: number): void;
  /** 批量删除。 */
  (e: "del", boxes: number[]): void;
  (e: "dup", box: number): void;
  (e: "z", box: number, dir: "up" | "down" | "top" | "bottom"): void;
  /** 双击文本盒 → 请求父组件的点字直改(传真实 DOM 里的可编辑元素)。 */
  (e: "text-edit", el: HTMLElement): void;
}>();

const selSet = ref<number[]>([]);
/** 主选(最后一个):属性面板/浮条的对象。 */
const sel = computed<number | null>(() => (selSet.value.length ? selSet.value[selSet.value.length - 1] : null));
defineExpose({
  sel,
  select: (i: number | null) => (selSet.value = i === null ? [] : [i]),
});
watch(
  () => props.boxes,
  (b) => {
    selSet.value = selSet.value.filter((i) => i < b.length);
  }
);

const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** 盒子的画布 px 包围盒(SVG 线/多边形/圆按端点或点集算)。 */
function bounds(b: FreeBox): { x: number; y: number; w: number; h: number } {
  const t = String(b.type ?? "");
  if (t === "line" || t === "arrow" || t === "axis") {
    const x1 = num(b.x, 0), y1 = num(b.y, 0);
    const x2 = num(b.x2, x1 + num(b.w, 100)), y2 = num(b.y2, y1);
    const x = Math.min(x1, x2), y = Math.min(y1, y2);
    return { x, y, w: Math.max(12, Math.abs(x2 - x1)), h: Math.max(12, Math.abs(y2 - y1)) };
  }
  if (t === "polyline" || t === "curve" || t === "polygon") {
    const pts = ptsOf(b);
    if (pts.length >= 2) {
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const x = Math.min(...xs), y = Math.min(...ys);
      return { x, y, w: Math.max(12, Math.max(...xs) - x), h: Math.max(12, Math.max(...ys) - y) };
    }
  }
  if ((t === "ellipse" || t === "circle") && num(b.r, 0) > 0) {
    const r = num(b.r, 0);
    return { x: num(b.x, 0) - r, y: num(b.y, 0) - r, w: 2 * r, h: 2 * r };
  }
  if (t === "point" || t === "dot") {
    const r = Math.max(6, num(b.r, 6));
    return { x: num(b.x, 0) - r, y: num(b.y, 0) - r, w: 2 * r, h: 2 * r };
  }
  return { x: num(b.x, 0), y: num(b.y, 0), w: Math.max(1, num(b.w, 100)), h: Math.max(1, num(b.h, 100)) };
}
function ptsOf(b: FreeBox): [number, number][] {
  const out: [number, number][] = [];
  if (Array.isArray(b.points))
    for (const p of b.points as any[]) {
      if (Array.isArray(p) && p.length >= 2) out.push([Number(p[0]) || 0, Number(p[1]) || 0]);
      else if (p && typeof p === "object" && "x" in p) out.push([Number(p.x) || 0, Number(p.y) || 0]);
    }
  return out;
}
/** div 类盒子(文本/矩形/卡片/蒙版/图片/表格/图表)才能拉手柄;SVG 类只支持整体平移。 */
function resizable(b: FreeBox): boolean {
  return !["line", "arrow", "axis", "polyline", "curve", "polygon", "point", "dot"].includes(String(b.type ?? ""));
}

const pc = (n: number, base: number) => `${((n * 100) / base).toFixed(4)}%`;
function boxStyle(b: FreeBox) {
  const r = bounds(b);
  return { left: pc(r.x, 1280), top: pc(r.y, 720), width: pc(r.w, 1280), height: pc(r.h, 720) };
}

// ───────── 拖拽 / 缩放 / 吸附 ─────────
type Drag = {
  kind: "move" | "resize";
  idx: number; // 主动被拖的盒子(吸附以它的包围盒为准)
  set: number[]; // 一起动的盒子(多选整组走)
  handle?: string;
  startX: number;
  startY: number;
  orig: { x: number; y: number; w: number; h: number };
  dx: number;
  dy: number;
  nw?: { x: number; y: number; w: number; h: number };
  moved: boolean;
};
const drag = ref<Drag | null>(null);
const rootEl = ref<HTMLElement | null>(null);
/** 吸附对齐线(画布坐标;null=无)。 */
const guideV = ref<number | null>(null);
const guideH = ref<number | null>(null);
const SNAP = 6;

function toCanvas(dxPx: number, dyPx: number): [number, number] {
  const r = rootEl.value?.getBoundingClientRect();
  if (!r || !r.width) return [0, 0];
  return [(dxPx * 1280) / r.width, (dyPx * 720) / r.height];
}
function realEl(i: number): HTMLElement | null {
  return (props.stageHost?.querySelector(`[data-bi="${i}"]`) as HTMLElement | null) ?? null;
}

/** 吸附候选:页边缘/页中线 + 其他盒子(不在拖动组里)的边缘。 */
function snapCandidates(exclude: number[]): { xs: number[]; ys: number[] } {
  const xs = [0, 640, 1280];
  const ys = [0, 360, 720];
  props.boxes.forEach((b, i) => {
    if (exclude.includes(i)) return;
    const r = bounds(b);
    xs.push(r.x, r.x + r.w);
    ys.push(r.y, r.y + r.h);
  });
  return { xs, ys };
}
/** 对 dx/dy 做吸附修正,顺带记录对齐线位置。 */
function applySnap(d: Drag, dx: number, dy: number): [number, number] {
  const { xs, ys } = snapCandidates(d.set);
  const L = d.orig.x + dx, R = L + d.orig.w, CX = L + d.orig.w / 2;
  const T = d.orig.y + dy, B = T + d.orig.h, CY = T + d.orig.h / 2;
  let bestX: { cand: number; off: number } | null = null;
  for (const cand of xs)
    for (const edge of [L, CX, R]) {
      const off = cand - edge;
      if (Math.abs(off) <= SNAP && (!bestX || Math.abs(off) < Math.abs(bestX.off))) bestX = { cand, off };
    }
  let bestY: { cand: number; off: number } | null = null;
  for (const cand of ys)
    for (const edge of [T, CY, B]) {
      const off = cand - edge;
      if (Math.abs(off) <= SNAP && (!bestY || Math.abs(off) < Math.abs(bestY.off))) bestY = { cand, off };
    }
  guideV.value = bestX ? bestX.cand : null;
  guideH.value = bestY ? bestY.cand : null;
  return [dx + (bestX?.off ?? 0), dy + (bestY?.off ?? 0)];
}

function onBoxDown(i: number, e: MouseEvent) {
  e.preventDefault(); // 防选中文字;副作用是焦点不再自动落过来 → 手动 focus,键盘操作才收得到
  e.stopPropagation();
  rootEl.value?.focus();
  if (e.shiftKey) {
    // Shift+点选:加/减选,不拖
    const at = selSet.value.indexOf(i);
    if (at >= 0) selSet.value.splice(at, 1);
    else selSet.value.push(i);
    return;
  }
  if (!selSet.value.includes(i)) selSet.value = [i]; // 点未选中的 → 单选它;点已选的 → 整组拖
  startDrag("move", i, undefined, e);
}
function onHandleDown(i: number, handle: string, e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  startDrag("resize", i, handle, e);
}
function startDrag(kind: Drag["kind"], idx: number, handle: string | undefined, e: MouseEvent) {
  const b = props.boxes[idx];
  if (!b) return;
  drag.value = {
    kind, idx, handle,
    set: kind === "move" ? [...selSet.value] : [idx],
    startX: e.clientX, startY: e.clientY,
    orig: bounds(b), dx: 0, dy: 0, moved: false,
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp, { once: true });
}
function onMove(e: MouseEvent) {
  const d = drag.value;
  if (!d) return;
  let [dx, dy] = toCanvas(e.clientX - d.startX, e.clientY - d.startY);
  d.moved ||= Math.abs(dx) > 1 || Math.abs(dy) > 1;
  if (d.kind === "move") {
    [dx, dy] = applySnap(d, dx, dy);
    d.dx = dx;
    d.dy = dy;
    // 实时反馈:transform 只动视觉,不碰布局;选中组的真实元素一起走
    const t = `translate(${((dx * 100) / 1280).toFixed(3)}cqw, ${((dy * 100) / 720).toFixed(3)}cqh)`;
    for (const i of d.set) {
      const el = realEl(i);
      if (el) el.style.transform = t;
    }
  } else {
    const o = d.orig;
    let { x, y, w, h } = o;
    const hd = d.handle ?? "se";
    if (hd.includes("e")) w = o.w + dx;
    if (hd.includes("s")) h = o.h + dy;
    if (hd.includes("w")) { x = o.x + dx; w = o.w - dx; }
    if (hd.includes("n")) { y = o.y + dy; h = o.h - dy; }
    if (w < 8) { if (hd.includes("w")) x -= 8 - w; w = 8; }
    if (h < 8) { if (hd.includes("n")) y -= 8 - h; h = 8; }
    d.nw = { x, y, w, h };
    const el = realEl(d.idx);
    if (el) {
      el.style.left = pc(x, 1280);
      el.style.top = pc(y, 720);
      el.style.width = pc(w, 1280);
      el.style.height = pc(h, 720);
    }
  }
  drag.value = { ...d };
}
function onUp() {
  window.removeEventListener("mousemove", onMove);
  const d = drag.value;
  drag.value = null;
  guideV.value = null;
  guideH.value = null;
  if (!d) return;
  for (const i of d.set) {
    const el = realEl(i);
    if (el) el.style.transform = "";
  }
  if (!d.moved) return; // 纯点击:只选中,不发空操作
  if (d.kind === "move") {
    if (d.dx || d.dy) emit("move", d.set, Math.round(d.dx), Math.round(d.dy));
  } else if (d.nw) {
    const b = props.boxes[d.idx];
    if (!b) return;
    const r = (n: number) => Math.round(n);
    if ((String(b.type) === "ellipse" || String(b.type) === "circle") && num(b.r, 0) > 0) {
      // 圆按 r 存储:取新包围盒的半宽,圆心随包围盒中心走
      const nr = r(Math.min(d.nw.w, d.nw.h) / 2);
      emit("patch", d.idx, { x: r(d.nw.x + d.nw.w / 2), y: r(d.nw.y + d.nw.h / 2), r: nr });
    } else {
      emit("patch", d.idx, { x: r(d.nw.x), y: r(d.nw.y), w: r(d.nw.w), h: r(d.nw.h) });
    }
  }
}

/** 拖拽中的覆盖框样式(跟手;非拖拽时按 spec)。 */
function liveStyle(i: number) {
  const d = drag.value;
  const base = boxStyle(props.boxes[i]);
  if (!d) return base;
  if (d.kind === "move" && d.set.includes(i))
    return { ...base, transform: `translate(${((d.dx * 100) / 1280).toFixed(3)}cqw, ${((d.dy * 100) / 720).toFixed(3)}cqh)` };
  if (d.kind === "resize" && d.idx === i && d.nw)
    return { left: pc(d.nw.x, 1280), top: pc(d.nw.y, 720), width: pc(d.nw.w, 1280), height: pc(d.nw.h, 720) };
  return base;
}

// ───────── 框选(空白处拖出矩形,相交即选中) ─────────
const marquee = ref<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
function canvasPoint(e: MouseEvent): [number, number] {
  const r = rootEl.value?.getBoundingClientRect();
  if (!r || !r.width) return [0, 0];
  return [((e.clientX - r.left) * 1280) / r.width, ((e.clientY - r.top) * 720) / r.height];
}
function onRootDown(e: MouseEvent) {
  if (e.target !== rootEl.value) return;
  e.preventDefault();
  rootEl.value?.focus();
  const [x, y] = canvasPoint(e);
  marquee.value = { x0: x, y0: y, x1: x, y1: y };
  const move = (ev: MouseEvent) => {
    const [mx, my] = canvasPoint(ev);
    if (marquee.value) marquee.value = { ...marquee.value, x1: mx, y1: my };
  };
  const up = () => {
    window.removeEventListener("mousemove", move);
    const m = marquee.value;
    marquee.value = null;
    if (!m) return;
    const L = Math.min(m.x0, m.x1), R = Math.max(m.x0, m.x1);
    const T = Math.min(m.y0, m.y1), B = Math.max(m.y0, m.y1);
    if (R - L < 4 && B - T < 4) {
      selSet.value = []; // 原地一点:清空选择
      return;
    }
    selSet.value = props.boxes
      .map((b, i) => ({ i, r: bounds(b) }))
      .filter(({ r }) => r.x < R && L < r.x + r.w && r.y < B && T < r.y + r.h)
      .map(({ i }) => i);
  };
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up, { once: true });
}
const marqueeStyle = computed(() => {
  const m = marquee.value;
  if (!m) return null;
  const L = Math.min(m.x0, m.x1), T = Math.min(m.y0, m.y1);
  return { left: pc(L, 1280), top: pc(T, 720), width: pc(Math.abs(m.x1 - m.x0), 1280), height: pc(Math.abs(m.y1 - m.y0), 720) };
});

// ───────── 键盘 ─────────
function onKey(e: KeyboardEvent) {
  if (!selSet.value.length) return;
  const step = e.shiftKey ? 10 : 1;
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
    e.preventDefault();
    e.stopPropagation();
    const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
    emit("move", [...selSet.value], dx, dy);
  } else if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    e.stopPropagation();
    emit("del", [...selSet.value]);
    selSet.value = [];
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
    e.preventDefault();
    e.stopPropagation();
    if (sel.value !== null) emit("dup", sel.value);
  } else if (e.key === "Escape") {
    e.stopPropagation();
    selSet.value = [];
  }
}

function onDblClick(i: number, e: MouseEvent) {
  e.stopPropagation();
  // 按坐标穿透覆盖层找 [data-e]:表格要双击到哪格改哪格,多行文本要双击到哪行改哪行
  const hit = document
    .elementsFromPoint(e.clientX, e.clientY)
    .find((el) => el instanceof HTMLElement && el.matches("[data-e]")) as HTMLElement | undefined;
  if (hit) {
    emit("text-edit", hit);
    return;
  }
  const host = realEl(i);
  const editable = (host?.matches?.("[data-e]") ? host : host?.querySelector("[data-e]")) as HTMLElement | null;
  if (editable) emit("text-edit", editable);
}

const selBounds = computed(() => (sel.value !== null && props.boxes[sel.value] ? bounds(props.boxes[sel.value]) : null));
</script>

<template>
  <!-- click.stop:覆盖层铺满 .sl,不拦的话点击会冒泡到舞台触发翻页 -->
  <div ref="rootEl" class="ffe" tabindex="0" @keydown="onKey" @click.stop @mousedown="onRootDown">
    <div
      v-for="(b, i) in boxes"
      :key="i"
      class="ffe-box"
      :class="{ on: selSet.includes(i), primary: sel === i }"
      :style="liveStyle(i)"
      @mousedown="onBoxDown(i, $event)"
      @dblclick="onDblClick(i, $event)"
    >
      <template v-if="sel === i && selSet.length === 1 && resizable(b) && !drag">
        <span v-for="h in ['nw','n','ne','e','se','s','sw','w']" :key="h" class="ffe-h" :class="h" @mousedown="onHandleDown(i, h, $event)" />
      </template>
    </div>
    <!-- 吸附对齐线(页边缘/中线/邻盒边缘命中时亮) -->
    <div v-if="guideV !== null" class="ffe-guide v" :style="{ left: pc(guideV, 1280) }" />
    <div v-if="guideH !== null" class="ffe-guide h" :style="{ top: pc(guideH, 720) }" />
    <!-- 框选矩形 -->
    <div v-if="marqueeStyle" class="ffe-marquee" :style="marqueeStyle" />
    <!-- 选中浮条:层级/复制/删除(贴着主选框上缘) -->
    <div
      v-if="sel !== null && selBounds && !drag && !marquee"
      class="ffe-bar"
      :style="{ left: pc(selBounds.x, 1280), top: `calc(${pc(selBounds.y, 720)} - 34px)` }"
      @mousedown.stop
    >
      <template v-if="selSet.length === 1">
        <button title="上移一层" @click="emit('z', sel!, 'up')"><ArrowUp :size="12" /></button>
        <button title="下移一层" @click="emit('z', sel!, 'down')"><ArrowDown :size="12" /></button>
        <button title="置顶" @click="emit('z', sel!, 'top')"><ChevronsUp :size="12" /></button>
        <button title="置底" @click="emit('z', sel!, 'bottom')"><ChevronsDown :size="12" /></button>
        <button title="复制 (Ctrl+D)" @click="emit('dup', sel!)"><Copy :size="12" /></button>
      </template>
      <span v-else class="ffe-bar-n">{{ selSet.length }} 个元素</span>
      <button class="del" title="删除 (Del)" @click="emit('del', [...selSet]); selSet = []"><Trash2 :size="12" /></button>
    </div>
  </div>
</template>

<style scoped>
/* 覆盖层与 .sl 同几何:绝对铺满父容器(父容器 = .dkv-fit,与 .sl 同宽同高)。
   container-type 使 cqw/cqh 在拖拽 transform 里可用(与渲染器同尺度)。 */
.ffe { position: absolute; inset: 0; z-index: 5; outline: none; container-type: size; }
.ffe-box { position: absolute; cursor: move; border: 1px solid transparent; border-radius: 2px; }
.ffe-box:hover { border-color: rgba(127, 168, 212, 0.6); }
.ffe-box.on { border-color: var(--primary, #7fa8d4); }
.ffe-box.primary { box-shadow: 0 0 0 1px rgba(127, 168, 212, 0.35); }
.ffe-h { position: absolute; width: 9px; height: 9px; background: #fff; border: 1.5px solid var(--primary, #7fa8d4); border-radius: 2px; z-index: 2; }
.ffe-h.nw { left: -5px; top: -5px; cursor: nwse-resize; }
.ffe-h.n  { left: calc(50% - 4px); top: -5px; cursor: ns-resize; }
.ffe-h.ne { right: -5px; top: -5px; cursor: nesw-resize; }
.ffe-h.e  { right: -5px; top: calc(50% - 4px); cursor: ew-resize; }
.ffe-h.se { right: -5px; bottom: -5px; cursor: nwse-resize; }
.ffe-h.s  { left: calc(50% - 4px); bottom: -5px; cursor: ns-resize; }
.ffe-h.sw { left: -5px; bottom: -5px; cursor: nesw-resize; }
.ffe-h.w  { left: -5px; top: calc(50% - 4px); cursor: ew-resize; }
.ffe-guide { position: absolute; z-index: 4; pointer-events: none; background: #e0564a; }
.ffe-guide.v { top: 0; bottom: 0; width: 1px; }
.ffe-guide.h { left: 0; right: 0; height: 1px; }
.ffe-marquee { position: absolute; z-index: 4; pointer-events: none; border: 1px dashed var(--primary, #7fa8d4); background: rgba(127, 168, 212, 0.12); }
.ffe-bar { position: absolute; display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: 7px; background: rgba(20, 20, 24, 0.88); z-index: 6; }
.ffe-bar button { display: inline-flex; padding: 4px; border: none; border-radius: 4px; background: transparent; color: #d8d8de; cursor: pointer; }
.ffe-bar button:hover { background: rgba(255, 255, 255, 0.18); color: #fff; }
.ffe-bar button.del:hover { background: #b3402e; }
.ffe-bar-n { font-size: 10.5px; color: #d8d8de; padding: 0 6px; white-space: nowrap; }
</style>

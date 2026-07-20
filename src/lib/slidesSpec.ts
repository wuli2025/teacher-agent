/**
 * polaris.slides.json(传统PPT spec)→ 预览 HTML 的确定性渲染器。
 *
 * 与 Rust 端 forge_pptx_native.rs 同源同构:6 色板 / 11 版式一一对应,
 * 预览即导出(结构同源,不会预览一个样导出一个样)。纯函数,无副作用,
 * 产出完整 HTML 文档字符串喂 iframe srcdoc(sandbox=allow-scripts 下无脚本也可渲染)。
 *
 * 配图(image-full / image-text):srcdoc 是不透明源,**加载不了 file:// 本地路径**,
 * 故 `image` 字段必须由调用方预先换成 data URL(见 DeckStudio.resolveSpecImages);
 * 换不到就渲染成占位框——宁可显式标「配图待载入」,也不要预览悄悄少一张图让人以为导出也没有。
 * 图用 `object-fit:cover`,与 Rust 端的 `a:srcRect` cover 裁切同语义(同构的关键一环)。
 */

export interface SlideSpec {
  version?: number;
  theme?: string;
  slides: SlidePage[];
}
export interface SlidePage {
  layout?: string;
  title?: string;
  subtitle?: string;
  kicker?: string;
  points?: (string | { text?: string; sub?: string[] })[];
  left?: SpecCol;
  right?: SpecCol;
  items?: {
    head?: string;
    body?: string;
    points?: (string | { text?: string; sub?: string[] })[];
    value?: string;
    label?: string;
    desc?: string;
  }[];
  steps?: { head?: string; body?: string }[];
  text?: string;
  by?: string;
  notes?: string;
  /** image-full / image-text 专用。spec 里是本地绝对路径;预览前会被换成 data URL。 */
  image?: string;
  /** image-text:图在哪半边,"left"(默认) | "right"。 */
  side?: string;
  /** image-text 文字侧的小标题。 */
  head?: string;
  /** freeform 专用:自由摆放的盒子(1280×720 逻辑 px 绝对定位)。 */
  boxes?: FreeBox[];
  /** 页面切换动画(引擎写 <p:transition>,放映模式 CSS 同构)。 */
  transition?: SlideTransition;
}

export interface SlideTransition {
  /** fade | fade-black | push | cover | uncover | zoom */
  type: string;
  /** up | down | left | right(push/cover/uncover 用,语义=新页运动方向)。 */
  dir?: string;
  /** fast | med | slow(缺省 med)。 */
  speed?: string;
}

/** 页面切换效果清单(UI 九宫格与放映 CSS 共用)。 */
export const TRANSITIONS: { id: string; name: string; hasDir: boolean }[] = [
  { id: "", name: "无", hasDir: false },
  { id: "fade", name: "淡入", hasDir: false },
  { id: "fade-black", name: "全黑淡入", hasDir: false },
  { id: "push", name: "推入", hasDir: true },
  { id: "cover", name: "覆盖", hasDir: true },
  { id: "uncover", name: "揭开", hasDir: true },
  { id: "zoom", name: "缩放", hasDir: false },
];

/**
 * freeform 盒子。与 pptx_native.rs 的 freeform 分支逐字段对齐(9 类 / 17 个 type 取值)。
 * 注意 `size` **不走 autofit** —— 引擎给多少画多少(只 clamp 4–400),预览必须照做,
 * 否则「预览帮你缩了、导出溢出」比不预览还糟。
 */
export interface FreeBox {
  type?: string;
  x?: number; y?: number; w?: number; h?: number;
  /** line/arrow/axis 的终点(默认 x2=x+w, y2=y)。 */
  x2?: number; y2?: number;
  /** circle/point 的半径:给了就以 (x,y) 为圆心。point 默认 6。 */
  r?: number;
  /** polyline/curve/polygon 的点集,[[x,y],…] 或 [{x,y},…],需 ≥2 点。 */
  points?: unknown;
  closed?: boolean;
  arrow?: boolean;
  dash?: boolean;
  /** 描边/文字色(色板词或 #hex)。 */
  color?: string;
  /** 填充色(可选;不给则空心)。 */
  fill?: string;
  /** 线宽 1–40,默认 3。 */
  width?: number;
  /** text 盒:单行文本 或 lines 多行数组。 */
  text?: string;
  lines?: string[];
  size?: number;
  align?: string;
  anchor?: string;
  bold?: boolean;
  italic?: boolean;
  /** text 盒字体:"serif" 衬线,缺省黑体。只做二选,不开放全字体族。 */
  font?: string;
  /** 旋转角度 0–359(仅 div 类盒子:text/rect/card/scrim/image;SVG 线类不支持)。 */
  rot?: number;
  /** 整盒不透明度 0–100(图片盒不支持,两端一致跳过)。 */
  opacity?: number;
  /** scrim 的不透明度 0–100,默认 50。 */
  alpha?: number;
  /** image 盒:预览前会被换成 data URL(同固定版式的 image 字段)。 */
  image?: string;
  cover?: boolean;
  rounded?: boolean;
  /** table 盒:行×列文本(首行默认表头);widths 为各列相对宽度。 */
  rows?: string[][];
  header?: boolean;
  widths?: number[];
  /** chart 盒:bar|line|pie|donut + 类目 + 数据(单系列或多系列)。 */
  chartType?: string;
  labels?: string[];
  series?: number[] | number[][];
  names?: string[];
  title?: string;
  /** true=导出真 OOXML 图表(PowerPoint 里可改数据);缺省=形状组(处处同款,预览逐数字对齐)。 */
  native?: boolean;
  /** 第 N 次单击时淡入(0/缺省=随页显示)。预览渲染全部盒子(= 动画播完的终态)。 */
  click?: number;
  /** 富元素动画(引擎写真 p:timing,放映模式 CSS 同构播放)。 */
  anim?: BoxAnim;
}

export interface BoxAnim {
  /** 进入 appear|fade|fly-in|float-in|wipe|zoom · 强调 pulse|grow|transparency · 退出 fade-out|fly-out|zoom-out|disappear */
  effect: string;
  /** click(默认)|with(与上一效果同时)|after(上一效果之后)。 */
  trigger?: string;
  /** 毫秒,默认 500。 */
  dur?: number;
  delay?: number;
  /** up|down|left|right(fly-in/fly-out/wipe 用)。 */
  dir?: string;
}

/** 元素动画效果清单(面板 UI 与放映 CSS 共用)。 */
export const BOX_ANIMS: { id: string; name: string; cls: "entr" | "emph" | "exit"; hasDir?: boolean }[] = [
  { id: "appear", name: "出现", cls: "entr" },
  { id: "fade", name: "淡化", cls: "entr" },
  { id: "fly-in", name: "飞入", cls: "entr", hasDir: true },
  { id: "float-in", name: "浮入", cls: "entr" },
  { id: "wipe", name: "擦除", cls: "entr", hasDir: true },
  { id: "zoom", name: "缩放", cls: "entr" },
  { id: "pulse", name: "脉冲", cls: "emph" },
  { id: "grow", name: "放大", cls: "emph" },
  { id: "transparency", name: "透明", cls: "emph" },
  { id: "fade-out", name: "淡出", cls: "exit" },
  { id: "fly-out", name: "飞出", cls: "exit", hasDir: true },
  { id: "zoom-out", name: "缩小消失", cls: "exit" },
  { id: "disappear", name: "消失", cls: "exit" },
];
export interface SpecCol {
  head?: string;
  points?: (string | { text?: string; sub?: string[] })[];
}

interface Palette {
  bg1: string; bg2: string; ink: string; muted: string;
  accent: string; card: string; cardLine: string;
}

/** 与 forge_pptx_native.rs 的 PALETTES 保持同步(色值一致)。 */
const PALETTES: Record<string, Palette> = {
  "midnight-gold":{ bg1: "#0A0E1A", bg2: "#1C2236", ink: "#F4F1E8", muted: "#9AA1B3", accent: "#E2C078", card: "#151B2C", cardLine: "#2A3149" },
  "ink-gold":     { bg1: "#16181D", bg2: "#1F232B", ink: "#F2F0E9", muted: "#A8A49A", accent: "#D4B06A", card: "#20242C", cardLine: "#2E333D" },
  "deep-space":   { bg1: "#0B0F1A", bg2: "#131A2A", ink: "#E8ECF6", muted: "#93A0B8", accent: "#7AA2F7", card: "#16203A", cardLine: "#263250" },
  "warm-paper":   { bg1: "#FAF6EE", bg2: "#F3EDE0", ink: "#3A2F25", muted: "#8A7E6F", accent: "#B3672A", card: "#FFFFFF", cardLine: "#E5DCCB" },
  "forest":       { bg1: "#F4F7F2", bg2: "#E9F0E7", ink: "#1E2A22", muted: "#6B7A6F", accent: "#2F7A4F", card: "#FFFFFF", cardLine: "#D7E2D6" },
  "tech-blue":    { bg1: "#FFFFFF", bg2: "#EEF3FA", ink: "#16324F", muted: "#5D7187", accent: "#1F6FD6", card: "#FFFFFF", cardLine: "#D8E2EE" },
  "minimal-white":{ bg1: "#FFFFFF", bg2: "#F6F5F0", ink: "#1F1F1F", muted: "#6B6B6B", accent: "#A07520", card: "#FFFFFF", cardLine: "#E6E3D8" },
};

/** spec 可用的原生色板 id 列表(给提示词/选择器用)。 */
export const NATIVE_THEMES = Object.keys(PALETTES);

/** 原生色板的展示元数据(换肤 UI 用):中文名 + 取色,与 PALETTES 同步。 */
export const NATIVE_THEME_META: { id: string; name: string; bg: string; accent: string; ink: string }[] = [
  { id: "minimal-white", name: "极简白", bg: PALETTES["minimal-white"].bg1, accent: PALETTES["minimal-white"].accent, ink: PALETTES["minimal-white"].ink },
  { id: "warm-paper", name: "暖纸", bg: PALETTES["warm-paper"].bg1, accent: PALETTES["warm-paper"].accent, ink: PALETTES["warm-paper"].ink },
  { id: "forest", name: "森林", bg: PALETTES["forest"].bg1, accent: PALETTES["forest"].accent, ink: PALETTES["forest"].ink },
  { id: "tech-blue", name: "科技蓝", bg: PALETTES["tech-blue"].bg1, accent: PALETTES["tech-blue"].accent, ink: PALETTES["tech-blue"].ink },
  { id: "ink-gold", name: "墨金", bg: PALETTES["ink-gold"].bg1, accent: PALETTES["ink-gold"].accent, ink: PALETTES["ink-gold"].ink },
  { id: "deep-space", name: "深空", bg: PALETTES["deep-space"].bg1, accent: PALETTES["deep-space"].accent, ink: PALETTES["deep-space"].ink },
  { id: "midnight-gold", name: "夜金", bg: PALETTES["midnight-gold"].bg1, accent: PALETTES["midnight-gold"].accent, ink: PALETTES["midnight-gold"].ink },
];

/**
 * 宽容解析:模型边写边存时 spec 常是「半个 JSON」。严格 parse 失败就打捞 ——
 * 扫 slides 数组里**已经完整闭合**的页对象逐个 parse,坏一页跳一页。
 * 这是「生成中逐页点亮」的地基:文件每落一批页,预览就先亮一批,不必等全文合法。
 */
export function parseSpecLoose(text: string): { spec: SlideSpec | null; partial: boolean } {
  try {
    const s = JSON.parse(text);
    if (s && Array.isArray(s.slides)) return { spec: s, partial: false };
  } catch {
    /* fallthrough → 打捞 */
  }
  const themeM = /"theme"\s*:\s*"([^"]*)"/.exec(text);
  const head = text.search(/"slides"\s*:\s*\[/);
  if (head < 0) return { spec: null, partial: true };
  const arrStart = text.indexOf("[", head);
  const slides: SlidePage[] = [];
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
        try { slides.push(JSON.parse(text.slice(objStart, i + 1))); } catch { /* 坏页跳过 */ }
        objStart = -1;
      }
    } else if (ch === "]" && depth === 0) break;
  }
  if (!slides.length) return { spec: null, partial: true };
  return { spec: { theme: themeM?.[1], slides }, partial: true };
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * 可编辑标记:给承载文字的元素打 `data-e="<字段路径>"`,DeckViewer 据此把用户改的
 * 文字回写进 spec 的对应字段(见 setSpecText)。路径**相对单页**(slides[i] 之内),
 * 因为同一页 HTML 会同时被缩略图与舞台复用,页号由组件自己知道。
 * 只标**纯文字叶子**:标题/副标题/kicker/bullet/卡片头尾/数字/引文/freeform 文本盒。
 */
function de(path: string): string {
  return ` data-e="${path}"`;
}

/** 按 `a.0.b` 形式的路径取值(数组下标用数字段)。 */
function getPath(obj: any, path: string): any {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}

/**
 * 把用户编辑的文字写回单页 spec 的 `path` 字段。返回是否真的改动了。
 * 只写字符串叶子;路径不存在/类型不符就拒绝(宁可不改,也不要把 spec 写坏)。
 */
export function setSpecText(slide: any, path: string, value: string): boolean {
  const keys = path.split(".");
  const last = keys.pop();
  if (!last) return false;
  const host = keys.reduce((o, k) => (o == null ? o : o[k]), slide);
  if (host == null || typeof host !== "object") return false;
  const old = host[last];
  // points[] 里的裸字符串项 与 各种 string 字段:都只接受 string→string
  if (old !== undefined && typeof old !== "string") return false;
  if (String(old ?? "") === value) return false;
  host[last] = value;
  return true;
}

/** 该路径当前的文字(给编辑器做「没变就不写盘」判断)。 */
export function getSpecText(slide: any, path: string): string {
  const v = getPath(slide, path);
  return typeof v === "string" ? v : "";
}

// ───────── 页面级操作(增/删/复制/重排/备注)─────────
// 全部是**纯 spec 变换**:改的是 slides 数组本身,不碰任何版式数学 —— 增删页之后
// 每页仍各自 autofit,排版不会被改坏。播放器只负责发意图(SlideOp),写盘/重转由调用方做。

export type SlideOp =
  | { kind: "dup"; index: number }
  | { kind: "del"; index: number }
  | { kind: "move"; index: number; to: number }
  | { kind: "add"; index: number; layout: string }
  | { kind: "notes"; index: number; value: string }
  /** 解锁为自由版式:语义页展开成 freeform 盒子(不可逆,此后该页不再 autofit)。 */
  | { kind: "freeform"; index: number }
  /** 盒子级操作(仅 freeform 页):改字段 / 增 / 删 / 调层级。 */
  | { kind: "box-set"; index: number; box: number; patch: Partial<FreeBox> }
  | { kind: "box-add"; index: number; boxSpec: FreeBox }
  | { kind: "box-del"; index: number; box: number }
  | { kind: "box-z"; index: number; box: number; dir: "up" | "down" | "top" | "bottom" }
  /** 页面切换动画:value=null 清除;all=true 应用到全部页。 */
  | { kind: "transition"; index: number; value: SlideTransition | null; all?: boolean }
  /** 多选批量:一次拖动/一次删除 = 一步撤销(拆成 N 个单盒 op 会灌爆撤销栈+重转 N 次)。 */
  | { kind: "boxes-move"; index: number; boxes: number[]; dx: number; dy: number }
  | { kind: "boxes-del"; index: number; boxes: number[] };

/** 平移一个盒子(原地改):按类型把 dx/dy 写进正确的字段 —— 线挪端点、多边形挪点集。
 *  编辑器与批量 op 共用,保证「单选拖」与「多选拖」落盘语义完全一致。 */
export function moveFreeBox(b: FreeBox, dx: number, dy: number): void {
  const t = String(b.type ?? "");
  const n = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const r = Math.round;
  if (t === "line" || t === "arrow" || t === "axis") {
    const x1 = n(b.x, 0), y1 = n(b.y, 0);
    const x2 = n(b.x2, x1 + n(b.w, 100)), y2 = n(b.y2, y1);
    b.x = r(x1 + dx); b.y = r(y1 + dy); b.x2 = r(x2 + dx); b.y2 = r(y2 + dy);
    return;
  }
  if ((t === "polyline" || t === "curve" || t === "polygon") && Array.isArray(b.points)) {
    b.points = (b.points as any[]).map((p) =>
      Array.isArray(p) ? [r((Number(p[0]) || 0) + dx), r((Number(p[1]) || 0) + dy)]
      : p && typeof p === "object" ? { x: r((Number((p as any).x) || 0) + dx), y: r((Number((p as any).y) || 0) + dy) }
      : p
    ) as any;
    return;
  }
  b.x = r(n(b.x, 0) + dx);
  b.y = r(n(b.y, 0) + dy);
}

/** 「加页」可选的版式 + 各自的占位内容(照 SKILL.md 的字段表填,加完即可点字改)。 */
export const NEW_SLIDE_LAYOUTS: { id: string; name: string; make: () => SlidePage }[] = [
  { id: "bullets", name: "要点页", make: () => ({ layout: "bullets", title: "新页面", points: ["要点一", "要点二", "要点三"] }) },
  { id: "section", name: "章节页", make: () => ({ layout: "section", kicker: "SECTION", title: "章节标题" }) },
  { id: "two-col", name: "两栏", make: () => ({ layout: "two-col", title: "新页面", left: { head: "左栏", points: ["要点一", "要点二"] }, right: { head: "右栏", points: ["要点一", "要点二"] } }) },
  { id: "compare", name: "对比", make: () => ({ layout: "compare", title: "对比", items: [{ head: "方案 A", body: "说明文字" }, { head: "方案 B", body: "说明文字" }] }) },
  { id: "stats", name: "数据", make: () => ({ layout: "stats", title: "关键数据", items: [{ value: "80%", label: "指标一", desc: "说明" }, { value: "3x", label: "指标二", desc: "说明" }] }) },
  { id: "timeline", name: "时间线", make: () => ({ layout: "timeline", title: "流程", steps: [{ head: "第一步", body: "说明" }, { head: "第二步", body: "说明" }, { head: "第三步", body: "说明" }] }) },
  { id: "quote", name: "引用", make: () => ({ layout: "quote", text: "在这里写一句话", by: "出处" }) },
  { id: "closing", name: "结尾", make: () => ({ layout: "closing", title: "谢谢", subtitle: "欢迎提问" }) },
];

/**
 * 把一次页面操作应用到 spec 对象(**原地改**)。返回是否真的改动了。
 * 越界/无意义的操作(把第一页上移、删到零页)一律拒绝 —— 宁可不改,也不要把 spec 写坏。
 */
export function applySlideOp(spec: any, op: SlideOp): boolean {
  const slides: SlidePage[] = spec?.slides;
  if (!Array.isArray(slides)) return false;
  const i = op.index;
  if (op.kind !== "add" && (i < 0 || i >= slides.length)) return false;
  switch (op.kind) {
    case "dup":
      // 深拷贝:浅拷贝会让两页共享 points/items 数组,改一页另一页跟着变
      slides.splice(i + 1, 0, JSON.parse(JSON.stringify(slides[i])));
      return true;
    case "del":
      if (slides.length <= 1) return false; // 空 spec 渲染不出东西,留最后一页
      slides.splice(i, 1);
      return true;
    case "move": {
      const to = Math.max(0, Math.min(op.to, slides.length - 1));
      if (to === i) return false;
      slides.splice(to, 0, slides.splice(i, 1)[0]);
      return true;
    }
    case "add": {
      const tpl = NEW_SLIDE_LAYOUTS.find((l) => l.id === op.layout) ?? NEW_SLIDE_LAYOUTS[0];
      slides.splice(Math.max(0, Math.min(i, slides.length)), 0, tpl.make());
      return true;
    }
    case "notes": {
      const v = op.value.trim();
      const sl = slides[i] as SlidePage;
      if ((sl.notes ?? "") === v) return false;
      if (v) sl.notes = v;
      else delete sl.notes;
      return true;
    }
    case "freeform": {
      const boxes = expandToFreeform(slides[i]);
      if (!boxes) return false; // 已是 freeform / 展不开:拒绝
      slides[i] = { layout: "freeform", notes: slides[i].notes, boxes };
      if (!slides[i].notes) delete slides[i].notes;
      return true;
    }
    case "box-set": {
      const boxes = (slides[i] as SlidePage).boxes;
      const b = Array.isArray(boxes) ? boxes[op.box] : undefined;
      if (!b) return false;
      let changed = false;
      for (const [k, v] of Object.entries(op.patch)) {
        if ((b as any)[k] === v) continue;
        if (v === undefined || v === null) delete (b as any)[k];
        else (b as any)[k] = v;
        changed = true;
      }
      return changed;
    }
    case "box-add": {
      const sl = slides[i] as SlidePage;
      if (sl.layout !== "freeform") return false;
      if (!Array.isArray(sl.boxes)) sl.boxes = [];
      sl.boxes.push(op.boxSpec);
      return true;
    }
    case "box-del": {
      const boxes = (slides[i] as SlidePage).boxes;
      if (!Array.isArray(boxes) || op.box < 0 || op.box >= boxes.length) return false;
      boxes.splice(op.box, 1);
      return true;
    }
    case "box-z": {
      const boxes = (slides[i] as SlidePage).boxes;
      if (!Array.isArray(boxes) || op.box < 0 || op.box >= boxes.length) return false;
      // freeform 的数组顺序即绘制顺序即 z 序(引擎同义)
      const to =
        op.dir === "top" ? boxes.length - 1
        : op.dir === "bottom" ? 0
        : op.dir === "up" ? op.box + 1
        : op.box - 1;
      if (to === op.box || to < 0 || to >= boxes.length) return false;
      boxes.splice(to, 0, boxes.splice(op.box, 1)[0]);
      return true;
    }
    case "transition": {
      const apply = (sl: SlidePage) => {
        if (op.value) sl.transition = { ...op.value };
        else delete sl.transition;
      };
      if (op.all) slides.forEach(apply);
      else apply(slides[i]);
      return true;
    }
    case "boxes-move": {
      const boxes = (slides[i] as SlidePage).boxes;
      if (!Array.isArray(boxes) || (!op.dx && !op.dy)) return false;
      const hit = op.boxes.filter((bi) => bi >= 0 && bi < boxes.length);
      if (!hit.length) return false;
      for (const bi of hit) moveFreeBox(boxes[bi], op.dx, op.dy);
      return true;
    }
    case "boxes-del": {
      const boxes = (slides[i] as SlidePage).boxes;
      if (!Array.isArray(boxes)) return false;
      // 降序删,下标才不会互相踩
      const hit = [...new Set(op.boxes.filter((bi) => bi >= 0 && bi < boxes.length))].sort((a, b) => b - a);
      if (!hit.length) return false;
      for (const bi of hit) boxes.splice(bi, 1);
      return true;
    }
  }
}

// ───────── 解锁为自由版式:语义版式 → freeform 盒子(与引擎几何逐坐标对齐)─────────
// 所有坐标直接抄自 pptx_native.rs 各版式分支(header 80,50,1120,64 / rule 80,122,72,4 /
// 封面标题 80,268,1120,110 …),字号用同一套 autofit —— 解锁瞬间页面基本纹丝不动。
// 颜色一律用色板词(ink/accent/muted/card/line/bg1),解锁后换肤仍然生效。
// 已知取舍(freeform 文本盒单一字号/颜色,组合段落只能拆盒):
//  · 卡片内容原本垂直居中,拆成 头/正文 两盒后改为顶对齐 —— 内容多的卡几乎无差,稀疏卡会上移;
//  · bullet 圆点原是强调色,拆开后并入文字(前缀「• 」)成正文色;子条不再降 3pt。

/** points → 文本行(「• 」/「  – 」前缀),与渲染器的 bullets 视觉对应。 */
function pointsToLines(points: SlidePage["points"]): string[] {
  const out: string[] = [];
  if (!Array.isArray(points)) return out;
  for (const p of points) {
    if (typeof p === "string") out.push(`• ${p}`);
    else if (p && typeof p === "object") {
      if (p.text) out.push(`• ${p.text}`);
      for (const s of p.sub ?? []) out.push(`　– ${s}`);
    }
  }
  return out;
}

const tbox = (
  x: number, y: number, w: number, h: number, size: number,
  o: Partial<FreeBox> = {}
): FreeBox => ({ type: "text", x, y, w, h, size, ...o });

/** 语义版式页 → freeform 盒子数组;已是 freeform 或空页返回 null(拒绝解锁)。 */
export function expandToFreeform(sl: SlidePage): FreeBox[] | null {
  const layout = sl.layout ?? "bullets";
  if (layout === "freeform") return null;
  const B: FreeBox[] = [];
  const header = () => {
    if (!sl.title) return;
    const size = autofit([{ em: emWidth(sl.title), rel: 0, after: 0 }], 1120, 64, 22, 32);
    B.push(tbox(80, 50, 1120, 64, size, { text: sl.title, bold: true, color: "ink" }));
    B.push({ type: "rect", x: 80, y: 122, w: 72, h: 4, color: "accent" });
  };
  const cover = (onImage: boolean) => {
    const ink = onImage ? "white" : "ink";
    const sub = onImage ? "#E8E8E8" : "muted";
    if (sl.kicker)
      B.push(tbox(160, 218, 960, 32, 17, { text: sl.kicker, bold: true, align: "center", color: onImage ? "white" : "accent" }));
    const title = sl.title || (layout === "closing" ? "谢谢" : "");
    B.push(tbox(80, 268, 1120, 110, coverTitleSize(title), { text: title, bold: true, align: "center", color: ink }));
    B.push({ type: "rect", x: 598, y: 392, w: 84, h: 4, color: "accent" });
    if (sl.subtitle)
      B.push(tbox(160, 420, 960, 70, coverSubSize(sl.subtitle), { text: sl.subtitle, align: "center", color: sub }));
  };
  switch (layout) {
    case "title":
    case "closing":
      cover(false);
      break;
    case "image-full":
      B.push({ type: "image", x: 0, y: 0, w: 1280, h: 720, image: sl.image, cover: true });
      B.push({ type: "scrim", x: 0, y: 0, w: 1280, h: 720, color: "black", alpha: 50 });
      cover(true);
      break;
    case "section": {
      B.push({ type: "rect", x: 80, y: 290, w: 8, h: 130, color: "accent" });
      if (sl.kicker) B.push(tbox(116, 296, 1000, 32, 17, { text: sl.kicker, bold: true, color: "accent" }));
      const t = sl.title ?? "";
      const size = autofit([{ em: emWidth(t), rel: 0, after: 0 }], 1040, 90, 26, 44);
      B.push(tbox(116, 336, 1040, 90, size, { text: t, bold: true, color: "ink" }));
      break;
    }
    case "two-col": {
      header();
      const size = Math.min(
        ...[sl.left, sl.right].filter(Boolean).map((c) => {
          const fl: FitLine[] = [];
          if (c!.head) fl.push({ em: emWidth(c!.head), rel: 2, after: 8 });
          pointFitLines(c!.points, fl);
          return autofit(fl, 488 - BULLET_INDENT, 414, 13, 24);
        }),
        24
      );
      [sl.left, sl.right].forEach((c, i) => {
        if (!c) return;
        const x = 80 + i * 576;
        B.push({ type: "card", x, y: 168, w: 544, h: 470 });
        let ty = 208;
        if (c.head) {
          B.push(tbox(x + 28, ty, 488, 40, size + 2, { text: c.head, bold: true, color: "accent" }));
          ty += 52;
        }
        const lines = pointsToLines(c.points);
        if (lines.length) B.push(tbox(x + 28, ty, 488, 638 - ty, size, { lines, color: "ink" }));
      });
      break;
    }
    case "compare": {
      header();
      const items = Array.isArray(sl.items) ? sl.items.slice(0, 4) : [];
      const n = Math.max(1, items.length);
      const w = Math.floor((1120 - 28 * (n - 1)) / n);
      const size = Math.min(
        ...items.map((it) => {
          const fl: FitLine[] = [];
          if (it.head) fl.push({ em: emWidth(it.head), rel: 3, after: 8 });
          for (const l of (it.body ?? "").split("\n").filter((x) => x.trim()))
            fl.push({ em: emWidth(l.trim()), rel: 0, after: 6 });
          pointFitLines(it.points, fl);
          return autofit(fl, w - 48 - BULLET_INDENT, 382, 11, 22);
        }),
        22
      );
      items.forEach((it, i) => {
        const x = 80 + i * (w + 28);
        B.push({ type: "card", x, y: 180, w, h: 430 });
        let ty = 216;
        if (it.head) {
          B.push(tbox(x + 24, ty, w - 48, 42, size + 3, { text: it.head, bold: true, color: "accent" }));
          ty += 54;
        }
        const lines = (it.body ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
        lines.push(...pointsToLines(it.points));
        if (lines.length) B.push(tbox(x + 24, ty, w - 48, 586 - ty, size, { lines, color: "ink" }));
      });
      break;
    }
    case "stats": {
      header();
      const items = Array.isArray(sl.items) ? sl.items.slice(0, 4) : [];
      const n = Math.max(1, items.length);
      const w = Math.floor((1120 - 28 * (n - 1)) / n);
      items.forEach((it, i) => {
        const x = 80 + i * (w + 28);
        B.push({ type: "card", x, y: 220, w, h: 320 });
        if (it.value) {
          const vs = autofit([{ em: emWidth(it.value), rel: 0, after: 0 }], w - 40, 120, 22, 60);
          B.push(tbox(x + 20, 250, w - 40, 100, vs, { text: it.value, bold: true, align: "center", anchor: "middle", color: "accent" }));
        }
        if (it.label) B.push(tbox(x + 20, 360, w - 40, 36, 20, { text: it.label, bold: true, align: "center", color: "ink" }));
        if (it.desc) {
          const ds = autofit([{ em: emWidth(it.desc), rel: 0, after: 0 }], w - 40, 90, 10, 16);
          B.push(tbox(x + 20, 402, w - 40, 100, ds, { text: it.desc, align: "center", color: "muted" }));
        }
      });
      break;
    }
    case "timeline": {
      header();
      const steps = Array.isArray(sl.steps) ? sl.steps.slice(0, 5) : [];
      const n = Math.max(1, steps.length);
      const w = Math.floor((1120 - 24 * (n - 1)) / n);
      if (n > 1)
        B.push({ type: "rect", x: 80 + Math.floor(w / 2), y: 250, w: (n - 1) * (w + 24), h: 3, color: "line" });
      const size = Math.min(
        ...steps.map((st) => {
          const fl: FitLine[] = [];
          if (st.head) fl.push({ em: emWidth(st.head), rel: 3, after: 6 });
          for (const l of (st.body ?? "").split("\n").filter((x) => x.trim()))
            fl.push({ em: emWidth(l.trim()), rel: 0, after: 4 });
          return autofit(fl, w, 320, 10, 20);
        }),
        20
      );
      steps.forEach((st, i) => {
        const x = 80 + i * (w + 24);
        const cx = x + Math.floor(w / 2);
        B.push({ type: "circle", x: cx, y: 252, r: 22, fill: "accent", color: "accent" });
        B.push(tbox(cx - 22, 230, 44, 44, 18, { text: String(i + 1), bold: true, align: "center", anchor: "middle", color: "bg1" }));
        let ty = 296;
        if (st.head) {
          B.push(tbox(x, ty, w, 36, size + 3, { text: st.head, bold: true, align: "center", color: "ink" }));
          ty += 42;
        }
        const lines = (st.body ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length) B.push(tbox(x, ty, w, 616 - ty, size, { lines, align: "center", color: "muted" }));
      });
      break;
    }
    case "quote": {
      B.push(tbox(100, 120, 200, 130, 96, { text: "“", bold: true, color: "accent" }));
      const qs = autofit([{ em: emWidth(sl.text), rel: 0, after: 0 }], 960, 220, 18, 40);
      B.push(tbox(160, 250, 960, 220, qs, { text: sl.text ?? "", italic: true, align: "center", anchor: "middle", color: "ink" }));
      if (sl.by) B.push(tbox(160, 490, 960, 40, 18, { text: `—— ${sl.by}`, align: "center", color: "muted" }));
      break;
    }
    case "image-text": {
      header();
      const right = String(sl.side ?? "").toLowerCase() === "right";
      const [imgX, txtX] = right ? [656, 80] : [80, 656];
      B.push({ type: "image", x: imgX, y: 168, w: 544, h: 470, image: sl.image, cover: true, rounded: true });
      const fl: FitLine[] = [];
      if (sl.head) fl.push({ em: emWidth(sl.head), rel: 2, after: 10 });
      pointFitLines(sl.points, fl);
      const size = autofit(fl, 544 - BULLET_INDENT, 446, 13, 30);
      let ty = 196;
      if (sl.head) {
        B.push(tbox(txtX, ty, 544, 44, size + 2, { text: sl.head, bold: true, color: "accent" }));
        ty += 56;
      }
      const lines = pointsToLines(sl.points);
      if (lines.length) B.push(tbox(txtX, ty, 544, 626 - ty, size, { lines, color: "ink" }));
      break;
    }
    default: {
      // bullets(含未知版式)
      header();
      const fl: FitLine[] = [];
      pointFitLines(sl.points, fl);
      const size = autofit(fl, 1120 - BULLET_INDENT, 470, 16, 36);
      const lines = pointsToLines(sl.points);
      if (lines.length) B.push(tbox(80, 176, 1120, 470, size, { lines, anchor: "middle", color: "ink" }));
    }
  }
  return B.length ? B : null;
}

// ───────── 自适应字号(与 pptx_native.rs 的 autofit 逐行同构)─────────
// 引擎按每页内容量反算字号(行少撑大、行多才收)。预览必须用**同一套算法与同一批常量**,
// 否则预览一个字号、导出另一个字号 —— 这正是「预览即导出」要防的事。
// 改这里等于改导出:两边任何一处调了,另一处必须同步。

const PT2PX = 96 / 72;
const LINE_H = 1.32;
/** bullet 悬挂缩进(marL=285750 EMU = 30px),算可用宽要扣。 */
const BULLET_INDENT = 30;

/** em 宽度:CJK/全角 1em,拉丁/数字约 0.55em。 */
function emWidth(s: unknown): number {
  let w = 0;
  for (const ch of String(s ?? "")) {
    const u = ch.codePointAt(0)!;
    const cjk =
      (u >= 0x2e80 && u <= 0x9fff) ||
      (u >= 0xf900 && u <= 0xfaff) ||
      (u >= 0xff00 && u <= 0xffef) ||
      (u >= 0x3000 && u <= 0x303f);
    w += cjk ? 1 : 0.55;
  }
  return w;
}

interface FitLine { em: number; rel: number; after: number }

/** 在 [min,max] 里挑最大的、能在 (w,h) px 盒内放下全部行的字号(pt)。 */
function autofit(lines: FitLine[], w: number, h: number, min: number, max: number): number {
  if (!lines.length) return max;
  for (let size = max; size >= min; size--) {
    let total = 0;
    for (const l of lines) {
      const s = Math.max(6, size + l.rel);
      const perRow = Math.max(1, w / (s * PT2PX));
      const rows = Math.max(1, Math.ceil(l.em / perRow));
      total += rows * s * LINE_H * PT2PX + l.after * PT2PX;
    }
    if (total <= h) return size;
  }
  return min;
}

/** points → 度量行(规则与 Rust 的 point_fit_lines / pointsHtml 一一对应)。 */
function pointFitLines(points: SlidePage["points"], out: FitLine[]): void {
  if (!Array.isArray(points)) return;
  for (const p of points) {
    if (typeof p === "string") {
      out.push({ em: emWidth(p), rel: 0, after: 8 });
    } else if (p && typeof p === "object") {
      if (p.text) out.push({ em: emWidth(p.text), rel: 0, after: 4 });
      for (const s of p.sub ?? []) out.push({ em: emWidth(s), rel: -3, after: 4 });
    }
  }
}

/**
 * pt → CSS。用 `cqw`(容器宽度百分比)而非 px/clamp:幻灯片容器宽 = 1280 逻辑 px 画布,
 * 故 S pt = S×(96/72) px = S×1.3333/1280×100 cqw —— **与导出像素级同构**,且预览缩放到
 * 任何尺寸都保持比例。旧代码用 clamp(a,Bvw,c) 只是「差不多大」,换算不过去。
 */
function fs(pt: number): string {
  return `font-size:${((pt * PT2PX * 100) / 1280).toFixed(3)}cqw`;
}

/**
 * points → HTML。`size` 由调用方 autofit 算好后传入(与导出同字号)。
 * `base` = 该 points 数组在单页 spec 里的路径前缀(如 `points` / `left.points`),
 * 用来给每个 bullet 打可编辑标记;不传则不可编辑。
 */
function pointsHtml(points: SlidePage["points"], pal: Palette, size: number, base?: string): string {
  if (!Array.isArray(points)) return "";
  const li: string[] = [];
  points.forEach((p, i) => {
    if (typeof p === "string") {
      // 裸字符串项:路径就是 `<base>.<i>`
      li.push(`<li${base ? de(`${base}.${i}`) : ""}>${esc(p)}</li>`);
    } else if (p && typeof p === "object") {
      // 子条降 3pt(与 Rust 的 rel:-3 一致)
      const subs = Array.isArray(p.sub) && p.sub.length
        ? `<ul class="sub" style="${fs(size - 3)}">${p.sub
            .map((s, j) => `<li${base ? de(`${base}.${i}.sub.${j}`) : ""}>${esc(s)}</li>`)
            .join("")}</ul>`
        : "";
      // 有子条时外层 li 不能整体可编辑(会把子条文字一起吞进 text),
      // 故把 text 单独包一层 span 挂标记。
      const txt = `<span${base ? de(`${base}.${i}.text`) : ""}>${esc(p.text ?? "")}</span>`;
      li.push(`<li>${txt}${subs}</li>`);
    }
  });
  return li.length
    ? `<ul class="pts" style="--acc:${pal.accent};${fs(size)}">${li.join("")}</ul>`
    : "";
}

/** 页题头。标题 autofit [22,32],与 Rust 的 header() 同界。 */
function headerHtml(title?: string): string {
  if (!title) return "";
  const size = autofit([{ em: emWidth(title), rel: 0, after: 0 }], 1120, 64, 22, 32);
  return `<h2 class="hd" style="${fs(size)}"${de("title")}>${esc(title)}</h2><div class="rule"></div>`;
}

function slideHtml(sl: SlidePage, pal: Palette): string {
  const layout = sl.layout ?? "bullets";
  let inner = "";
  switch (layout) {
    case "title":
    case "closing": {
      const title = sl.title || (layout === "closing" ? "谢谢" : "");
      inner = `<div class="center">
        ${sl.kicker ? `<div class="kick" style="${fs(17)}"${de("kicker")}>${esc(sl.kicker)}</div>` : ""}
        <h1 style="${fs(coverTitleSize(title))}"${de("title")}>${esc(title)}</h1><div class="rule mid"></div>
        ${sl.subtitle ? `<p class="sub" style="${fs(coverSubSize(sl.subtitle))}"${de("subtitle")}>${esc(sl.subtitle)}</p>` : ""}
      </div>`;
      break;
    }
    case "section": {
      const t = sl.title ?? "";
      const size = autofit([{ em: emWidth(t), rel: 0, after: 0 }], 1040, 90, 26, 44);
      inner = `<div class="sect"><div class="bar"></div><div>
        ${sl.kicker ? `<div class="kick" style="${fs(17)}"${de("kicker")}>${esc(sl.kicker)}</div>` : ""}
        <h1 class="sec-t" style="${fs(size)}"${de("title")}>${esc(t)}</h1></div></div>`;
      break;
    }
    case "two-col": {
      // 两栏共用同一字号(各栏算一次取小),与 Rust 的 col_size 同逻辑。
      const size = Math.min(
        ...[sl.left, sl.right].filter(Boolean).map((c) => {
          const fl: FitLine[] = [];
          if (c!.head) fl.push({ em: emWidth(c!.head), rel: 2, after: 8 });
          pointFitLines(c!.points, fl);
          return autofit(fl, 488 - BULLET_INDENT, 414, 13, 24);
        }),
        24
      );
      const col = (c: SpecCol | undefined, side: "left" | "right") =>
        c
          ? `<div class="card">${c.head ? `<div class="chead" style="${fs(size + 2)}"${de(`${side}.head`)}>${esc(c.head)}</div>` : ""}${pointsHtml(c.points, pal, size, `${side}.points`)}</div>`
          : "";
      inner = `${headerHtml(sl.title)}<div class="cols">${col(sl.left, "left")}${col(sl.right, "right")}</div>`;
      break;
    }
    case "compare": {
      const items = Array.isArray(sl.items) ? sl.items.slice(0, 4) : [];
      const n = Math.max(1, items.length);
      // Math.floor 不能省:Rust 那边 `(1120 - gap*(n-1)) / n` 是**整除**(3 卡 → 354 而非
      // 354.667)。这 0.667px 的差足以让 autofit 差出 1pt —— 实测预览 59 / 导出 58。
      const cw = Math.floor((1120 - 28 * (n - 1)) / n);
      const size = Math.min(
        ...items.map((it) => {
          const fl: FitLine[] = [];
          if (it.head) fl.push({ em: emWidth(it.head), rel: 3, after: 8 });
          for (const l of (it.body ?? "").split("\n").filter((x) => x.trim()))
            fl.push({ em: emWidth(l.trim()), rel: 0, after: 6 });
          pointFitLines(it.points, fl);
          return autofit(fl, cw - 48 - BULLET_INDENT, 382, 11, 22);
        }),
        22
      );
      const cards = items
        .map((it, i) => {
          // body 是「\n 分行的整块文本」,拆行只为排版;编辑要回写整块 → 标记打在容器上,
          // 由 DeckViewer 用 innerText 取回换行(逐行标记会把一行写成整个 body)。
          const lines = (it.body ?? "").split("\n").filter((l) => l.trim());
          const body = lines.length
            ? `<div${de(`items.${i}.body`)}>${lines.map((l) => `<p style="${fs(size)}">${esc(l.trim())}</p>`).join("")}</div>`
            : "";
          return `<div class="card">${it.head ? `<div class="chead" style="${fs(size + 3)}"${de(`items.${i}.head`)}>${esc(it.head)}</div>` : ""}${body}${pointsHtml(it.points, pal, size, `items.${i}.points`)}</div>`;
        })
        .join("");
      inner = `${headerHtml(sl.title)}<div class="cmp" style="--n:${items.length || 1}">${cards}</div>`;
      break;
    }
    case "stats": {
      const items = Array.isArray(sl.items) ? sl.items.slice(0, 4) : [];
      const n = Math.max(1, items.length);
      const cw = Math.floor((1120 - 28 * (n - 1)) / n); // 整除,同 Rust
      const cards = items
        .map((it, i) => {
          // value / desc 各自 autofit(与 Rust 同界),label 固定 20pt
          const vs = it.value ? autofit([{ em: emWidth(it.value), rel: 0, after: 0 }], cw - 40, 120, 22, 60) : 0;
          const ds = it.desc ? autofit([{ em: emWidth(it.desc), rel: 0, after: 0 }], cw - 40, 90, 10, 16) : 0;
          return `<div class="card stat">
            ${it.value ? `<div class="num" style="${fs(vs)}"${de(`items.${i}.value`)}>${esc(it.value)}</div>` : ""}
            ${it.label ? `<div class="nlabel" style="${fs(20)}"${de(`items.${i}.label`)}>${esc(it.label)}</div>` : ""}
            ${it.desc ? `<div class="ndesc" style="${fs(ds)}"${de(`items.${i}.desc`)}>${esc(it.desc)}</div>` : ""}
          </div>`;
        })
        .join("");
      inner = `${headerHtml(sl.title)}<div class="cmp stats" style="--n:${items.length || 1}">${cards}</div>`;
      break;
    }
    case "timeline": {
      const steps = Array.isArray(sl.steps) ? sl.steps.slice(0, 5) : [];
      const n = Math.max(1, steps.length);
      const sw = Math.floor((1120 - 24 * (n - 1)) / n); // 整除,同 Rust
      const size = Math.min(
        ...steps.map((st) => {
          const fl: FitLine[] = [];
          if (st.head) fl.push({ em: emWidth(st.head), rel: 3, after: 6 });
          for (const l of (st.body ?? "").split("\n").filter((x) => x.trim()))
            fl.push({ em: emWidth(l.trim()), rel: 0, after: 4 });
          return autofit(fl, sw, 320, 10, 20);
        }),
        20
      );
      const cells = steps
        .map(
          (st, i) => `<div class="step"><div class="dot">${i + 1}</div>
            ${st.head ? `<div class="shead" style="${fs(size + 3)}"${de(`steps.${i}.head`)}>${esc(st.head)}</div>` : ""}
            ${st.body
              ? `<div class="sbody" style="${fs(size)}"${de(`steps.${i}.body`)}>${st.body.split("\n").filter((l) => l.trim()).map((l) => `<p>${esc(l.trim())}</p>`).join("")}</div>`
              : ""}
          </div>`,
        )
        .join("");
      inner = `${headerHtml(sl.title)}<div class="tl" style="--n:${steps.length || 1}">${cells}</div>`;
      break;
    }
    case "quote": {
      const qs = autofit([{ em: emWidth(sl.text), rel: 0, after: 0 }], 960, 220, 18, 40);
      inner = `<div class="quote"><div class="qmark">“</div>
        <p class="qtext" style="${fs(qs)}"${de("text")}>${esc(sl.text ?? "")}</p>
        ${sl.by ? `<p class="qby" style="${fs(18)}">—— <span${de("by")}>${esc(sl.by)}</span></p>` : ""}</div>`;
      break;
    }
    case "image-full": {
      // 与 Rust 同构:全幅图 + 50% 黑蒙版 + 居中白字(白字恒定,不随色板)。
      const t = sl.title ?? "";
      inner = `<div class="ifull">${imgHtml(sl.image)}<div class="scrim"></div>
        <div class="center on-img">
          ${sl.kicker ? `<div class="kick on-img" style="${fs(17)}"${de("kicker")}>${esc(sl.kicker)}</div>` : ""}
          <h1 style="${fs(coverTitleSize(t))}"${de("title")}>${esc(t)}</h1><div class="rule mid"></div>
          ${sl.subtitle ? `<p class="sub on-img" style="${fs(coverSubSize(sl.subtitle))}"${de("subtitle")}>${esc(sl.subtitle)}</p>` : ""}
        </div></div>`;
      break;
    }
    case "image-text": {
      const right = String(sl.side ?? "").toLowerCase() === "right";
      const fl: FitLine[] = [];
      if (sl.head) fl.push({ em: emWidth(sl.head), rel: 2, after: 10 });
      pointFitLines(sl.points, fl);
      const size = autofit(fl, 544 - BULLET_INDENT, 446, 13, 30);
      const media = `<div class="ihalf">${imgHtml(sl.image)}</div>`;
      const txt = `<div class="ihalf txt">
        ${sl.head ? `<div class="chead" style="${fs(size + 2)}"${de("head")}>${esc(sl.head)}</div>` : ""}
        ${pointsHtml(sl.points, pal, size, "points")}</div>`;
      inner = `${headerHtml(sl.title)}<div class="cols">${right ? txt + media : media + txt}</div>`;
      break;
    }
    case "freeform": {
      // 自由版式:绝对定位盒子,不走 autofit(引擎同此)。此前这里没有分支 → freeform 页
      // 掉进 default 当 bullets 渲染,而 freeform 页没有 points → 预览一片空白、导出却好好的。
      inner = freeformHtml(sl, pal);
      break;
    }
    default: {
      // bullets(含未知版式降级):内容少就撑大,与 Rust 同界 [16,36]。
      const fl: FitLine[] = [];
      pointFitLines(sl.points, fl);
      const size = autofit(fl, 1120 - BULLET_INDENT, 470, 16, 36);
      // .fillbox:与 Rust 的 anchor="ctr" 对应 —— 内容放不满时垂直居中,不在下方留死白。
      inner = `${headerHtml(sl.title)}<div class="fillbox">${pointsHtml(sl.points, pal, size, "points")}</div>`;
    }
  }
  return `<section class="sl">${inner}</section>`;
}

/** 封面/结尾/全幅图页的主标题字号(三处共用,与 Rust 同界 [30,50])。 */
function coverTitleSize(title: string): number {
  return autofit([{ em: emWidth(title), rel: 0, after: 0 }], 1120, 110, 30, 50);
}
/** 封面副标题(与 Rust 同界 [14,24])。 */
function coverSubSize(sub: string): number {
  return autofit([{ em: emWidth(sub), rel: 0, after: 0 }], 960, 70, 14, 24);
}

/**
 * 配图 <img>。只认 data:/http(s) —— 本地绝对路径在 srcdoc 的不透明源里必然加载失败,
 * 与其渲染一个碎图图标,不如显式画占位框说明「预览未载入」(导出仍会有图)。
 */
function imgHtml(src?: string): string {
  const s = String(src ?? "").trim();
  if (!s) return "";
  if (/^(data:|https?:)/i.test(s)) return `<img class="pic" src="${esc(s)}" alt=""/>`;
  const name = s.split(/[\\/]/).pop() ?? s;
  return `<div class="pic ph"><span>配图待载入<br/>${esc(name)}</span></div>`;
}

// ───────── freeform(与 pptx_native.rs 的 freeform 分支同构)─────────
// 这一段**没有排版数学** —— freeform 本来就是绝对定位、不走 autofit,所以预览只需
// 把盒子按 x/y/w/h 画到 1280×720 画布上。坐标一律换成百分比:.sl 是 16:9 容器,
// left=x/1280 与 top=y/720 落点一致,缩放到任何尺寸都不漂。

/** 与 Rust norm_color 同构:色板词 / #RRGGBB / #RGB → CSS 颜色;认不出退 fallback。 */
function normColor(raw: unknown, pal: Palette, fallback: string): string {
  const t = String(raw ?? "").trim();
  if (!t) return fallback;
  switch (t.toLowerCase()) {
    case "ink": case "text": return pal.ink;
    case "muted": return pal.muted;
    case "accent": return pal.accent;
    case "card": return pal.card;
    case "line": return pal.cardLine;
    case "bg": case "bg1": return pal.bg1;
    case "bg2": return pal.bg2;
    case "white": return "#FFFFFF";
    case "black": return "#000000";
  }
  const hex = t.replace(/^#/, "");
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toUpperCase()}`;
  if (/^[0-9a-f]{3}$/i.test(hex)) return `#${hex.split("").map((c) => c + c).join("").toUpperCase()}`;
  return fallback;
}

const num = (v: unknown, d: number): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : d;
};
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
/** x→% (画布宽 1280) / y→% (画布高 720)。 */
const px = (n: number) => `${((n * 100) / 1280).toFixed(4)}%`;
const py = (n: number) => `${((n * 100) / 720).toFixed(4)}%`;

/** points 解析:[[x,y],…] / [{x,y},…] / "x,y x,y" 都吃(与 Rust parse_points 宽容度对齐)。 */
function parsePts(raw: unknown): [number, number][] {
  const out: [number, number][] = [];
  if (Array.isArray(raw)) {
    for (const p of raw) {
      if (Array.isArray(p) && p.length >= 2) out.push([Number(p[0]) || 0, Number(p[1]) || 0]);
      else if (p && typeof p === "object") {
        const o = p as { x?: unknown; y?: unknown };
        if (o.x !== undefined && o.y !== undefined) out.push([Number(o.x) || 0, Number(o.y) || 0]);
      }
    }
  } else if (typeof raw === "string") {
    for (const pair of raw.trim().split(/\s+/)) {
      const [a, b] = pair.split(",");
      if (a !== undefined && b !== undefined) out.push([Number(a) || 0, Number(b) || 0]);
    }
  }
  return out;
}

/** 一个覆盖整页画布的 SVG 层(每盒一个 → DOM 顺序 = 绘制顺序 = 与导出的 z 序一致)。 */
function svgLayer(inner: string, defs = ""): string {
  return `<svg class="ff-svg" viewBox="0 0 1280 720" preserveAspectRatio="none">${defs}${inner}</svg>`;
}

function freeBoxHtml(b: FreeBox, pal: Palette, i: number): string {
  const x = num(b.x, 0), y = num(b.y, 0);
  const w = Math.max(1, num(b.w, 100)), h = Math.max(1, num(b.h, 100));
  const stroke = normColor(b.color, pal, pal.ink);
  const sw = clamp(num(b.width, 3), 1, 40);
  const fill = b.fill && String(b.fill).length ? normColor(b.fill, pal, pal.accent) : null;
  const click = Math.max(0, num(b.click, 0));
  // data-click / data-anim*:预览渲染全部盒子(动画终态);放映模式读这些属性做分步播放。
  // data-bi:盒子在 boxes 数组里的下标 —— 自由编辑覆盖层靠它把 DOM 元素对回 spec。
  const an = b.anim && b.anim.effect
    ? ` data-anim="${esc(b.anim.effect)}" data-animtrig="${esc(b.anim.trigger ?? "click")}"` +
      ` data-animdur="${clamp(num(b.anim.dur, 500), 50, 10000)}"${b.anim.dir ? ` data-animdir="${esc(b.anim.dir)}"` : ""}`
    : "";
  const dc = `${click > 0 ? ` data-click="${click}"` : ""}${an} data-bi="${i}"`;
  // rot/opacity:与引擎同语义 —— rot 只作用于 div 类盒子(绕自身中心),opacity 全类型;
  // 图片盒的 opacity 引擎不支持(无 solidFill),预览端同样跳过,两端一致。
  const rot = num(b.rot, 0) % 360;
  const opacity = clamp(num(b.opacity, 100), 0, 100);
  const isImg = ["image", "pic"].includes(String(b.type ?? ""));
  const fx =
    `${rot ? `transform:rotate(${rot}deg);` : ""}` +
    `${opacity < 100 && !isImg ? `opacity:${opacity / 100};` : ""}`;
  const svgFx = opacity < 100 ? `opacity:${opacity / 100};` : "";
  const box = (style: string, inner = "") =>
    `<div class="ff-b" style="left:${px(x)};top:${py(y)};width:${px(w)};height:${py(h)};${fx}${style}"${dc}>${inner}</div>`;

  switch (String(b.type ?? "")) {
    case "line": case "arrow": case "axis": {
      const x2 = num(b.x2, x + w), y2 = num(b.y2, y);
      const arrow = b.type === "arrow" || b.type === "axis" || b.arrow === true;
      const id = `ah${i}`;
      const defs = arrow
        ? `<defs><marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${stroke}"/></marker></defs>`
        : "";
      const dash = b.dash === true ? ` stroke-dasharray="${sw * 3},${sw * 2}"` : "";
      const mk = arrow ? ` marker-end="url(#${id})"` : "";
      return `<div class="ff-b ff-full"${svgFx ? ` style="${svgFx}"` : ""}${dc}>${svgLayer(
        `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"${dash}${mk}/>`,
        defs
      )}</div>`;
    }
    case "polyline": case "curve": case "polygon": {
      const pts = parsePts(b.points);
      if (pts.length < 2) return ""; // 与引擎一致:点不足只跳过该盒,不毁整页
      const closed = b.type === "polygon" || b.closed === true;
      const d = pts.map(([a, c]) => `${a},${c}`).join(" ");
      const tag = closed ? "polygon" : "polyline";
      return `<div class="ff-b ff-full"${svgFx ? ` style="${svgFx}"` : ""}${dc}>${svgLayer(
        `<${tag} points="${d}" fill="${closed && fill ? fill : "none"}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`
      )}</div>`;
    }
    case "ellipse": case "circle": {
      const r = num(b.r, 0);
      const [ex, ey, ew, eh] = r > 0 ? [x - r, y - r, 2 * r, 2 * r] : [x, y, w, h];
      return `<div class="ff-b ff-full"${svgFx ? ` style="${svgFx}"` : ""}${dc}>${svgLayer(
        `<ellipse cx="${ex + ew / 2}" cy="${ey + eh / 2}" rx="${ew / 2}" ry="${eh / 2}" fill="${fill ?? "none"}" stroke="${stroke}" stroke-width="${sw}"/>`
      )}</div>`;
    }
    case "point": case "dot": {
      const r = Math.max(1, num(b.r, 6));
      const c = fill ?? stroke;
      return `<div class="ff-b ff-full"${svgFx ? ` style="${svgFx}"` : ""}${dc}>${svgLayer(
        `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="${c}" stroke-width="1"/>`
      )}</div>`;
    }
    case "text": {
      const size = clamp(num(b.size, 18), 4, 400);
      const color = normColor(b.color, pal, pal.ink);
      const align =
        ["center", "ctr", "c"].includes(String(b.align)) ? "center"
        : ["right", "r", "end"].includes(String(b.align)) ? "right"
        : "left";
      const anchor =
        ["middle", "center", "ctr"].includes(String(b.anchor)) ? "center"
        : ["bottom", "b"].includes(String(b.anchor)) ? "flex-end"
        : "flex-start";
      // lines 多行:逐行可编辑(各是独立字段);text 单行:整盒可编辑
      const multi = Array.isArray(b.lines);
      const src = multi ? b.lines!.filter((l) => typeof l === "string") : [b.text];
      const body = src
        .filter((t) => t !== undefined && t !== null)
        .map((t, j) => `<p${multi ? de(`boxes.${i}.lines.${j}`) : de(`boxes.${i}.text`)}>${esc(t)}</p>`)
        .join("");
      if (!body) return "";
      // serif 与引擎的 Georgia/宋体 对应;缺省继承页面黑体
      const family = String(b.font ?? "").toLowerCase() === "serif"
        ? "font-family:Georgia,'Times New Roman',SimSun,serif;"
        : "";
      return box(
        `${fs(size)};color:${color};text-align:${align};justify-content:${anchor};${family}` +
          `${b.bold ? "font-weight:700;" : ""}${b.italic ? "font-style:italic;" : ""}`,
        body
      );
    }
    case "rect": case "bar":
      return box(`background:${normColor(b.color, pal, pal.accent)}`);
    case "card":
      return box(`background:${pal.card};border:1px solid ${pal.cardLine};border-radius:10px`);
    case "scrim": {
      const a = clamp(num(b.alpha, 50), 0, 100);
      return box(`background:${normColor(b.color, pal, "#000000")};opacity:${a / 100}`);
    }
    case "chart": {
      const svg = chartSvg(b, pal);
      if (!svg) return "";
      return box("overflow:hidden", svg);
    }
    case "table": {
      // 与引擎 table_xml 同构:表头 accent 底 + bg1 字,正文 card 底 + ink 字,网格线 line。
      const rows = Array.isArray(b.rows) ? b.rows.filter((r) => Array.isArray(r)) : [];
      const ncols = rows.reduce((m, r) => Math.max(m, r.length), 0);
      if (!rows.length || !ncols) return "";
      const header = b.header !== false;
      const size = clamp(num(b.size, 14), 6, 40);
      const ws = Array.isArray(b.widths) && b.widths.length === ncols && b.widths.every((v) => Number(v) > 0)
        ? b.widths.map(Number)
        : Array(ncols).fill(1);
      const wsum = ws.reduce((a, c) => a + c, 0);
      const cols = ws.map((v) => `<col style="width:${((v * 100) / wsum).toFixed(2)}%"/>`).join("");
      const trs = rows
        .map((r, ri) => {
          const isHead = header && ri === 0;
          const tds = Array.from({ length: ncols }, (_, c) => {
            const cell = esc(r[c] ?? "");
            const st = isHead
              ? `background:${pal.accent};color:${pal.bg1};font-weight:700;text-align:center;${fs(size + 1)}`
              : `background:${pal.card};color:${pal.ink};${fs(size)}`;
            return `<td style="border:1px solid ${pal.cardLine};padding:.35em .6em;${st}"${de(`boxes.${i}.rows.${ri}.${c}`)}>${cell}</td>`;
          }).join("");
          return `<tr>${tds}</tr>`;
        })
        .join("");
      return box(
        "overflow:hidden",
        `<table class="ff-tbl"><colgroup>${cols}</colgroup><tbody>${trs}</tbody></table>`
      );
    }
    case "image": case "pic": {
      const s = String(b.image ?? "").trim();
      const rounded = b.rounded === true ? "border-radius:10px;" : "";
      // 与固定版式同一条约定:srcdoc 加载不了 file://,路径必须已被换成 data URL,
      // 否则显式画占位框(宁可标「待载入」,也不要预览悄悄少一张图)。
      if (/^(data:|https?:)/i.test(s)) {
        const fit = b.cover === false ? "fill" : "cover";
        return box(`${rounded}overflow:hidden`, `<img src="${esc(s)}" alt="" style="width:100%;height:100%;object-fit:${fit};display:block"/>`);
      }
      const name = s.split(/[\\/]/).pop() ?? "";
      return box(
        `${rounded}background:${pal.card};border:1px dashed ${pal.cardLine};color:${pal.muted};` +
          `display:flex;align-items:center;justify-content:center;text-align:center;font-size:1.25cqw;line-height:1.6`,
        `<span>配图待载入<br/>${esc(name)}</span>`
      );
    }
    default:
      return ""; // 未知 type:与引擎一致,跳过该盒
  }
}

function freeformHtml(sl: SlidePage, pal: Palette): string {
  const boxes = Array.isArray(sl.boxes) ? sl.boxes : [];
  return `<div class="ff">${boxes.map((b, i) => freeBoxHtml(b, pal, i)).join("")}</div>`;
}

// ───────── 形状化图表预览(与引擎 chart_shapes 逐数字对齐)─────────
// 引擎把图表导出为原生形状组;这里出同构 SVG。几何常量(标题 26/类目 18/图例 20/内边距 6、
// 柱宽 72%、留头 14px、饼自 270° 顺时针)两边完全一致 —— 改一边必须同步另一边。

const CHART_EXTRA = ["#5B8DEF", "#E0A458", "#6CBF8F", "#B37FD4", "#D46A6A"];
function chartColor(i: number, pal: Palette): string {
  return i === 0 ? pal.accent : CHART_EXTRA[(i - 1) % CHART_EXTRA.length];
}
const PT = (pt: number) => (pt * 96) / 72; // svg 局部单位 = 画布 px

function chartSvg(b: FreeBox, pal: Palette): string {
  const kind = String(b.chartType ?? "");
  const labels = Array.isArray(b.labels) ? b.labels.map(String) : [];
  let series: number[][] = [];
  if (Array.isArray(b.series)) {
    series = (b.series as unknown[]).every((v) => typeof v === "number")
      ? [(b.series as number[]).map((v) => Math.max(0, Number(v) || 0))]
      : (b.series as number[][]).filter(Array.isArray).map((r) => r.map((v) => Math.max(0, Number(v) || 0)));
  }
  if (!labels.length || !series.length || series.every((s) => !s.length)) return "";
  const names = Array.isArray(b.names) ? b.names.map(String) : [];
  const w = Math.max(1, num(b.w, 100)), h = Math.max(1, num(b.h, 100));
  const title = String(b.title ?? "");
  const ns = series.length, nl = labels.length;
  const titleH = title ? 26 : 0;
  const isPie = kind === "pie" || kind === "donut";
  const xlabH = isPie ? 0 : 18;
  const legendH = isPie || (ns > 1 && names.length) ? 20 : 0;
  const pad = 6;
  const px0 = pad, py0 = titleH + pad;
  const pw = Math.max(40, w - 2 * pad), ph = Math.max(40, h - titleH - xlabH - legendH - 2 * pad);
  const baseline = py0 + ph;
  const maxv = Math.max(1e-9, ...series.flat());
  const out: string[] = [];
  const txt = (x: number, y: number, t: string, pt: number, color: string, anchor = "middle", bold = false) =>
    out.push(
      `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${PT(pt).toFixed(1)}" fill="${color}" text-anchor="${anchor}"${bold ? ' font-weight="700"' : ""}>${esc(t)}</text>`
    );
  const fmtV = (v: number) => (Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(1));
  if (title) txt(w / 2, 18, title, 14, pal.ink, "middle", true);
  if (kind === "bar") {
    out.push(`<rect x="${px0}" y="${baseline}" width="${pw}" height="2" fill="${pal.cardLine}"/>`);
    const groupW = pw / nl;
    const inner = groupW * 0.72;
    const barW = Math.max(4, inner / ns);
    series.forEach((sv, si) => {
      const color = chartColor(si, pal);
      sv.slice(0, nl).forEach((v, li) => {
        const bh = Math.round((v / maxv) * (ph - 14));
        const bx = px0 + li * groupW + (groupW - inner) / 2 + si * barW;
        if (bh > 0) out.push(`<rect x="${bx.toFixed(1)}" y="${baseline - bh}" width="${(barW - 2).toFixed(1)}" height="${bh}" fill="${color}"/>`);
        if (ns === 1) txt(bx + barW / 2, baseline - bh - 5, fmtV(v), 10, pal.muted);
      });
    });
    labels.forEach((lab, li) => txt(px0 + li * groupW + groupW / 2, baseline + 15, lab, 10, pal.muted));
  } else if (kind === "line") {
    out.push(`<rect x="${px0}" y="${baseline}" width="${pw}" height="2" fill="${pal.cardLine}"/>`);
    const groupW = pw / nl;
    series.forEach((sv, si) => {
      const color = chartColor(si, pal);
      const pts = sv.slice(0, nl).map((v, li) => [px0 + li * groupW + groupW / 2, baseline - Math.round((v / maxv) * (ph - 14))]);
      if (pts.length >= 2)
        out.push(`<polyline points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round"/>`);
      for (const [cx, cy] of pts) out.push(`<circle cx="${cx.toFixed(1)}" cy="${cy}" r="4" fill="${color}"/>`);
    });
    labels.forEach((lab, li) => txt(px0 + li * groupW + groupW / 2, baseline + 15, lab, 10, pal.muted));
  } else if (isPie) {
    const sv = series[0];
    const total = sv.slice(0, nl).reduce((a, c) => a + c, 0);
    if (total <= 0) return "";
    const d = Math.min(pw, ph);
    const R = d / 2;
    const cx = w / 2, cy = py0 + ph / 2;
    const innerR = kind === "donut" ? R * 0.62 : 0; // ≈ 引擎 blockArc adj3=19000 的孔径
    let ang = 270;
    sv.slice(0, nl).forEach((v, li) => {
      const sweep = (v / total) * 360;
      if (sweep <= 0) return;
      out.push(sectorPath(cx, cy, R, innerR, ang, ang + Math.min(sweep, 359.98), chartColor(li, pal), pal.bg1));
      ang += sweep;
    });
  } else return "";
  if (legendH > 0) {
    const ly = h - legendH + 2;
    const entries: [string, string][] = isPie
      ? labels.slice(0, nl).map((lab, li) => {
          const sv = series[0];
          const total = Math.max(1e-9, sv.slice(0, nl).reduce((a, c) => a + c, 0));
          const v = sv[li] ?? 0;
          return [chartColor(li, pal), `${lab} ${fmtV(v)}(${Math.round((v / total) * 100)}%)`];
        })
      : names.slice(0, ns).map((n, si) => [chartColor(si, pal), n]);
    const cell = pw / Math.max(1, entries.length);
    entries.forEach(([color, text], ei) => {
      const ex = px0 + ei * cell;
      out.push(`<rect x="${(ex + cell / 2 - 46).toFixed(1)}" y="${ly + 4}" width="10" height="10" fill="${color}"/>`);
      txt(ex + cell / 2 - 32, ly + 13, text, 10, pal.muted, "start");
    });
  }
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="none" style="display:block">${out.join("")}</svg>`;
}

/** 扇形/环形切片路径(角度制,自 3 点钟顺时针,与 OOXML pie/blockArc 同约定)。 */
function sectorPath(cx: number, cy: number, R: number, r: number, a1: number, a2: number, fill: string, stroke: string): string {
  const rad = (a: number) => (a * Math.PI) / 180;
  const p = (radius: number, a: number) => `${(cx + radius * Math.cos(rad(a))).toFixed(2)},${(cy + radius * Math.sin(rad(a))).toFixed(2)}`;
  const large = a2 - a1 > 180 ? 1 : 0;
  const d = r > 0
    ? `M${p(r, a1)} L${p(R, a1)} A${R},${R} 0 ${large} 1 ${p(R, a2)} L${p(r, a2)} A${r},${r} 0 ${large} 0 ${p(r, a1)} Z`
    : `M${cx.toFixed(2)},${cy.toFixed(2)} L${p(R, a1)} A${R},${R} 0 ${large} 1 ${p(R, a2)} Z`;
  return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
}

/** spec 对象或 JSON 字符串 → 校验过的 SlideSpec(失败 null)。 */
function coerceSpec(spec: SlideSpec | string): SlideSpec | null {
  let s: SlideSpec;
  try {
    s = typeof spec === "string" ? JSON.parse(spec) : spec;
  } catch {
    return null;
  }
  if (!s || !Array.isArray(s.slides) || !s.slides.length) return null;
  return s;
}

/**
 * 单页内部的全部样式(预览/播放器/缩略图共用)。.sl 只写「页面本体」规则,
 * 不写宽度/阴影等排场规则 —— 那些由各 chrome(纵览/播放器)自己按场景补。
 * container-type:inline-size —— fs() 用 cqw 把 pt 精确换算成容器宽度百分比,
 * 使预览字号与导出像素级同构,且**同一份 HTML 缩到 150px 缩略图字号自动等比**。
 */
function slideBaseCss(pal: Palette): string {
  return `
  .sl{aspect-ratio:16/9;border-radius:8px;container-type:inline-size;
    background:linear-gradient(180deg,${pal.bg1},${pal.bg2});color:${pal.ink};
    padding:4.4% 6.2%;overflow:hidden;position:relative}
  /* 字号一律由内联 style 的 fs() 给(autofit 算出),此处只管字重/颜色/间距 */
  .hd{font-weight:700}
  .rule{width:72px;height:4px;background:${pal.accent};margin:10px 0 16px}
  .rule.mid{margin:14px auto}
  .center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 10%}
  .center h1{font-weight:800}
  .kick{color:${pal.accent};font-weight:700;letter-spacing:.18em;text-transform:uppercase;margin-bottom:12px}
  .sub{color:${pal.muted};margin-top:4px}
  .sect{position:absolute;inset:0;display:flex;align-items:center;gap:26px;padding:0 8%}
  .bar{width:8px;height:130px;background:${pal.accent};border-radius:2px;flex-shrink:0}
  .sec-t{font-weight:800;margin-top:6px}
  .pts{list-style:none;display:flex;flex-direction:column;gap:.55em}
  .pts>li{padding-left:1.15em;position:relative}
  .pts>li::before{content:"•";color:var(--acc,${pal.accent});position:absolute;left:0;font-weight:700}
  /* 子条字号由内联 fs(size-3) 给(与 Rust 的 rel:-3 一致),这里不再用 .86em 相对缩放 */
  .pts .sub{list-style:none;margin-top:.35em;display:flex;flex-direction:column;gap:.3em;color:${pal.muted}}
  .pts .sub>li{padding-left:1.1em;position:relative}
  .pts .sub>li::before{content:"–";color:${pal.muted};position:absolute;left:0}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:3%}
  /* 与 Rust 的 anchor="ctr" 对应:autofit 之后仍放不满时垂直居中,不在下方留死白。
     bullets 文本框 y=176..646(470px)→ 占满题头以下的整块内容区。 */
  .fillbox{position:absolute;left:6.2%;right:6.2%;top:24.4%;height:65.3%;
    display:flex;flex-direction:column;justify-content:center}
  .card{justify-content:center}
  .ihalf.txt{justify-content:center}
  /* 卡片高度对齐 Rust 的固定画法(画布 1280 宽 = 100cqw,故 Npx = N/12.8 cqw):
     two-col 470px / compare 430px / stats 320px。不钉死的话卡片会跟着内容缩,
     预览成了「卡随字变」而导出是「卡固定、字居中」—— 两回事。 */
  .cols>.card{height:36.72cqw}
  .cmp>.card{height:33.59cqw}
  .cmp.stats>.card{height:25cqw}
  /* 配图:object-fit:cover ≡ Rust 端 a:srcRect 的 cover 裁切(等比填满+对称裁切,不变形) */
  .pic{width:100%;height:100%;object-fit:cover;display:block;border-radius:8px}
  .pic.ph{display:flex;align-items:center;justify-content:center;text-align:center;
    background:${pal.card};border:1px dashed ${pal.cardLine};color:${pal.muted};
    font-size:1.25cqw;line-height:1.6;border-radius:8px}
  .ifull{position:absolute;inset:0}
  .ifull .pic{height:100%;border-radius:0}
  .scrim{position:absolute;inset:0;background:rgba(0,0,0,.5)}
  .center.on-img h1{color:#fff}
  .kick.on-img{color:#fff}
  .sub.on-img{color:#E8E8E8}
  /* 图框几何对齐 Rust:544x470 px 图框(见 pptx_native.rs image-text 分支)。
     用 aspect-ratio 而非 height:100% —— grid 父容器没有确定高度,百分比高会塌成 0。 */
  .ihalf{min-height:0}
  .ihalf .pic{aspect-ratio:544/470;height:auto}
  .ihalf.txt{display:flex;flex-direction:column;padding-top:.4%}
  .cmp{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:2.4%}
  .card{background:${pal.card};border:1px solid ${pal.cardLine};border-radius:10px;padding:5.5% 5%;min-height:0;
    display:flex;flex-direction:column}
  .chead{color:${pal.accent};font-weight:700;margin-bottom:.6em}
  .card p{margin-bottom:.45em}
  .stats{margin-top:3%}
  .stat{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:7% 4%}
  .num{color:${pal.accent};font-weight:800;line-height:1.1}
  .nlabel{font-weight:700;margin-top:.5em}
  .ndesc{color:${pal.muted};margin-top:.4em}
  .tl{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:2.2%;position:relative;margin-top:4%}
  .tl::before{content:"";position:absolute;left:10%;right:10%;top:21px;height:3px;background:${pal.cardLine}}
  .step{display:flex;flex-direction:column;align-items:center;text-align:center;position:relative;z-index:1}
  /* 圆点 44px @1280 画布 = 3.4375cqw;内数字 18pt(与 Rust circle_num 一致) */
  .dot{width:3.4375cqw;height:3.4375cqw;border-radius:50%;background:${pal.accent};color:${pal.bg1};font-weight:800;font-size:1.875cqw;display:flex;align-items:center;justify-content:center}
  .shead{font-weight:700;margin-top:.7em}
  .sbody{color:${pal.muted};margin-top:.4em}
  .sbody p{margin-bottom:.3em}
  .quote{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 12%}
  /* 引号装饰 96pt(与 Rust 一致,非 autofit 项);正文/出处字号走内联 fs() */
  .qmark{color:${pal.accent};font-size:10cqw;font-weight:800;line-height:.6;align-self:flex-start;margin-left:-2%}
  .qtext{font-style:italic;margin-top:14px}
  .qby{color:${pal.muted};margin-top:18px}
  /* ── freeform ── .sl 有 padding:4.4% 6.2%,而 freeform 的坐标是相对整张 1280×720 画布的,
     故 .ff 用 absolute inset:0 顶掉 padding,让 left/top 的百分比直接落在画布原点上。 */
  .ff{position:absolute;inset:0;overflow:hidden}
  .ff-b{position:absolute;display:flex;flex-direction:column}
  .ff-b>p{margin:0}
  /* 线/折线/圆/点走 SVG:viewBox 与画布同为 1280×720,preserveAspectRatio="none" 下
     容器也是 16:9 → 不会变形,且 stroke-width 的用户单位 = 画布 px,与引擎线宽同尺度。 */
  .ff-full{left:0;top:0;width:100%;height:100%;pointer-events:none}
  .ff-svg{width:100%;height:100%;overflow:visible;display:block}
  /* freeform 真表格:等分/按 widths 布局,行高均摊铺满盒子(与引擎 a:tr h 均摊一致) */
  .ff-tbl{width:100%;height:100%;border-collapse:collapse;table-layout:fixed}
  .ff-tbl td{overflow:hidden;text-overflow:ellipsis;vertical-align:middle}`;
}

/** spec(对象或 JSON 字符串)→ 自包含纵览 HTML(全部页竖排滚动)。解析失败返回 null。 */
export function specPreviewHtml(spec: SlideSpec | string): string | null {
  const s = coerceSpec(spec);
  if (!s) return null;
  const pal = PALETTES[s.theme ?? ""] ?? PALETTES["minimal-white"];
  const slides = s.slides.map((sl) => slideHtml(sl, pal)).join("\n");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  body{background:#3a3a3e;padding:18px;display:flex;flex-direction:column;gap:18px;
    font-family:"Segoe UI","Microsoft YaHei","PingFang SC",sans-serif}
  .sl{width:100%;max-width:980px;margin:0 auto;box-shadow:0 8px 26px rgba(0,0,0,.35)}
  ${slideBaseCss(pal)}
  </style></head><body>${slides}</body></html>`;
}

/**
 * 逐页渲染(DeckViewer.vue 组件用):每页一段 <section class="sl">…</section> + 色板 CSS。
 * 之所以不用 specViewerHtml 的 iframe 方案:Tauri 主文档的 CSP 会被 srcdoc iframe
 * 继承,内联 <script> 一律被拦 —— 播放器 runtime 根本跑不起来。组件方案由 Vue 管
 * 状态,页面 HTML 走 v-html(内容全部经 esc() 转义,安全由构造保证),彻底绕开 CSP。
 */
export function specSlidesRender(
  spec: SlideSpec | string
): { pages: string[]; css: string; theme: string } | null {
  const s = coerceSpec(spec);
  if (!s) return null;
  const theme = PALETTES[s.theme ?? ""] ? (s.theme as string) : "minimal-white";
  const pal = PALETTES[theme];
  return { pages: s.slides.map((sl) => slideHtml(sl, pal)), css: slideBaseCss(pal), theme };
}

export interface DeckViewerOpts {
  /** 生成中:缩略图栏尾部加脉动占位「下一页生成中」。 */
  generating?: boolean;
  /** srcdoc 重建时恢复到的页码(0 起)。 */
  initialPage?: number;
  /** true=跳到最新一页(生成中逐页点亮的跟随感);false/缺省=停在 initialPage。 */
  follow?: boolean;
  /** postMessage 回传时带上的通道名 —— 工坊与右抽屉可能同屏各挂一个播放器,
   *  父窗口靠它分流页码,不然互相覆盖。缺省 ""。 */
  channel?: string;
}

/**
 * spec → 豆包式播放器 HTML:左缩略图栏 + 右大舞台 + 键盘/点击翻页 + 页码。
 * 自包含(内联 runtime,sandbox=allow-scripts 即可跑),同一份页面 HTML 渲一遍进
 * <template>,缩略图和舞台都从模板克隆 —— cqw 字号在小容器里自动等比,无需 transform。
 * 翻页时向父窗口 postMessage({type:"deck-page",page,user}) —— 父组件靠它在轮询重建
 * srcdoc 时恢复页码(iframe 是不透明源,父窗口读不了它的内部状态,只能靠消息)。
 */
export function specViewerHtml(spec: SlideSpec | string, opts: DeckViewerOpts = {}): string | null {
  const s = coerceSpec(spec);
  if (!s) return null;
  const pal = PALETTES[s.theme ?? ""] ?? PALETTES["minimal-white"];
  const slides = s.slides.map((sl) => slideHtml(sl, pal)).join("\n");
  const n = s.slides.length;
  const cfg = JSON.stringify({
    n,
    page: Math.max(0, Math.min(opts.initialPage ?? 0, n - 1)),
    follow: opts.follow === true,
    generating: opts.generating === true,
    channel: String(opts.channel ?? ""),
  }).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  html,body{height:100%}
  body{display:flex;background:#26262b;overflow:hidden;
    font-family:"Segoe UI","Microsoft YaHei","PingFang SC",sans-serif}
  #rail{width:152px;flex-shrink:0;overflow-y:auto;padding:12px 10px;display:flex;
    flex-direction:column;gap:10px;background:rgba(0,0,0,.22)}
  #rail::-webkit-scrollbar{width:6px}
  #rail::-webkit-scrollbar-thumb{background:rgba(255,255,255,.18);border-radius:3px}
  .th{position:relative;cursor:pointer;border-radius:8px;outline:2px solid transparent;
    outline-offset:1px;transition:outline-color .15s;flex-shrink:0}
  .th:hover{outline-color:rgba(255,255,255,.35)}
  .th.on{outline-color:${pal.accent}}
  .th .sl{width:100%;border-radius:6px;pointer-events:none}
  .th-n{position:absolute;left:5px;top:5px;z-index:2;font-size:10px;line-height:1;
    padding:3px 6px;border-radius:4px;background:rgba(0,0,0,.55);color:#fff;font-weight:600}
  .th-pending{aspect-ratio:16/9;border-radius:6px;border:1.5px dashed rgba(255,255,255,.32);
    display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.6);
    font-size:11px;animation:dkpulse 1.25s ease-in-out infinite;flex-shrink:0}
  @keyframes dkpulse{50%{opacity:.4}}
  #main{flex:1;display:flex;flex-direction:column;min-width:0}
  #stage{flex:1;display:flex;align-items:center;justify-content:center;padding:20px;min-height:0;cursor:pointer}
  #stage .sl{width:min(100%,calc((100vh - 96px)*1.77778));box-shadow:0 12px 36px rgba(0,0,0,.45)}
  #bar{height:48px;flex-shrink:0;display:flex;align-items:center;justify-content:center;gap:16px;
    color:#c9c9cf;font-size:12.5px;user-select:none}
  #bar button{border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.06);color:#e4e4e8;
    border-radius:7px;padding:5px 14px;font-size:12.5px;cursor:pointer}
  #bar button:hover{background:rgba(255,255,255,.14)}
  #bar button:disabled{opacity:.35;cursor:default}
  #bar .gen{color:${pal.accent};font-weight:600;animation:dkpulse 1.25s ease-in-out infinite}
  ${slideBaseCss(pal)}
  </style></head><body>
  <aside id="rail"></aside>
  <main id="main">
    <div id="stage" title="点击翻下一页 · 键盘 ←→ 翻页"></div>
    <div id="bar">
      <button id="prev">‹ 上一页</button>
      <span id="num"></span>
      <button id="next">下一页 ›</button>
      <span class="gen" id="genhint" hidden>生成中…</span>
    </div>
  </main>
  <template id="tpl">${slides}</template>
  <script>
  (function(){
    var CFG=${cfg};
    var tpl=document.getElementById("tpl");
    var slides=[].slice.call(tpl.content.children);
    var rail=document.getElementById("rail"),stage=document.getElementById("stage");
    var num=document.getElementById("num"),prev=document.getElementById("prev"),next=document.getElementById("next");
    if(CFG.generating)document.getElementById("genhint").hidden=false;
    var thumbs=slides.map(function(s,i){
      var t=document.createElement("div");t.className="th";
      var b=document.createElement("span");b.className="th-n";b.textContent=String(i+1);
      t.appendChild(b);t.appendChild(s.cloneNode(true));
      t.addEventListener("click",function(){go(i,true);});
      rail.appendChild(t);return t;
    });
    if(CFG.generating){
      var p=document.createElement("div");p.className="th-pending";
      p.textContent="下一页生成中…";rail.appendChild(p);
    }
    var page=-1;
    function go(i,user){
      var to=Math.max(0,Math.min(i,slides.length-1));
      if(to===page)return;
      page=to;
      stage.replaceChildren(slides[page].cloneNode(true));
      for(var k=0;k<thumbs.length;k++)thumbs[k].classList.toggle("on",k===page);
      num.textContent=(page+1)+" / "+slides.length;
      prev.disabled=page<=0;next.disabled=page>=slides.length-1;
      var th=thumbs[page];if(th&&th.scrollIntoView)th.scrollIntoView({block:"nearest"});
      try{parent.postMessage({type:"deck-page",channel:CFG.channel,page:page,user:!!user},"*");}catch(e){}
    }
    prev.addEventListener("click",function(){go(page-1,true);});
    next.addEventListener("click",function(){go(page+1,true);});
    stage.addEventListener("click",function(){go(page<slides.length-1?page+1:page,true);});
    document.addEventListener("keydown",function(e){
      if(e.key==="ArrowRight"||e.key==="ArrowDown"||e.key===" "||e.key==="PageDown"){e.preventDefault();go(page+1,true);}
      else if(e.key==="ArrowLeft"||e.key==="ArrowUp"||e.key==="PageUp"){e.preventDefault();go(page-1,true);}
      else if(e.key==="Home"){e.preventDefault();go(0,true);}
      else if(e.key==="End"){e.preventDefault();go(slides.length-1,true);}
    });
    go(CFG.follow?slides.length-1:CFG.page,false);
  })();
  <\/script></body></html>`;
}

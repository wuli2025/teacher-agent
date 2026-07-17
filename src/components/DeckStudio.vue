<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import { usePolling } from "../composables/usePolling";
import {
  Presentation,
  FileText,
  Loader,
  Sparkles,
  Upload,
  X,
  FolderOpen,
  ExternalLink,
  Monitor,
  FileType2,
  Zap,
  RefreshCw,
  Play,
  Send,
  SlidersHorizontal,
  ChevronsLeft,
  ChevronsRight,
  Wrench,
  Shapes,
  Image as ImageIcon,
  Table2,
  BarChart3,
} from "@lucide/vue";
import { useAppStore } from "../stores/app";
import { useChatStore } from "../stores/chat";
import { artifacts as artifactsApi, chat as chatApi, skills as skillsApi, type AttachedFile, type Skill } from "../tauri";
import { useFileDrop } from "../composables/useFileDrop";
import { groupedThemes, findTheme, type DeckTheme } from "../lib/deckThemes";
import {
  parseSpecLoose, setSpecText, applySlideOp, NATIVE_THEME_META, TRANSITIONS, BOX_ANIMS,
  type SlideSpec, type SlideOp, type FreeBox,
} from "../lib/slidesSpec";
import { useSpecEdit } from "../composables/useSpecEdit";
import { resolveSpecImages } from "../lib/specImages";
import DeckViewer from "./DeckViewer.vue";

// KeepAlive 的 include 按组件 name 匹配 → 显式命名:切去对话看进度再切回来,
// phase/convId/产物预览都还在,「继续修改」不丢
defineOptions({ name: "DeckStudio" });

const app = useAppStore();
const chat = useChatStore();

const STUDIO_PROJECT_NAME = "演示工坊";
const VIEW_KEY = "deck";

const outputMode = ref<"html" | "pptx">("pptx"); // 默认传统 PPT(.pptx)；点「网页 PPT」才切 html
const isPpt = computed(() => outputMode.value === "pptx");

type Phase = "config" | "generating" | "done";
const phase = ref<Phase>("config");
const error = ref<string | null>(null);
const convId = ref<string | null>(null);
const lastAction = ref<"create" | "revise">("create");

// ───────── 配置 ─────────
const contentText = ref("");
const charCount = computed(() => contentText.value.length);
const uploads = ref<AttachedFile[]>([]);
const uploading = ref(false);

const selectedTheme = ref("auto"); // 默认 AI 自由发挥(视内容而定,走高级路线)
const groups = groupedThemes(true);
const curTheme = computed<DeckTheme>(() => findTheme(selectedTheme.value));

const slideCount = ref(12);
const autoSlides = ref(true); // 默认 AI 按篇幅与重点自己决定页数
const aspect = ref<"16:9" | "4:3">("16:9");
// 原生引擎的 sldSz 硬编码 16:9(pptx_native.rs CANVAS_W/H)，传统 PPT 给不了 4:3——
// 之前 UI 照样让选、提示词照样写「画幅:4:3」，模型无从遵守，用户拿到的还是 16:9。
// 这里让 pptx 模式恒 16:9，4:3 只留给网页模式(模型自己写 HTML，能真兑现)。
const effAspect = computed(() => (isPpt.value ? "16:9" : aspect.value));
type Density = "auto" | "low" | "med" | "high";
const density = ref<Density>("auto");
const DENSITIES: { id: Density; label: string; hint: string }[] = [
  { id: "auto", label: "AI 决定", hint: "由 AI 按内容与重点自行把握，每页不必统一" },
  { id: "low", label: "极简", hint: "每页一句话 · 大字 · 演讲投影型" },
  { id: "med", label: "适中", hint: "标题 + 3-4 个要点 · 通用" },
  { id: "high", label: "信息密", hint: "图表/对比/多卡片 · 阅读型" },
];

// 自定义风格：在所选主题基础上叠加用户的风格描述
const customStyle = ref("");

// AI 配图(传统 PPT 专属):image-full / image-text 版式 + polaris-forge image 生图。
// 默认开 —— 课件的「好看」有一大半来自真配图,这也是原生引擎补上的最后一块能力。
// 网页模式没有 spec、不经引擎,该开关无意义,故只在 isPpt 时呈现。
const withImages = ref(true);

// 可叠加的「增强技能」——与对话框同源:list_skills 全量技能库,点选后随对话一起注入。
// polaris-deck-studio 本体恒注入,不在列表里重复展示。
const FALLBACK_SKILLS: Skill[] = [
  { id: "deep-research", name: "深度搜索", description: "先联网研究、把内容补全/查证", source: "official" },
  { id: "image-gen", name: "AI 配图", description: "为页面生成插图/配图", source: "official" },
  { id: "pdf", name: "读 PDF", description: "解析上传的 PDF 素材", source: "official" },
];
const skillsList = ref<Skill[]>([]);
const skillSearch = ref("");
async function loadSkills() {
  try {
    skillsList.value = await skillsApi.list();
  } catch {
    skillsList.value = FALLBACK_SKILLS;
  }
}
onMounted(loadSkills);
function filteredSkills(): Skill[] {
  const base = skillsList.value.filter((s) => s.id !== "polaris-deck-studio");
  const q = skillSearch.value.trim().toLowerCase();
  if (!q) return base;
  return base.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
}
const extraSkills = ref<string[]>([]);
function toggleSkill(id: string) {
  const i = extraSkills.value.indexOf(id);
  if (i >= 0) extraSkills.value.splice(i, 1);
  else extraSkills.value.push(id);
}
const skillIds = computed(() => ["polaris-deck-studio", ...extraSkills.value]);

const canGenerate = computed(
  () => (contentText.value.trim().length >= 10 || uploads.value.length > 0) && phase.value !== "generating"
);

// ───────── 上传 ─────────
async function addPaths(paths: string[]) {
  if (!paths.length) return;
  uploading.value = true;
  error.value = null;
  try {
    const res = await chatApi.attachFiles(convId.value ?? undefined, paths);
    for (const r of res) {
      if (r.ok && !uploads.value.some((u) => u.path === r.path)) uploads.value.push(r);
    }
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    uploading.value = false;
  }
}
async function pickFiles() {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const sel = await open({
      multiple: true,
      filters: [{ name: "素材", extensions: ["md", "txt", "docx", "pdf", "pptx", "html", "json", "csv"] }],
    });
    if (!sel) return;
    await addPaths(Array.isArray(sel) ? sel : [sel]);
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  }
}
function removeUpload(i: number) {
  uploads.value.splice(i, 1);
}
const { isOver: dropOver } = useFileDrop({
  active: () => app.view === VIEW_KEY && phase.value !== "generating",
  onDrop: addPaths,
});

// ───────── prompt ─────────
function densityText(): string {
  return DENSITIES.find((d) => d.id === density.value)?.hint ?? "";
}
function buildPrompt(): string {
  // 传统 PPT 与网页 PPT 的「主题」根本不是一回事:前者是引擎内置的 6 套色板(spec.theme),
  // 后者才是 themes.css 的 17 套 data-theme。auto 文案必须分开说,否则模型会拿 data-theme
  // 的 id 去填 spec.theme,引擎认不得 → 静默回退 minimal-white,用户选的主题全白选。
  const themeLine =
    selectedTheme.value === "auto"
      ? isPpt.value
        ? "AI 自由发挥 —— 从 SKILL.md 列出的 **6 套内置色板**里挑气质最贴合内容的一个填进 " +
          "`spec.theme`（课件默认优先浅色板，教室投影下深色底常糊）。版式混排要讲究：" +
          "按信息类型选 compare/timeline/stats/two-col，**通篇 bullets 视为失败**。"
        : "AI 自由发挥 —— 视觉方向由你根据内容的气质与场景自行决定：从 skill 的 themes.css 全部 " +
          "`data-theme` 主题里挑最贴合的一个，也可在所选主题之上自行调配色与版式。两条硬要求：" +
          "①**必须基于 polaris-deck-studio 的主题体系制作**，别脱离 skill 自起炉灶；" +
          "②观感**必须高级**——讲究的版式层级、克制的配色、超大标题与留白，一眼有设计感，拒绝平庸的默认观感。"
      : `${curTheme.value.name}（data-theme id=${selectedTheme.value}）`;
  const lines = [
    "请使用 polaris-deck-studio skill 制作一份演示。",
    "",
    "## 制作配置",
    `- 输出模式：${isPpt.value
      ? "pptx——传统 PPT（**原生可编辑**）。不写 deck.html，改为产出结构化 spec 文件 polaris.slides.json，再转换成真文本框/真形状、100% 可编辑的 .pptx（spec v1 格式见 SKILL.md「一、spec v1 格式」）"
      : "html（最终交付自包含单文件 .html）"}`,
    `- 主题：${themeLine}${isPpt.value && selectedTheme.value !== "auto" ? "——传统 PPT 走 spec 内置 6 色板(minimal-white/warm-paper/forest/tech-blue/ink-gold/deep-space)，从中选气质最接近所选主题的一个填 spec.theme" : ""}`,
    `- 画幅比例：${effAspect.value}${isPpt.value ? "（引擎固定，无需也无法调整）" : ""}`,
    autoSlides.value
      ? "- 页数：由你按篇幅与重点自行决定（内容多则多页、少则少页，重点处展开讲透，别硬凑也别硬砍）"
      : `- 页数：约 ${slideCount.value} 页（含封面与结尾，按内容增减）`,
    density.value === "auto"
      ? "- 信息密度：由你按内容与重点自行决定（重点页可密、过渡页可简，不必每页统一）"
      : `- 信息密度：${density.value} —— ${densityText()}`,
  ];
  if (customStyle.value.trim()) {
    lines.push(`- 自定义风格补充：${customStyle.value.trim()}（在所选主题基础上按此调整，与主题冲突时以此为准）`);
  }
  if (extraSkills.value.length) {
    const names = skillsList.value
      .filter((s) => extraSkills.value.includes(s.id))
      .map((s) => s.name)
      .join("、") || extraSkills.value.join("、");
    lines.push(`- 已启用增强技能：${names}——制作时按需调用（如先研究补全内容、为页面配图、解析素材）。`);
  }
  if (uploads.value.length) {
    lines.push("", "## 素材文件（先 Read 它们作为内容来源）");
    for (const u of uploads.value) lines.push(`- ${u.path}`);
  }
  lines.push("", "## 正文内容");
  lines.push(contentText.value.trim() || "（见上方素材文件）");
  lines.push("", "## 要求");
  if (isPpt.value) {
    lines.push(
      "- 严格按 SKILL.md：把内容编排成 polaris.slides.json（11 种版式：title/section/bullets/two-col/compare/stats/timeline/quote/closing/image-full/image-text，按信息类型混排别通篇 bullets，标题短、要点凝练，每页可带 notes 口播稿），**文件名必须是 polaris.slides.json**，存到产物目录。",
      "- 字段严格照 SKILL.md 的版式表——引擎只读表里列出的字段，写别的等于没写；compare/stats 最多 4 项、timeline 最多 5 步，超了会被丢弃，要拆页。",
      `- 配图：${withImages.value
        ? "**要配图**。顺序按 SKILL.md 2.5：先把完整 spec 写盘（image 字段直接写计划路径，实时预览立刻逐页点亮、缺图显示占位框），再用 `polaris-forge image --prompt=\"…\" --out=<产物目录>/img/xx.png --ratio=16:9` 把图生到那些路径（prompt 必须写「无文字」），最后才转换。宁少勿滥，2–5 张，只给「讲不清楚才需要看」的地方配。生图失败就改用无图版式、末尾说明，别卡住。"
        : "本次**不配图**，只用文字版式（不要写 image 字段，也不要调生图）。"}`,
      "- 然后用 Polaris 自带 CLI 转换：`polaris-forge spec-pptx --spec=<产物目录>/polaris.slides.json --out=<产物目录>/演示.pptx`（CLI 在 ~/Polaris/bin/，Windows 为 polaris-forge.exe）。",
      "- 若 CLI 不存在也不用慌：把 spec 按上述文件名存好即可，Polaris 会自动完成转换。**不要**因 CLI 缺失就改去写 HTML 或截图，那会毁掉可编辑性。",
    );
  } else {
    lines.push(
      "- 严格按 SKILL.md「五、网页 PPT 模式」：产出**自包含单文件** deck.html（所有 CSS/JS 内联、零外部依赖、双击即开），配色可参考技能目录 assets/themes.css 里的 data-theme 主题，用到哪套就把那套的变量内联进 <style>；翻页交互自己写（键盘左右/点击）。",
      "- 网页模式到此即可，无需导出。",
    );
  }
  lines.push("- 回答末尾用**绝对路径**列出最终产物文件。");
  return lines.join("\n");
}
function revisePrompt(text: string): string {
  return [
    "对刚才生成的这份演示做如下修改：",
    "",
    text.trim(),
    "",
    "## 要求",
    "- 直接在**原产物文件上修改**（保持文件名不变，别另起新文件），改完重新保存。",
    isPpt.value
      ? "- 传统 PPT：直接改 polaris.slides.json，再重新运行 `polaris-forge spec-pptx` 覆盖导出 .pptx；CLI 不可用则改完 spec 即可（Polaris 自动转换）。"
      : "- 网页模式：改完自包含 .html 即可。",
    "- 回答末尾用绝对路径列出更新后的产物文件。",
  ].join("\n");
}

// ───────── 动作 ─────────
async function ensureConv(): Promise<string> {
  let project = app.projects.find((p) => p.name === STUDIO_PROJECT_NAME);
  let projectId: string | null = project?.id ?? null;
  if (!projectId) {
    await app.createProject(STUDIO_PROJECT_NAME);
    projectId = app.currentProjectId;
    if (!projectId) throw new Error("创建演示工坊项目失败");
  }
  // navigate=false: 留在演示工坊视图就地展示生成进度/预览, 不跳 chat(否则本组件被卸载)。
  const conv = await app.createConversation(projectId, false);
  return conv.id;
}
function preview(): string {
  const t = contentText.value.trim();
  if (t) return t.slice(0, 24) + (t.length > 24 ? "…" : "");
  if (uploads.value.length) return uploads.value[0].name;
  return "未命名";
}

async function start() {
  if (!canGenerate.value) return;
  error.value = null;
  try {
    const id = await ensureConv();
    convId.value = id;
    if (uploads.value.length) {
      try {
        const res = await chatApi.attachFiles(id, uploads.value.map((u) => u.path));
        uploads.value = res.filter((r) => r.ok);
      } catch {
        /* 已在目录则忽略 */
      }
    }
    lastAction.value = "create";
    phase.value = "generating";
    specEdit.resetHistory(); // 新一份 spec:旧撤销栈作废
    const display = `PPT·${curTheme.value.name}：${preview()}`;
    await chat.send(id, buildPrompt(), display, undefined, {
      permissionMode: "auto_current",
      skillIds: skillIds.value,
      goal: `制作一份「${curTheme.value.name}」主题的${isPpt.value ? "PPT(.pptx)" : "网页PPT(.html)"}并保存到产物目录`,
    });
  } catch (e: any) {
    error.value = e?.message ?? String(e);
    phase.value = hasResult.value ? "done" : "config";
  }
}

const reviseText = ref("");
async function revise() {
  const text = reviseText.value.trim();
  if (!text || !convId.value) return;
  error.value = null;
  try {
    lastAction.value = "revise";
    phase.value = "generating";
    await chat.send(convId.value, revisePrompt(text), `✏️ 修改 PPT：${text.slice(0, 20)}`, undefined, {
      permissionMode: "auto_current",
      skillIds: skillIds.value,
      goal: "按要求修改已生成的演示并覆盖更新产物文件",
    });
    reviseText.value = "";
  } catch (e: any) {
    error.value = e?.message ?? String(e);
    phase.value = "done";
  }
}

function reset() {
  phase.value = "config";
  convId.value = null;
  outputs.value = [];
  previewHtml.value = "";
  previewSpec.value = null;
  previewKey.value = "";
  reviseText.value = "";
  specPages.value = 0;
  specTheme.value = "";
  specEdit.resetHistory(); // 换了一份 spec:旧撤销栈会把上一份的内容写回来
}

// ───────── 产物 + 实时预览 ─────────
const sending = computed(() => chat.isSending(convId.value));
// 生成遮罩上的「现在在干嘛」:取对话流最近一次工具调用(纯展示)
const lastToolHint = computed(() => {
  const arr = chat.bubblesFor(convId.value);
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].role === "tool") return arr[i].toolDetail || arr[i].tool || "";
  }
  return "";
});
const outputs = ref<{ path: string; name: string; modified: number }[]>([]);
const hasResult = computed(() => outputs.value.length > 0);
// 网页模式:自包含 html 喂 iframe。传统PPT模式:解析+内联图后的 spec 对象喂 DeckViewer。
const previewHtml = ref<string>("");
const previewSpec = ref<SlideSpec | null>(null);
const previewPath = ref<string>("");
// 内容防抖键:spec 文本没变就不重新 解析/内联图(几百KB的图重读一遍不便宜)
const previewKey = ref<string>("");
// 宽容解析出的页数(生成中逐页点亮的进度数字) + 当前 spec 主题(换肤高亮用)
const specPages = ref(0);
const specTheme = ref<string>("");
const outRe = computed(() =>
  isPpt.value ? /\.pptx$|polaris\.slides\.json$|\.html?$/i : /\.html?$/i
);

async function loadOutputs() {
  if (!convId.value) return;
  try {
    const list = await artifactsApi.list(convId.value);
    const hits = list
      .filter((e) => outRe.value.test(e.name))
      .map((e) => ({ path: e.path, name: e.name, modified: e.modified ?? 0 }));
    const want = isPpt.value ? ".pptx" : ".html";
    hits.sort((a, b) => Number(b.name.toLowerCase().endsWith(want)) - Number(a.name.toLowerCase().endsWith(want)));
    outputs.value = hits;
    await loadPreview();
  } catch {
    /* ignore */
  }
}
// 读取自包含 .html(网页模式)或 polaris.slides.json(传统PPT spec,确定性渲染)喂 iframe srcdoc。
// 不能按「路径没变就跳过」短路:继续修改是覆盖写原文件(文件名不变),必须重读;
// 但内容没变就不动 srcdoc,免得轮询期间 iframe 无谓重载、丢掉当前翻页。
async function loadPreview() {
  // 传统PPT模式下 spec 优先:导出引擎吃的是 spec,预览必须与导出同构(「预览即导出」)。
  // 模型顺手写的 html 只在没有 spec 时才当预览用。
  const specFirst = isPpt.value && outputs.value.some((o) => /polaris\.slides\.json$/i.test(o.name));
  const htmlOut = specFirst ? undefined : outputs.value.find((o) => /\.html?$/i.test(o.name));
  if (htmlOut) {
    try {
      const p = await artifactsApi.read(htmlOut.path);
      if (p?.text && (p.text !== previewHtml.value || htmlOut.path !== previewPath.value)) {
        previewHtml.value = p.text;
        previewPath.value = htmlOut.path;
        previewKey.value = htmlOut.path;
      }
    } catch {
      /* ignore */
    }
    return;
  }
  // 传统PPT(spec 路线):spec → DeckViewer 组件,与导出引擎同构(预览即导出)。
  // 生成中用宽容解析:模型边写边存的「半个 JSON」也能先亮出已完整的页(豆包式逐页点亮),
  // 不必等整份 spec 合法。翻页状态在 DeckViewer 里,这里只管喂最新的 spec 对象。
  const specOut = outputs.value.find((o) => /polaris\.slides\.json$/i.test(o.name));
  if (specOut && isPpt.value) {
    try {
      const p = await artifactsApi.read(specOut.path);
      if (!p?.text) return;
      const key = `${specOut.path}|${p.text}`;
      if (key === previewKey.value) return; // 内容没变:不重复解析/内联图
      const { spec } = parseSpecLoose(p.text);
      if (!spec || !Array.isArray(spec.slides) || !spec.slides.length) return;
      specPages.value = spec.slides.length;
      specTheme.value = String(spec.theme ?? "");
      await resolveSpecImages(spec);
      previewSpec.value = spec;
      previewPath.value = specOut.path;
      previewKey.value = key;
    } catch {
      /* ignore */
    }
  }
}

// 导出/转换目标 = 同目录**已有的那份 pptx**(模型做的、聊天里列为交付物的那个)。
// 绝不能写死成「演示.pptx」—— 那会新建一个重复文件,而用户认识的那份纹丝不动,
// 看起来就是「导出没保存」(真踩过)。没有已存在的 pptx 时才用兜底名。
function pptxTarget(specPath: string): string {
  const hit = outputs.value.find((o) => /\.pptx$/i.test(o.name));
  return hit ? hit.path : specPath.replace(/polaris\.slides\.json$/i, "课件.pptx");
}

// 兜底转换:模型只写了 spec(CLI 不在/没跑成)→ 桌面端自己调原生引擎出 .pptx。
// 「继续修改」只改 spec 不重转 pptx 是常态 → 按 mtime 判旧:pptx 比 spec 旧就重转,
// 否则用户拿到的导出永远停在第一版。
async function ensureSpecConverted() {
  if (!isPpt.value) return;
  const spec = outputs.value.find((o) => /polaris\.slides\.json$/i.test(o.name));
  if (!spec) return;
  const pptx = outputs.value.find((o) => /\.pptx$/i.test(o.name));
  if (pptx && pptx.modified >= spec.modified) return;
  try {
    await artifactsApi.specToPptx(spec.path, pptxTarget(spec.path));
    await loadOutputs();
  } catch (e: any) {
    error.value = `spec → PPT 转换失败：${e?.message ?? e}`;
  }
}

watch(sending, async (now, before) => {
  if (before && !now && phase.value === "generating") {
    await loadOutputs();
    await ensureSpecConverted();
    phase.value = "done"; // DeckViewer 的 generating prop 随之落下:撤占位、回封面
  }
});

// ───────── 完成态动作:导出 / 换肤 ─────────
const specOut = computed(() => outputs.value.find((o) => /polaris\.slides\.json$/i.test(o.name)));
const exporting = ref(false);
const exported = ref<string | null>(null); // 刚导出的文件名(回执,明说存到哪)
// 用户主动点「导出」= 无条件重转(mtime 短路只给轮询兜底用,主动导出必须拿到最新内容),
// **覆盖用户认识的那份 pptx** 并在资源管理器里选中它 —— 让「导出」这个词兑现。
async function exportPptx() {
  const spec = specOut.value;
  if (!spec || exporting.value) return;
  exporting.value = true;
  error.value = null;
  exported.value = null;
  try {
    const out = pptxTarget(spec.path);
    await artifactsApi.specToPptx(spec.path, out);
    await loadOutputs();
    exported.value = out.replace(/\\/g, "/").split("/").pop() ?? "";
    await artifactsApi.reveal(out); // 在资源管理器里定位成品
  } catch (e: any) {
    error.value = `导出 PPTX 失败：${e?.message ?? e}`;
  } finally {
    exporting.value = false;
  }
}
// 所有对 spec 的改动(改字/页面增删重排/备注/换肤)共用一个事务:
// 读盘 → 改对象 → 写盘 → 刷预览 → 重转 pptx,并自动记撤销栈。
const specEdit = useSpecEdit({
  specPath: () => specOut.value?.path ?? null,
  pptxTarget: (p) => pptxTarget(p),
  // spec 文本变了 → previewKey 失配 → 播放器按新内容重排;再拉一次列表让 mtime 跟上
  onWritten: () => loadOutputs(),
  onError: (m) => (error.value = m),
});

// 点字直改:只改文字不动版式。autofit 会按新内容重算字号,所以用户改不坏排版。
function onDeckEdit(slideIdx: number, path: string, value: string) {
  error.value = null;
  void specEdit.mutate((obj) => {
    if (!obj?.slides?.[slideIdx]) throw new Error("spec 结构不符");
    return setSpecText(obj.slides[slideIdx], path, value); // 没改动/路径不符:静默跳过
  });
}
// 页面级操作:加页/删页/复制/重排/备注 —— 纯 spec 变换,每页仍各自 autofit。
function onDeckOp(op: SlideOp) {
  error.value = null;
  void specEdit.mutate((obj) => applySlideOp(obj, op));
}

// 换肤不重新生成:spec.theme 是引擎/预览共用的色板 id,本地改字段→预览秒变→后台重转 pptx。
// 内容一字不动 —— 这正是「版式态」的红利(豆包没有重排引擎,我们有)。
const skinning = ref<string | null>(null);
async function applyTheme(id: string) {
  if (!specOut.value || skinning.value || phase.value === "generating") return;
  skinning.value = id;
  error.value = null;
  await specEdit.mutate((obj) => {
    if (obj.theme === id) return false;
    obj.theme = id;
    return true;
  });
  skinning.value = null;
}

// 共享轮询:页面隐藏自动暂停、回前台立即补拉、卸载自动清理。3s——逐页点亮的跟手感。
const poller = usePolling(loadOutputs, 3000);
watch(phase, (p) => {
  if (p === "generating") poller.start();
  else poller.stop();
});

function openConv() {
  if (convId.value) app.setView("chat");
}
function openDir() {
  const proj = app.projects.find((p) => p.name === STUDIO_PROJECT_NAME);
  if (proj) app.openProjectDir(proj.id);
}
function openFile(path: string) {
  artifactsApi.openExternal(path);
}
const pptxOut = computed(() => outputs.value.find((o) => /\.pptx$/i.test(o.name)));

// ───────── 豆包式工作区(生成开始后的双栏形态) ─────────
// 左=真对话流(chat store 的消息/工具调用实时滚动,底部输入=继续修改),右=完整编辑器。
// 配置首屏(showConfig)保持原样,点「生成」即切换,reset() 回配置。
const showConfig = computed(() => phase.value === "config" && !hasResult.value);
const bubbles = computed(() => chat.bubblesFor(convId.value));
const chatCollapsed = ref(false);
// 窗口收窄到 1200px 以下:对话流自动折叠成细条(规划 M1 验收项),拉宽自动展开。
// 只在跨越阈值时改状态,不覆盖用户在宽窗口下的手动折叠。
const narrowMq = window.matchMedia("(max-width: 1199px)");
function onNarrowChange(e: MediaQueryListEvent | MediaQueryList) {
  chatCollapsed.value = e.matches;
}
onMounted(() => {
  if (narrowMq.matches) chatCollapsed.value = true;
  narrowMq.addEventListener("change", onNarrowChange);
});
onBeforeUnmount(() => narrowMq.removeEventListener("change", onNarrowChange));
const chatScrollEl = ref<HTMLElement | null>(null);
// 新气泡/流式增量都贴底跟随(用户手动上翻超过一屏就不抢)
watch(
  [() => bubbles.value.length, () => bubbles.value[bubbles.value.length - 1]?.text?.length ?? 0],
  async () => {
    await nextTick();
    const el = chatScrollEl.value;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < el.clientHeight;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }
);
const viewerRef = ref<InstanceType<typeof DeckViewer> | null>(null);
const panelOpen = ref(true);
const deckTitle = computed(
  () => pptxOut.value?.name ?? specOut.value?.name ?? outputs.value[0]?.name ?? "演示文稿"
);
const LAYOUT_NAMES: Record<string, string> = {
  title: "封面", section: "章节", bullets: "要点", "two-col": "两栏", compare: "对比",
  stats: "数据", timeline: "时间线", quote: "引用", closing: "结尾",
  "image-full": "全幅图", "image-text": "图文", freeform: "自由版式",
};
const curLayoutName = computed(() => {
  const i = viewerRef.value?.page ?? 0;
  const l = String(previewSpec.value?.slides?.[i]?.layout ?? "bullets");
  return LAYOUT_NAMES[l] ?? l;
});
function fmtClock(unixSec: number): string {
  if (!unixSec) return "";
  const d = new Date(unixSec * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ───────── 自由编辑:插入元素 + 选中元素属性(格式面板) ─────────
const freeEditing = computed(() => !!viewerRef.value?.freeEdit && !!viewerRef.value?.curIsFreeform);
const selIdx = computed<number | null>(() => (viewerRef.value?.selBoxIdx as number | null) ?? null);
const selBox = computed<FreeBox | null>(() => {
  const i = selIdx.value;
  if (i === null) return null;
  const boxes = (previewSpec.value as any)?.slides?.[viewerRef.value?.page ?? 0]?.boxes;
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
  onDeckOp({ kind: "box-set", index: viewerRef.value?.page ?? 0, box: i, patch });
}
function numPatch(key: keyof FreeBox, e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  if (Number.isFinite(v)) patchSel({ [key]: Math.round(v) } as Partial<FreeBox>);
}
/** 色板词下拉(ink/muted/accent/白/黑)+ 自定义 hex。存进 spec 的是词或 #hex,换肤仍生效。 */
const COLOR_WORDS = [
  { id: "ink", name: "正文色" }, { id: "muted", name: "次要色" }, { id: "accent", name: "强调色" },
  { id: "card", name: "卡片色" }, { id: "white", name: "白" }, { id: "black", name: "黑" },
];
function colorPatch(key: "color" | "fill", e: Event) {
  const v = (e.target as HTMLSelectElement).value;
  if (v === "__custom") return; // 等 hex 输入框落值
  patchSel({ [key]: v || undefined } as Partial<FreeBox>);
}
function hexPatch(key: "color" | "fill", e: Event) {
  const v = (e.target as HTMLInputElement).value.trim();
  if (/^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(v)) patchSel({ [key]: v.startsWith("#") ? v : `#${v}` } as Partial<FreeBox>);
}

// 插入元素(落画布中央,插完在覆盖层里直接拖)
const shapeMenu = ref(false);
function insertBox(box: FreeBox) {
  shapeMenu.value = false;
  viewerRef.value?.addBox(box);
}
function insertText() {
  insertBox({ type: "text", x: 490, y: 320, w: 300, h: 80, text: "双击编辑文字", size: 20, color: "ink" });
}
const SHAPES: { name: string; make: () => FreeBox }[] = [
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
// 表格:豆包式 7×6 格子选择器。首行默认表头,插完双击任意格直接改字。
const tableMenu = ref(false);
const tableHover = ref<[number, number]>([0, 0]); // [rows, cols]
function insertTable(rows: number, cols: number) {
  tableMenu.value = false;
  const body = Array.from({ length: rows - 1 }, () => Array(cols).fill("内容"));
  const head = Array.from({ length: cols }, (_, c) => `列 ${c + 1}`);
  const h = Math.min(460, 48 * rows);
  insertBox({ type: "table", x: 240, y: 190, w: 800, h, rows: [head, ...body], header: true, size: 14 });
}
// 图表:四种类型插入 + 豆包式底部数据编辑弹层(改完实时重绘,导出为形状组)
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
/** 数据编辑草稿(打开时深拷贝,点「应用」才 patch —— 一次编辑 = 一步撤销)。 */
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
// 元素动画(选中盒子的 anim 字段;引擎写真 p:timing,放映 CSS 同构)
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
/** 本页动画顺序列表(与放映的步骤模型同源:click 组升序在前,anim 盒按序在后)。 */
const animSeq = computed(() => {
  const sl = (previewSpec.value as any)?.slides?.[viewerRef.value?.page ?? 0];
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

// 页面切换动画(引擎 <p:transition> + 放映 CSS 同构)
const curTransition = computed(
  () => (previewSpec.value as any)?.slides?.[viewerRef.value?.page ?? 0]?.transition ?? null
);
function setTransition(patch: { type?: string; dir?: string; speed?: string }) {
  const pg = viewerRef.value?.page ?? 0;
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
  onDeckOp({ kind: "transition", index: viewerRef.value?.page ?? 0, value: cur ? { ...cur } : null, all: true });
}
const TR_DIRS = [
  { id: "up", name: "从底部" }, { id: "down", name: "从顶部" },
  { id: "left", name: "从右侧" }, { id: "right", name: "从左侧" },
];
const TR_SPEEDS = [
  { id: "fast", name: "快" }, { id: "med", name: "中" }, { id: "slow", name: "慢" },
];

// 选中表格的行列增删(面板按钮;深拷贝改完整体 patch,一次改动 = 一步撤销)
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

function fillDemo() {
  contentText.value =
    "主题：Polaris 是什么。一句话——把 AI 变成你的创作生产线。" +
    "三个要点：① 对话即创作，文案/PPT/视频一站出；② 知识库沉淀，越用越懂你；③ 全本地，数据不出门。" +
    "结尾：现在就开始，让未来替你打工。";
}
</script>

<template>
  <div class="dk">
    <!-- ═══════ 配置首屏(生成前) ═══════ -->
    <template v-if="showConfig">
    <header class="dk-head">
      <Presentation :size="19" :stroke-width="1.7" class="dk-icon" />
      <h1 class="dk-title">PPT 演示</h1>
      <span class="dk-sub">左侧配置 · 中间实时预览 · 底部继续修改</span>
      <div class="dk-toggle">
        <button :class="{ on: isPpt }" @click="outputMode = 'pptx'"><FileType2 :size="13" /> 传统 PPT</button>
        <button :class="{ on: !isPpt }" @click="outputMode = 'html'"><Monitor :size="13" /> 网页 PPT</button>
      </div>
    </header>

    <!-- 工作台：左配置 + 右主区 -->
    <div class="dk-work">
      <!-- 左：配置 -->
      <aside class="dk-side">
        <div class="dk-side-sec">
          <div class="dk-side-title">主题风格</div>
          <div class="dk-preview-mini" :style="{ background: curTheme.bg, color: curTheme.text }">
            <span :style="{ color: curTheme.accent, fontFamily: curTheme.font === 'serif' ? 'var(--serif)' : 'inherit' }">{{ curTheme.name }}</span>
          </div>
          <template v-for="g in groups" :key="g.group">
            <div class="dk-group-label">{{ g.group }}</div>
            <div class="dk-themes">
              <button
                v-for="t in g.items"
                :key="t.id"
                class="dk-theme"
                :class="{ active: selectedTheme === t.id }"
                :title="t.name"
                @click="selectedTheme = t.id"
              >
                <span class="dk-theme-sw" :style="{ background: t.bg }">
                  <Sparkles v-if="t.id === 'auto'" :size="12" :style="{ color: t.accent }" />
                  <span v-else class="dk-theme-acc" :style="{ background: t.accent }"></span>
                </span>
                <span class="dk-theme-name">{{ t.name }}</span>
              </button>
            </div>
          </template>
        </div>

        <div class="dk-side-sec">
          <div class="dk-side-title">参数</div>
          <div class="dk-lab-row">
            <label class="dk-lab">页数 <b v-if="!autoSlides">≈ {{ slideCount }}</b><b v-else>AI 决定</b></label>
            <label class="dk-check"><input type="checkbox" v-model="autoSlides" /> AI 决定</label>
          </div>
          <input type="range" min="4" max="30" step="1" v-model.number="slideCount" class="dk-range" :disabled="autoSlides" />
          <label class="dk-lab">画幅</label>
          <div class="dk-seg">
            <button :class="{ on: effAspect === '16:9' }" @click="aspect = '16:9'">16:9</button>
            <button
              :class="{ on: effAspect === '4:3' }"
              :disabled="isPpt"
              :title="isPpt ? '传统 PPT 由原生引擎渲染，固定 16:9；需要 4:3 请用网页 PPT 模式' : ''"
              @click="aspect = '4:3'"
            >
              4:3
            </button>
          </div>
          <span v-if="isPpt" class="dk-note">传统 PPT 固定 16:9（引擎画幅）。</span>
          <label class="dk-lab">信息密度</label>
          <div class="dk-seg">
            <button v-for="d in DENSITIES" :key="d.id" :class="{ on: density === d.id }" @click="density = d.id">{{ d.label }}</button>
          </div>
          <span class="dk-note">{{ densityText() }}</span>
          <template v-if="isPpt">
            <label class="dk-lab-row" style="margin-top: 8px">
              <span class="dk-lab" style="margin: 0">AI 配图</span>
              <label class="dk-check"><input type="checkbox" v-model="withImages" /> 开启</label>
            </label>
            <span class="dk-note">
              为封面与关键讲解页生成真插图（MiniMax），嵌进 PPT 后仍可选中/换图。关掉则纯文字，出片更快。
            </span>
          </template>
        </div>

        <div class="dk-side-sec">
          <div class="dk-side-title">自定义风格 · 可选</div>
          <textarea
            v-model="customStyle"
            class="dk-custom"
            rows="2"
            placeholder="用自己的话补充风格：如「黑金高级、圆角大卡片、衬线大标题」「极简留白、莫兰迪色」…会叠加在所选主题上"
          />
        </div>

        <div class="dk-side-sec">
          <div class="dk-side-title">增强技能 · 可选</div>
          <input v-model="skillSearch" class="dk-skill-search" type="text" placeholder="搜索技能…" />
          <div class="dk-skill-list">
            <button
              v-for="s in filteredSkills()"
              :key="s.id"
              class="dk-skill-item"
              :class="{ on: extraSkills.includes(s.id) }"
              :title="s.description"
              @click="toggleSkill(s.id)"
            >
              <span class="dk-skill-name">{{ s.name }}</span>
              <span class="dk-skill-desc">{{ s.description }}</span>
            </button>
            <span v-if="!filteredSkills().length" class="dk-note">没有匹配的技能</span>
          </div>
          <span class="dk-note">
            与对话框同一个技能库。点选叠加，AI 制作时会按需调用（如先联网补全内容、为页面配图）。
          </span>
        </div>

      </aside>

      <!-- 右：内容输入 + 生成按钮 -->
      <main class="dk-main">
        <div class="dk-canvas" :class="{ drop: dropOver }">
          <div class="dk-input">
            <h3 class="dk-input-title"><FileText :size="16" :stroke-width="1.7" /> 演示内容</h3>
            <textarea
              v-model="contentText"
              class="dk-textarea"
              placeholder="把要做成演示的文案/大纲贴在这里，或上传文件作为素材，然后点下方「生成」…"
            />
            <div class="dk-input-foot">
              <span :class="{ warn: charCount < 10 && uploads.length === 0 }">
                {{ charCount }} 字{{ charCount < 10 && uploads.length === 0 ? " · 至少 10 字或上传文件" : "" }}
              </span>
              <div class="dk-input-btns">
                <button class="dk-ghost" @click="fillDemo">填入示例</button>
                <button class="dk-ghost" :disabled="uploading" @click="pickFiles">
                  <Loader v-if="uploading" :size="12" class="spin" /><Upload v-else :size="12" /> 上传
                </button>
              </div>
            </div>
            <div v-if="uploads.length" class="dk-files">
              <div v-for="(u, i) in uploads" :key="u.path" class="dk-file">
                <FileText :size="12" /><span class="dk-file-name">{{ u.name }}</span>
                <button class="dk-file-x" @click="removeUpload(i)"><X :size="12" /></button>
              </div>
            </div>
          </div>
        </div>
        <div class="dk-composer">
          <div v-if="error" class="dk-error">{{ error }}</div>
          <button class="dk-primary" :disabled="!canGenerate || phase === 'generating'" @click="start">
            <Zap :size="16" :stroke-width="1.9" /> 一键生成{{ isPpt ? "传统 PPT" : "网页 PPT" }}
          </button>
          <span class="dk-note">在「演示工坊」项目下新建对话注入技能全自动制作。</span>
        </div>
      </main>
    </div>
    </template>

    <!-- ═══════ 豆包式工作区(生成开始后):左对话流 + 右完整编辑器 ═══════ -->
    <div v-else class="dk-ws">
      <!-- 左:真对话流。AI 的分析/工具调用/完成卡片实时滚动,底部输入=继续修改 -->
      <aside class="dk-chat" :class="{ folded: chatCollapsed }">
        <div class="dk-chat-head">
          <template v-if="!chatCollapsed">
            <span class="dk-chat-title">对话</span>
            <button class="dk-chat-ic" title="在完整对话页打开" @click="openConv"><ExternalLink :size="13" /></button>
          </template>
          <button class="dk-chat-ic" :title="chatCollapsed ? '展开对话' : '收起对话'" @click="chatCollapsed = !chatCollapsed">
            <component :is="chatCollapsed ? ChevronsRight : ChevronsLeft" :size="14" />
          </button>
        </div>
        <template v-if="!chatCollapsed">
          <div ref="chatScrollEl" class="dk-chat-scroll">
            <div
              v-for="(b, i) in bubbles"
              :key="i"
              class="dk-bb"
              :class="[b.role, { err: b.err }]"
            >
              <template v-if="b.role === 'tool'">
                <Wrench :size="11" class="dk-bb-wr" />
                <span class="dk-bb-tool">{{ b.tool }}</span>
                <span v-if="b.toolDetail" class="dk-bb-detail">{{ b.toolDetail }}</span>
              </template>
              <template v-else>{{ b.text }}</template>
            </div>
            <div v-if="sending" class="dk-bb assistant dk-typing"><Loader :size="12" class="spin" /> 正在工作…</div>
            <!-- 完成卡片:豆包式回执,点击打开成品 -->
            <button v-if="phase === 'done' && pptxOut" class="dk-done-card" @click="openFile(pptxOut.path)">
              <FileType2 :size="16" />
              <span class="dk-done-name">{{ pptxOut.name }}</span>
              <span class="dk-done-time">创建 {{ fmtClock(pptxOut.modified) }}</span>
            </button>
          </div>
          <div class="dk-chat-in">
            <textarea
              v-model="reviseText"
              rows="2"
              placeholder="发消息继续修改：第 2 页换三栏 / 换深空主题 / 再加一页总结…"
              :disabled="phase === 'generating'"
              @keydown.enter.exact.prevent="revise"
            />
            <button class="dk-send" :disabled="!reviseText.trim() || phase === 'generating'" title="发送 (Enter)" @click="revise">
              <Send :size="15" />
            </button>
          </div>
        </template>
      </aside>

      <!-- 右:完整编辑器(标题栏 / 插入工具条 / 舞台+格式面板) -->
      <main class="dk-ed">
        <div class="dk-ed-title">
          <Presentation :size="17" :stroke-width="1.7" class="dk-icon" />
          <span class="dk-ed-name" :title="deckTitle">{{ deckTitle }}</span>
          <span v-if="phase === 'generating'" class="dk-ed-live">
            <Loader :size="12" class="spin" />
            {{ lastAction === 'revise' ? '正在按修改重做' : '正在生成' }}<template v-if="specPages"> · 已出 {{ specPages }} 页</template>
          </span>
          <span v-else-if="exported" class="dk-exported">已保存到 {{ exported }}</span>
          <div class="dk-ed-acts">
            <button class="dk-ghost" :disabled="!previewSpec" title="全屏放映 (F5)" @click="viewerRef?.present()">
              <Play :size="13" /> 放映
            </button>
            <button v-if="isPpt && specOut" class="dk-primary sm" :disabled="exporting || phase === 'generating'" @click="exportPptx">
              <Loader v-if="exporting" :size="13" class="spin" /><FileType2 v-else :size="13" />
              {{ exporting ? "导出中…" : "导出 PPTX" }}
            </button>
            <button class="dk-ghost" title="打开产物目录" @click="openDir"><FolderOpen :size="13" /> 目录</button>
            <button class="dk-ghost" title="放弃当前，回到配置重新开始" @click="reset"><RefreshCw :size="13" /></button>
          </div>
        </div>
        <div v-if="isPpt && previewSpec" class="dk-ed-tools">
          <!-- 插入:只在自由编辑态出现(语义页由 autofit 管排版,没有可插的自由元素) -->
          <template v-if="freeEditing && phase === 'done'">
            <button class="dk-tool" title="插入文本框" @click="insertText"><FileText :size="13" /> 文本</button>
            <span class="dk-shape-wrap">
              <button class="dk-tool" :class="{ on: shapeMenu }" title="插入图形" @click="shapeMenu = !shapeMenu">
                <Shapes :size="13" /> 图形
              </button>
              <div v-if="shapeMenu" class="dk-shape-menu">
                <button v-for="s in SHAPES" :key="s.name" @click="insertBox(s.make())">{{ s.name }}</button>
              </div>
            </span>
            <button class="dk-tool" title="插入本地图片" @click="insertImage"><ImageIcon :size="13" /> 图片</button>
            <span class="dk-shape-wrap">
              <button class="dk-tool" :class="{ on: chartMenu }" title="插入图表（导出为可选中的形状组）" @click="chartMenu = !chartMenu">
                <BarChart3 :size="13" /> 图表
              </button>
              <div v-if="chartMenu" class="dk-shape-menu">
                <button v-for="c in CHART_TYPES" :key="c.id" @click="insertChart(c.id)">{{ c.name }}</button>
              </div>
            </span>
            <span class="dk-shape-wrap">
              <button class="dk-tool" :class="{ on: tableMenu }" title="插入表格（PowerPoint 里仍是真表格）" @click="tableMenu = !tableMenu">
                <Table2 :size="13" /> 表格
              </button>
              <div v-if="tableMenu" class="dk-tbl-pick" @mouseleave="tableHover = [0, 0]">
                <div class="dk-tbl-lab">插入表格 <b>{{ tableHover[0] || "-" }} × {{ tableHover[1] || "-" }}</b></div>
                <div class="dk-tbl-grid">
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
            <span class="dk-tools-sep" />
          </template>
          <button class="dk-tool" :class="{ on: panelOpen }" title="格式面板" @click="panelOpen = !panelOpen">
            <SlidersHorizontal :size="13" /> 格式
          </button>
          <div class="dk-zoom">
            <button title="缩小" @click="viewerRef?.setZoom((viewerRef?.zoom ?? 100) - 10)">−</button>
            <span>{{ viewerRef?.zoom ?? 100 }}%</span>
            <button title="放大" @click="viewerRef?.setZoom((viewerRef?.zoom ?? 100) + 10)">+</button>
          </div>
        </div>
        <div v-if="error" class="dk-error ws">{{ error }}</div>
        <!-- 图表数据编辑弹层(豆包式底部表格):草稿制,点「应用」才落盘 = 一步撤销 -->
        <div v-if="chartDraft" class="dk-chart-sheet" @click.self="chartDraft = null">
          <div class="dk-chart-card">
            <div class="dk-chart-head">
              编辑图表数据
              <button class="dk-chat-ic" title="关闭" @click="chartDraft = null"><X :size="14" /></button>
            </div>
            <div class="dk-chart-grid-wrap">
              <table class="dk-chart-grid">
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
                      <button class="dk-chat-ic" title="删这一行" :disabled="chartDraft.labels.length <= 1" @click="chartDelLabel(li)"><X :size="12" /></button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="dk-chart-acts">
              <button class="dk-ghost" @click="chartAddLabel">+ 行</button>
              <button class="dk-ghost" :disabled="chartDraft.series.length >= 6" @click="chartAddSeries">+ 系列</button>
              <button class="dk-ghost" :disabled="chartDraft.series.length <= 1" @click="chartDelSeries">− 系列</button>
              <span style="flex:1"></span>
              <button class="dk-ghost" @click="chartDraft = null">取消</button>
              <button class="dk-primary sm" @click="applyChartEdit">应用</button>
            </div>
          </div>
        </div>
        <div class="dk-ed-body">
          <div class="dk-ed-stage">
            <!-- 生成中第一页还没落地:轻量等待(左栏对话流已在讲进度) -->
            <div v-if="phase === 'generating' && !previewHtml && !previewSpec" class="dk-wait">
              <Loader :size="30" class="spin" />
              <span class="dk-wait-t">{{ lastAction === 'revise' ? '正在按修改重做…' : '正在构思大纲与页面…' }}</span>
              <span v-if="lastToolHint" class="dk-tool-hint">{{ lastToolHint }}</span>
            </div>
            <!-- 传统PPT:组件播放器(与导出同构;不走 iframe——Tauri CSP 拦 srcdoc 内联脚本) -->
            <DeckViewer
              v-else-if="isPpt && previewSpec"
              ref="viewerRef"
              class="dk-viewer"
              :spec="previewSpec"
              :generating="phase === 'generating'"
              :editable="phase === 'done'"
              :can-undo="specEdit.canUndo.value"
              @edit="onDeckEdit"
              @op="onDeckOp"
              @undo="specEdit.undo()"
            />
            <!-- 网页PPT:自包含 html 喂 iframe。安全: 只给 allow-scripts,绝不加 allow-same-origin -->
            <iframe v-else-if="previewHtml" class="dk-frame" :srcdoc="previewHtml" sandbox="allow-scripts"></iframe>
            <div v-else class="dk-frame-empty">
              <Monitor :size="30" />
              <span>{{ phase === 'generating' ? '预览加载中…可在目录查看' : '预览没有加载出来' }}</span>
              <button v-if="phase !== 'generating'" class="dk-ghost" @click="loadOutputs">重新加载预览</button>
            </div>
          </div>
          <!-- 右:格式面板(文档信息 + 选中元素属性 + 换肤 + 产物) -->
          <aside v-if="panelOpen && isPpt && previewSpec" class="dk-panel">
            <!-- 选中元素:属性直写 spec(每次改动 = 一步撤销,预览与导出同步) -->
            <div v-if="selBox" class="dk-panel-sec">
              <div class="dk-panel-title">元素 · {{ selBoxName }}</div>
              <div class="dk-xywh" v-if="!selIsLine">
                <label>X<input type="number" :value="selBox.x ?? 0" @change="numPatch('x', $event)" /></label>
                <label>Y<input type="number" :value="selBox.y ?? 0" @change="numPatch('y', $event)" /></label>
                <template v-if="selBox.r === undefined">
                  <label>宽<input type="number" :value="selBox.w ?? 100" @change="numPatch('w', $event)" /></label>
                  <label>高<input type="number" :value="selBox.h ?? 100" @change="numPatch('h', $event)" /></label>
                </template>
                <label v-else>半径<input type="number" :value="selBox.r" @change="numPatch('r', $event)" /></label>
              </div>
              <label v-if="selRotatable" class="dk-prop-row">
                旋转
                <input type="number" min="0" max="359" :value="selBox.rot ?? 0" @change="numPatch('rot', $event)" />
              </label>
              <label v-if="!selIsImage" class="dk-prop-row">
                不透明
                <input type="number" min="0" max="100" :value="selBox.opacity ?? 100" @change="numPatch('opacity', $event)" />
              </label>
              <template v-if="selIsText">
                <label class="dk-prop-row">
                  字号
                  <input type="number" min="4" max="400" :value="selBox.size ?? 18" @change="numPatch('size', $event)" />
                </label>
                <div class="dk-seg">
                  <button :class="{ on: !!selBox.bold }" title="加粗" @click="patchSel({ bold: !selBox.bold || undefined })"><b>B</b></button>
                  <button :class="{ on: !!selBox.italic }" title="斜体" @click="patchSel({ italic: !selBox.italic || undefined })"><i>I</i></button>
                </div>
                <div class="dk-seg">
                  <button v-for="a in [['left','左'],['center','中'],['right','右']]" :key="a[0]"
                    :class="{ on: (selBox.align ?? 'left') === a[0] || (a[0]==='left' && !selBox.align) }"
                    @click="patchSel({ align: a[0] === 'left' ? undefined : a[0] })">{{ a[1] }}</button>
                </div>
                <div class="dk-seg">
                  <button :class="{ on: !selBox.font }" @click="patchSel({ font: undefined })">黑体</button>
                  <button :class="{ on: selBox.font === 'serif' }" @click="patchSel({ font: 'serif' })">衬线</button>
                </div>
              </template>
              <label v-if="selIsLine" class="dk-prop-row">
                线宽
                <input type="number" min="1" max="40" :value="selBox.width ?? 3" @change="numPatch('width', $event)" />
              </label>
              <template v-if="selIsChart">
                <label class="dk-prop-row">
                  类型
                  <select :value="selBox.chartType" @change="patchSel({ chartType: ($event.target as HTMLSelectElement).value })">
                    <option v-for="c in CHART_TYPES" :key="c.id" :value="c.id">{{ c.name }}</option>
                  </select>
                </label>
                <label class="dk-prop-row">
                  标题
                  <input type="text" :value="selBox.title ?? ''" @change="patchSel({ title: ($event.target as HTMLInputElement).value || undefined })" />
                </label>
                <button class="dk-ghost" style="justify-content:center" @click="openChartEditor">编辑数据</button>
                <span class="dk-note">导出为形状组（可选中改色，PowerPoint 里不能改数）。</span>
              </template>
              <template v-if="selIsTable">
                <div class="dk-panel-row"><span>表格</span><b>{{ selBox.rows?.length ?? 0 }} 行 × {{ selBox.rows?.[0]?.length ?? 0 }} 列</b></div>
                <div class="dk-seg">
                  <button title="加一行" @click="tableAddRow">行 +</button>
                  <button title="删末行" @click="tableDelRow">行 −</button>
                  <button title="加一列" @click="tableAddCol">列 +</button>
                  <button title="删末列" @click="tableDelCol">列 −</button>
                </div>
                <label class="dk-check"><input type="checkbox" :checked="selBox.header !== false" @change="patchSel({ header: ($event.target as HTMLInputElement).checked ? undefined : false })" /> 首行作表头</label>
                <label class="dk-prop-row">
                  字号
                  <input type="number" min="6" max="40" :value="selBox.size ?? 14" @change="numPatch('size', $event)" />
                </label>
                <span class="dk-note">双击任意单元格直接改字。</span>
              </template>
              <label class="dk-prop-row">
                颜色
                <select :value="COLOR_WORDS.some(c => c.id === selBox!.color) ? selBox!.color : (selBox!.color ? '__custom' : 'ink')" @change="colorPatch('color', $event)">
                  <option v-for="c in COLOR_WORDS" :key="c.id" :value="c.id">{{ c.name }}</option>
                  <option value="__custom">自定义…</option>
                </select>
              </label>
              <input
                v-if="selBox.color && !COLOR_WORDS.some(c => c.id === selBox!.color)"
                class="dk-hex" type="text" placeholder="#RRGGBB" :value="selBox.color" @change="hexPatch('color', $event)"
              />
            </div>
            <!-- 元素动画:进入/强调/退出 + 触发/时长/方向(放映与导出 PowerPoint 均生效) -->
            <div v-if="selBox" class="dk-panel-sec">
              <div class="dk-panel-title">元素动画</div>
              <button class="dk-tr-none" :class="{ on: !selAnim }" @click="setAnim('')">无动画</button>
              <template v-for="g in ANIM_GROUPS" :key="g.cls">
                <div class="dk-group-label">{{ g.name }}</div>
                <div class="dk-tr-grid three">
                  <button
                    v-for="a in BOX_ANIMS.filter(a => a.cls === g.cls)"
                    :key="a.id"
                    :class="{ on: selAnim?.effect === a.id }"
                    @click="setAnim(a.id)"
                  >{{ a.name }}</button>
                </div>
              </template>
              <template v-if="selAnim">
                <label class="dk-prop-row">
                  触发
                  <select :value="selAnim.trigger ?? 'click'" @change="animField({ trigger: ($event.target as HTMLSelectElement).value })">
                    <option v-for="t in ANIM_TRIGGERS" :key="t.id" :value="t.id">{{ t.name }}</option>
                  </select>
                </label>
                <label class="dk-prop-row">
                  时长 ms
                  <input type="number" min="50" max="10000" step="50" :value="selAnim.dur ?? 500"
                    @change="animField({ dur: Number(($event.target as HTMLInputElement).value) || 500 })" />
                </label>
                <div v-if="BOX_ANIMS.find(a => a.id === selAnim!.effect)?.hasDir" class="dk-seg">
                  <button v-for="d in TR_DIRS" :key="d.id" :class="{ on: (selAnim.dir ?? 'up') === d.id }"
                    @click="animField({ dir: d.id })">{{ d.name }}</button>
                </div>
              </template>
              <!-- 顺序列表 + 预览(规划 M4 任务项):点行选中对应元素,预览在舞台原位播完自动复原 -->
              <template v-if="animSeq.length">
                <div class="dk-group-label">播放顺序</div>
                <div class="dk-anim-seq">
                  <button v-for="(r, ri) in animSeq" :key="ri" class="dk-anim-row" :class="{ on: selIdx === r.box }" @click="viewerRef?.selectBox(r.box)">
                    <span class="dk-anim-step">{{ r.step }}</span>{{ r.label }}
                  </button>
                </div>
                <button class="dk-ghost" style="justify-content:center" :disabled="viewerRef?.previewingAnims" @click="viewerRef?.previewAnims()">
                  <Play :size="12" /> {{ viewerRef?.previewingAnims ? "播放中…" : "预览本页动画" }}
                </button>
              </template>
              <span class="dk-note">放映时按序播放；导出后 PowerPoint 里是真动画。</span>
            </div>
            <div class="dk-panel-sec">
              <div class="dk-panel-title">文档</div>
              <div class="dk-panel-row"><span>页数</span><b>{{ specPages }}</b></div>
              <div class="dk-panel-row"><span>当前页</span><b>第 {{ (viewerRef?.page ?? 0) + 1 }} 页 · {{ curLayoutName }}</b></div>
            </div>
            <!-- 页面切换:效果格 + 方向 + 速度 + 应用到全部(引擎 p:transition,PowerPoint 放映原生生效) -->
            <div v-if="phase === 'done'" class="dk-panel-sec">
              <div class="dk-panel-title">页面切换</div>
              <div class="dk-tr-grid">
                <button
                  v-for="t in TRANSITIONS"
                  :key="t.id"
                  :class="{ on: (curTransition?.type ?? '') === t.id }"
                  @click="setTransition({ type: t.id })"
                >{{ t.name }}</button>
              </div>
              <template v-if="TRANSITIONS.find(t => t.id === (curTransition?.type ?? ''))?.hasDir">
                <div class="dk-seg">
                  <button
                    v-for="d in TR_DIRS"
                    :key="d.id"
                    :class="{ on: (curTransition?.dir ?? 'up') === d.id }"
                    @click="setTransition({ dir: d.id })"
                  >{{ d.name }}</button>
                </div>
              </template>
              <div v-if="curTransition" class="dk-seg">
                <button
                  v-for="sp in TR_SPEEDS"
                  :key="sp.id"
                  :class="{ on: (curTransition?.speed ?? 'med') === sp.id }"
                  @click="setTransition({ speed: sp.id })"
                >{{ sp.name }}</button>
              </div>
              <button class="dk-ghost" style="justify-content:center" @click="transitionAll">应用到全部页</button>
              <span class="dk-note">放映与导出的 PowerPoint 均生效。</span>
            </div>
            <div class="dk-panel-sec">
              <div class="dk-panel-title">主题换肤</div>
              <div class="dk-skin wrap">
                <button
                  v-for="t in NATIVE_THEME_META"
                  :key="t.id"
                  class="dk-skin-sw"
                  :class="{ on: specTheme === t.id, busy: skinning === t.id }"
                  :title="`${t.name}（内容不变，预览与导出同步换色）`"
                  :disabled="!!skinning || phase === 'generating'"
                  :style="{ background: t.bg }"
                  @click="applyTheme(t.id)"
                >
                  <span class="dk-skin-acc" :style="{ background: t.accent }"></span>
                </button>
                <Loader v-if="skinning" :size="12" class="spin" />
              </div>
              <span class="dk-note">内容不变，预览与导出同步换色。</span>
            </div>
            <div class="dk-panel-sec">
              <div class="dk-panel-title">产物</div>
              <button v-for="o in outputs" :key="o.path" class="dk-out" @click="openFile(o.path)">
                <component :is="/\.pptx$/i.test(o.name) ? FileType2 : Monitor" :size="13" />
                <span>{{ o.name }}</span><ExternalLink :size="11" />
              </button>
            </div>
          </aside>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.dk { height: 100%; display: flex; flex-direction: column; overflow: hidden; background: var(--bg); }
.dk-head { display: flex; align-items: center; gap: 10px; padding: 12px 20px; border-bottom: 1px solid var(--border-soft); background: var(--panel); }
.dk-icon { color: var(--primary); }
.dk-title { font-family: var(--serif); font-size: 16px; font-weight: 600; color: var(--text); }
.dk-sub { font-size: 12px; color: var(--muted); margin-left: 4px; }
.dk-toggle { margin-left: auto; display: inline-flex; gap: 3px; padding: 3px; background: var(--bg-soft); border-radius: 9px; border: 1px solid var(--border-soft); }
.dk-toggle button { display: inline-flex; align-items: center; gap: 5px; padding: 6px 12px; border: none; background: transparent; color: var(--muted); font-size: 12.5px; font-weight: 600; border-radius: 7px; cursor: pointer; }
.dk-toggle button.on { background: var(--primary); color: #fff; }

.dk-work { flex: 1; display: grid; grid-template-columns: 252px 1fr; overflow: hidden; }
@media (max-width: 820px) { .dk-work { grid-template-columns: 200px 1fr; } }

/* 左侧配置 */
.dk-side { overflow-y: auto; border-right: 1px solid var(--border-soft); padding: 14px; display: flex; flex-direction: column; gap: 18px; background: var(--bg-soft); }
.dk-side-sec { display: flex; flex-direction: column; gap: 8px; }
.dk-side-title { font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--dim); }
.dk-preview-mini { height: 48px; border-radius: 8px; border: 1px solid var(--border); display: flex; align-items: center; padding: 0 12px; font-size: 13px; font-weight: 800; }
.dk-group-label { font-size: 10.5px; color: var(--dim); margin-top: 2px; }
.dk-themes { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.dk-theme { display: flex; align-items: center; gap: 6px; padding: 5px 6px; border: 1px solid var(--border); border-radius: 7px; background: var(--bg); cursor: pointer; text-align: left; }
.dk-theme:hover { border-color: var(--primary); }
.dk-theme.active { border-color: var(--primary); background: var(--primary-soft); }
.dk-theme-sw { width: 20px; height: 20px; border-radius: 5px; flex-shrink: 0; border: 1px solid rgba(0,0,0,.08); position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; }
.dk-theme-acc { position: absolute; bottom: 0; left: 0; right: 0; height: 38%; }
.dk-theme-name { font-size: 11px; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.dk-lab { font-size: 12px; font-weight: 500; color: var(--muted); margin-top: 4px; }
.dk-lab b { color: var(--primary-deep); }
.dk-range { width: 100%; accent-color: var(--primary); }
.dk-seg { display: flex; gap: 4px; }
.dk-seg button { flex: 1; padding: 6px 4px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-2); font-size: 11.5px; cursor: pointer; }
.dk-seg button.on { border-color: var(--primary); background: var(--primary-soft); color: var(--primary-deep); font-weight: 600; }
.dk-seg button:disabled { opacity: .45; cursor: default; }
.dk-note { font-size: 10.5px; color: var(--muted); line-height: 1.5; }
.dk-lab-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.dk-check { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--muted); cursor: pointer; user-select: none; }
.dk-check input { accent-color: var(--primary); }
.dk-custom { resize: none; padding: 8px 10px; border: 1px solid var(--border); border-radius: 7px; background: var(--bg); color: var(--text); font-size: 11.5px; line-height: 1.5; }
.dk-custom:focus { outline: none; border-color: var(--primary); }
.dk-skill-search { padding: 6px 9px; border: 1px solid var(--border); border-radius: 7px; background: var(--bg); color: var(--text); font-size: 11.5px; }
.dk-skill-search:focus { outline: none; border-color: var(--primary); }
.dk-skill-list { display: flex; flex-direction: column; gap: 5px; max-height: 220px; overflow-y: auto; }
.dk-skill-item { display: flex; flex-direction: column; gap: 2px; padding: 6px 9px; border: 1px solid var(--border); border-radius: 7px; background: var(--bg); cursor: pointer; text-align: left; }
.dk-skill-item:hover { border-color: var(--primary); }
.dk-skill-item.on { border-color: var(--primary); background: var(--primary-soft); }
.dk-skill-name { font-size: 11.5px; font-weight: 600; color: var(--text-2); }
.dk-skill-item.on .dk-skill-name { color: var(--primary-deep); }
.dk-skill-desc { font-size: 10px; color: var(--muted); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

.dk-out { display: flex; align-items: center; gap: 6px; padding: 7px 9px; border: 1px solid var(--primary); border-radius: 7px; background: var(--primary-soft); color: var(--primary-deep); font-size: 11.5px; font-weight: 600; cursor: pointer; }
.dk-out span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dk-side-acts { display: flex; gap: 5px; margin-top: 4px; }
.dk-ghost { display: inline-flex; align-items: center; gap: 4px; padding: 6px 9px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--text-2); font-size: 11.5px; cursor: pointer; transition: border-color .15s, color .15s; }
.dk-ghost:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
.dk-ghost:disabled { opacity: .5; cursor: default; }

/* 右主区 */
.dk-main { display: flex; flex-direction: column; overflow: hidden; position: relative; }
.dk-canvas { flex: 1; overflow: auto; position: relative; padding: 18px; display: flex; }
.dk-canvas.drop { outline: 2px dashed var(--primary); outline-offset: -10px; }

/* 输入态 */
.dk-input { flex: 1; display: flex; flex-direction: column; gap: 10px; max-width: 860px; margin: 0 auto; width: 100%; }
.dk-input-title { display: inline-flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 600; color: var(--text); margin: 0; }
.dk-textarea { flex: 1; min-height: 300px; resize: none; padding: 14px 16px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); color: var(--text); font-size: 14px; line-height: 1.75; }
.dk-textarea:focus { outline: none; border-color: var(--primary); }
.dk-input-foot { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--muted); }
.dk-input-foot .warn { color: var(--vermilion); }
.dk-input-btns { display: flex; gap: 6px; }
.dk-files { display: flex; flex-wrap: wrap; gap: 6px; }
.dk-file { display: flex; align-items: center; gap: 5px; padding: 4px 8px; background: var(--bg-soft); border-radius: 6px; font-size: 11.5px; color: var(--text-2); }
.dk-file-name { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dk-file-x { border: none; background: transparent; color: var(--muted); cursor: pointer; display: inline-flex; padding: 1px; }
.dk-file-x:hover { color: var(--vermilion); }

/* ═══════ 豆包式工作区 ═══════ */
.dk-ws { flex: 1; display: flex; overflow: hidden; }

/* 左:对话流 */
.dk-chat { width: 316px; flex-shrink: 0; display: flex; flex-direction: column; border-right: 1px solid var(--border-soft); background: var(--bg-soft); transition: width .18s ease; overflow: hidden; }
.dk-chat.folded { width: 42px; }
@media (max-width: 1200px) { .dk-chat:not(.folded) { width: 252px; } }
.dk-chat-head { display: flex; align-items: center; gap: 4px; padding: 9px 10px; border-bottom: 1px solid var(--border-soft); }
.dk-chat-title { flex: 1; font-size: 12.5px; font-weight: 700; color: var(--text-2); }
.dk-chat-ic { display: inline-flex; padding: 4px; border: none; border-radius: 6px; background: transparent; color: var(--muted); cursor: pointer; }
.dk-chat-ic:hover { background: var(--bg); color: var(--primary); }
.dk-chat.folded .dk-chat-head { flex-direction: column; padding: 9px 0; }
.dk-chat-scroll { flex: 1; overflow-y: auto; padding: 12px 10px; display: flex; flex-direction: column; gap: 8px; }
.dk-bb { max-width: 100%; font-size: 12.5px; line-height: 1.65; white-space: pre-wrap; word-break: break-word; }
.dk-bb.user { align-self: flex-end; background: var(--primary); color: #fff; border-radius: 10px 10px 3px 10px; padding: 7px 11px; max-width: 92%; }
.dk-bb.assistant { color: var(--text); }
.dk-bb.assistant.err { color: var(--vermilion); }
.dk-bb.tool { display: flex; align-items: center; gap: 5px; white-space: nowrap; overflow: hidden; font-size: 11px; color: var(--muted); background: var(--bg); border: 1px solid var(--border-soft); border-radius: 6px; padding: 4px 8px; }
.dk-bb-wr { flex-shrink: 0; }
.dk-bb-tool { font-weight: 600; flex-shrink: 0; }
.dk-bb-detail { overflow: hidden; text-overflow: ellipsis; font-family: var(--mono); font-size: 10.5px; }
.dk-typing { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }
.dk-done-card { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid var(--primary); border-radius: 10px; background: var(--primary-soft); color: var(--primary-deep); cursor: pointer; text-align: left; }
.dk-done-card:hover { filter: brightness(1.03); }
.dk-done-name { flex: 1; font-size: 12.5px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dk-done-time { font-size: 10.5px; color: var(--muted); flex-shrink: 0; }
.dk-chat-in { display: flex; align-items: flex-end; gap: 6px; padding: 10px; border-top: 1px solid var(--border-soft); }
.dk-chat-in textarea { flex: 1; min-width: 0; resize: none; padding: 8px 10px; border: 1px solid var(--border); border-radius: 9px; background: var(--bg); color: var(--text); font-size: 12.5px; line-height: 1.5; font-family: inherit; }
.dk-chat-in textarea:focus { outline: none; border-color: var(--primary); }
.dk-chat-in textarea:disabled { opacity: .55; }
.dk-send { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border: none; border-radius: 9px; background: var(--primary); color: #fff; cursor: pointer; flex-shrink: 0; }
.dk-send:hover:not(:disabled) { filter: brightness(1.08); }
.dk-send:disabled { opacity: .45; cursor: default; }

/* 右:编辑器 */
.dk-ed { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.dk-ed-title { display: flex; align-items: center; gap: 9px; padding: 10px 14px; border-bottom: 1px solid var(--border-soft); background: var(--panel); }
.dk-ed-name { font-size: 14px; font-weight: 700; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dk-ed-live { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--primary-deep); white-space: nowrap; }
.dk-ed-acts { margin-left: auto; display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.dk-ed-tools { display: flex; align-items: center; gap: 8px; padding: 7px 14px; border-bottom: 1px solid var(--border-soft); background: var(--panel); }
.dk-tool { display: inline-flex; align-items: center; gap: 5px; padding: 5px 11px; border: 1px solid var(--border); border-radius: 7px; background: var(--bg); color: var(--text-2); font-size: 12px; font-weight: 600; cursor: pointer; }
.dk-tool:hover { border-color: var(--primary); color: var(--primary); }
.dk-tool.on { border-color: var(--primary); background: var(--primary-soft); color: var(--primary-deep); }
.dk-zoom { margin-left: auto; display: flex; align-items: center; gap: 2px; }
.dk-zoom button { width: 24px; height: 24px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-2); font-size: 14px; line-height: 1; cursor: pointer; }
.dk-zoom button:hover { border-color: var(--primary); color: var(--primary); }
.dk-zoom span { min-width: 44px; text-align: center; font-size: 11.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
.dk-tools-sep { width: 1px; height: 18px; background: var(--border-soft); margin: 0 4px; }
.dk-shape-wrap { position: relative; display: inline-flex; }
.dk-shape-menu { position: absolute; left: 0; top: calc(100% + 5px); z-index: 20; display: flex; flex-direction: column; gap: 2px; padding: 4px; min-width: 96px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); box-shadow: 0 8px 26px rgba(0,0,0,.16); }
.dk-shape-menu button { padding: 6px 10px; border: none; border-radius: 5px; background: transparent; color: var(--text-2); font-size: 12px; text-align: left; cursor: pointer; }
.dk-shape-menu button:hover { background: var(--primary-soft); color: var(--primary-deep); }
/* 表格 7×6 格子选择器(豆包式) */
.dk-tbl-pick { position: absolute; left: 0; top: calc(100% + 5px); z-index: 20; padding: 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); box-shadow: 0 8px 26px rgba(0,0,0,.16); }
.dk-tbl-lab { font-size: 11px; color: var(--muted); margin-bottom: 6px; white-space: nowrap; }
.dk-tbl-lab b { color: var(--primary-deep); }
.dk-tbl-grid { display: grid; grid-template-columns: repeat(7, 16px); gap: 3px; }
.dk-tbl-grid button { width: 16px; height: 16px; padding: 0; border: 1px solid var(--border); border-radius: 3px; background: var(--bg); cursor: pointer; }
.dk-tbl-grid button.lit { background: var(--primary); border-color: var(--primary); }
/* 图表数据编辑弹层 */
.dk-chart-sheet { position: absolute; inset: 0; z-index: 30; display: flex; align-items: flex-end; justify-content: center; background: rgba(0,0,0,.28); }
.dk-ed { position: relative; }
.dk-chart-card { width: min(680px, calc(100% - 32px)); max-height: 70%; margin-bottom: 16px; display: flex; flex-direction: column; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 16px 48px rgba(0,0,0,.3); overflow: hidden; }
.dk-chart-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; font-size: 13px; font-weight: 700; color: var(--text); border-bottom: 1px solid var(--border-soft); }
.dk-chart-grid-wrap { overflow: auto; padding: 10px 14px; }
.dk-chart-grid { border-collapse: collapse; width: 100%; }
.dk-chart-grid th, .dk-chart-grid td { border: 1px solid var(--border-soft); padding: 2px; }
.dk-chart-grid th { background: var(--bg-soft); font-size: 11px; color: var(--muted); font-weight: 600; }
.dk-chart-grid input { width: 100%; min-width: 64px; border: none; background: transparent; color: var(--text); font-size: 12px; padding: 5px 7px; }
.dk-chart-grid input:focus { outline: 2px solid var(--primary); border-radius: 3px; }
.dk-chart-acts { display: flex; align-items: center; gap: 6px; padding: 10px 14px; border-top: 1px solid var(--border-soft); }
/* 页面切换效果格 */
.dk-tr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.dk-tr-grid button { padding: 7px 4px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text-2); font-size: 11px; cursor: pointer; }
.dk-tr-grid button:hover { border-color: var(--primary); }
.dk-tr-grid button.on { border-color: var(--primary); background: var(--primary-soft); color: var(--primary-deep); font-weight: 600; }
.dk-tr-grid.three { grid-template-columns: 1fr 1fr 1fr; }
.dk-tr-none { padding: 6px; border: 1px dashed var(--border); border-radius: 6px; background: transparent; color: var(--muted); font-size: 11px; cursor: pointer; }
.dk-tr-none.on { border-color: var(--primary); color: var(--primary-deep); border-style: solid; background: var(--primary-soft); }
/* 动画顺序列表 */
.dk-anim-seq { display: flex; flex-direction: column; gap: 3px; max-height: 150px; overflow-y: auto; }
.dk-anim-row { display: flex; align-items: center; gap: 6px; padding: 4px 7px; border: 1px solid var(--border-soft); border-radius: 6px; background: var(--bg); color: var(--text-2); font-size: 11px; text-align: left; cursor: pointer; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.dk-anim-row:hover { border-color: var(--primary); }
.dk-anim-row.on { border-color: var(--primary); background: var(--primary-soft); color: var(--primary-deep); }
.dk-anim-step { flex-shrink: 0; width: 16px; height: 16px; border-radius: 50%; background: var(--primary); color: #fff; font-size: 9.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
/* 元素属性(格式面板) */
.dk-xywh { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
.dk-xywh label, .dk-prop-row { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--muted); }
.dk-prop-row { justify-content: space-between; }
.dk-xywh input, .dk-prop-row input { width: 100%; max-width: 76px; padding: 4px 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); font-size: 11.5px; }
.dk-prop-row select { max-width: 100px; padding: 4px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); font-size: 11.5px; }
.dk-hex { padding: 4px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); font-size: 11.5px; font-family: var(--mono); }
.dk-xywh input:focus, .dk-prop-row input:focus, .dk-hex:focus { outline: none; border-color: var(--primary); }
.dk-ed-body { flex: 1; min-height: 0; display: flex; }
.dk-ed-stage { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 12px; }
.dk-error.ws { margin: 8px 14px 0; flex-basis: auto; }

/* 右:格式面板 */
.dk-panel { width: 208px; flex-shrink: 0; overflow-y: auto; border-left: 1px solid var(--border-soft); background: var(--bg-soft); padding: 12px; display: flex; flex-direction: column; gap: 16px; }
.dk-panel-sec { display: flex; flex-direction: column; gap: 7px; }
.dk-panel-title { font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--dim); }
.dk-panel-row { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--muted); }
.dk-panel-row b { color: var(--text); font-weight: 600; }

/* 预览态(播放器/iframe/等待) */
.dk-viewer { flex: 1; min-height: 0; border: 1px solid var(--border); box-shadow: var(--shadow, 0 6px 24px rgba(0,0,0,.08)); }
.dk-frame { flex: 1; width: 100%; border: 1px solid var(--border); border-radius: 10px; background: #fff; box-shadow: var(--shadow, 0 6px 24px rgba(0,0,0,.08)); }
.dk-frame-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--muted); border: 1px dashed var(--border); border-radius: 10px; }

/* 生成前等待面板(第一页出现即让位给播放器) */
.dk-wait { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--text); font-size: 14px; font-weight: 600; }
.dk-wait-t { font-weight: 600; }
.dk-tool-hint { max-width: 80%; font-family: var(--mono); font-size: 11px; font-weight: 400; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.dk-exported { font-size: 11.5px; font-weight: 600; color: var(--ok, #2f7a4f); white-space: nowrap; }
.dk-skin { display: flex; align-items: center; gap: 5px; }
.dk-skin.wrap { flex-wrap: wrap; }
.dk-skin-sw { position: relative; width: 24px; height: 24px; border-radius: 6px; border: 1.5px solid var(--border); cursor: pointer; overflow: hidden; padding: 0; }
.dk-skin-sw:hover:not(:disabled) { border-color: var(--primary); }
.dk-skin-sw.on { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }
.dk-skin-sw.busy { animation: dk-spin 1s linear infinite; }
.dk-skin-sw:disabled { cursor: default; opacity: .7; }
.dk-skin-acc { position: absolute; left: 0; right: 0; bottom: 0; height: 34%; display: block; }

/* 底部 composer */
.dk-composer { border-top: 1px solid var(--border-soft); background: var(--panel); padding: 12px 18px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.dk-comp-i { color: var(--primary); flex-shrink: 0; }
.dk-comp-input { flex: 1; min-width: 200px; resize: none; padding: 10px 12px; border: 1px solid var(--border); border-radius: 9px; background: var(--bg); color: var(--text); font-size: 13px; line-height: 1.5; max-height: 110px; }
.dk-comp-input:focus { outline: none; border-color: var(--primary); }
.dk-primary { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 11px 26px; border: none; border-radius: 10px; background: var(--primary); color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; transition: filter .15s; }
.dk-primary.sm { padding: 10px 18px; font-size: 13px; flex-shrink: 0; }
.dk-primary:hover:not(:disabled) { filter: brightness(1.07); }
.dk-primary:disabled { opacity: .5; cursor: default; }
.dk-error { flex-basis: 100%; padding: 8px 11px; border-radius: 8px; background: var(--vermilion-soft); color: var(--vermilion); font-size: 12px; }

.spin { animation: dk-spin .9s linear infinite; }
@keyframes dk-spin { to { transform: rotate(360deg); } }
</style>

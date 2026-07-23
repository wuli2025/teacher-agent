<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount, onMounted, defineAsyncComponent } from "vue";
import { Paperclip, Image as ImageIcon, Mic, Send, Search, Loader, Eye, Sparkles, X, ChevronLeft, ChevronRight, Maximize, MonitorPlay, FileText } from "@lucide/vue";
import { parseDocLoose } from "../lib/docSpec";
// 教案范例的「点开看」= 真 Word 版预览:与编辑器同一个渲染器。懒加载,不吸进首屏 chunk。
const DocViewer = defineAsyncComponent(() => import("./DocViewer.vue"));
import { useAppStore } from "../stores/app";
import { useChatStore } from "../stores/chat";
import { chat as chatApi, artifacts, invoke, listen, isTauri, uploadToBackend, type AttachedFile } from "../tauri";
import { useFileDrop } from "../composables/useFileDrop";
import { WebVoiceRecorder } from "../lib/webVoice";
import { humanizeError } from "../lib/humanizeError";
import { MODES, GRADES, subjectOf, subjectsOf, type Grade, type TeachMode, type TeachSample } from "../lib/teachSamples";
import { registerLessonJob } from "../lib/lessonFollowUp";
import { toast } from "../composables/useToast";

// KeepAlive 友好命名（虽然 Home 很轻，保持一致）
defineOptions({ name: "HomeView" });

const app = useAppStore();
const chat = useChatStore();

const mode = computed(() => MODES[app.homeMode]);
// 「新建对话」通用助手首页 = chat 版式（居中问候 + 底部输入，无案例广场），
// 与三大工坊（左标题 + 案例广场）是两种不同版式（设计稿 1-新建对话主页 vs 2-AI课件PPT）。
const isChat = computed(() => app.homeMode === "chat");

// 设计稿里三个工坊共用同一句欢迎语「LUMI 你的智能助手」，
// 工坊差异只体现在导航高亮、输入占位与范例库上，标题不再随模式变。

// 欢迎语与输入卡之间原来还有一排快捷建议 chip（分析报告 / 写PPT / 写教案 / 数学课件），
// 设计稿里标题下面直接就是输入卡，故整排移除；对应的 QUICK 常量与 useQuick() 一并删掉。
// 那几个入口在左侧导航里都有（AI 教案 / AI 课件PPT / 生成数学课件），功能没有丢。

// 吉祥物图缺失时（打包漏带 / 文件被删）回退到原来的渐变圆球，hero 不塌成空洞
const mascotOk = ref(true);

// ───────── 输入 + 附件 ─────────
const input = ref("");
const inputEl = ref<HTMLTextAreaElement | null>(null);
const uploads = ref<AttachedFile[]>([]);
const uploading = ref(false);
const busy = ref(false);

// 输入框高度随内容自动增长（与 polaris-app / ChatPanel 同一套）：
// 先归零再按 scrollHeight 撑高，到 CSS max-height 后转为框内滚动。
function autoGrow() {
  const el = inputEl.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}
// 内容变化（手输 / 语音回填 / 范例填入 / 发送清空）都重算高度
watch(input, () => nextTick(autoGrow));
onMounted(() => nextTick(autoGrow));

async function addPaths(paths: string[]) {
  if (!paths.length) return;
  uploading.value = true;
  try {
    const res = await chatApi.attachFiles(undefined, paths);
    for (const r of res) if (r.ok && !uploads.value.some((u) => u.path === r.path)) uploads.value.push(r);
  } catch (e: any) {
    toast.error(`附件添加失败：${e?.message ?? e}`);
  } finally {
    uploading.value = false;
  }
}
async function pickFiles(imagesOnly = false) {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const sel = await open({
      multiple: true,
      filters: imagesOnly
        ? [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }]
        : [{ name: "素材", extensions: ["md", "txt", "docx", "pdf", "pptx", "html", "json", "csv", "png", "jpg", "jpeg"] }],
    });
    if (!sel) return;
    await addPaths(Array.isArray(sel) ? sel : [sel]);
  } catch (e: any) {
    toast.error(`选择文件失败：${e?.message ?? e}`);
  }
}
function removeUpload(i: number) {
  uploads.value.splice(i, 1);
}
useFileDrop({ active: () => app.view === "home", onDrop: addPaths });

// ───────── 语音听写（与 ChatPanel 同一套）─────────
// 点话筒 / 按右 Alt 开始说话，说话时文字流式长进输入框，再点 / 再按右 Alt 结束。
// 桌面端走后端 cpal 录音（voice:partial 流式 + voice:dictation 终稿）；
// 浏览器端本地录 WAV 上传后整段识别。
const dictating = ref(false);
const voiceBusy = ref(false); // 浏览器路径:停录后上传+识别的 ~1s,期间禁重复点击
let dictateBase = ""; // 听写开始时输入框已有内容，新转写续在其后
const voiceUnlisteners: Array<() => void> = [];
let webRec: WebVoiceRecorder | null = null;

async function toggleDictate() {
  if (!isTauri) return toggleDictateWeb();
  try {
    if (!dictating.value) {
      dictateBase = input.value ? input.value.replace(/\s+$/, "") + " " : "";
      await invoke("voice_dictate_start");
      dictating.value = true;
    } else {
      dictating.value = false;
      await invoke("voice_dictate_stop");
    }
  } catch (e) {
    dictating.value = false;
    toast.error(`语音输入：${humanizeError(e)}`);
  }
}

// 浏览器整段批处理:点开始 getUserMedia 录音 → 再点停止 → 16k WAV 上传 → 识别回填。
async function toggleDictateWeb() {
  if (voiceBusy.value) return;
  if (!dictating.value) {
    try {
      dictateBase = input.value ? input.value.replace(/\s+$/, "") + " " : "";
      webRec = new WebVoiceRecorder();
      await webRec.start();
      dictating.value = true;
    } catch (e) {
      dictating.value = false;
      webRec = null;
      toast.error(`语音输入：${humanizeError(e)}`);
    }
    return;
  }
  dictating.value = false;
  const rec = webRec;
  webRec = null;
  voiceBusy.value = true;
  try {
    const wav = await rec?.stop();
    if (!wav) return; // 太短/误触
    const [up] = await uploadToBackend([wav]);
    if (!up?.path) throw new Error("音频上传失败");
    const r = await invoke<{ text?: string; error?: string }>("voice_transcribe_file", { path: up.path });
    if (r?.text) {
      input.value = dictateBase + r.text;
      nextTick(() => {
        autoGrow();
        inputEl.value?.focus();
      });
    }
  } catch (e) {
    toast.error(`语音输入：${humanizeError(e)}`);
  } finally {
    voiceBusy.value = false;
  }
}

function onGlobalKeydown(e: KeyboardEvent) {
  // 右 Alt 快捷开关听写（仅本窗口获焦时）。AltGr 在 Win 也以 AltRight 触发。
  if (e.code === "AltRight") {
    e.preventDefault();
    if (!e.repeat) void toggleDictate();
  }
}

onMounted(async () => {
  window.addEventListener("keydown", onGlobalKeydown);
  // 流式：说话中把当前转写实时续到输入框（从听写起点之后替换）
  voiceUnlisteners.push(
    await listen<{ text?: string }>("voice:partial", (p) => {
      if (dictating.value && p && typeof p.text === "string") {
        input.value = dictateBase + p.text;
        nextTick(autoGrow);
      }
    })
  );
  // 结束：终稿（防污染后）落定到输入框
  voiceUnlisteners.push(
    await listen<{ text?: string; error?: string; cancelled?: boolean }>("voice:dictation", (f) => {
      dictating.value = false;
      if (f?.error) {
        toast.error(`语音输入：${f.error}`);
        return;
      }
      if (f?.cancelled) return;
      if (typeof f?.text === "string" && f.text) {
        input.value = dictateBase + f.text;
        nextTick(() => {
          autoGrow();
          inputEl.value?.focus();
        });
      }
    })
  );
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onGlobalKeydown);
  for (const u of voiceUnlisteners) u();
  if (webRec) {
    webRec.cancel();
    webRec = null;
  } else if (dictating.value) {
    void invoke("voice_dictate_stop").catch(() => {});
  }
});

// ───────── 生成 ─────────
const canSend = computed(() => (input.value.trim().length > 0 || uploads.value.length > 0) && !busy.value);

/** 从提示词/附件名里提取课程名，给左栏对话起名（如「找春天 · 课件」）。提不出返回空串。 */
function deriveConvTitle(text: string, m: (typeof MODES)[keyof typeof MODES]): string {
  // 通用对话不追加「· 课件/教案」后缀，交给默认命名。
  if (m.key === "chat") return "";
  let topic =
    text.match(/《([^》]{1,24})》/)?.[1] ??
    text.match(/'([^']{2,32})'/)?.[1] ??
    text.match(/[“"]([^”"]{2,32})[”"]/)?.[1] ??
    text.match(/「([^」]{1,24})」/)?.[1];
  if (!topic) {
    topic = text
      .replace(/^请?(使用|用)[^，,。]{0,30}技能[，,]?\s*/, "")
      .replace(/^(请|帮我|给我|为我|我要|我想要?)+/, "")
      .replace(/^(生成|制作|设计|撰?写|做|出)+(一份|一个|一套|一节)?/, "")
      .replace(/(的)?(教学|完整|课堂)*(课件|教案|PPT|ppt)\s*[（(]?[^）)]*[）)]?[^]*$/, "")
      .trim();
  }
  if (!topic && uploads.value.length) {
    topic = uploads.value[0].name.replace(/\.[a-z0-9]+$/i, "").replace(/_?课件$/, "");
  }
  topic = (topic || "").replace(/^讲解/, "").trim().slice(0, 18);
  if (!topic) return "";
  const suffix = m.key === "lesson" ? "教案" : "课件";
  return `${topic} · ${suffix}`;
}

async function generate() {
  if (!canSend.value) return;
  const m = mode.value;
  const userText = input.value.trim();
  busy.value = true;
  try {
    const projectId = await app.ensureProjectId();
    const conv = await app.createConversation(projectId, false);
    // 左栏对话名自动配课程名（提取失败保持默认名，不阻塞发送）
    const convTitle = deriveConvTitle(userText, m);
    if (convTitle) app.renameConversation(conv, convTitle).catch(() => {});
    if (uploads.value.length) {
      try {
        await chatApi.attachFiles(conv.id, uploads.value.map((u) => u.path));
      } catch {
        /* 已在目录则忽略 */
      }
    }
    const display = `${m.badge}：${(userText || uploads.value[0]?.name || "未命名").slice(0, 24)}`;
    // 教案工坊:登记这条对话,生成结束(done)时弹「是否生成配套 PPT」追问
    if (m.key === "lesson") {
      registerLessonJob(conv.id, userText || uploads.value[0]?.name.replace(/\.[a-z0-9]+$/i, "") || "");
    }
    await chat.send(conv.id, m.buildPrompt(userText), display, undefined, {
      permissionMode: "auto_current",
      skillIds: m.skillIds,
      goal: m.goal,
    });
    // 进入工作台：中间对话流 + 右侧大预览（产物产出后右抽屉自动展开）
    input.value = "";
    uploads.value = [];
    app.setView("chat");
  } catch (e: any) {
    toast.error(`生成失败：${e?.message ?? e}`);
  } finally {
    busy.value = false;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    generate();
  }
}

// 填提示词进输入框并聚焦（可再改后发送）
function useSample(s: TeachSample) {
  input.value = s.prompt;
  autoGrow();
  inputEl.value?.focus();
  document.querySelector(".home-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
}

// ───────── 案例预览（点开看）+ 做同款 ─────────
const preview = ref<TeachSample | null>(null);
const page = ref(1);
const cloning = ref(false);

// 教案范例走「真 Word 版预览」:把 public/sample-docs/<docId>.json 喂给 DocViewer,
// 与编辑器同一个渲染器 —— 用户在这儿看到的纸张,就是点「做同款」之后能改的那份。
// 不用页截图(教案是流式长文档,截成一页页图既笨重又改不了),也不用 PDF(装不下编辑能力)。
const docSpec = ref<any | null>(null);
const docLoading = ref(false);
const isDocPreview = computed(() => !!preview.value?.docId);

async function loadDocSpec(s: TeachSample) {
  docSpec.value = null;
  docLoading.value = true;
  try {
    const res = await fetch(`/sample-docs/${s.docId}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { spec } = parseDocLoose(await res.text());
    if (preview.value?.id === s.id) docSpec.value = spec; // 竞态:读盘期间已切走
  } catch (e: any) {
    toast.error(`范例教案载入失败：${e?.message ?? e}`);
  } finally {
    docLoading.value = false;
  }
}

function openSample(s: TeachSample) {
  if (!s.deckId && !s.docId) {
    useSample(s);
    return;
  }
  preview.value = s;
  page.value = 1;
  if (s.docId) void loadDocSpec(s);
}
function closePreview() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  preview.value = null;
  docSpec.value = null;
}

// 全屏播放：预览右上角进入放映模式，点击/方向键翻页，Esc 退出
const stageEl = ref<HTMLElement | null>(null);
const isFs = ref(false);
function toggleFullscreen() {
  if (!document.fullscreenElement) stageEl.value?.requestFullscreen().catch(() => {});
  else document.exitFullscreen().catch(() => {});
}
function onFsChange() {
  isFs.value = !!document.fullscreenElement;
}
function onStageClick() {
  if (isFs.value) flip(1);
}
onMounted(() => document.addEventListener("fullscreenchange", onFsChange));
onBeforeUnmount(() => document.removeEventListener("fullscreenchange", onFsChange));
/** 高清页（2560×1440）：大图舞台与全屏放映用 */
function slideSrc(deckId: string, n: number) {
  return `/sample-slides/${deckId}/${n}.webp`;
}
/** 缩略页（480×270）：缩略图条与卡片封面用，别拿高清档喂它们 */
function thumbSrc(deckId: string, n: number) {
  return `/sample-slides/${deckId}/t${n}.webp`;
}
function flip(d: number) {
  const s = preview.value;
  if (!s?.pages) return;
  page.value = Math.min(Math.max(page.value + d, 1), s.pages);
}
function onPreviewKey(e: KeyboardEvent) {
  if (!preview.value) return;
  if (e.key === "Escape") closePreview();
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp") flip(-1);
  else if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") flip(1);
}
onMounted(() => window.addEventListener("keydown", onPreviewKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onPreviewKey));

function bytesToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

// 做同款的提示词按模式区分：课件模式参考版式做课件，教案模式参考真教案再写一份同范式的
function samePrompt(s: TeachSample): string {
  if (s.docId) {
    return `参考附件《${s.title}》这份青教赛范式教案的结构、颗粒度与行文口吻，写一份同款教案：换成我指定的课题（下面补充），十个板块齐全，教学过程用四栏表（教学环节·教师活动·学生活动·设计意图），设计意图要写实。\n\n课题：`;
  }
  if (app.homeMode === "lesson") {
    return `参考附件《${s.title}》这份课件的教学思路与环节编排，为这节课写一份完整教案（教学目标、重难点、教学过程、板书设计、作业）。`;
  }
  return `参考附件《${s.title}》这份课件的结构、版式与讲法，做一份同款课件：主题一致，内容与图文可优化升级，每页配口播稿。`;
}

/** 范例的原 pptx 落到本地磁盘（内置资源走 tauri.localhost，没有真实路径，得先写出来），返回绝对路径。 */
async function materializeDeck(s: TeachSample): Promise<AttachedFile> {
  const res = await fetch(`/sample-files/${s.deckId}.pptx`);
  if (!res.ok) throw new Error(`范例文件读取失败 HTTP ${res.status}`);
  const b64 = bytesToBase64(await res.arrayBuffer());
  const af = await chatApi.attachImage(undefined, s.fileName || `${s.title}.pptx`, b64);
  if (!af.ok) throw new Error(af.error || "附件写入失败");
  return { ...af, kind: "office" };
}

/** 教案范例的原 .docx 落盘（同 materializeDeck，只是换了资源目录与扩展名）。 */
async function materializeDoc(s: TeachSample): Promise<AttachedFile> {
  const res = await fetch(`/sample-doc-files/${s.docId}.docx`);
  if (!res.ok) throw new Error(`范例文件读取失败 HTTP ${res.status}`);
  const b64 = bytesToBase64(await res.arrayBuffer());
  const af = await chatApi.attachImage(undefined, s.fileName || `${s.title}.docx`, b64);
  if (!af.ok) throw new Error(af.error || "附件写入失败");
  return { ...af, kind: "office" };
}

/** 用 Word 打开原教案：保真度 100%，与「用 PowerPoint 放映」同一套理由。 */
async function openInWord(s: TeachSample) {
  if (!s.docId || opening.value) return;
  if (!isTauri) {
    toast.info("用 Word 打开在桌面端可用");
    return;
  }
  opening.value = true;
  try {
    const af = await materializeDoc(s);
    await artifacts.openExternal(af.path);
    toast.success(`已用系统默认程序打开《${s.title}》`);
  } catch (e: any) {
    toast.error(`打开失败：${e?.message ?? e}`);
  } finally {
    opening.value = false;
  }
}

/** 用 PowerPoint 放映：交给系统默认程序打开原课件 —— 保真度 100%、动画与母版全在，
 *  这是「真播放器」，页截图只负责在应用内快速翻阅。 */
const opening = ref(false);
async function openInPowerPoint(s: TeachSample) {
  if (!s.deckId || opening.value) return;
  if (!isTauri) {
    toast.info("用 PowerPoint 放映在桌面端可用");
    return;
  }
  opening.value = true;
  try {
    const af = await materializeDeck(s);
    await artifacts.openExternal(af.path);
    toast.success(`已用系统默认程序打开《${s.title}》，按 F5 即可放映`);
  } catch (e: any) {
    toast.error(`打开失败：${e?.message ?? e}`);
  } finally {
    opening.value = false;
  }
}

/** 做同款：把原课件文件放进输入框附件 + 预填同款提示词，用户可改后一键生成 */
async function makeSame(s: TeachSample) {
  if (!s.deckId && !s.docId) {
    useSample(s);
    return;
  }
  if (cloning.value) return;
  cloning.value = true;
  try {
    const af = s.docId ? await materializeDoc(s) : await materializeDeck(s);
    if (!uploads.value.some((u) => u.path === af.path)) uploads.value.push(af);
    input.value = samePrompt(s);
    autoGrow();
    closePreview();
    inputEl.value?.focus();
    document.querySelector(".home-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
    toast.success(`已把《${s.title}》${s.docId ? "原教案" : "原课件"}放入附件，可直接生成同款`);
  } catch (e: any) {
    toast.error(`做同款失败：${e?.message ?? e}`);
  } finally {
    cloning.value = false;
  }
}

// ───────── 范例库过滤（年级 + 学科 + 搜索） ─────────
const grade = ref<Grade>("全部");
const subject = ref("全部");
const search = ref("");
// 「全部」视图高中在前（主力用户是高中教师），同年级保持录入顺序（sort 稳定）
const GRADE_RANK: Record<string, number> = { 高中: 0, 初中: 1, 小学: 2, 其他: 3 };
// 学科 tab 由当前工坊的范例现算：换工坊（教案/数学课件）时学科随之变少，不会留下点开是空的 tab
const subjectTabs = computed(() => ["全部", ...subjectsOf(mode.value.samples)]);
// 切工坊后旧学科可能不存在了，回落到「全部」
watch(subjectTabs, (tabs) => {
  if (!tabs.includes(subject.value)) subject.value = "全部";
});
const filteredSamples = computed(() => {
  let list = mode.value.samples;
  if (grade.value !== "全部") list = list.filter((s) => s.grade === grade.value);
  else list = [...list].sort((a, b) => (GRADE_RANK[a.grade] ?? 9) - (GRADE_RANK[b.grade] ?? 9));
  if (subject.value !== "全部") list = list.filter((s) => subjectOf(s) === subject.value);
  const q = search.value.trim().toLowerCase();
  if (q) list = list.filter((s) => (s.title + s.subtitle).toLowerCase().includes(q));
  return list;
});

// 封面：有 cover 名则优先真图 .png（codex 生成）缺则回退 .svg；无 cover 名用课件第 1 页截图
function coverSrc(s: TeachSample) {
  // 教案封面已换成文生图的学科插画(scripts/gen-lesson-covers.py 出的 .png):
  // 旧的 svg 封面是「假纸张 + 又印一遍标题 + 右下角漏出 docId」,15 张几乎一样,整面墙一片白。
  // svg 仍留在库里当回退,新图缺失时不至于开天窗。
  if (s.docId) return `/sample-covers/${s.cover || s.docId}.png`;
  if (s.cover) return `/sample-covers/${s.cover}.png`;
  return s.deckId ? thumbSrc(s.deckId, 1) : "";
}
function onCoverErr(e: Event, s: TeachSample) {
  const img = e.target as HTMLImageElement;
  const name = s.cover || s.docId;
  if (name && !img.src.endsWith(".svg")) img.src = `/sample-covers/${name}.svg`;
}
</script>

<template>
  <div class="home-scroll" :class="{ chat: isChat }">
    <div class="home" :class="{ chat: isChat }">
      <!-- Hero：chat 版式居中问候（设计稿 1-新建对话主页），工坊版式左对齐标题（2-AI课件PPT） -->
      <div class="hero-block" :class="{ center: isChat }">
        <h1 class="hero-title">LUMI 你的智能助手</h1>
      </div>

      <!-- 输入卡 + 覆在右上角外沿探头的吉祥物（设计稿：LUMI 猫形机器人从输入框上沿探出，chat/工坊两版式共用） -->
      <div class="composer-wrap">
        <!-- ?v=2：旧版 mascot.png 是白底图，同名换透明版后 WebView2 可能继续吐缓存的白底旧图，换 URL 强制取新 -->
        <img class="composer-mascot" src="/mascot/mascot.png?v=2" alt="" @error="mascotOk = false" v-show="mascotOk" />
      <!-- 干净输入框（附件 / 图片 / 话筒 / 发送） -->
      <div class="composer" :class="{ busy }">
        <div class="composer-top">
          <textarea
            ref="inputEl"
            v-model="input"
            :placeholder="mode.placeholder"
            rows="1"
            @input="autoGrow"
            @keydown="onKeydown"
          ></textarea>
        </div>

        <!-- 待发送附件 -->
        <div v-if="uploads.length" class="attach-row">
          <span v-for="(u, i) in uploads" :key="u.path" class="attach-chip" :title="u.path">
            {{ u.name }}
            <button class="ac-x" @click="removeUpload(i)">×</button>
          </span>
        </div>

        <div class="composer-bar">
          <div class="cb-left">
            <button class="cb-ic" title="添加素材附件" @click="pickFiles(false)">
              <Paperclip :size="19" :stroke-width="1.7" />
            </button>
            <button class="cb-ic" title="添加图片" @click="pickFiles(true)">
              <ImageIcon :size="19" :stroke-width="1.7" />
            </button>
            <span v-if="uploading" class="up-hint"><Loader :size="13" class="spin" /> 处理素材…</span>
          </div>
          <div class="cb-right">
            <button
              class="cb-ic mic"
              :class="{ live: dictating }"
              :disabled="voiceBusy"
              :title="voiceBusy ? '识别中…' : dictating ? '正在听写 · 点击 / 右 Alt 结束' : '语音输入 · 点击 / 按右 Alt 开始，再按一下结束'"
              @click="toggleDictate"
            >
              <Mic :size="19" :stroke-width="1.7" />
              <span v-if="dictating" class="mic-ping"></span>
            </button>
            <button class="send" :disabled="!canSend" title="生成 (Enter)" @click="generate">
              <Loader v-if="busy" :size="19" class="spin" />
              <Send v-else :size="19" :stroke-width="1.8" />
            </button>
          </div>
        </div>
      </div>
      </div>
      <!-- /composer-wrap -->

      <!-- 案例区（仅工坊模式；「新建对话」通用助手首页不展示案例广场）：标题 + 年级 tab + 搜索 -->
      <template v-if="!isChat">
      <div class="lib-title-row">
        <h2 class="lib-title">案例广场</h2>
        <span class="lib-hint">真实生成的完整课件 · 点开逐页看 · 一键做同款</span>
      </div>
      <div class="lib-head">
        <div class="grade-tabs">
          <button
            v-for="g in GRADES"
            :key="g"
            class="gt"
            :class="{ on: grade === g }"
            @click="grade = g"
          >
            {{ g }}
          </button>
        </div>
        <div class="lib-search">
          <Search :size="15" :stroke-width="1.8" />
          <input v-model="search" placeholder="输入知识点搜索资源" />
        </div>
      </div>

      <!-- 学科筛选：与年级正交，tab 由当前工坊实有范例现算 -->
      <div class="subject-tabs">
        <button
          v-for="sj in subjectTabs"
          :key="sj"
          class="sjt"
          :class="{ on: subject === sj }"
          @click="subject = sj"
        >
          {{ sj }}
        </button>
      </div>

      <!-- 案例卡片网格 -->
      <div class="sample-grid">
        <div
          v-for="s in filteredSamples"
          :key="s.id"
          class="sample-card"
          role="button"
          tabindex="0"
          @click="openSample(s)"
          @keydown.enter="openSample(s)"
        >
          <div class="sc-cover">
            <img :src="coverSrc(s)" :alt="s.title" loading="lazy" @error="onCoverErr($event, s)" />
            <span class="sc-grade">{{ s.grade }}</span>
            <span v-if="s.pages" class="sc-pages">{{ s.pages }} 页</span>
            <span v-else-if="s.words" class="sc-pages">{{ Math.round(s.words / 100) / 10 }} 千字</span>
            <div v-if="s.deckId || s.docId" class="sc-hover">
              <span class="sc-hover-pill">
                <component :is="s.docId ? FileText : Eye" :size="15" :stroke-width="2" />
                {{ s.docId ? "看 Word 版" : "点开看" }}
              </span>
            </div>
          </div>
          <div class="sc-body">
            <div class="sc-text">
              <div class="sc-title">{{ s.title }}</div>
              <div class="sc-meta">
                <span v-if="s.by" class="sc-by">{{ s.by }}</span>
                <span class="sc-sub">{{ s.subtitle }}</span>
              </div>
            </div>
            <button
              v-if="s.deckId || s.docId"
              class="sc-same"
              :disabled="cloning"
              :title="s.docId ? '把这份原教案喂给 AI，生成同款' : '把这份原课件喂给 AI，生成同款'"
              @click.stop="makeSame(s)"
            >
              <Sparkles :size="13" :stroke-width="2" /> 做同款
            </button>
          </div>
        </div>
        <div v-if="!filteredSamples.length" class="lib-empty">该分类下暂无范例</div>
      </div>
      </template>
    </div>

    <!-- 课件逐页预览弹窗 -->
    <Transition name="pv">
      <div v-if="preview" class="pv-mask" @click.self="closePreview()">
        <div class="pv-panel">
          <div class="pv-head">
            <div class="pv-head-text">
              <span class="pv-title">{{ preview.title }}</span>
              <span class="pv-tags">
                <span class="pv-tag">{{ preview.grade }}</span>
                <span v-if="preview.by" class="pv-tag">{{ preview.by }}</span>
              </span>
            </div>
            <div class="pv-head-actions">
              <button v-if="!isDocPreview" class="pv-fs" title="全屏放映 (Esc 退出)" @click="toggleFullscreen()">
                <Maximize :size="15" :stroke-width="2" /> 全屏播放
              </button>
              <button class="pv-x" title="关闭 (Esc)" @click="closePreview()">
                <X :size="18" :stroke-width="2" />
              </button>
            </div>
          </div>

          <!-- 教案范例:真 Word 版纸张预览(只读)。与编辑器同一个 DocViewer —— 这里看到的
               排版就是「做同款」之后能逐段改的那份,不是另做一套只能看的死图。 -->
          <div v-if="isDocPreview" class="pv-doc">
            <div v-if="docLoading" class="pv-doc-state">
              <Loader :size="20" class="spin" /> 正在载入教案…
            </div>
            <DocViewer v-else-if="docSpec" :spec="docSpec" :editable="false" />
            <div v-else class="pv-doc-state">教案载入失败，可点下方「用 Word 打开」看原文件</div>
          </div>

          <div v-if="!isDocPreview" ref="stageEl" class="pv-stage" :class="{ fs: isFs }" @click="onStageClick">
            <button class="pv-nav prev" :disabled="page <= 1" @click.stop="flip(-1)">
              <ChevronLeft :size="22" :stroke-width="2" />
            </button>
            <img
              class="pv-slide"
              :src="slideSrc(preview.deckId!, page)"
              :alt="`${preview.title} 第 ${page} 页`"
            />
            <button class="pv-nav next" :disabled="page >= (preview.pages || 1)" @click.stop="flip(1)">
              <ChevronRight :size="22" :stroke-width="2" />
            </button>
            <span v-if="isFs" class="pv-fs-count">{{ page }} / {{ preview.pages }} · 点击翻页 · Esc 退出</span>
          </div>

          <div v-if="!isDocPreview" class="pv-thumbs">
            <button
              v-for="n in preview.pages || 0"
              :key="n"
              class="pv-thumb"
              :class="{ on: n === page }"
              @click="page = n"
            >
              <img :src="thumbSrc(preview.deckId!, n)" :alt="`第 ${n} 页`" loading="lazy" />
            </button>
          </div>

          <div class="pv-foot">
            <span v-if="isDocPreview" class="pv-count">{{ preview.words ? `${preview.words} 字` : "教案范例" }}</span>
            <span v-else class="pv-count">{{ page }} / {{ preview.pages }}</span>
            <div class="pv-actions">
              <button
                v-if="isTauri && isDocPreview"
                class="pv-btn ghost"
                :disabled="opening"
                title="用系统里的 Word 打开原教案：保真度 100%"
                @click="openInWord(preview!)"
              >
                <Loader v-if="opening" :size="15" class="spin" />
                <FileText v-else :size="15" :stroke-width="2" />
                用 Word 打开
              </button>
              <button
                v-else-if="isTauri"
                class="pv-btn ghost"
                :disabled="opening"
                title="用系统里的 PowerPoint 打开原课件：保真度 100%，动画与母版都在"
                @click="openInPowerPoint(preview!)"
              >
                <Loader v-if="opening" :size="15" class="spin" />
                <MonitorPlay v-else :size="15" :stroke-width="2" />
                用 PowerPoint 放映
              </button>
              <button class="pv-btn ghost" :title="isDocPreview ? '不带原文件，只用这课的提示词生成同类教案' : '不带原文件，只用这课的提示词生成同类课件'" @click="useSample(preview!); closePreview()">只借思路生成</button>
              <button class="pv-btn primary" :disabled="cloning" :title="isDocPreview ? '把这份原教案作为参考附件喂给 AI' : '把这份原课件作为参考附件喂给 AI'" @click="makeSame(preview!)">
                <Loader v-if="cloning" :size="15" class="spin" />
                <Sparkles v-else :size="15" :stroke-width="2" />
                做同款
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.home-scroll {
  flex: 1;
  overflow-y: auto;
  background: var(--bg-chat);
}
/* chat 版式：让滚动容器成为纵向弹性列，好让首页整块撑满高度、输入卡沉底 */
.home-scroll.chat {
  display: flex;
  flex-direction: column;
}
.home {
  position: relative;
  max-width: 1056px;
  margin: 0 auto;
  padding: 40px 24px 80px;
}
/* chat 版式（新建对话通用助手）：问候 + chip + 输入卡当作**一整组**垂直居中，
   再靠较大的下内边距把这组整体上提一档（视觉重心略高于正中，比沉底更聚拢好看）。
   用 flex:1 + min-height:0 撑满滚动容器高度（min-height:100% 在 flex 链里不稳定）。 */
.home.chat {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  /* 比工坊版式更宽：输入卡几乎横撑到内容区左右两边，只留一档呼吸的边距。
     1560 只是超宽屏上的兜底封顶，常规窗口下等同于满宽。
     ⚠ width:100% 不能省 —— .home 是 flex 项且带 margin:0 auto，
     横向 auto 边距会让它退化成「按内容收缩」，max-width 只封顶不给宽，
     结果输入卡被 chip 行的宽度勒住（真踩过：设了 1280 仍只有 ~630）。 */
  width: 100%;
  max-width: 1560px;
  /* justify-content:center 是按「内边距盒」居中的，所以上内边距比下内边距大多少，
     整组就往下挪多少的一半。这里用 18vh 让下移量随窗口高度走（矮窗口自动收敛，
     不会把输入卡顶出视口），220px 封顶。对标 WorkBuddy 首页：输入卡中心落在
     视口高度约 2/3 处 —— 不贴底，也不飘在上半部。 */
  padding: min(18vh, 220px) 36px 24px;
}
/* 这一组内部的节奏：标题 → 输入卡，间距收紧成一个整体 */
.home.chat .hero-title {
  font-size: 34px;
  line-height: 48px;
}
.home.chat .composer-wrap {
  margin-top: 22px;
}
/* 卡片变宽后若仍是单行高，会显得像一条细长的带子；给它一点纵向体量才压得住场面 */
.home.chat .composer {
  padding: 26px 26px 16px;
}
.home.chat .composer textarea {
  min-height: 84px;
}

/* ── Hero：工坊版式标题左对齐；chat 版式居中问候 ── */
.hero-block {
  position: relative;
  padding: 10px 0 0;
}
.hero-block.center {
  text-align: center;
}
/* ── 输入卡包裹 + 从右上角外沿探头的吉祥物（LUMI 猫形机器人）──
   吉祥物落在输入卡之下（z-index:0），爪子被卡片盖住，只露出探头。
   PNG 已是透明底（原图自带的白底 + 白卡片都抠掉了），所以护眼 / 深色主题下
   不会再露出生硬的白矩形；换图时务必也保持透明底。 */
.composer-wrap {
  position: relative;
  /* 原先这段间距由 chip 行的 margin 撑着，chip 移除后由输入卡自己接管 */
  margin-top: 26px;
}
.composer-mascot {
  position: absolute;
  right: 24px;
  /* 设计稿：爪子搭在输入卡上沿、下半身被卡片盖住，只露出探头。下探 12px 交给 z-index
     更高的 .composer 盖住即可 —— 前提是卡片有那圈**实心**渐变描边（见 .composer）：
     描边跟卡片一起画在猫之上，卡沿那条线才会完整地从猫身上横穿过去而不断开。
     早先卡片只有一层 ~20% 不透明度的辉光当轮廓，压到猫的白身体上就没了，线在猫这里断一截，
     看着像「边框被猫啃掉一块」——那是描边的问题，不是位置的问题，别再靠抬高吉祥物来绕。 */
  bottom: calc(100% - 12px);
  /* 图已抠成透明底（512×392，白卡片连同白底一起去掉），这里必须按原比例给高，
     否则 contain 会在框里留空。 */
  width: 128px;
  height: 98px;
  object-fit: contain;
  object-position: center bottom;
  z-index: 0;
  pointer-events: none;
  user-select: none;
}
.hero-title {
  font-size: 30px;
  line-height: 44px;
  font-weight: 600;
  letter-spacing: 0.063px;
  margin: 0;
  color: var(--text);
}

/* ── 输入卡（设计稿）：18px 圆角 + 1px 品牌渐变描边（左青右绿）+ 一层绿色辉光 ──
   描边必须是实心的，不能只靠辉光：辉光只有 ~20% 不透明度，压到吉祥物的白色身体上
   就完全看不见了，卡沿那条线会在猫这里断一截，看着像「边框被猫啃掉」。
   渐变描边靠双层背景实现：padding-box 那层铺卡面底色，border-box 那层铺 --brand-grad，
   1px 的透明 border 正好把渐变露出来当描边。 */
.composer {
  position: relative;
  z-index: 1;
  border: 1px solid transparent;
  border-radius: 18px;
  background:
    linear-gradient(var(--panel), var(--panel)) padding-box,
    var(--brand-grad) border-box;
  padding: 20px 20px 14px;
  box-shadow: 0 2px 13.4px var(--brand-glow);
  transition: box-shadow 0.2s cubic-bezier(0.32, 0.72, 0, 1);
}
.composer:focus-within {
  box-shadow: 0 2px 20px var(--brand-glow);
}
.composer.busy {
  opacity: 0.85;
}
.composer-top {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.composer textarea {
  flex: 1;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--text);
  font-size: 17px;
  line-height: 27px;
  letter-spacing: -0.432px;
  /* 起手就是一块「敢写长句」的大框（≈3 行），随内容长高，到 320 后框内滚动 */
  min-height: 84px;
  max-height: 320px;
  font-family: inherit;
  overflow-y: auto;
}
.composer textarea::placeholder {
  color: var(--dim);
}
.attach-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0 2px;
}
.attach-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: 7px;
  background: var(--selection-bg);
  font-size: 12px;
  color: var(--text-2);
}
.ac-x {
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
.composer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
}
.cb-left {
  display: flex;
  align-items: center;
  gap: 4px;
}
/* 话筒与发送同组：语音是「说完就发」的一步，放在发送手边而不是附件那头 */
.cb-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cb-ic {
  position: relative;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.14s, color 0.14s;
}
.cb-ic:hover {
  background: var(--selection-bg);
  color: var(--text);
}
.cb-ic.mic.live {
  color: var(--brand);
  background: color-mix(in srgb, var(--brand) 14%, transparent);
}
.mic-ping {
  position: absolute;
  inset: -2px;
  border-radius: 11px;
  border: 2px solid var(--brand);
  animation: micp 1s ease-out infinite;
}
@keyframes micp {
  0% { opacity: 0.7; transform: scale(0.9); }
  100% { opacity: 0; transform: scale(1.25); }
}
.up-hint {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--muted);
  margin-left: 6px;
}
/* 发送键（设计稿）：35px 圆钮 —— 空输入时灰 #ADADAD，有内容才亮成绿渐变 */
.send {
  width: 35px;
  height: 35px;
  border-radius: 22px;
  border: none;
  background: var(--brand-grad);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.16s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.16s;
}
.send:hover:not(:disabled) {
  transform: translateY(-1px);
}
.send:disabled {
  background: #adadad;
  color: #fff;
  cursor: not-allowed;
}
.spin {
  animation: sp 0.9s linear infinite;
}
@keyframes sp {
  to { transform: rotate(360deg); }
}

/* ── 案例区头部 ── */
.lib-title-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin: 48px 0 0;
}
.lib-title {
  font-size: 20px;
  line-height: 36px;
  font-weight: 800;
  color: var(--ink);
  margin: 0;
  letter-spacing: 0.051px;
}
.lib-hint {
  font-size: 13px;
  color: var(--muted);
}
.lib-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 14px 0 18px;
  flex-wrap: wrap;
}
.grade-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
/* 学段 chip（设计稿）：选中= 绿渐变实底白字 700，未选中= 无底 500 #44444A */
.gt {
  border: none;
  background: transparent;
  color: var(--text-2);
  font-size: 15px;
  line-height: 18px;
  font-weight: 500;
  letter-spacing: -0.234px;
  padding: 6px 12px;
  height: 30px;
  border-radius: 8px;
  cursor: pointer;
  transition: color 0.14s, background 0.14s;
}
.gt:hover {
  background: var(--selection-bg);
}
.gt.on {
  background: var(--brand-grad);
  color: #fff;
  font-weight: 700;
}
/* 学科 chip：次一级筛选，选中只换绿字，不加底 —— 避免两行 chip 打架 */
.subject-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: -2px 0 18px;
}
.sjt {
  border: none;
  background: transparent;
  color: color-mix(in srgb, var(--text-2) 62%, transparent);
  font-size: 15px;
  line-height: 18px;
  font-weight: 400;
  letter-spacing: -0.234px;
  padding: 6px 12px;
  height: 32px;
  border-radius: 8px;
  cursor: pointer;
  transition: color 0.14s, background 0.14s;
}
.sjt:hover {
  color: var(--text);
  background: var(--selection-bg);
}
.sjt.on {
  color: var(--brand);
  font-weight: 500;
}
/* 主区搜索框：260 宽全圆角实底，无描边 */
.lib-search {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 9px 16px;
  height: 36.5px;
  border-radius: 999px;
  background: var(--active-bg);
  border: none;
  color: var(--muted);
  min-width: 260px;
}
.lib-search input {
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  letter-spacing: -0.15px;
  color: var(--text);
  flex: 1;
}
.lib-search input::placeholder {
  color: rgba(117, 117, 117, 0.45);
}

/* ── 案例卡片网格 ── */
/* 设计稿：3 列固定网格，卡片 radius 14、白底 + 一层柔投影（不描边） */
.sample-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}
.sample-card {
  text-align: left;
  border: none;
  border-radius: 14px;
  background: var(--panel);
  box-shadow: var(--shadow-card);
  overflow: hidden;
  cursor: pointer;
  padding: 0;
  transition: transform 0.2s cubic-bezier(0.32, 0.72, 0, 1), box-shadow 0.2s cubic-bezier(0.32, 0.72, 0, 1);
}
/* 反馈落在投影上，封面截图保持安静（不缩放） */
.sample-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.1);
}
.sample-card:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.sc-cover {
  position: relative;
  aspect-ratio: 16 / 9;
  background: var(--selection-bg);
  overflow: hidden;
}
.sc-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.sc-grade {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 2px 9px;
  border-radius: 999px;
  background: rgba(20, 18, 40, 0.68);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  backdrop-filter: blur(3px);
}
.sc-pages {
  position: absolute;
  right: 8px;
  bottom: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(20, 18, 40, 0.68);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  backdrop-filter: blur(3px);
}
/* 悬浮「点开看」遮罩 */
.sc-hover {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, rgba(30, 26, 60, 0) 30%, rgba(30, 26, 60, 0.38));
  opacity: 0;
  transition: opacity 0.18s;
}
.sample-card:hover .sc-hover {
  opacity: 1;
}
.sc-hover-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--brand);
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
}
.sc-body {
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.sc-text {
  min-width: 0;
}
.sc-title {
  font-size: 15px;
  line-height: 27px;
  font-weight: 700;
  letter-spacing: -0.234px;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sc-meta {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 5px;
  min-width: 0;
}
/* 学科 chip：灰底小标签（设计稿 12/600 #44444A on #EBEBE8） */
.sc-by {
  flex-shrink: 0;
  font-size: 12px;
  line-height: 21px;
  font-weight: 600;
  color: var(--text-2);
  background: var(--selection-bg);
  padding: 1px 7px;
  border-radius: 6px;
}
.sc-sub {
  font-size: 13px;
  line-height: 23px;
  letter-spacing: -0.076px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 「做同款」：常态描边幽灵胶囊，卡片被注视时才亮成绿渐变 —— 一屏只有一处彩色 */
.sc-same {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--border-soft);
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  line-height: 15px;
  font-weight: 700;
  padding: 5px 10px;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.16s cubic-bezier(0.32, 0.72, 0, 1), color 0.16s cubic-bezier(0.32, 0.72, 0, 1), border-color 0.16s cubic-bezier(0.32, 0.72, 0, 1);
}
.sample-card:hover .sc-same {
  background: var(--brand-grad);
  border-color: transparent;
  color: #fff;
}
.sc-same:disabled {
  opacity: 0.6;
  cursor: wait;
}
.lib-empty {
  grid-column: 1 / -1;
  text-align: center;
  color: var(--dim);
  padding: 40px 0;
  font-size: 14px;
}

/* ── 课件逐页预览弹窗 ── */
/* 遮罩径向渐晕：面板处亮、四角暗，天然聚光 */
.pv-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: radial-gradient(120% 90% at 50% 42%, rgba(18, 16, 34, 0.42) 0%, rgba(18, 16, 34, 0.68) 100%);
  backdrop-filter: blur(10px) saturate(1.05);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
}
.pv-panel {
  width: min(1080px, 100%);
  max-height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border: 1px solid var(--border-soft);
  border-radius: 18px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.07),
    0 8px 28px rgba(10, 8, 24, 0.2),
    0 36px 100px -24px rgba(10, 8, 24, 0.55);
  overflow: hidden;
}
.pv-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px 12px;
  border-bottom: 1px solid var(--border-soft);
}
.pv-head-text {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.pv-title {
  font-size: 17px;
  font-weight: 800;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pv-tags {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.pv-tag {
  font-size: 12px;
  font-weight: 600;
  color: var(--brand);
  background: color-mix(in srgb, var(--brand) 10%, transparent);
  padding: 2px 8px;
  border-radius: 999px;
}
.pv-tag.dim {
  color: var(--muted);
  background: var(--selection-bg);
}
.pv-head-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.pv-fs {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid color-mix(in srgb, var(--brand) 35%, transparent);
  background: transparent;
  color: var(--brand);
  font-size: 12.5px;
  font-weight: 700;
  padding: 6px 13px;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.14s, color 0.14s;
}
.pv-fs:hover {
  background: var(--brand-grad);
  color: #fff;
}
.pv-x {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.14s, color 0.14s;
}
.pv-x:hover {
  background: var(--selection-bg);
  color: var(--text);
}
.pv-stage {
  position: relative;
  background: #12101c;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}
.pv-slide {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: contain;
  display: block;
  max-height: 64vh;
}
/* 教案范例：真 Word 版纸张预览（DocViewer 自带深底与左大纲栏） */
.pv-doc {
  display: flex;
  min-height: 0;
  height: 66vh;
  background: #3a3a3f;
}
.pv-doc-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.62);
  font-size: 13px;
}
/* 全屏放映态：图占满屏，点击翻页 */
.pv-stage.fs {
  background: #000;
  cursor: pointer;
}
.pv-stage.fs .pv-slide {
  max-height: 100vh;
  height: 100vh;
  aspect-ratio: auto;
}
.pv-fs-count {
  position: absolute;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 16px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  backdrop-filter: blur(4px);
  pointer-events: none;
}
.pv-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(3px);
  transition: background 0.14s, opacity 0.14s;
}
.pv-nav:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.3);
}
.pv-nav:disabled {
  opacity: 0.25;
  cursor: default;
}
.pv-nav.prev { left: 12px; }
.pv-nav.next { right: 12px; }
/* 缩略条并入暗场：内容区暗、操作区亮，沉浸不被一条亮带扯破 */
.pv-thumbs {
  display: flex;
  gap: 8px;
  padding: 10px 14px;
  overflow-x: auto;
  background: rgba(20, 18, 31, 0.96);
}
.pv-thumb {
  flex-shrink: 0;
  width: 86px;
  aspect-ratio: 16 / 9;
  border: 2px solid transparent;
  border-radius: 7px;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.06);
  opacity: 0.55;
  transition: opacity 0.16s cubic-bezier(0.32, 0.72, 0, 1), border-color 0.16s cubic-bezier(0.32, 0.72, 0, 1);
}
.pv-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.pv-thumb:hover {
  opacity: 1;
}
.pv-thumb.on {
  opacity: 1;
  border-color: var(--brand);
}
.pv-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 18px 14px;
}
.pv-count {
  font-size: 13px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.pv-actions {
  display: flex;
  gap: 10px;
}
.pv-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 700;
  padding: 9px 18px;
  cursor: pointer;
  transition: background 0.16s cubic-bezier(0.32, 0.72, 0, 1), color 0.16s cubic-bezier(0.32, 0.72, 0, 1), transform 0.16s cubic-bezier(0.32, 0.72, 0, 1);
}
.pv-btn.ghost {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-2);
}
.pv-btn.ghost:hover {
  background: var(--selection-bg);
  color: var(--text);
}
.pv-btn.primary {
  border: none;
  background: var(--brand-grad);
  color: #fff;
}
.pv-btn.primary:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(0.95);
}
.pv-btn.primary:disabled {
  opacity: 0.7;
  cursor: wait;
}
.pv-enter-active,
.pv-leave-active {
  transition: opacity 0.2s cubic-bezier(0.32, 0.72, 0, 1);
}
.pv-enter-active .pv-panel,
.pv-leave-active .pv-panel {
  transition: transform 0.2s cubic-bezier(0.32, 0.72, 0, 1);
}
.pv-enter-from,
.pv-leave-to {
  opacity: 0;
}
.pv-enter-from .pv-panel,
.pv-leave-to .pv-panel {
  transform: scale(0.96);
}
</style>

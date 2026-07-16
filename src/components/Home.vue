<script setup lang="ts">
import { ref, computed, onBeforeUnmount, onMounted } from "vue";
import { Paperclip, Image as ImageIcon, Mic, Send, Search, Loader, Eye, Sparkles, X, ChevronLeft, ChevronRight, Maximize, MonitorPlay } from "@lucide/vue";
import { useAppStore } from "../stores/app";
import { useChatStore } from "../stores/chat";
import { chat as chatApi, artifacts, invoke, listen, isTauri, type AttachedFile } from "../tauri";
import { useFileDrop } from "../composables/useFileDrop";
import { MODES, GRADES, type Grade, type TeachSample } from "../lib/teachSamples";
import { toast } from "../composables/useToast";

// KeepAlive 友好命名（虽然 Home 很轻，保持一致）
defineOptions({ name: "HomeView" });

const app = useAppStore();
const chat = useChatStore();

const mode = computed(() => MODES[app.homeMode]);

// hero 大标题：{高亮词} 拆分渲染
const heroParts = computed(() => {
  const s = mode.value.hero;
  const m = s.match(/^(.*)\{(.+)\}(.*)$/);
  if (!m) return [{ t: s, hi: false }];
  return [
    { t: m[1], hi: false },
    { t: m[2], hi: true },
    { t: m[3], hi: false },
  ];
});

// 吉祥物图缺失时（打包漏带 / 文件被删）回退到原来的渐变圆球，hero 不塌成空洞
const mascotOk = ref(true);

// ───────── 输入 + 附件 ─────────
const input = ref("");
const inputEl = ref<HTMLTextAreaElement | null>(null);
const uploads = ref<AttachedFile[]>([]);
const uploading = ref(false);
const busy = ref(false);

function autoGrow() {
  const el = inputEl.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 220) + "px";
}

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

// ───────── 语音听写（桌面端；点话筒开/关，文字长进输入框） ─────────
const dictating = ref(false);
let voiceUn: (() => void) | null = null;
async function toggleDictate() {
  if (!isTauri) {
    toast.info("语音输入在桌面端可用");
    return;
  }
  try {
    if (!dictating.value) {
      if (!voiceUn) {
        voiceUn = await listen<{ text?: string; error?: string }>("voice:dictation", (f) => {
          if (f?.text) {
            input.value = (input.value + f.text).trimStart();
            autoGrow();
          }
          if (f?.error) toast.error(`识别失败：${f.error}`);
        });
      }
      await invoke("voice_dictate_start");
      dictating.value = true;
    } else {
      await invoke("voice_dictate_stop");
      dictating.value = false;
    }
  } catch (e: any) {
    dictating.value = false;
    toast.error(`语音失败：${e?.message ?? e}`);
  }
}
onBeforeUnmount(() => {
  voiceUn?.();
  if (dictating.value) invoke("voice_dictate_stop").catch(() => {});
});

// ───────── 生成 ─────────
const canSend = computed(() => (input.value.trim().length > 0 || uploads.value.length > 0) && !busy.value);

/** 从提示词/附件名里提取课程名，给左栏对话起名（如「找春天 · 课件」）。提不出返回空串。 */
function deriveConvTitle(text: string, m: (typeof MODES)[keyof typeof MODES]): string {
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
    await chat.send(conv.id, m.buildPrompt(userText), display, undefined, {
      permissionMode: "auto_current",
      skillIds: m.skillIds,
      goal: m.goal,
    });
    // 进入工作台：中间对话流 + 右侧大预览（产物产出后右抽屉自动展开）
    input.value = "";
    uploads.value = [];
    app.drawerCollapsed = false;
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

function openSample(s: TeachSample) {
  if (!s.deckId) {
    useSample(s);
    return;
  }
  preview.value = s;
  page.value = 1;
}
function closePreview() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  preview.value = null;
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

// 做同款的提示词按模式区分：课件模式参考版式做课件，教案模式参考课件写教案
function samePrompt(s: TeachSample): string {
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
  if (!s.deckId) {
    useSample(s);
    return;
  }
  if (cloning.value) return;
  cloning.value = true;
  try {
    const af = await materializeDeck(s);
    if (!uploads.value.some((u) => u.path === af.path)) uploads.value.push(af);
    input.value = samePrompt(s);
    autoGrow();
    closePreview();
    inputEl.value?.focus();
    document.querySelector(".home-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
    toast.success(`已把《${s.title}》原课件放入附件，可直接生成同款`);
  } catch (e: any) {
    toast.error(`做同款失败：${e?.message ?? e}`);
  } finally {
    cloning.value = false;
  }
}

// ───────── 范例库过滤（年级 + 搜索） ─────────
const grade = ref<Grade>("全部");
const search = ref("");
// 「全部」视图高中在前（主力用户是高中教师），同年级保持录入顺序（sort 稳定）
const GRADE_RANK: Record<string, number> = { 高中: 0, 初中: 1, 小学: 2, 学前: 3, 其他: 4 };
const filteredSamples = computed(() => {
  let list = mode.value.samples;
  if (grade.value !== "全部") list = list.filter((s) => s.grade === grade.value);
  else list = [...list].sort((a, b) => (GRADE_RANK[a.grade] ?? 9) - (GRADE_RANK[b.grade] ?? 9));
  const q = search.value.trim().toLowerCase();
  if (q) list = list.filter((s) => (s.title + s.subtitle).toLowerCase().includes(q));
  return list;
});

// 封面：有 cover 名则优先真图 .png（codex 生成）缺则回退 .svg；无 cover 名用课件第 1 页截图
function coverSrc(s: TeachSample) {
  if (s.cover) return `/sample-covers/${s.cover}.png`;
  return s.deckId ? thumbSrc(s.deckId, 1) : "";
}
function onCoverErr(e: Event, s: TeachSample) {
  const img = e.target as HTMLImageElement;
  if (s.cover && !img.src.endsWith(".svg")) img.src = `/sample-covers/${s.cover}.svg`;
}
</script>

<template>
  <div class="home-scroll">
    <div class="home">
      <!-- Hero -->
      <div class="hero-block">
        <img class="hero-mascot" src="/mascot/mascot.png" alt="" @error="mascotOk = false" v-show="mascotOk" />
        <div v-if="!mascotOk" class="hero-orb"></div>
        <h1 class="hero-title">
          <template v-for="(p, i) in heroParts" :key="i">
            <span :class="{ hi: p.hi }">{{ p.t }}</span>
          </template>
        </h1>
      </div>

      <!-- 干净输入框（附件 / 图片 / 话筒 / 发送） -->
      <div class="composer" :class="{ busy }">
        <div class="composer-top">
          <span class="mode-badge">{{ mode.badge }}</span>
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
            <button
              class="cb-ic mic"
              :class="{ live: dictating }"
              title="语音输入"
              @click="toggleDictate"
            >
              <Mic :size="19" :stroke-width="1.7" />
              <span v-if="dictating" class="mic-ping"></span>
            </button>
            <span v-if="uploading" class="up-hint"><Loader :size="13" class="spin" /> 处理素材…</span>
          </div>
          <button class="send" :disabled="!canSend" title="生成 (Enter)" @click="generate">
            <Loader v-if="busy" :size="18" class="spin" />
            <Send v-else :size="18" :stroke-width="1.8" />
          </button>
        </div>
      </div>

      <!-- 案例区：标题 + 年级 tab + 搜索 -->
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
            <div v-if="s.deckId" class="sc-hover">
              <span class="sc-hover-pill"><Eye :size="15" :stroke-width="2" /> 点开看</span>
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
              v-if="s.deckId"
              class="sc-same"
              :disabled="cloning"
              title="把这份原课件喂给 AI，生成同款"
              @click.stop="makeSame(s)"
            >
              <Sparkles :size="13" :stroke-width="2" /> 做同款
            </button>
          </div>
        </div>
        <div v-if="!filteredSamples.length" class="lib-empty">该分类下暂无范例</div>
      </div>
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
              <button class="pv-fs" title="全屏放映 (Esc 退出)" @click="toggleFullscreen()">
                <Maximize :size="15" :stroke-width="2" /> 全屏播放
              </button>
              <button class="pv-x" title="关闭 (Esc)" @click="closePreview()">
                <X :size="18" :stroke-width="2" />
              </button>
            </div>
          </div>

          <div ref="stageEl" class="pv-stage" :class="{ fs: isFs }" @click="onStageClick">
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

          <div class="pv-thumbs">
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
            <span class="pv-count">{{ page }} / {{ preview.pages }}</span>
            <div class="pv-actions">
              <button
                v-if="isTauri"
                class="pv-btn ghost"
                :disabled="opening"
                title="用系统里的 PowerPoint 打开原课件：保真度 100%，动画与母版都在"
                @click="openInPowerPoint(preview!)"
              >
                <Loader v-if="opening" :size="15" class="spin" />
                <MonitorPlay v-else :size="15" :stroke-width="2" />
                用 PowerPoint 放映
              </button>
              <button class="pv-btn ghost" title="不带原文件，只用这课的提示词生成同类课件" @click="useSample(preview!); closePreview()">只借思路生成</button>
              <button class="pv-btn primary" :disabled="cloning" title="把这份原课件作为参考附件喂给 AI" @click="makeSame(preview!)">
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
.home {
  position: relative;
  max-width: 1120px;
  margin: 0 auto;
  padding: 40px 32px 80px;
}
/* 页顶两团同源紫雾：给 hero 的光一点「空气」，往下自然回素底 */
.home::before {
  content: "";
  position: absolute;
  top: -140px;
  left: 50%;
  transform: translateX(-50%);
  width: min(960px, 92%);
  height: 520px;
  background:
    radial-gradient(closest-side at 36% 38%, color-mix(in srgb, var(--primary, #6a5cff) 9%, transparent) 0%, transparent 70%),
    radial-gradient(closest-side at 68% 26%, color-mix(in srgb, var(--primary, #6a5cff) 6%, transparent) 0%, transparent 72%);
  pointer-events: none;
  z-index: 0;
}
.home > * {
  position: relative;
  z-index: 1;
}

/* ── Hero ── */
.hero-block {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 26px 0 30px;
}
.hero-block::before {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 560px;
  height: 260px;
  transform: translate(-50%, -52%);
  background: radial-gradient(closest-side, color-mix(in srgb, var(--primary, #6a5cff) 14%, transparent) 0%, transparent 72%);
  pointer-events: none;
}
/* 卡通吉祥物：hero 的主视觉，比原来的小圆球更有存在感 */
.hero-mascot {
  width: 76px;
  height: 76px;
  object-fit: contain;
  flex-shrink: 0;
  filter: drop-shadow(0 10px 26px color-mix(in srgb, var(--primary, #6a5cff) 30%, transparent));
}
.hero-orb {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 32%,
    color-mix(in srgb, var(--primary, #6a5cff) 45%, #fff) 0%,
    var(--primary, #6a5cff) 58%,
    color-mix(in srgb, var(--primary, #6a5cff) 78%, #1e1b4b) 100%);
  box-shadow: 0 10px 32px -6px color-mix(in srgb, var(--primary, #6a5cff) 45%, transparent);
  flex-shrink: 0;
}
.hero-title {
  font-size: 40px;
  font-weight: 800;
  letter-spacing: 1px;
  margin: 0;
  color: var(--text);
  font-family: var(--serif, inherit);
}
/* 高亮词：同源三站渐变（深→本色→浅），不引第二色相 */
.hero-title .hi {
  background: linear-gradient(98deg,
    color-mix(in srgb, var(--primary, #6a5cff) 85%, #1e1b4b) 0%,
    var(--primary, #6a5cff) 48%,
    color-mix(in srgb, var(--primary, #6a5cff) 55%, #fff) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

/* ── 输入框：边框退后，聚焦时软光环托起 ── */
.composer {
  border: 1px solid color-mix(in srgb, var(--primary, #6a5cff) 30%, var(--border-soft));
  border-radius: 18px;
  background: var(--panel);
  padding: 18px 18px 12px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.65),
    0 1px 2px rgba(20, 18, 40, 0.04),
    0 14px 44px -14px color-mix(in srgb, var(--primary, #6a5cff) 20%, transparent);
  transition: border-color 0.2s cubic-bezier(0.32, 0.72, 0, 1), box-shadow 0.2s cubic-bezier(0.32, 0.72, 0, 1);
}
.composer:focus-within {
  border-color: color-mix(in srgb, var(--primary, #6a5cff) 55%, transparent);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.65),
    0 0 0 3px color-mix(in srgb, var(--primary, #6a5cff) 10%, transparent),
    0 18px 52px -14px color-mix(in srgb, var(--primary, #6a5cff) 26%, transparent);
}
.composer.busy {
  opacity: 0.85;
}
.composer-top {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.mode-badge {
  flex-shrink: 0;
  margin-top: 2px;
  padding: 6px 14px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--primary, #6a5cff) 12%, transparent);
  color: var(--primary, #6a5cff);
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;
}
.composer textarea {
  flex: 1;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--text);
  font-size: 17px;
  line-height: 1.6;
  min-height: 30px;
  max-height: 220px;
  font-family: inherit;
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
  color: var(--primary, #6a5cff);
  background: color-mix(in srgb, var(--primary, #6a5cff) 14%, transparent);
}
.mic-ping {
  position: absolute;
  inset: -2px;
  border-radius: 11px;
  border: 2px solid var(--primary, #6a5cff);
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
.send {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--primary, #6a5cff) 84%, #fff) 0%,
    var(--primary, #6a5cff) 55%,
    color-mix(in srgb, var(--primary, #6a5cff) 90%, #000) 100%);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 6px 18px -6px color-mix(in srgb, var(--primary, #6a5cff) 45%, transparent);
  transition: transform 0.16s cubic-bezier(0.32, 0.72, 0, 1), box-shadow 0.16s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.16s;
}
.send:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px -8px color-mix(in srgb, var(--primary, #6a5cff) 55%, transparent);
}
.send:disabled {
  background: var(--border);
  color: var(--dim);
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
  margin: 56px 0 0;
}
.lib-title {
  font-size: 20px;
  font-weight: 800;
  color: var(--text);
  margin: 0;
  letter-spacing: 0.5px;
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
.gt {
  border: none;
  background: transparent;
  color: var(--text-2);
  font-size: 15px;
  font-weight: 500;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: color 0.14s, background 0.14s;
}
.gt:hover {
  background: var(--selection-bg);
}
.gt.on {
  color: var(--primary, #6a5cff);
  font-weight: 700;
  background: color-mix(in srgb, var(--primary, #6a5cff) 10%, transparent);
}
.lib-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  border-radius: 999px;
  background: var(--bg-soft, var(--selection-bg));
  border: 1px solid var(--border-soft);
  color: var(--muted);
  min-width: 260px;
}
.lib-search input {
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: var(--text);
  flex: 1;
}

/* ── 案例卡片网格 ── */
.sample-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 20px;
}
.sample-card {
  text-align: left;
  border: 1px solid var(--border-soft);
  border-radius: 14px;
  background: var(--panel);
  overflow: hidden;
  cursor: pointer;
  padding: 0;
  transition: transform 0.2s cubic-bezier(0.32, 0.72, 0, 1), box-shadow 0.2s cubic-bezier(0.32, 0.72, 0, 1), border-color 0.2s cubic-bezier(0.32, 0.72, 0, 1);
}
/* 反馈落在边框与投影上，封面截图保持安静（不缩放） */
.sample-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--primary, #6a5cff) 26%, var(--border-soft));
  box-shadow:
    0 2px 6px rgba(20, 18, 40, 0.05),
    0 20px 48px -18px color-mix(in srgb, var(--primary, #6a5cff) 22%, rgba(20, 18, 40, 0.4));
}
.sample-card:focus-visible {
  outline: 2px solid var(--primary, #6a5cff);
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
  color: var(--primary, #6a5cff);
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
  font-weight: 700;
  color: var(--text);
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
/* 学科签名与「做同款」默认收灰，卡片被注视（hover）时才亮 —— 一屏只有一处紫 */
.sc-by {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
  background: var(--selection-bg);
  padding: 1px 7px;
  border-radius: 6px;
  transition: color 0.16s cubic-bezier(0.32, 0.72, 0, 1), background 0.16s cubic-bezier(0.32, 0.72, 0, 1);
}
.sample-card:hover .sc-by {
  color: var(--primary, #6a5cff);
  background: color-mix(in srgb, var(--primary, #6a5cff) 10%, transparent);
}
.sc-sub {
  font-size: 13px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sc-same {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--border-soft);
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  padding: 5px 10px;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.16s cubic-bezier(0.32, 0.72, 0, 1), color 0.16s cubic-bezier(0.32, 0.72, 0, 1), border-color 0.16s cubic-bezier(0.32, 0.72, 0, 1);
}
.sample-card:hover .sc-same {
  border-color: color-mix(in srgb, var(--primary, #6a5cff) 35%, transparent);
  color: var(--primary, #6a5cff);
}
.sc-same:hover:not(:disabled) {
  background: var(--primary, #6a5cff);
  border-color: var(--primary, #6a5cff);
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
  color: var(--primary, #6a5cff);
  background: color-mix(in srgb, var(--primary, #6a5cff) 10%, transparent);
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
  border: 1px solid color-mix(in srgb, var(--primary, #6a5cff) 35%, transparent);
  background: transparent;
  color: var(--primary, #6a5cff);
  font-size: 12.5px;
  font-weight: 700;
  padding: 6px 13px;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.14s, color 0.14s;
}
.pv-fs:hover {
  background: var(--primary, #6a5cff);
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
  background: color-mix(in srgb, var(--primary, #6a5cff) 9%, #12101c);
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
  border-color: var(--primary, #6a5cff);
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
  background: var(--primary, #6a5cff);
  color: #fff;
}
.pv-btn.primary:hover:not(:disabled) {
  transform: translateY(-1px);
  background: color-mix(in srgb, var(--primary, #6a5cff) 88%, #000);
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

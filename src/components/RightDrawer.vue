<script setup lang="ts">
import { ref, computed, watch, defineAsyncComponent } from "vue";
import { marked } from "marked";
import { sanitizeHtml } from "../lib/sanitize";
import { parseSpecLoose, setSpecText, applySlideOp, type SlideOp } from "../lib/slidesSpec";
import { resolveSpecImages } from "../lib/specImages";
import { usePolling } from "../composables/usePolling";
import { useSpecEdit } from "../composables/useSpecEdit";
import DeckEditor from "./DeckEditor.vue";
// 编辑器实例:导出条上的「放映/解锁拖拽」要调它(viewer 现住在 DeckEditor 里)
const deckEditorRef = ref<InstanceType<typeof DeckEditor> | null>(null);
import {
  X,
  FolderOpen,
  Download,
  Unlock,
  MousePointer2,
  ExternalLink,
  Globe,
  Maximize2,
  Minimize2,
  FileCode,
  FileText,
  File as FileIcon,
  Image as ImageIcon,
  Loader,
  PencilLine,
  Play,
  Square,
  RotateCw,
  Boxes,
  Terminal,
} from "@lucide/vue";
// 懒加载(与 App.vue 的四个 Studio 同模式): 编辑器 149KB+figmaPull/deckThemes 只在
// 用户真正进入编辑态(artifacts.editing)时才拉取, 不再吸进首屏 chunk。
const ArtifactEditor = defineAsyncComponent(() => import("./ArtifactEditor.vue"));
import { useAppStore } from "../stores/app";
import { useArtifactsStore } from "../stores/artifacts";
import { useProjectsStore } from "../stores/projects";
import { useChatStore } from "../stores/chat";
import { artifacts as artifactsApi, isTauri } from "../tauri";

const app = useAppStore();
const artifacts = useArtifactsStore();
const projects = useProjectsStore();
const chat = useChatStore();

function onStopActive() {
  if (!projects.activeRoot) return;
  // 停止=杀整个进程树,误点不可恢复,二次确认
  const name = projects.active?.name ?? "项目";
  if (!confirm(`停止运行「${name}」?进程树会被结束。`)) return;
  projects.stop(projects.activeRoot);
}
function onOpenPreviewExternal() {
  // 用系统默认浏览器打开运行中的应用（artifact_open_external 对 URL 同样适用）
  if (projects.previewUrl) artifactsApi.openExternal(projects.previewUrl);
}

// HTML / SVG（网页 PPT / 网页）走可视化编辑器；Markdown / 纯文本走文档编辑（源码+实时预览）
const canEdit = computed(() => {
  const k = artifacts.payload?.kind;
  return k === "html" || k === "svg" || k === "markdown" || k === "text";
});
const editTitle = computed(() => {
  const k = artifacts.payload?.kind;
  if (k === "markdown") return "编辑（左边改 Markdown，右边实时预览，Ctrl+S 保存）";
  if (k === "text") return "编辑此文件（Ctrl+S 保存）";
  return "编辑（放大到编辑器，可拖动/缩放元素、改文字/换主题/改源码）";
});

// ── 抽屉宽度拖拽（WorkBuddy 式收缩条）：抓左缘拖动，三种形态各记各的宽 ──
const drEl = ref<HTMLElement | null>(null);
const drDragging = ref(false);
function drawerWidthMode(): "default" | "preview" | "expand" {
  if (artifacts.current) {
    return artifacts.expanded || artifacts.editing ? "expand" : "preview";
  }
  if (projects.activeRoot) return "preview";
  return "default";
}
function startDrawerDrag(e: MouseEvent) {
  const el = drEl.value;
  if (!el) return;
  const mode = drawerWidthMode();
  drDragging.value = true;
  app.drawerResizing = true; // shell 据此关掉列宽过渡，拖拽才跟手
  const startX = e.clientX;
  const startW = el.getBoundingClientRect().width;
  // rAF 合帧：mousemove 一帧可能来好几个，只在画帧前应用最后一次（同侧栏拖拽）
  let pending = startW;
  let rafId = 0;
  const flush = () => {
    rafId = 0;
    app.setDrawerWidth(mode, pending, false);
  };
  const move = (ev: MouseEvent) => {
    pending = startW - (ev.clientX - startX); // 抓的是左缘：往左拖 = 变宽
    if (!rafId) rafId = requestAnimationFrame(flush);
  };
  const up = () => {
    drDragging.value = false;
    app.drawerResizing = false;
    if (rafId) cancelAnimationFrame(rafId);
    app.setDrawerWidth(mode, pending, true); // 松手落一次盘
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
  };
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
}
function resetDrawerWidth() {
  app.resetDrawerWidth(drawerWidthMode());
}

// ── .pptx 也能编辑：找它的网页版源稿 deck.html ──
// .pptx 是逐页截图死图，真正可编辑的是同目录的 deck.html。预览 pptx 时
// 找同目录的伴生 html（同名优先，否则取最新），「编辑」= 编辑 html + 保存后一键重导出。
const isPptx = computed(() => /\.pptx$/i.test(artifacts.current?.name ?? ""));
const pptxDeckHtml = ref<string | null>(null);
// 原生 spec 导出的 pptx:同目录的 polaris.slides.json(有它,预览就走豆包式播放器)
const pptxSiblingSpec = ref<string | null>(null);
watch(
  () => artifacts.current?.path,
  async (p) => {
    pptxDeckHtml.value = null;
    pptxSiblingSpec.value = null;
    if (!p || !/\.pptx$/i.test(p)) return;
    try {
      const norm = (s: string) => s.replace(/\\/g, "/");
      const np = norm(p);
      const dir = np.slice(0, np.lastIndexOf("/") + 1);
      const base = (np.split("/").pop() ?? "").replace(/\.pptx$/i, "");
      const list = await artifactsApi.list(app.currentConvId ?? undefined);
      // 异步竞态守卫:list/read 期间用户可能已切到别的 pptx,过期回调若继续写
      // pptxDeckHtml 会让「编辑/更新 PPT」指向上一个文件 → 覆盖错 deck。一律丢弃。
      if (artifacts.current?.path !== p) return;
      // 同目录有 polaris.slides.json = 原生 spec 导出的真可编辑 pptx ——
      // 此时绝不能给 deck.html 重导出入口:任何 html 截图覆盖都会把真文本框毁成死图。
      // 记下 spec 路径:预览改走确定性播放器(与演示工坊同一渲染器,预览即导出)。
      const sib = list.find((e) => norm(e.path) === `${dir}polaris.slides.json`);
      if (sib) {
        pptxSiblingSpec.value = sib.path;
        return;
      }
      const htmls = list.filter(
        (e) => /\.html?$/i.test(e.name) && norm(e.path).startsWith(dir)
      );
      if (!htmls.length) return;
      const exact = htmls.find((e) => e.name.replace(/\.html?$/i, "") === base);
      if (exact) {
        pptxDeckHtml.value = exact.path;
        return;
      }
      // 非同名兜底:必须验明内容确实是 deck(含 .slide 结构/导出 runtime),
      // 否则同目录随便一个网页都会被当伴生、「更新 PPT」用它覆盖毁掉原 pptx。
      const recent = [...htmls].sort((a, b) => b.modified - a.modified).slice(0, 3);
      for (const h of recent) {
        try {
          const c = await artifactsApi.read(h.path);
          if (artifacts.current?.path !== p) return; // 同上:read 期间已切走则丢弃
          if (c?.text && /class=["'][^"']*\bslide\b|__deck|data-notext-capable/.test(c.text)) {
            pptxDeckHtml.value = h.path;
            return;
          }
        } catch {
          /* 读不动就看下一个候选 */
        }
      }
    } catch {
      /* 找不到就不显示编辑入口 */
    }
  },
  { immediate: true }
);
function editPptx() {
  if (pptxDeckHtml.value && artifacts.current) {
    artifacts.enterEditDeck(pptxDeckHtml.value, artifacts.current.path);
  }
}

// ── 演示 spec / 原生 pptx → 豆包式播放器预览(DeckViewer 组件) ──
// 对话里(演示工坊之外)模型也会产 polaris.slides.json:它 kind=text,原来只能看生 JSON;
// 原生 spec 导出的 .pptx 是 binary,原来只有「暂不支持预览」。两者都改走 DeckViewer
// —— 与演示工坊同一个确定性渲染器,预览即导出。(不用 srcdoc iframe:Tauri CSP 会拦
// 它的内联脚本,播放器 runtime 跑不起来 —— 排查过,壳在页全空。)
// 生成中(chat 正在发送)每 3s 直接重读 spec 文件:配合宽容解析,模型边写页边点亮,
// 这是「一句话生成课件」主链路的豆包式实时感。不用 artifacts.refresh() —— 那会把
// loading 置真,整个预览区每 3s 闪一次加载态。
const deckSpec = ref<any | null>(null);
const deckSpecPath = ref<string | null>(null);
const deckKey = ref<string>("");
const deckPages = ref(0);
// 导出目标 = 同目录**已有的那份 pptx**(模型做的、聊天里列为交付物的那个)。
// 绝不能写死成「演示.pptx」—— 那会新建一个重复文件,而用户认识的那份纹丝不动,
// 看起来就是「导出没保存」(真踩过)。没有已存在的 pptx 时才用 spec 同名兜底。
const deckPptxPath = ref<string | null>(null);
// 【必须声明在下面那个 immediate watch 之前】它在 setup 期就同步跑并会写这两个 ref;
// 声明在后 = TDZ「Cannot access before initialization」,整个抽屉被错误边界吞掉(真踩过)。
const deckExported = ref<string | null>(null); // 刚导出的文件名(回执)
const deckExporting = ref(false);
const deckError = ref<string | null>(null);
async function resolvePptxTarget(specPath: string): Promise<string> {
  const norm = (s: string) => s.replace(/\\/g, "/");
  const np = norm(specPath);
  const dir = np.slice(0, np.lastIndexOf("/") + 1);
  try {
    const list = await artifactsApi.list(app.currentConvId ?? undefined);
    const sibs = list
      .filter((e) => /\.pptx$/i.test(e.name) && norm(e.path).startsWith(dir))
      .sort((a, b) => b.modified - a.modified);
    if (sibs.length) return sibs[0].path;
  } catch {
    /* 列不出来就走兜底名 */
  }
  return specPath.replace(/polaris\.slides\.json$/i, "课件.pptx");
}
const deckGenerating = computed(() => chat.isSending(app.currentConvId ?? null));
// 生成中且还没有可渲染的页:用等待态盖住 loading/error(spec 未落盘时 read 必然报错)
const deckPending = computed(
  () => deckGenerating.value && !!deckCandidatePath.value && !deckSpec.value
);

/** spec 文本 → 解析+内联图 → 喂 DeckViewer。内容没变(key 相同)就不重复解析。 */
async function buildDeck(specText: string, specPath: string, expectPayload: unknown) {
  const key = `${specPath}|${specText}`;
  if (key === deckKey.value) return;
  const { spec } = parseSpecLoose(specText);
  if (!spec || !Array.isArray(spec.slides) || !spec.slides.length) return;
  await resolveSpecImages(spec);
  if (artifacts.payload !== expectPayload) return; // 竞态:内联图期间已切走
  deckSpec.value = spec;
  deckSpecPath.value = specPath;
  deckKey.value = key;
  deckPages.value = spec.slides.length;
}

watch(
  [() => artifacts.payload, pptxSiblingSpec],
  async ([p, sib]) => {
    deckSpec.value = null;
    deckSpecPath.value = null;
    deckKey.value = "";
    deckPages.value = 0;
    deckPptxPath.value = null;
    deckExported.value = null;
    if (!p) return;
    if (/^polaris\.slides\.json$/i.test(p.name) && p.text) {
      await buildDeck(p.text, p.path, p);
      // 正看 spec:导出目标 = 同目录已有的那份 pptx
      if (artifacts.payload === p) deckPptxPath.value = await resolvePptxTarget(p.path);
    } else if (/\.pptx$/i.test(p.name) && sib) {
      // 正看 pptx 本身:它就是导出目标(覆盖自己)
      deckPptxPath.value = p.path;
      try {
        const r = await artifactsApi.read(sib);
        if (artifacts.payload !== p) return; // 竞态:读盘期间已切走
        if (r?.text) await buildDeck(r.text, sib, p);
      } catch {
        /* 读不到就维持原分支(binary 提示) */
      }
    }
  },
  { immediate: true }
);

// 候选 spec 路径:当前正看的就是 spec,或正看的 pptx 有伴生 spec。
// 用 current(用户意图)而不用 payload:后端的 artifact 事件可能先于文件真正落盘,
// 自动打开时 read 失败 → payload 是 null、error 挂着 —— 若轮询门要求 payload 非空,
// 文件稍后落盘也没人再去读,抽屉就死在「文件不存在」上了。
const deckCandidatePath = computed<string | null>(() => {
  const cur = artifacts.current;
  if (!cur) return null;
  if (/^polaris\.slides\.json$/i.test(cur.name)) return cur.path;
  if (/\.pptx$/i.test(cur.name) && pptxSiblingSpec.value) return pptxSiblingSpec.value;
  return null;
});
// 生成中轮询重读 spec(逐页点亮);生成结束再读最后一次(撤占位、回封面)
async function pollDeckSpec() {
  const sp = deckCandidatePath.value;
  if (!sp) return;
  // 早开晚落盘的恢复:抽屉停在错误态(payload 空)时,重开一次 —— 文件已落盘就能翻身
  if (!artifacts.payload) {
    if (artifacts.error && !artifacts.loading) await artifacts.refresh();
    return; // payload 就位后由 watch 正常构建
  }
  const p = artifacts.payload;
  try {
    const r = await artifactsApi.read(sp);
    if (r?.text && artifacts.payload === p) await buildDeck(r.text, sp, p);
  } catch {
    /* 下次轮询再试 */
  }
}
const deckPoller = usePolling(pollDeckSpec, 3000);
watch(
  () => deckGenerating.value && !!deckCandidatePath.value,
  (on, was) => {
    if (on) deckPoller.start();
    else {
      deckPoller.stop();
      if (was) void pollDeckSpec(); // 下降沿补一拍:重建成「完成态」播放器
    }
  }
);
// ── 生成 PPT 时自动收起左侧侧栏 ──
// 课件开始流式生成(右抽屉进播放器实时点亮)那一刻,横向空间全该让给舞台。
// 只在「本来是展开的」时收起,并在这份 PPT 预览关掉后恢复 —— 用户自己收着的不去动。
const sidebarAutoHidden = ref(false);
watch(
  () => deckGenerating.value && !!deckCandidatePath.value,
  (on) => {
    if (on && !app.sidebarCollapsed) {
      sidebarAutoHidden.value = true;
      app.sidebarCollapsed = true;
    }
  },
  { immediate: true }
);
watch(deckCandidatePath, (p) => {
  if (!p && sidebarAutoHidden.value) {
    sidebarAutoHidden.value = false;
    app.sidebarCollapsed = false;
  }
});
// ── 演示编辑器要铺满：一出现 spec 就把抽屉放大到宽档(工具条+舞台+格式面板才不挤) ──
// 只在「本来是窄预览」时自动放大,离开这份 PPT 再收回 —— 用户自己点收起的不去覆盖。
const deckAutoExpanded = ref(false);
watch(
  () => !!deckCandidatePath.value,
  (isDeck) => {
    if (isDeck && !artifacts.expanded) {
      deckAutoExpanded.value = true;
      artifacts.expanded = true;
    } else if (!isDeck && deckAutoExpanded.value) {
      deckAutoExpanded.value = false;
      artifacts.expanded = false;
    }
  },
  { immediate: true }
);

// 所有对 spec 的改动共用一个事务(与演示工坊同一个 composable):
// 读盘 → 改对象 → 写盘 → 刷预览 → 重转 pptx,并自动记撤销栈。
const specEdit = useSpecEdit({
  specPath: () => deckSpecPath.value,
  pptxTarget: async (sp) => {
    const out = deckPptxPath.value ?? (await resolvePptxTarget(sp));
    deckPptxPath.value = out;
    return out;
  },
  onWritten: (text, sp) => buildDeck(text, sp, artifacts.payload), // 立刻按新内容重排
  onError: (m) => (deckError.value = m),
});
// 点字直改:autofit 会按新内容重算字号,所以用户改不坏排版。
function onDeckEdit(slideIdx: number, path: string, value: string) {
  deckError.value = null;
  void specEdit.mutate((obj) => {
    if (!obj?.slides?.[slideIdx]) throw new Error("spec 结构不符");
    return setSpecText(obj.slides[slideIdx], path, value); // 没改动/路径不符:静默跳过
  });
}
// 页面级操作:加页/删页/复制/重排/备注 —— 纯 spec 变换,每页仍各自 autofit。
function onDeckOp(op: SlideOp) {
  deckError.value = null;
  void specEdit.mutate((obj) => applySlideOp(obj, op));
}
// 演示编辑默认铺满整个窗口(固定层):图2那套豆包布局 —— 大画布 + 顶部插入工具条 +
// 右侧格式面板 + 浮动文字格式条。侧抽屉太窄塞不下,舞台会被挤没,所以默认就全屏。
// 顶栏「退出全屏」可切回紧凑抽屉。
const deckMax = ref(true);
// 豆包式「退出全屏」:不是缩回窄抽屉,而是编辑器让出左侧一列露出对话面板 ——
// 左边继续跟 AI 聊着改,右边画布实时刷新。再点「全屏」收回对话列。
const deckChat = ref(false);
function toggleDeckChat() {
  deckChat.value = !deckChat.value;
  // 露出的左列得真的是对话:当前主视图不是聊天就切过去
  if (deckChat.value && app.view !== "chat") app.setView("chat");
}
// 同步给 App.vue:分栏期间抽屉在网格里的占宽清零,聊天列才有地方
watch(
  () => deckChat.value && deckMax.value && !!deckSpec.value,
  (on) => (app.deckChatSplit = on),
  { immediate: true }
);
// 换肤:deck 级 spec.theme,内容不变,预览与导出同步换色。
function onDeckTheme(id: string) {
  deckError.value = null;
  void specEdit.mutate((obj) => {
    if (obj.theme === id) return false;
    obj.theme = id;
    return true;
  });
}
// 换了 spec 文件:旧撤销栈会把上一份的内容写进新文件 —— 必须清。
// (这个 watch 只能待在 specEdit 声明之后:上面那些 immediate watch 在 setup 期就同步跑,
//  引用尚未初始化的 const 会 TDZ 报错、整个抽屉被错误边界吞掉 —— 同文件已踩过一次。)
watch(deckSpecPath, () => specEdit.resetHistory());
// 用户主动导出 = 无条件重转(不做 mtime 短路),**覆盖用户认识的那份 pptx**,
// 转完在资源管理器里选中它 —— 让「导出」这个词兑现:他看得见文件真的更新了。
async function exportDeckPptx() {
  const sp = deckSpecPath.value;
  if (!sp || deckExporting.value) return;
  deckExporting.value = true;
  deckError.value = null;
  deckExported.value = null;
  try {
    const out = deckPptxPath.value ?? (await resolvePptxTarget(sp));
    await artifactsApi.specToPptx(sp, out);
    deckPptxPath.value = out;
    deckExported.value = out.replace(/\\/g, "/").split("/").pop() ?? "";
    await artifactsApi.reveal(out);
  } catch (e: any) {
    deckError.value = `导出 PPTX 失败：${e?.message ?? e}`;
  } finally {
    deckExporting.value = false;
  }
}

const headIcon = computed(() => {
  const k = artifacts.payload?.kind;
  if (k === "html" || k === "svg") return FileCode;
  if (k === "image") return ImageIcon;
  if (k === "markdown" || k === "text") return FileText;
  return FileIcon;
});

const renderedMd = computed(() => {
  const p = artifacts.payload;
  if (p?.kind === "markdown" && p.text) {
    return sanitizeHtml(marked.parse(p.text) as string);
  }
  return "";
});

function fmtSize(n: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
</script>

<template>
  <aside
    ref="drEl"
    class="dr"
    :class="{
      collapsed: !artifacts.current && !projects.activeRoot,
      preview: !!artifacts.current || !!projects.activeRoot,
      resizing: drDragging,
      'chat-split': deckChat && deckMax && !!deckSpec,
    }"
  >
    <!-- 左缘收缩条：拖拽调宽（三种形态各记各的宽），双击恢复默认 -->
    <div
      class="dr-resizer"
      title="拖拽调节面板宽度 · 双击恢复默认"
      @mousedown.prevent="startDrawerDrag"
      @dblclick="resetDrawerWidth"
    >
      <span class="dr-grip" />
    </div>
    <!-- 拖拽期间的全屏透明罩：防止鼠标滑进 iframe 后 mousemove 被吞、拖拽中断 -->
    <div v-if="drDragging" class="dr-drag-veil"></div>
    <!-- ───────── 运行预览模式（一键启动的项目，内嵌 iframe 看应用 + 日志台） ───────── -->
    <template v-if="projects.activeRoot">
      <div class="pv-head">
        <Boxes :size="15" :stroke-width="1.7" class="pv-ficon" />
        <span class="pv-name" :title="projects.active?.root">
          {{ projects.active?.name ?? "项目" }}
        </span>
        <span v-if="projects.starting" class="pj-badge starting">启动中</span>
        <span v-else-if="projects.ready" class="pj-badge ready">运行中</span>
        <div class="pv-actions">
          <button
            class="pv-btn"
            title="重新载入预览"
            :disabled="!projects.ready"
            @click="projects.reloadFrame()"
          >
            <RotateCw :size="14" :stroke-width="1.8" />
          </button>
          <button
            class="pv-btn"
            :title="projects.logsOpen ? '隐藏日志' : '显示日志'"
            :class="{ on: projects.logsOpen }"
            @click="projects.toggleLogs()"
          >
            <Terminal :size="15" :stroke-width="1.8" />
          </button>
          <button
            class="pv-btn"
            title="用默认浏览器打开"
            :disabled="!projects.previewUrl"
            @click="onOpenPreviewExternal()"
          >
            <Globe :size="15" :stroke-width="1.8" />
          </button>
          <button class="pv-btn danger" title="停止运行" @click="onStopActive()">
            <Square :size="13" :stroke-width="2" />
          </button>
          <button class="pv-btn" title="关闭预览" @click="projects.closePreview()">
            <X :size="15" :stroke-width="2" />
          </button>
        </div>
      </div>

      <div class="pv-body pj-body">
        <!-- 应用就绪 → iframe 看真实运行的前后端 -->
        <iframe
          v-if="projects.ready && projects.previewUrl"
          :key="projects.frameNonce"
          class="pv-frame"
          :src="projects.previewUrl"
          referrerpolicy="no-referrer"
        />
        <!-- 还在装依赖 / 起服务 → 状态提示（日志在下方滚动） -->
        <div v-else class="pv-state">
          <Loader :size="22" :stroke-width="1.6" class="spin" />
          <span>正在装依赖、启动前后端…</span>
          <span class="pj-hint">首次运行要下载依赖，可能需要一会儿，下面是实时日志</span>
        </div>

        <!-- 日志台 -->
        <div v-if="projects.logsOpen" class="pj-logs">
          <div
            v-for="(l, i) in projects.logs"
            :key="i"
            class="pj-log"
            :class="l.stream"
          >
            {{ l.line }}
          </div>
          <div v-if="!projects.logs.length" class="pj-log info">等待输出…</div>
        </div>
      </div>
    </template>

    <!-- ───────── 成品编辑器（仿豆包，放大态）───────── -->
    <ArtifactEditor v-else-if="artifacts.current && artifacts.editing" />

    <!-- ───────── 成品预览模式 ───────── -->
    <template v-else-if="artifacts.current">
      <div class="pv-head">
        <component :is="headIcon" :size="15" :stroke-width="1.7" class="pv-ficon" />
        <span class="pv-name" :title="artifacts.current.path">
          {{ artifacts.current.name }}
        </span>
        <span v-if="artifacts.payload" class="pv-size">
          {{ fmtSize(artifacts.payload.size) }}
        </span>
        <div class="pv-actions">
          <button
            class="pv-btn"
            :title="isTauri ? '打开原文件夹位置' : '下载文件'"
            @click="artifacts.revealInFolder()"
          >
            <component
              :is="isTauri ? FolderOpen : Download"
              :size="15"
              :stroke-width="1.8"
            />
          </button>
          <button
            v-if="canEdit"
            class="pv-btn"
            :title="editTitle"
            @click="artifacts.enterEdit()"
          >
            <PencilLine :size="15" :stroke-width="1.8" />
          </button>
          <button
            v-else-if="isPptx && pptxDeckHtml"
            class="pv-btn"
            title="编辑此 PPT（实际编辑它的网页版源稿，保存后一键重新导出 .pptx）"
            @click="editPptx()"
          >
            <PencilLine :size="15" :stroke-width="1.8" />
          </button>
          <button
            v-else
            class="pv-btn"
            :title="artifacts.expanded ? '收起' : '放大'"
            @click="artifacts.toggleExpand()"
          >
            <component
              :is="artifacts.expanded ? Minimize2 : Maximize2"
              :size="14"
              :stroke-width="1.8"
            />
          </button>
          <button
            class="pv-btn"
            :title="isTauri ? '用默认浏览器打开' : '在新标签页打开'"
            @click="artifacts.openExternal()"
          >
            <Globe :size="15" :stroke-width="1.8" />
          </button>
          <button class="pv-btn" title="关闭预览" @click="artifacts.close()">
            <X :size="15" :stroke-width="2" />
          </button>
        </div>
      </div>

      <div class="pv-body">
        <!-- 课件生成中、spec 还没落盘:后端的 artifact 事件在模型「叙述路径」时就触发,
             比真正写盘早一两分钟。这段窗口必须给等待态 —— 否则用户盯着的是一句刺眼的
             「文件不存在或无法访问」(那是真相,但不是此刻该说的话)。轮询会在文件落盘的
             那一刻自动接上,无需用户操作。必须排在 loading/error 分支前把它们盖住。 -->
        <div v-if="deckPending" class="pv-state">
          <Loader :size="22" :stroke-width="1.6" class="spin" />
          <span>课件生成中…第一页出来就会显示</span>
        </div>
        <div v-else-if="artifacts.loading" class="pv-state">
          <Loader :size="22" :stroke-width="1.6" class="spin" />
          <span>正在加载…</span>
        </div>
        <div v-else-if="artifacts.error" class="pv-state err">
          <span>{{ artifacts.error }}</span>
          <button class="pv-open-ext" @click="artifacts.openExternal()">
            <ExternalLink :size="14" :stroke-width="1.8" />
            <span>{{ isTauri ? "用系统程序打开" : "在浏览器打开 / 下载" }}</span>
          </button>
        </div>

        <template v-else-if="artifacts.payload">
          <!-- 演示 spec / 原生 pptx → 豆包式播放器(与演示工坊同一渲染器,预览即导出)。
               必须排在 text/binary 分支前:spec 是 kind=text、原生 pptx 是 kind=binary。 -->
          <div v-if="deckSpec" class="pv-deck" :class="{ full: deckMax, chat: deckMax && deckChat }">
            <div v-if="deckError" class="pv-deck-err">{{ deckError }}</div>
            <!-- 状态文案在左,动作按钮全部靠右(pv-deck-acts 吃掉中间空白) -->
            <div class="pv-deck-bar">
              <span v-if="deckMax" class="pv-deck-file" :title="artifacts.payload?.name">{{ artifacts.payload?.name }}</span>
              <span v-if="deckGenerating" class="pv-deck-live">
                <Loader :size="12" :stroke-width="1.8" class="spin" /> 生成中 · 已出 {{ deckPages }} 页
              </span>
              <!-- 导出回执:明说存成了哪个文件 —— 否则用户以为「没保存」(真踩过) -->
              <span v-else-if="deckExported" class="pv-deck-ok">已保存到 {{ deckExported }}</span>
              <span v-else class="pv-deck-hint">原生可编辑 · 预览即导出</span>
              <div class="pv-deck-acts">
                <button
                  class="pv-deck-edit"
                  :disabled="!deckPages"
                  title="全屏放映（F5 · Esc 退出）"
                  @click="deckEditorRef?.present()"
                >
                  <Play :size="13" :stroke-width="1.8" />
                  <span>放映</span>
                </button>
                <button
                  v-if="!deckGenerating && !deckEditorRef?.curIsFreeform"
                  class="pv-deck-edit"
                  title="把本页解锁成自由版式：元素可拖拽/缩放（不可逆）。改文字不用解锁，点了就能改"
                  @click="deckEditorRef?.toggleFreeEdit()"
                >
                  <Unlock :size="13" :stroke-width="1.8" />
                  <span>解锁拖拽</span>
                </button>
                <button
                  class="pv-deck-export"
                  :disabled="deckExporting || deckGenerating"
                  :title="deckGenerating ? '生成完成后可导出' : '无条件重转并在文件夹中定位'"
                  @click="exportDeckPptx()"
                >
                  <Loader v-if="deckExporting" :size="13" :stroke-width="1.8" class="spin" />
                  <Download v-else :size="13" :stroke-width="1.8" />
                  <span>{{ deckExporting ? "导出中…" : "导出 PPTX" }}</span>
                </button>
                <button
                  class="pv-deck-edit"
                  :title="deckChat ? '收起对话，画布铺满窗口' : '退出全屏：左侧露出对话框，边聊边改'"
                  @click="toggleDeckChat"
                >
                  <component :is="deckChat ? Maximize2 : Minimize2" :size="13" :stroke-width="1.8" />
                  <span>{{ deckChat ? "全屏" : "退出全屏" }}</span>
                </button>
                <button v-if="deckMax" class="pv-deck-edit" title="关闭编辑器" @click="artifacts.close()">
                  <X :size="14" :stroke-width="2" />
                </button>
              </div>
            </div>
            <DeckEditor
              ref="deckEditorRef"
              class="pv-deck-viewer"
              :spec="deckSpec"
              :generating="deckGenerating"
              :editable="!deckGenerating"
              :full="deckMax && !deckChat"
              :can-undo="specEdit.canUndo.value"
              @edit="onDeckEdit"
              @op="onDeckOp"
              @theme="onDeckTheme"
              @undo="specEdit.undo()"
            />
          </div>
          <!-- HTML / SVG → iframe 完整渲染 -->
          <iframe
            v-else-if="
              artifacts.payload.kind === 'html' ||
              artifacts.payload.kind === 'svg'
            "
            :key="artifacts.payload.path"
            class="pv-frame"
            :srcdoc="artifacts.payload.text"
            sandbox="allow-scripts allow-popups allow-forms allow-modals allow-pointer-lock allow-downloads"
            referrerpolicy="no-referrer"
          />
          <!-- 图片 -->
          <div
            v-else-if="artifacts.payload.kind === 'image'"
            class="pv-img-wrap"
          >
            <img :src="artifacts.payload.dataUrl" :alt="artifacts.payload.name" />
          </div>
          <!-- Markdown → 渲染 -->
          <div
            v-else-if="artifacts.payload.kind === 'markdown'"
            class="pv-md markdown"
            v-html="renderedMd"
          />
          <!-- 纯文本 / 代码 -->
          <pre
            v-else-if="artifacts.payload.kind === 'text'"
            class="pv-code"
          ><code>{{ artifacts.payload.text }}</code></pre>
          <!-- 其它二进制 -->
          <div v-else class="pv-state">
            <FileIcon :size="26" :stroke-width="1.4" />
            <span>该文件类型暂不支持内嵌预览</span>
            <button
              v-if="isPptx && pptxDeckHtml"
              class="pv-open-ext primary"
              @click="editPptx()"
            >
              <PencilLine :size="14" :stroke-width="1.8" />
              <span>在 App 里编辑此 PPT</span>
            </button>
            <span v-if="isPptx && pptxDeckHtml" class="pv-edit-hint">
              编辑的是它的网页版源稿，保存后可一键重新导出 .pptx
            </span>
            <button class="pv-open-ext" @click="artifacts.openExternal()">
              <ExternalLink :size="14" :stroke-width="1.8" />
              <span>用系统程序打开</span>
            </button>
          </div>
        </template>
      </div>
    </template>

    <!-- 没有任何预览对象时整列 0 宽隐藏(collapsed):右侧只在看成品/PPT/运行项目时出现 -->
  </aside>
</template>

<style scoped>
.dr {
  /* 与主区面板同底色（--bg-chat），左右两块面板一样白、无色差 */
  background: var(--bg-chat);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative; /* 编辑器以 absolute inset:0 覆盖 */
  /* 与主区同款圆润嵌入面板（左缘不留缝，由主区的右缝隙分隔） */
  margin: 8px 8px 8px 0;
  border: 1px solid var(--hairline);
  border-radius: 12px;
  box-shadow: var(--shadow);
}
/* 收起：整列不渲染 —— 右侧边彻底消失，不留任何导轨/小框 */
.dr.collapsed {
  display: none;
}
/* 豆包式分栏:整个抽屉钉死到右侧(fixed),左边那条完全让给主区的对话面板 ——
   不再靠栅格列宽让位(抽屉元素会漏到最左盖住对话),直接把它移出文档流固定在右半屏。 */
.dr.chat-split {
  position: fixed;
  left: min(560px, 44vw);
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 300;
  margin: 0;
  border: none;
  border-left: 1px solid var(--border);
  border-radius: 0;
  box-shadow: -14px 0 36px rgba(0, 0, 0, 0.16);
}

/* ───────── 左缘收缩条（WorkBuddy 式）───────── */
.dr-resizer {
  position: absolute;
  left: -2px;
  top: 0;
  bottom: 0;
  width: 8px;
  z-index: 60; /* 压过编辑器(z-index:5)与预览头，任何形态都能抓到 */
  cursor: col-resize;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dr-grip {
  width: 3px;
  height: 44px;
  border-radius: 99px;
  background: var(--border-strong, #c9c9c2);
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease;
}
.dr-resizer:hover .dr-grip,
.dr.resizing .dr-grip {
  opacity: 1;
  background: var(--primary);
}
/* 拖拽期间盖住整窗（含 iframe），保证 mousemove 一直落在本文档上 */
.dr-drag-veil {
  position: fixed;
  inset: 0;
  z-index: 9999;
  cursor: col-resize;
}

/* ───────── 预览头 ───────── */
.pv-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-soft);
  background: var(--bg);
}
.pv-ficon {
  color: var(--primary);
  flex-shrink: 0;
}
.pv-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pv-size {
  font-size: 11px;
  color: var(--muted);
  flex-shrink: 0;
}
.pv-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}
.pv-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--muted);
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.pv-btn:hover {
  background: var(--bg-soft);
  color: var(--primary);
}

/* ───────── 预览体 ───────── */
.pv-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  /* 跟随主题（深色下不再白底衬浅字）；iframe 网页仍保持自身白底 */
  background: var(--bg-chat);
}
.pv-frame {
  flex: 1;
  width: 100%;
  height: 100%;
  border: none;
  background: #fff;
}
/* 演示播放器包壳:顶部导出条 + DeckViewer(自带深底) */
.pv-deck {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
/* 全屏编辑:Teleport 到 body 后铺满整个视口,画布拿到最大空间 */
.pv-deck.full {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: var(--bg);
}
/* 豆包式对话布局:抽屉(.dr.chat-split)已 fixed 到右半屏,编辑器只需填满它,不再各自 fixed */
.pv-deck.full.chat {
  position: absolute;
  inset: 0;
  z-index: auto;
}
.pv-deck-file {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 340px;
}
.pv-deck-viewer {
  flex: 1;
  min-height: 0;
  border-radius: 0;
}
.pv-deck-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-soft);
  background: var(--panel);
}
.pv-deck-export {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border: none;
  border-radius: 7px;
  background: var(--primary);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.pv-deck-export:hover:not(:disabled) {
  filter: brightness(1.07);
}
.pv-deck-export:disabled {
  opacity: 0.6;
  cursor: default;
}
/* 动作区靠右:margin-left:auto 吃掉状态文案与按钮之间的全部空白 */
.pv-deck-acts {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
/* 「放映」「编辑」是次要动作:描边而非实心,不跟「导出 PPTX」抢主色 */
.pv-deck-edit {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 11px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: transparent;
  color: var(--text-2);
  font-size: 12px;
  cursor: pointer;
}
.pv-deck-edit:hover {
  border-color: var(--primary);
  color: var(--primary);
}
.pv-deck-edit.on {
  border-color: var(--primary);
  background: var(--primary-soft);
  color: var(--primary-deep);
}
.pv-deck-edit:disabled {
  opacity: 0.5;
  cursor: default;
}
.pv-deck-hint {
  font-size: 11px;
  color: var(--muted);
}
.pv-deck-live {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--primary-deep, var(--primary));
}
.pv-deck-ok {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--ok, #2f7a4f);
}
.pv-deck-err {
  padding: 6px 10px;
  background: var(--vermilion-soft, rgba(168, 62, 50, 0.08));
  color: var(--vermilion, #a83e32);
  font-size: 12px;
}
.pv-img-wrap {
  flex: 1;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background:
    repeating-conic-gradient(#f4f4f0 0% 25%, #ffffff 0% 50%) 50% / 20px 20px;
}
.pv-img-wrap img {
  max-width: 100%;
  height: auto;
  box-shadow: var(--shadow-sm);
}
/* 深色主题下棋盘格透明底跟着变暗，不再刺眼 */
html[data-theme="dark"] .pv-img-wrap,
html[data-theme="aurora-dark"] .pv-img-wrap {
  background:
    repeating-conic-gradient(#242424 0% 25%, #1c1c1c 0% 50%) 50% / 20px 20px;
}
.pv-md {
  flex: 1;
  overflow: auto;
  padding: 24px 28px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text);
}
.pv-code {
  flex: 1;
  overflow: auto;
  margin: 0;
  padding: 16px 18px;
  font-family: var(--mono);
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text);
  background: var(--bg-soft);
  white-space: pre;
  tab-size: 2;
}
.pv-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--muted);
  font-size: 13px;
  padding: 40px 24px;
  text-align: center;
}
.pv-state.err {
  color: var(--vermilion);
}
.pv-open-ext {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  background: var(--panel);
  border-radius: 6px;
  color: var(--text-2);
  font-size: 12.5px;
  cursor: pointer;
}
.pv-open-ext:hover {
  border-color: var(--primary);
  color: var(--primary);
}
.pv-open-ext.primary {
  border-color: var(--primary);
  background: var(--primary);
  color: #fff;
  font-weight: 600;
}
.pv-open-ext.primary:hover {
  filter: brightness(1.07);
  color: #fff;
}
.pv-edit-hint {
  font-size: 11px;
  color: var(--dim);
  margin-top: -6px;
}
.spin {
  animation: pv-spin 0.9s linear infinite;
}
@keyframes pv-spin {
  to {
    transform: rotate(360deg);
  }
}

/* markdown 渲染基本排版 */
.markdown :deep(h1),
.markdown :deep(h2),
.markdown :deep(h3) {
  font-family: var(--serif);
  margin: 1.2em 0 0.5em;
  line-height: 1.3;
}
.markdown :deep(p) {
  margin: 0.6em 0;
}
.markdown :deep(pre) {
  background: var(--bg-soft);
  padding: 12px 14px;
  border-radius: 6px;
  overflow: auto;
  font-family: var(--mono);
  font-size: 12.5px;
}
.markdown :deep(code) {
  font-family: var(--mono);
  font-size: 0.9em;
}
.markdown :deep(:not(pre) > code) {
  background: var(--bg-soft);
  padding: 1px 5px;
  border-radius: 3px;
}
.markdown :deep(table) {
  border-collapse: collapse;
  margin: 0.8em 0;
}
.markdown :deep(th),
.markdown :deep(td) {
  border: 1px solid var(--border);
  padding: 6px 10px;
}
.markdown :deep(img) {
  max-width: 100%;
}
.markdown :deep(a) {
  color: var(--primary);
}
.markdown :deep(blockquote) {
  border-left: 3px solid var(--border-strong);
  margin: 0.8em 0;
  padding-left: 14px;
  color: var(--muted);
}

/* ───────── 运行中项目预览 ───────── */
.pv-btn.danger:hover {
  background: var(--vermilion-soft);
  color: var(--vermilion);
}
.pv-btn.on {
  color: var(--primary);
  background: var(--primary-soft);
}
.pv-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.pv-btn:disabled:hover {
  background: transparent;
  color: var(--muted);
}
.pj-badge {
  font-size: 10.5px;
  padding: 1px 7px;
  border-radius: 999px;
  flex-shrink: 0;
  letter-spacing: 0.3px;
}
.pj-badge.starting {
  background: var(--primary-soft);
  color: var(--primary-deep);
}
.pj-badge.ready {
  background: #e8f5e9;
  color: #2e7d32;
}

/* 运行预览体：iframe + 底部日志台 */
.pj-body {
  position: relative;
}
.pj-hint {
  font-size: 11.5px;
  color: var(--dim);
  max-width: 320px;
  line-height: 1.5;
}
.pj-logs {
  flex-shrink: 0;
  max-height: 38%;
  overflow-y: auto;
  background: #1a1a1a;
  color: #d4d4d4;
  font-family: var(--mono);
  font-size: 11.5px;
  line-height: 1.55;
  padding: 8px 12px;
  border-top: 1px solid var(--border-strong);
}
.pj-log {
  white-space: pre-wrap;
  word-break: break-all;
}
.pj-log.stderr {
  color: #ff9e9e;
}
.pj-log.info {
  color: #7fb0ff;
}

/* 项目列表卡片 */
.pj-list {
  list-style: none;
  margin: 0;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pj-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  background: var(--panel);
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.pj-card:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow);
}
.pj-card-main {
  flex: 1;
  min-width: 0;
}
.pj-card-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}
.pj-card-name > span:not(.pj-dot) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pj-card-ic {
  color: var(--primary);
  flex-shrink: 0;
}
.pj-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #2e7d32;
  flex-shrink: 0;
  box-shadow: 0 0 0 3px #e8f5e9;
}
.pj-card-svcs {
  font-size: 11px;
  color: var(--muted);
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pj-run {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  padding: 6px 13px;
  border: 1px solid var(--primary);
  border-radius: 8px;
  background: var(--primary);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: filter 0.15s, background 0.15s;
}
.pj-run:hover {
  filter: brightness(1.08);
}
.pj-run.running {
  background: var(--primary-soft);
  color: var(--primary-deep);
}

</style>

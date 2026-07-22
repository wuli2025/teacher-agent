import { defineStore } from "pinia";
import { ref, computed } from "vue";
import {
  convApi,
  isTauri,
  invoke,
  type Conversation,
  type Project,
} from "../tauri";
import { useChatStore } from "./chat";

/** 右抽屉的三种宽度形态：默认抽屉 / 成品预览 / 放大编辑 */
export type DrawerWidthMode = "default" | "preview" | "expand";

export type ViewKey =
  | "home"
  | "chat"
  | "wiki"
  | "file_center"
  | "graph"
  | "automation"
  | "claude_md"
  | "skill_center"
  | "env_doctor"
  | "update"
  | "settings"
  | "sense_api"
  | "voice_input"
  | "video_course"
  | "deck"
  | "web_studio";

/** 首页模式：新建对话(通用助手) / AI课件(PPT) / AI教案 / 生成数学课件。
 *  chat 与三大工坊是两种不同版式的首页（设计稿 1-新建对话主页 vs 2-AI课件PPT）。 */
export type HomeMode = "chat" | "ppt" | "lesson" | "math";

export const useAppStore = defineStore("app", () => {
  // 默认落地到九章爱学式首页（大标题 + 干净输入框 + 范例库）。
  const view = ref<ViewKey>("home");
  // 默认落地「新建对话」通用助手首页（设计稿 1-新建对话主页：居中问候 + 底部输入，无案例广场）。
  const homeMode = ref<HomeMode>("chat");
  function setHomeMode(m: HomeMode) {
    homeMode.value = m;
    view.value = "home";
  }
  const sidebarCollapsed = ref(false);

  // 置顶对话：仅前端持久化（localStorage），侧栏排序时置顶优先
  const PINNED_KEY = "polaris.pinnedConvs.v1";
  function loadPinned(): Set<string> {
    try {
      const raw = localStorage.getItem(PINNED_KEY);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {
      /* ignore corrupt storage */
    }
    return new Set();
  }
  const pinnedConvs = ref<Set<string>>(loadPinned());
  function persistPinned() {
    try {
      localStorage.setItem(PINNED_KEY, JSON.stringify([...pinnedConvs.value]));
    } catch {
      /* storage may be unavailable */
    }
  }
  function isPinned(convId: string | null | undefined): boolean {
    return !!convId && pinnedConvs.value.has(convId);
  }
  function togglePin(convId: string) {
    if (!convId) return;
    const s = new Set(pinnedConvs.value);
    if (s.has(convId)) s.delete(convId);
    else s.add(convId);
    pinnedConvs.value = s;
    persistPinned();
  }

  // 主题：浅色（默认·暖白水墨）/ 黑夜（深空玻璃，抄自智能选股版）。
  // 挂到 <html data-theme="dark"> 上由 style.css 的 token 覆盖块全局换肤。
  const THEME_KEY = "polaris.theme.v1";
  // 设计稿三档:light=浅色暖白 / dark=深色墨黑(#141414系) / eyecare=护眼米色纸感(#FAF4E3系)
  type Theme = "light" | "dark" | "eyecare";
  function loadTheme(): Theme {
    try {
      const t = localStorage.getItem(THEME_KEY);
      if (t === "light" || t === "dark" || t === "eyecare") return t;
      // 旧主题迁移:极光琉璃两套已下架,按明暗归位;nougat 是更早的旧键
      if (t === "aurora-dark") return "dark";
      if (t === "aurora-light" || t === "nougat") return "light";
      return "light";
    } catch {
      return "light";
    }
  }
  const theme = ref<Theme>(loadTheme());
  function applyTheme() {
    // light = 默认（无属性）；其余挂 data-theme 由 style.css token 块换肤
    if (theme.value === "light") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", theme.value);
    }
    // 原生标题栏跟随主题染成画框色（仅桌面端；Win11 生效，Win10 静默跳过）
    if (isTauri) {
      const titlebar: Record<Theme, { caption: string; text: string }> = {
        light: { caption: "#f3f2eb", text: "#1a1a1c" }, // 暖米框面，与侧栏无色差
        dark: { caption: "#1f1f1f", text: "#ffffff" }, // 墨黑框面(设计稿侧栏色)
        eyecare: { caption: "#ebe5d1", text: "#1a1a1c" }, // 护眼米色框面，与侧栏无色差
      };
      invoke("set_titlebar_color", titlebar[theme.value]).catch(() => {});
    }
  }
  function setTheme(t: Theme) {
    theme.value = t;
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      /* storage may be unavailable */
    }
    applyTheme();
  }
  applyTheme(); // store 初始化（App 启动）时立即生效，避免闪白

  // 任务完成但用户未查看的会话集合 → 侧栏显示墨蓝色未读点
  const unreadConvs = ref<Set<string>>(new Set());
  function markUnread(convId: string) {
    if (!convId) return;
    // 正在查看的对话不标记
    if (convId === currentConvId.value) return;
    unreadConvs.value = new Set(unreadConvs.value).add(convId);
  }
  function clearUnread(convId: string) {
    if (!unreadConvs.value.has(convId)) return;
    const s = new Set(unreadConvs.value);
    s.delete(convId);
    unreadConvs.value = s;
  }

  // 项目 + 对话
  const projects = ref<Project[]>([]);
  const expandedProjects = ref<Set<string>>(new Set());
  const conversationsByProject = ref<Record<string, Conversation[]>>({});
  const currentConvId = ref<string | null>(null);
  const currentProjectId = ref<string | null>(null);

  // 「召唤专家」跨视图通道:「召唤其它专家」跳到「专家团」页,在那里点某张卡的「召唤」时,
  // 经此把 (kind,id) 投递给对话区(ChatPanel 挂载时消费)去真正入驻 + 记入最近召唤。
  // 带 nonce:连续召唤同一个也能触发消费。
  const pendingSummon = ref<{ kind: "expert" | "team"; id: string; nonce: number } | null>(null);

  function setView(v: ViewKey) {
    view.value = v;
  }
  // 豆包式 PPT 编辑「退出全屏」:编辑器让出左列露出对话面板。置位期间 App.vue 把
  // 右抽屉在网格里的占宽清零,否则聊天列会被 46vw 的抽屉挤没(编辑器本体是 fixed 层,不受影响)。
  const deckChatSplit = ref(false);
  // 在「专家团」页点「召唤」→ 投递召唤意图并切回对话区,由 ChatPanel 落地。
  function requestSummon(kind: "expert" | "team", id: string) {
    pendingSummon.value = { kind, id, nonce: (pendingSummon.value?.nonce ?? 0) + 1 };
    view.value = "chat";
  }
  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }

  // 侧栏宽度可拖拽调节(200–420px),记住选择
  const SIDEBAR_W_KEY = "polaris.sidebarWidth.v1";
  const sidebarUserWidth = ref(
    Math.min(420, Math.max(200, parseInt(localStorage.getItem(SIDEBAR_W_KEY) || "285") || 285))
  );
  // persist=false：拖拽中每帧调用,只更新内存值(避免 60fps 同步写盘卡顿);
  // 松手时再 persist=true 落一次盘。
  function setSidebarWidth(w: number, persist = true) {
    sidebarUserWidth.value = Math.min(420, Math.max(200, Math.round(w)));
    if (!persist) return;
    try {
      localStorage.setItem(SIDEBAR_W_KEY, String(sidebarUserWidth.value));
    } catch {
      /* storage 不可用 */
    }
  }
  // 收起 = 整列 0 宽彻底消失(豆包式),由主区左上角的浮动小按钮负责再展开
  const sidebarWidth = computed(() =>
    sidebarCollapsed.value ? 0 : sidebarUserWidth.value
  );
  // ── 右抽屉宽度可拖拽调节（WorkBuddy 式收缩框）──
  // 三种形态各记各的宽：默认抽屉 / 成品预览 / 放大编辑。拖一次就记住，
  // 下次进入同一形态直接复原；没拖过(null)则走 App.vue 里的自适应默认档位。
  const DRAWER_W_KEYS: Record<DrawerWidthMode, string> = {
    default: "polaris.drawerWidth.default.v1",
    preview: "polaris.drawerWidth.preview.v1",
    expand: "polaris.drawerWidth.expand.v1",
  };
  const DRAWER_LIMITS: Record<DrawerWidthMode, { min: number; max: () => number }> = {
    default: { min: 240, max: () => Math.max(320, Math.round(window.innerWidth * 0.5)) },
    preview: { min: 320, max: () => Math.max(420, Math.round(window.innerWidth * 0.8)) },
    expand: { min: 520, max: () => Math.max(640, Math.round(window.innerWidth * 0.92)) },
  };
  function loadDrawerW(mode: DrawerWidthMode): number | null {
    try {
      const n = parseInt(localStorage.getItem(DRAWER_W_KEYS[mode]) || "");
      return Number.isFinite(n) && n >= 200 ? n : null;
    } catch {
      return null;
    }
  }
  const drawerWidths = ref<Record<DrawerWidthMode, number | null>>({
    default: loadDrawerW("default"),
    preview: loadDrawerW("preview"),
    expand: loadDrawerW("expand"),
  });
  // 拖拽中：App.vue 据此关掉 grid 列宽过渡，避免跟手延迟
  const drawerResizing = ref(false);
  function clampDrawerW(mode: DrawerWidthMode, w: number): number {
    const L = DRAWER_LIMITS[mode];
    return Math.min(L.max(), Math.max(L.min, Math.round(w)));
  }
  // persist=false：拖拽中每帧只更新内存值；松手时再 persist=true 落一次盘（同侧栏）
  function setDrawerWidth(mode: DrawerWidthMode, w: number, persist = true) {
    const v = clampDrawerW(mode, w);
    drawerWidths.value = { ...drawerWidths.value, [mode]: v };
    if (!persist) return;
    try {
      localStorage.setItem(DRAWER_W_KEYS[mode], String(v));
    } catch {
      /* storage 不可用 */
    }
  }
  /** 双击分隔条：恢复该形态的自适应默认宽 */
  function resetDrawerWidth(mode: DrawerWidthMode) {
    drawerWidths.value = { ...drawerWidths.value, [mode]: null };
    try {
      localStorage.removeItem(DRAWER_W_KEYS[mode]);
    } catch {
      /* storage 不可用 */
    }
  }

  async function refreshProjects() {
    try {
      projects.value = await convApi.listProjects();
    } catch (e) {
      // 静默失败=侧栏空白没人知道为什么;报出去并保留旧列表
      const { toast } = await import("../composables/useToast");
      const { humanizeError } = await import("../lib/humanizeError");
      toast.error(`项目列表加载失败:${humanizeError(e)}`);
      return;
    }
    if (!currentProjectId.value && projects.value.length) {
      currentProjectId.value = projects.value[0].id;
      expandedProjects.value.add(currentProjectId.value);
    }
    // 首屏只「等」当前项目的对话到位即可让侧栏渲染;其余项目的对话在后台并发补齐。
    // 侧栏项目排序虽依赖各项目对话的活跃时间,但那些时间戳「后到」无妨——先把界面画
    // 出来(不被项目数 × 一次 invoke 的串扇出阻塞首帧),批次到齐后一次性响应重排。
    // 旧版 `await Promise.all(所有项目)` 在项目多时会把首屏卡成 O(项目数)。
    // 侧栏已扁平化(不分项目) → 一次拉全部对话再按 projectId 归组, 而不是每个项目一次 invoke。
    // conversationsByProject 仍是唯一真源(增删改重命名都在维护它), 侧栏读它的扁平视图。
    await refreshAllConversations();
  }

  /** 一次拉全部未归档对话 → 归组进 conversationsByProject(侧栏扁平列表的加载路径)。 */
  async function refreshAllConversations() {
    let all: Conversation[];
    try {
      all = await convApi.listAllConversations();
    } catch (e) {
      const { toast } = await import("../composables/useToast");
      const { humanizeError } = await import("../lib/humanizeError");
      toast.error(`对话列表加载失败:${humanizeError(e)}`);
      return;
    }
    const next: Record<string, Conversation[]> = {};
    // 空项目也要留一个空数组, 否则 toggleProject 会误判「没加载过」再去拉一次。
    for (const p of projects.value) next[p.id] = [];
    for (const c of all) (next[c.projectId] ??= []).push(c);
    conversationsByProject.value = next;
  }

  /** 侧栏用: 不分项目的扁平对话列表, 最近活跃在前。 */
  const allConversations = computed<Conversation[]>(() =>
    Object.values(conversationsByProject.value)
      .flat()
      .sort((a, b) => b.updatedAt - a.updatedAt)
  );

  /**
   * 新建对话前确保有个「落脚项目」。项目在后端仍然承载 CLAUDE.md 人设 / 知识库 scope /
   * 工作目录, 只是不再作为 UI 分组 —— 所以这里静默复用当前项目 / 第一个项目, 都没有才建。
   */
  async function ensureProjectId(): Promise<string> {
    if (currentProjectId.value) return currentProjectId.value;
    if (!projects.value.length) await refreshProjects();
    const pid = projects.value[0]?.id ?? (await createProject("默认项目")).id;
    currentProjectId.value = pid;
    return pid;
  }

  /** 侧栏「+ 新对话」: 不问项目, 直接开一条。 */
  async function newConversation(navigate = true) {
    return createConversation(await ensureProjectId(), navigate);
  }

  async function refreshConversations(projectId: string) {
    try {
      conversationsByProject.value[projectId] =
        await convApi.listConversations(projectId);
    } catch (e) {
      const { toast } = await import("../composables/useToast");
      const { humanizeError } = await import("../lib/humanizeError");
      toast.error(`对话列表加载失败:${humanizeError(e)}`);
      return;
    }
    // Vue 3 reactive: 替换 ref 触发更新
    conversationsByProject.value = { ...conversationsByProject.value };
  }

  async function toggleProject(projectId: string) {
    if (expandedProjects.value.has(projectId)) {
      expandedProjects.value.delete(projectId);
    } else {
      expandedProjects.value.add(projectId);
      if (!conversationsByProject.value[projectId]) {
        await refreshConversations(projectId);
      }
    }
    expandedProjects.value = new Set(expandedProjects.value);
  }

  async function createProject(name: string) {
    const p = await convApi.createProject(name);
    projects.value = [...projects.value, p];
    expandedProjects.value = new Set([...expandedProjects.value, p.id]);
    currentProjectId.value = p.id;
    conversationsByProject.value = { ...conversationsByProject.value, [p.id]: [] };
    return p;
  }

  /** 本地项目 ↔ 协作项目绑定(团队项目主页/侧栏联动之桥) */
  async function bindProjectToCollab(
    projectId: string,
    collabProjectId: number,
    collabHost: string
  ) {
    const p = await convApi.bindProjectCollab(projectId, collabProjectId, collabHost);
    const i = projects.value.findIndex((x) => x.id === p.id);
    if (i >= 0) {
      const next = [...projects.value];
      next[i] = p;
      projects.value = next;
    }
    return p;
  }

  /** 按协作项目 id 反查绑定的本地项目(无则 undefined) */
  function projectByCollabId(collabId: number) {
    return projects.value.find((p) => p.collabProjectId === collabId);
  }

  // 归档项目 = 从活动列表移除(后端只置 archived 标记, 对话/消息保留, 不做硬删除)
  async function archiveProject(projectId: string) {
    await convApi.archiveProject(projectId);
    projects.value = projects.value.filter((p) => p.id !== projectId);
    const next = { ...conversationsByProject.value };
    delete next[projectId];
    conversationsByProject.value = next;
    if (expandedProjects.value.has(projectId)) {
      expandedProjects.value.delete(projectId);
      expandedProjects.value = new Set(expandedProjects.value);
    }
    // 当前项目被归档 → 回退到第一个剩余项目
    if (currentProjectId.value === projectId) {
      currentProjectId.value = projects.value[0]?.id ?? null;
    }
  }

  // 在系统文件管理器中打开该项目的工作目录
  async function openProjectDir(projectId: string) {
    await convApi.openProjectDir(projectId);
  }

  /**
   * @param navigate 是否切到 chat 视图。默认 true(侧栏/对话面板新建即跳进对话)。
   *   工坊类组件(Deck/Web 等)自己管理视图、就地展示预览, 必须传 false ——
   *   否则 setView('chat') 会卸载工坊组件、连带销毁其状态机/预览/「继续修改」。
   */
  async function createConversation(projectId: string, navigate = true) {
    const c = await convApi.createConversation(projectId);
    const cur = conversationsByProject.value[projectId] ?? [];
    conversationsByProject.value = {
      ...conversationsByProject.value,
      [projectId]: [c, ...cur],
    };
    expandedProjects.value = new Set([...expandedProjects.value, projectId]);
    currentConvId.value = c.id;
    // 同步标记这条新对话为「历史已加载(空)」——必须紧跟 currentConvId 赋值、其间不能有
    // await。否则 currentConvId 变更触发的 loadHistory(微任务)会在首条消息推入后用空历史
    // 把它覆盖掉(现象:第一次给对话发消息经常被「吃掉」)。覆盖所有「新建即发送」入口。
    useChatStore().markFresh(c.id);
    currentProjectId.value = projectId;
    if (navigate) setView("chat");
    return c;
  }

  async function deleteConversation(conv: Conversation) {
    await convApi.deleteConversation(conv.id);
    const cur = conversationsByProject.value[conv.projectId] ?? [];
    conversationsByProject.value = {
      ...conversationsByProject.value,
      [conv.projectId]: cur.filter((c) => c.id !== conv.id),
    };
    if (currentConvId.value === conv.id) {
      currentConvId.value = null;
    }
    // 删除后顺手清掉置顶标记，避免遗留垃圾
    if (pinnedConvs.value.has(conv.id)) togglePin(conv.id);
  }

  /** 回声层:归档对话 —— 从列表移除(消息保留在磁盘,可逆),不删数据。 */
  async function archiveConversation(conv: Conversation) {
    await convApi.archiveConversation(conv.id, true);
    const cur = conversationsByProject.value[conv.projectId] ?? [];
    conversationsByProject.value = {
      ...conversationsByProject.value,
      [conv.projectId]: cur.filter((c) => c.id !== conv.id),
    };
    if (currentConvId.value === conv.id) {
      currentConvId.value = null;
    }
  }

  async function renameConversation(conv: Conversation, title: string) {
    const t = title.trim();
    if (!t || t === conv.title) return;
    await convApi.renameConversation(conv.id, t);
    const cur = conversationsByProject.value[conv.projectId] ?? [];
    conversationsByProject.value = {
      ...conversationsByProject.value,
      [conv.projectId]: cur.map((c) => (c.id === conv.id ? { ...c, title: t } : c)),
    };
  }

  function selectConversation(conv: Conversation) {
    currentConvId.value = conv.id;
    currentProjectId.value = conv.projectId;
    clearUnread(conv.id);
    setView("chat");
  }

  /** 按 id 找对话标题(任务中心给后台 AI 任务起可读名用);找不到返回空串。 */
  function convTitle(convId: string | null): string {
    if (!convId) return "";
    for (const list of Object.values(conversationsByProject.value)) {
      const c = list.find((x) => x.id === convId);
      if (c) return c.title;
    }
    return "";
  }
  /** 按 id 跳转到某对话(任务中心点击后台任务用)。 */
  function openConversationById(convId: string) {
    for (const list of Object.values(conversationsByProject.value)) {
      const c = list.find((x) => x.id === convId);
      if (c) {
        selectConversation(c);
        return;
      }
    }
  }

  return {
    // ui
    view,
    homeMode,
    setHomeMode,
    sidebarCollapsed,
    sidebarWidth,
    setSidebarWidth,
    drawerWidths,
    drawerResizing,
    setDrawerWidth,
    resetDrawerWidth,
    theme,
    setTheme,
    setView,
    deckChatSplit,
    pendingSummon,
    requestSummon,
    toggleSidebar,
    unreadConvs,
    markUnread,
    clearUnread,
    // pin
    pinnedConvs,
    isPinned,
    togglePin,
    // conv
    projects,
    expandedProjects,
    conversationsByProject,
    currentConvId,
    currentProjectId,
    refreshProjects,
    refreshConversations,
    refreshAllConversations,
    allConversations,
    ensureProjectId,
    newConversation,
    toggleProject,
    createProject,
    bindProjectToCollab,
    projectByCollabId,
    archiveProject,
    openProjectDir,
    createConversation,
    deleteConversation,
    archiveConversation,
    renameConversation,
    selectConversation,
    convTitle,
    openConversationById,
  };
});

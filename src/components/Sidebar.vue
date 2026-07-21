<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import {
  Presentation,
  FileText,
  Sigma,
  Plus,
  Settings,
  PanelLeftClose,
  Pin,
  MoreHorizontal,
  Archive,
  Sparkles,
  BookOpen,
  MessageSquare,
} from "@lucide/vue";
import SearchGlass from "./icons/SearchGlass.vue";
import { useAppStore } from "../stores/app";
import { useChatStore } from "../stores/chat";
import ProviderDock from "./ProviderDock.vue";
import { convApi, type Conversation } from "../tauri";
import { toast } from "../composables/useToast";
import { MODE_ORDER, MODES, type TeachMode } from "../lib/teachSamples";

const app = useAppStore();
const chat = useChatStore();

// 三大功能（仿九章爱学左栏）：AI课件(PPT) / AI教案 / 生成数学课件。点一下切首页对应工坊。
// chat（新建对话）是独立首项，不出现在工坊列表(MODE_ORDER)里，这里给个占位图标满足类型。
const MODE_ICON: Record<TeachMode, any> = {
  chat: Plus,
  ppt: Presentation,
  lesson: FileText,
  math: Sigma,
};
const functionItems = MODE_ORDER.map((m) => ({ mode: m, label: MODES[m].label, icon: MODE_ICON[m] }));
// 导航同一时刻只能亮一项，靠 homeMode 区分：
// 「新建对话」= homeMode 'chat'（通用助手首页），三个工坊各自 'ppt'/'lesson'/'math'。
function pickMode(m: TeachMode) {
  app.setHomeMode(m);
}

// 「更多」= 精品推荐(技能中心，设计稿 6-更多精品推荐)，作直接导航项。
// 「更新」「环境」已移入「设置」页内(见 Settings.vue)，不再挂侧栏。
function pickNav(k: typeof app.view) {
  app.setView(k);
}

onMounted(() => {
  app.refreshProjects();
});

// 侧栏不再有「项目」概念:新建对话直接落到默认项目(store 里静默保证有一个)。
async function newConv() {
  await app.newConversation();
}
// 「新建对话」：切到通用助手首页（chat 版式：居中问候 + 底部输入，无案例广场）。
function startNew() {
  app.setHomeMode("chat");
}

async function confirmDelete(c: Conversation) {
  if (confirm(`删除对话「${c.title}」?(消息也会被清空)`)) {
    await app.deleteConversation(c);
  }
}

// ─────────── 对话行「⋯」菜单(回声层:沉淀为记忆 / 归档)───────────
const openConvMenuId = ref<string | null>(null);
function toggleConvMenu(id: string) {
  openConvMenuId.value = openConvMenuId.value === id ? null : id;
}
function closeConvMenu() {
  openConvMenuId.value = null;
}
// 把这条对话立刻沉淀成记忆(后台跑;完成后可在「设置 › 回声」看到条数增加)
async function distillConv(c: Conversation) {
  closeConvMenu();
  try {
    await convApi.distillConversation(c.id);
    toast.info(`正在把「${c.title}」沉淀为记忆…完成后可在「设置 › 回声」查看`);
  } catch (e) {
    toast.error(`沉淀失败：${e}`);
  }
}
async function archiveConv(c: Conversation) {
  closeConvMenu();
  if (
    confirm(
      `归档对话「${c.title}」?\n会从列表移除（消息保留在磁盘、不参与做梦取材），可逆。`
    )
  ) {
    await app.archiveConversation(c);
  }
}

// 对话排序（仿 Codex 扁平列表）：运行中 → 置顶 → 按最近活跃倒序；
// 不再按「今天/昨天」分组，时间改为行尾相对时间（「4 小时」）。
const DAY_MS = 86_400_000;
// updatedAt 兼容秒/毫秒：小于 1e12 视为秒，统一换算成毫秒
function toMs(t: number): number {
  return t < 1e12 ? t * 1000 : t;
}
// 有效活跃时间(ms)：取后端 updatedAt 与本地「最近交互」打点的较大值。
// 这样刚发送/正在运行的对话会冒泡到最上（仿 Codex）。
function effMs(c: Conversation): number {
  return Math.max(toMs(c.updatedAt), chat.activityAt(c.id));
}
// 行尾相对时间（仿 Codex「4 小时」）
function fmtAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟`;
  if (diff < DAY_MS) return `${Math.floor(diff / 3_600_000)} 小时`;
  if (diff < 30 * DAY_MS) return `${Math.floor(diff / DAY_MS)} 天`;
  const d = new Date(ms);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
// 对话过滤(按标题即时过滤;过滤中所有项目视为展开)
const convFilter = ref("");
// 排序键：运行中恒最前 > 置顶 > 最近活跃
function convSortKey(c: Conversation): number {
  return (
    (chat.isSending(c.id) ? 1e15 : 0) +
    (app.isPinned(c.id) ? 1e14 : 0) +
    effMs(c)
  );
}
// 侧栏是一条条对话的扁平列表(不再按项目分组;项目在后端仍承载人设/知识库 scope/工作目录)。
const sortedConvs = computed<Conversation[]>(() => {
  let list = app.allConversations;
  const q = convFilter.value.trim().toLowerCase();
  if (q) list = list.filter((c) => c.title.toLowerCase().includes(q));
  return [...list].sort((a, b) => convSortKey(b) - convSortKey(a));
});
</script>

<template>
  <aside class="sb" :class="{ collapsed: app.sidebarCollapsed }">
    <!-- Head：顶部留白，仅保留收起按钮（品牌 logo/文字已按要求移除）。
         收起后整列 display:none,展开入口在主区左上角的浮动按钮(App.vue)。 -->
    <div class="sb-head">
      <button
        class="collapse-btn push-right"
        title="收起侧栏 (Ctrl+B)"
        @click="app.toggleSidebar()"
      >
        <PanelLeftClose :size="17" :stroke-width="1.7" />
      </button>
    </div>

    <!-- Nav（设计稿顺序）：新建对话 / AI 课件PPT / AI 教案 / 生成数学课件 / 知识库 / 更多 / 设置
         —— 「新建对话」不再是蓝色大 CTA，而是与其它功能同规格的导航首项 -->
    <nav class="nav">
      <button
        class="nav-item fn"
        :class="{ active: app.view === 'home' && app.homeMode === 'chat' }"
        title="新建对话"
        @click="startNew()"
      >
        <span class="glyph-icon"><Plus :size="24" :stroke-width="1.6" /></span>
        <span v-if="!app.sidebarCollapsed" class="label">新建对话</span>
      </button>

      <button
        v-for="it in functionItems"
        :key="it.mode"
        class="nav-item fn"
        :class="{ active: app.view === 'home' && app.homeMode === it.mode }"
        :title="it.label"
        @click="pickMode(it.mode)"
      >
        <span class="glyph-icon"
          ><component :is="it.icon" :size="24" :stroke-width="1.6"
        /></span>
        <span v-if="!app.sidebarCollapsed" class="label">{{ it.label }}</span>
      </button>

      <button
        class="nav-item fn"
        :class="{ active: app.view === 'wiki' }"
        title="知识库"
        @click="pickNav('wiki')"
      >
        <span class="glyph-icon"
          ><BookOpen :size="24" :stroke-width="1.6"
        /></span>
        <span v-if="!app.sidebarCollapsed" class="label">知识库</span>
      </button>

      <!-- 更多：直达精品推荐(技能中心)，与其它功能同规格（设计稿 6-更多精品推荐） -->
      <button
        class="nav-item fn"
        :class="{ active: app.view === 'skill_center' }"
        title="更多"
        @click="pickNav('skill_center')"
      >
        <span class="glyph-icon"
          ><MoreHorizontal :size="24" :stroke-width="1.6"
        /></span>
        <span v-if="!app.sidebarCollapsed" class="label">更多</span>
      </button>

      <!-- 设置：设计稿里与「更多」平级的顶层项 -->
      <button
        class="nav-item fn"
        :class="{ active: app.view === 'settings' }"
        title="设置"
        @click="pickNav('settings')"
      >
        <span class="glyph-icon"><Settings :size="24" :stroke-width="1.6" /></span>
        <span v-if="!app.sidebarCollapsed" class="label">设置</span>
      </button>
    </nav>

    <!-- Conversations（扁平：不分项目，一条条对话按最近活跃排） -->
    <div v-if="!app.sidebarCollapsed" class="proj-section">
      <div class="proj-head">
        <span class="proj-title">历史对话</span>
        <button class="ic-btn plus" title="新建对话" @click="newConv()">+</button>
      </div>

      <!-- 对话过滤(标题即时过滤,Esc 清空) -->
      <div class="conv-filter">
        <SearchGlass :size="15" :stroke-width="1.8" class="cf-ic" />
        <input
          v-model="convFilter"
          placeholder="搜对话…"
          @keydown.esc="convFilter = ''"
        />
        <button v-if="convFilter" class="cf-x" @click="convFilter = ''">×</button>
      </div>

      <div class="conv-list">
        <div
          v-for="c in sortedConvs"
          :key="c.id"
          class="conv flat"
          :class="{ active: app.currentConvId === c.id, pinned: app.isPinned(c.id) }"
          @click="app.selectConversation(c)"
        >
          <!-- 设计稿：每条对话前一枚 18px 白底圆 + 气泡图标 -->
          <span class="cv-av"><MessageSquare :size="13" :stroke-width="1.1" /></span>
          <span
            v-if="app.unreadConvs.has(c.id)"
            class="cv-dot"
            title="有已完成的任务待查看"
          ></span>
          <Pin
            v-if="app.isPinned(c.id)"
            :size="11"
            :stroke-width="1.8"
            class="cv-pin"
          />
          <span class="cv-name" :title="c.title">{{ c.title }}</span>
          <!-- 行尾：运行中转圈圈；空闲时显示相对时间（仿 Codex「4 小时」），hover 换成删除 -->
          <span v-if="chat.isSending(c.id)" class="cv-spin" title="正在运行…"></span>
          <template v-else>
            <span class="cv-time">{{ fmtAgo(effMs(c)) }}</span>
            <button
              class="ca cv-dots"
              :class="{ on: openConvMenuId === c.id }"
              title="更多操作"
              @click.stop="toggleConvMenu(c.id)"
            >
              <MoreHorizontal :size="13" :stroke-width="1.8" />
            </button>
            <button
              class="ca delete"
              title="删除对话"
              @click.stop="confirmDelete(c)"
            >
              ×
            </button>
          </template>

          <!-- 对话操作菜单(回声层:沉淀为记忆 / 归档)-->
          <div v-if="openConvMenuId === c.id" class="conv-menu" @click.stop>
            <button class="pm-item" @click="distillConv(c)">
              <Sparkles :size="14" :stroke-width="1.7" />
              <span>沉淀为记忆</span>
            </button>
            <div class="pm-sep"></div>
            <button class="pm-item danger" @click="archiveConv(c)">
              <Archive :size="14" :stroke-width="1.7" />
              <span>归档对话（移出列表）</span>
            </button>
          </div>
        </div>
        <div v-if="!sortedConvs.length" class="empty-hint">
          {{ convFilter.trim() ? "没有匹配的对话" : "点右上角 + 开始新对话" }}
        </div>
      </div>
    </div>

    <!-- 点击空白处关闭对话菜单 -->
    <div v-if="openConvMenuId" class="menu-backdrop" @click="closeConvMenu()"></div>

    <div class="footer">
      <ProviderDock :collapsed="app.sidebarCollapsed" />
    </div>
  </aside>
</template>

<style scoped>
.sb {
  /* 低视觉污染稿：比主区略深一档的中性灰白, 纯平无渐变, 无分割线靠色差分区 */
  background: var(--bg-side);
  border-right: none;
  display: flex;
  flex-direction: column;
  padding: 8px 8px 6px;
  overflow: hidden;
}
/* 收起 = 整列彻底消失(列宽同时归 0),不再留 48px 图标导轨 */
.sb.collapsed {
  display: none;
}

.sb-head {
  display: flex;
  align-items: center;
  padding: 4px 4px 8px;
  gap: 6px;
}
.collapse-btn.push-right {
  margin-left: auto;
}
.collapse-btn {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: transparent;
  border: none;
  color: var(--muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}
.collapse-btn:hover {
  background: var(--selection-bg);
  color: var(--text);
}
.collapse-btn.rail {
  margin: 0 auto;
}

/* ── 导航（设计稿度量）：项高 44、padding 11/20、gap 12、radius 10、字 16px；
      默认 #44444A w400，选中只换中性灰底 #E6E6E6 + #171717 w500，不再用品牌色淡底 ── */
.nav {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 0 12px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 20px;
  height: 44px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-2);
  font-size: 16px;
  font-weight: 400;
  letter-spacing: -0.3125px;
  text-align: left;
}
.nav-item:hover {
  background: var(--selection-bg);
}
.nav-item.active {
  background: var(--active-bg);
  color: var(--text);
  font-weight: 500;
}
.nav-item .glyph-icon {
  width: 24px;
  height: 24px;
  color: var(--text-2);
}
.nav-item.active .glyph-icon {
  color: var(--text);
}
.sb.collapsed .nav-item {
  justify-content: center;
  padding: 11px 0;
}
/* 「更多」展开态 + 折叠箭头 */
.more-chev {
  margin-left: auto;
  font-size: 11px;
  color: var(--dim);
}
.nav-item.expanded {
  color: var(--text);
}
/* 「更多」里的次要项：缩进 + 字号降一档，作为子级 */
.nav-item.sub {
  padding-left: 34px;
  height: 40px;
  font-size: 15px;
  color: var(--muted);
}
.nav-item.sub .glyph-icon {
  width: 20px;
  height: 20px;
}
.sb.collapsed .nav-item.sub {
  padding-left: 0;
}
.glyph {
  display: inline-block;
  width: 16px;
  text-align: center;
  color: var(--muted);
  font-family: var(--serif);
}
.glyph-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  color: var(--muted);
}
.nav-item.active .glyph,
.nav-item.active .glyph-icon {
  color: var(--ink);
}
.label {
  flex: 1;
}

/* 历史对话区（设计稿 Frame 14）：与导航之间靠留白分区，不再拉分割线 */
.proj-section {
  margin-top: 22px;
  padding: 0 12px;
  overflow-y: auto;
  flex: 1;
}
.proj-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px 10px;
}
/* 「历史任务」是分区标签，不是第二主角：与功能栏同一无衬线字族，字号降一档、字距收敛，
   让视觉重量落在下面的对话行上（原来衬线 + 1.5px 字距与上方功能栏割裂） */
.proj-title {
  font-size: 14px;
  font-weight: 500;
  letter-spacing: -0.3125px;
  color: var(--muted);
}
/* 团队项目分区(GitHub repo 列表式) */
.team-sec-head {
  font-family: var(--serif);
  font-size: 10.5px;
  letter-spacing: 1.5px;
  color: var(--dim);
  padding: 8px 10px 2px;
}
.tp-caret {
  border: none;
  background: none;
  cursor: pointer;
  display: inline-flex;
  color: var(--muted);
  padding: 2px;
  margin: -2px -4px -2px -6px;
  transition: transform 0.15s;
}
.tp-caret.open {
  transform: rotate(90deg);
}
.tp-badge {
  margin-left: auto;
  font-size: 10px;
  font-weight: 700;
  min-width: 16px;
  text-align: center;
  padding: 1px 5px;
  border-radius: 999px;
  color: #b8860b;
  background: color-mix(in srgb, #b8860b 14%, transparent);
}
.proj.team .name {
  flex: 0 1 auto;
}
.tp-empty {
  font-size: 11px;
  color: var(--dim);
  font-style: italic;
  padding: 4px 10px 6px 30px;
}
.ic-btn {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--muted);
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.ic-btn:hover {
  background: var(--border);
  color: var(--text);
}
.ic-btn.plus {
  background: var(--btn-solid-bg);
  color: var(--btn-solid-text);
  font-size: 14px;
}
.ic-btn.plus:hover {
  background: var(--primary);
}
.ic-btn.mini {
  opacity: 0;
}
/* 项目「…」更多操作按钮：幽灵态，hover 行才显形；菜单打开时常驻 */
.ic-btn.dots {
  color: var(--dim);
}
.ic-btn.dots:hover {
  background: var(--border);
  color: var(--text);
}
.ic-btn.dots.on {
  opacity: 1;
  background: var(--border);
  color: var(--text);
}

/* 对话过滤框（设计稿：245×32，实底 #E6E6E6，无描边） */
.conv-filter {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 0 0 15px;
  padding: 7px 10px;
  height: 32px;
  border: none;
  border-radius: 9px;
  background: var(--active-bg);
}
.conv-filter .cf-ic {
  color: var(--dim);
  flex-shrink: 0;
}
.conv-filter .cf-ic {
  color: var(--dim);
}
.conv-filter input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13.5px;
  letter-spacing: -0.112px;
  color: var(--text);
}
.conv-filter input::placeholder {
  color: var(--dim);
}
.cf-x {
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  padding: 0 2px;
}
.cf-x:hover {
  color: var(--text);
}

.new-proj-row {
  display: flex;
  gap: 4px;
  padding: 4px 10px 6px;
}
.new-proj-row input {
  flex: 1;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 3px;
  font-size: 12px;
  background: var(--panel);
}
.new-proj-row input:focus {
  outline: none;
  border-color: var(--primary);
}
.primary-mini {
  padding: 2px 10px;
  background: var(--btn-solid-bg);
  color: var(--btn-solid-text);
  border: none;
  border-radius: 3px;
  font-size: 11px;
}
.primary-mini:hover {
  background: var(--primary);
}

.proj-block {
  margin-bottom: 4px;
  position: relative;
}
/* 项目 = 文件夹（仿 Codex）：名称虚化、低调，弱化为「分组容器」 */
.proj {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 10px;
  font-size: 12.5px;
  border-radius: 7px;
  cursor: pointer;
}
.proj:hover {
  background: var(--selection-bg);
}
.proj:hover .ic-btn.mini {
  opacity: 1;
}
.proj.active,
.proj.open {
  background: transparent;
}
.proj .folder {
  color: var(--dim);
  flex-shrink: 0;
}
.proj.open .folder,
.proj:hover .folder {
  color: var(--muted);
}
.proj .name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  /* 虚化：低对比、字距拉开，作为分组标题而非主角 */
  color: var(--muted);
  font-weight: 500;
  letter-spacing: 0.5px;
}
.proj:hover .name {
  color: var(--text-2);
}

/* 项目操作下拉菜单 —— 软阴影 + 圆角，求精致高级感 */
.proj-menu {
  position: absolute;
  z-index: 50;
  top: 30px;
  right: 6px;
  min-width: 184px;
  padding: 5px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.16), 0 2px 8px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1px;
  animation: pmIn 0.13s ease;
}
@keyframes pmIn {
  from {
    opacity: 0;
    transform: translateY(-4px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.pm-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 9px;
  border: none;
  background: transparent;
  color: var(--text-2);
  font-size: 12.5px;
  border-radius: 6px;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.pm-item svg {
  color: var(--muted);
  flex-shrink: 0;
}
.pm-item:hover {
  background: var(--selection-bg);
  color: var(--text);
}
.pm-item:hover svg {
  color: var(--text);
}
.pm-item.danger:hover {
  color: var(--vermilion);
}
.pm-item.danger:hover svg {
  color: var(--vermilion);
}
.pm-sep {
  height: 1px;
  margin: 3px 6px;
  background: var(--border-soft);
}
.menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 45;
}

/* 入驻专家 / 专家团 选择浮层 */
.persona-pick {
  position: absolute;
  z-index: 50;
  top: 30px;
  right: 6px;
  width: 244px;
  max-height: 380px;
  overflow-y: auto;
  padding: 8px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 14px 38px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.1);
  animation: pmIn 0.13s ease;
}
.pp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  padding: 2px 4px 6px;
}
.pp-x {
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
  padding: 0 4px;
}
.pp-x:hover {
  color: var(--text);
}
.pp-hint {
  font-size: 11px;
  color: var(--dim);
  line-height: 1.5;
  padding: 0 4px 6px;
}
.pp-hint code {
  font-size: 10.5px;
  background: var(--selection-bg);
  padding: 0 4px;
  border-radius: 3px;
}
.pp-grp {
  font-family: var(--serif);
  font-size: 10.5px;
  letter-spacing: 1.2px;
  color: var(--dim);
  padding: 8px 4px 4px;
}
.pp-item {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  width: 100%;
  padding: 8px 9px;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 8px;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}
.pp-item:hover {
  background: var(--selection-bg);
}
.pp-item.team:hover {
  border-color: var(--primary);
}
.pp-item:disabled {
  opacity: 0.5;
  cursor: wait;
}
.pp-ic {
  font-size: 18px;
  line-height: 1.2;
  flex-shrink: 0;
}
.pp-tx {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.pp-nm {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
}
.pp-ds {
  font-size: 11px;
  color: var(--muted);
  line-height: 1.4;
}

/* 行尾相对时间（仿 Codex）：常态显示，hover 让位给删除按钮 */
.cv-time {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--dim);
  white-space: nowrap;
}
.conv:hover .cv-time {
  display: none;
}
/* 对话 = 实体（仿 Codex）：可点的主条目。字号/圆角对齐上方功能栏的 .nav-item.sub，同一套节奏 */
.conv {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 10px;
  height: 35px;
  font-size: 14px;
  letter-spacing: -0.3125px;
  color: var(--text);
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
/* 对话行头像：18px 白底圆 + 细描边 + 灰气泡图标（设计稿 Frame 13） */
.cv-av {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  border: 0.5px solid rgba(153, 153, 153, 0.44);
  color: rgba(102, 102, 102, 0.54);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
html[data-theme="dark"] .cv-av {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.16);
  color: var(--muted);
}
.conv:hover {
  background: var(--selection-bg);
  color: var(--text);
}
/* 常态隐藏删除钮（位置由 .cv-time 占着，hover 二者互换，行宽不跳动） */
.conv .ca.delete {
  display: none;
}
.conv:hover .ca {
  opacity: 1;
}
.conv:hover .ca.delete {
  display: inline-flex;
}
/* 选中态与导航同源：中性灰底 + 深字，无品牌色 */
.conv.active {
  background: var(--active-bg);
  color: var(--text);
  font-weight: 500;
}
.cv-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-soft);
  flex-shrink: 0;
  animation: cvDotIn 0.3s ease;
}
@keyframes cvDotIn {
  from { transform: scale(0); }
  to { transform: scale(1); }
}
.cv-pin {
  flex-shrink: 0;
  color: var(--gold);
  transform: rotate(35deg);
}
/* 运行中转圈圈：细灰环 + 一段墨色弧旋转（仿 Codex 进度指示） */
.cv-spin {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 2px solid var(--border);
  border-top-color: var(--ink);
  animation: cvSpin 0.7s linear infinite;
}
@keyframes cvSpin {
  to {
    transform: rotate(360deg);
  }
}
.cv-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ca {
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 15px;
  border-radius: 4px;
  opacity: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.ca:hover {
  background: var(--border);
  color: var(--text);
}
.ca.delete:hover {
  color: var(--vermilion);
}
/* 对话行「⋯」钮：与删除钮同样常态隐藏、hover 现身；菜单展开时(.on)常驻高亮 */
.conv .ca.cv-dots {
  display: none;
}
.conv:hover .ca.cv-dots {
  display: inline-flex;
}
.ca.cv-dots.on {
  display: inline-flex;
  opacity: 1;
  background: var(--border);
  color: var(--text);
}
/* 对话操作下拉菜单(复用 .pm-item / .pm-sep) */
.conv-menu {
  position: absolute;
  z-index: 50;
  top: 28px;
  right: 6px;
  min-width: 184px;
  padding: 5px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.16), 0 2px 8px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1px;
  animation: pmIn 0.13s ease;
  cursor: default;
}

.empty-hint {
  font-size: 13px;
  color: var(--dim);
  padding: 8px 10px 8px 14px;
  font-style: italic;
}

.footer {
  margin-top: auto;
  padding-top: 6px;
  border-top: 1px solid var(--border-soft);
}
.footer-text {
  font-size: 10.5px;
  color: var(--dim);
  text-align: center;
  font-family: var(--serif);
  letter-spacing: 1.5px;
  padding: 4px 0;
}
</style>

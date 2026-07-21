<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import {
  Plus,
  Sparkles,
  Globe,
  Wrench,
  Trash2,
  Download,
  FileText,
  Table,
  AudioLines,
  Clapperboard,
  Image as ImageIcon,
  Ghost,
  FolderOpen,
  X,
  Bug,
  FlaskConical,
  Calculator,
  Receipt,
  Palette,
  ClipboardList,
} from "@lucide/vue";
import SearchGlass from "./icons/SearchGlass.vue";
import { skills as skillsApi, isTauri, type Skill } from "../tauri";
import { useSkillsStore } from "../stores/skills";

const skillsStore = useSkillsStore();
const activeTab = ref<"market" | "mine">("market");
const skillList = ref<Skill[]>([]);
const searchQuery = ref("");
const loading = ref(false);
// 正在安装的 skill id（用于按钮 loading 态）
const installing = ref<Set<string>>(new Set());

// 创建弹窗
const showCreateModal = ref(false);
const createForm = ref({
  id: "",
  name: "",
  description: "",
  systemPrompt: "",
});
const createError = ref("");

// 导入/下载弹窗
const showImportModal = ref(false);
const importSource = ref("");
const importing = ref(false);
const importError = ref("");

onMounted(loadSkills);

async function loadSkills() {
  loading.value = true;
  try {
    skillList.value = await skillsApi.list();
  } catch {
    skillList.value = [
      { id: "deep-research", name: "深度搜索", description: "...", source: "third-party" },
      { id: "skill-creator", name: "Skill 创建向导", description: "...", source: "official" },
    ];
  } finally {
    loading.value = false;
  }
}

const marketSkills = computed(() =>
  skillList.value.filter((s) => s.source !== "user")
);

// 「我的技能」= 已安装 / 已创建（物理存在于用户目录，removable）。预装内置只在市场展示。
const mySkills = computed(() =>
  skillList.value.filter((s) => s.removable)
);

const currentSkills = computed(() => {
  const list = activeTab.value === "market" ? marketSkills.value : mySkills.value;
  if (!searchQuery.value.trim()) return list;
  const q = searchQuery.value.toLowerCase();
  return list.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q)
  );
});

// 市场按人群/用途分组展示；「我的技能」保持平铺（title 为空 = 不渲染组头）
const CATEGORY_ORDER = [
  "开发编程",
  "测试质检",
  "财务会计",
  "设计美工",
  "办公文档",
  "教学教研",
  "音视频",
  "自动化与浏览器",
  "通用",
];
const currentGroups = computed(() => {
  const list = currentSkills.value;
  if (activeTab.value !== "market") return [{ title: "", skills: list }];
  const by = new Map<string, Skill[]>();
  for (const s of list) {
    const c = s.category || "通用";
    if (!by.has(c)) by.set(c, []);
    by.get(c)!.push(s);
  }
  const ordered = CATEGORY_ORDER.filter((c) => by.has(c));
  const rest = [...by.keys()].filter((c) => !CATEGORY_ORDER.includes(c));
  return [...ordered, ...rest].map((c) => ({ title: c, skills: by.get(c)! }));
});

function iconForSkill(skill: Skill) {
  const map: Record<string, any> = {
    "deep-research": Globe,
    "skill-creator": Wrench,
    pdf: FileText,
    xlsx: Table,
    "edge-tts": AudioLines,
    hyperframes: Clapperboard,
    "web-search": SearchGlass,
    "image-gen": ImageIcon,
    "cloak-browser": Ghost,
    "systematic-debugging": Bug,
    "bug-report-repro": Bug,
    "writing-plans": ClipboardList,
    "verification-before-completion": ClipboardList,
    "mcp-builder": Wrench,
    "webapp-testing": FlaskConical,
    "e2e-test-pipeline": FlaskConical,
    "financial-model": Calculator,
    "bookkeeping-recon": Calculator,
    "invoice-audit": Receipt,
    "canvas-design": Palette,
    "brand-guidelines": Palette,
    "algorithmic-art": Sparkles,
  };
  return map[skill.id] ?? Sparkles;
}

function sourceLabel(source: string) {
  if (source === "official") return "官方";
  if (source === "third-party") return "第三方";
  return "我的";
}

// 从市场安装 → 复制到用户目录 → 重新加载 → 自动激活（立即可用，无需手动确认）
async function onInstall(skill: Skill) {
  if (installing.value.has(skill.id) || skill.installed) return;
  installing.value = new Set(installing.value).add(skill.id);
  try {
    await skillsApi.install(skill.id);
    await loadSkills();
    skillsStore.enable(skill.id); // 安装即激活
  } catch (e: any) {
    alert(`安装失败: ${e?.message ?? e}`);
  } finally {
    const next = new Set(installing.value);
    next.delete(skill.id);
    installing.value = next;
  }
}

// ── 导入 / 下载（外部来源） ──
function openImportModal() {
  importSource.value = "";
  importError.value = "";
  showImportModal.value = true;
}
function closeImportModal() {
  showImportModal.value = false;
}
async function browseFile() {
  if (!isTauri) return;
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const sel = await open({
      multiple: false,
      filters: [{ name: "Skill", extensions: ["md", "zip"] }],
    });
    if (typeof sel === "string") importSource.value = sel;
  } catch {
    /* 用户取消或无 dialog */
  }
}
async function submitImport() {
  const src = importSource.value.trim();
  if (!src) {
    importError.value = "请填写来源：URL / git 仓库 / 本地文件路径";
    return;
  }
  importing.value = true;
  importError.value = "";
  try {
    const ids = await skillsApi.import(src);
    await loadSkills();
    ids.forEach((id) => skillsStore.enable(id)); // 导入即激活
    closeImportModal();
    activeTab.value = "mine";
  } catch (e: any) {
    importError.value = e?.message ?? String(e);
  } finally {
    importing.value = false;
  }
}

async function onDelete(skill: Skill) {
  if (!confirm(`确定移除技能「${skill.name}」?`)) return;
  try {
    await skillsApi.delete(skill.id);
    skillsStore.remove(skill.id);
    await loadSkills();
  } catch (e: any) {
    alert(`移除失败: ${e?.message ?? e}`);
  }
}

function openCreateModal() {
  createForm.value = { id: "", name: "", description: "", systemPrompt: "" };
  createError.value = "";
  showCreateModal.value = true;
}

function closeCreateModal() {
  showCreateModal.value = false;
}

function sanitizeId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function onNameInput() {
  if (!createForm.value.id) {
    createForm.value.id = sanitizeId(createForm.value.name);
  }
}

async function submitCreate() {
  createError.value = "";
  const { id, name, description, systemPrompt } = createForm.value;
  if (!id.trim() || !name.trim() || !systemPrompt.trim()) {
    createError.value = "ID、名称和 System Prompt 为必填项";
    return;
  }
  try {
    await skillsApi.create(id.trim(), name.trim(), description.trim(), systemPrompt.trim());
    await loadSkills();
    skillsStore.enable(id.trim()); // 创建即激活
    closeCreateModal();
    activeTab.value = "mine";
  } catch (e: any) {
    createError.value = e?.message ?? String(e);
  }
}
</script>

<template>
  <div class="skill-center">
    <!-- 顶部一行：Tab + 次级按钮 + 搜索（设计稿 Frame 28，去掉了原来的独立标题行） -->
    <div class="sc-toolbar">
      <div class="sc-tabs">
        <button
          class="sc-tab"
          :class="{ active: activeTab === 'market' }"
          @click="activeTab = 'market'"
        >
          精品推荐
        </button>
        <button
          class="sc-tab"
          :class="{ active: activeTab === 'mine' }"
          @click="activeTab = 'mine'"
        >
          我的技能
          <span v-if="mySkills.length > 0" class="sc-tab-badge">{{ mySkills.length }}</span>
        </button>
      </div>
      <div class="sc-toolbar-right">
        <button class="sc-ghost-btn sc-new-btn" @click="openCreateModal">
          <Plus :size="14" :stroke-width="2" />
          <span>新技能</span>
        </button>
        <button
          class="sc-ghost-btn sc-import-btn"
          title="从外部 URL / git 仓库 / 本地文件导入"
          @click="openImportModal"
        >
          <Download :size="14" :stroke-width="2" />
          <span>导入</span>
        </button>
        <div class="sc-search">
          <SearchGlass :size="15" :stroke-width="1.8" class="sc-search-icon" />
          <input v-model="searchQuery" placeholder="输入关键词搜索技能" type="text" />
        </div>
      </div>
    </div>

    <!-- Skill Grid（市场按分组，我的技能平铺） -->
    <div
      v-for="group in loading ? [] : currentGroups"
      :key="group.title || 'all'"
      class="sc-group"
    >
      <div v-if="group.title" class="sc-group-head">
        <span class="sc-group-title">{{ group.title }}</span>
        <span class="sc-group-count">{{ group.skills.length }}</span>
      </div>
      <div class="sc-grid" :class="{ mine: activeTab === 'mine' }">
      <div v-for="skill in group.skills" :key="skill.id" class="sc-card">
        <!-- 封面位：数据里没有海报图，用占位底 + 技能图标顶上，保持 201×103 的版式 -->
        <div class="sc-cover">
          <component :is="iconForSkill(skill)" :size="34" :stroke-width="1.4" />
        </div>
        <div class="sc-card-body">
          <div class="sc-card-name" :title="skill.name">{{ skill.name }}</div>
          <div class="sc-card-sub" :title="skill.description">
            {{ skill.description || sourceLabel(skill.source) }}
          </div>
          <div class="sc-card-foot">
            <!-- 精品推荐：黑色「安装」/ 半透明黑「已安装」胶囊 -->
            <template v-if="activeTab === 'market'">
              <button
                v-if="!skill.installed"
                class="sc-pill sc-pill-install"
                :disabled="installing.has(skill.id)"
                @click="onInstall(skill)"
              >
                <Download :size="14" :stroke-width="1.9" />
                <span>{{ installing.has(skill.id) ? "安装中…" : "安装" }}</span>
              </button>
              <span v-else class="sc-pill sc-pill-installed">已安装</span>
            </template>
            <!-- 我的技能：开关 + 「已安装」文字 -->
            <template v-else>
              <label class="switch" title="开启/关闭" @click.stop>
                <input
                  type="checkbox"
                  :checked="skillsStore.has(skill.id)"
                  @change="skillsStore.toggle(skill.id)"
                />
                <span class="slider round" />
              </label>
              <span class="sc-installed-text">已安装</span>
            </template>
            <!-- 删除图标固定在卡片右下角 -->
            <button
              v-if="skill.removable"
              class="sc-card-delete"
              title="卸载 / 删除"
              @click="onDelete(skill)"
            >
              <Trash2 :size="16" :stroke-width="1.8" />
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="currentSkills.length === 0 && !loading" class="sc-empty">
      <template v-if="activeTab === 'mine'">
        <div>还没有安装或创建技能 — 去「市场精选」安装，或自己创建一个</div>
        <button class="sc-empty-btn" @click="openCreateModal">+ 创建第一个技能</button>
      </template>
      <template v-else>
        暂无技能
      </template>
    </div>

    <!-- 导入/下载弹窗 -->
    <div v-if="showImportModal" class="modal-overlay" @click.self="closeImportModal">
      <div class="modal">
        <div class="modal-head">
          <span class="modal-title">导入 / 下载技能</span>
          <button class="modal-close" @click="closeImportModal">
            <X :size="16" :stroke-width="2" />
          </button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <label>来源（不限来源，鼓励从外面拿）</label>
            <input
              v-model="importSource"
              placeholder="git 仓库 / 远程 .md / .zip / 本地路径"
              @keydown.enter="submitImport"
            />
          </div>
          <div class="import-hint">
            <div>支持任意来源：</div>
            <ul>
              <li><strong>git 仓库</strong>：如 <code>https://github.com/obra/superpowers</code>（整套合集自动逐个装）</li>
              <li><strong>远程文件</strong>：<code>https://…/skill.md</code> 或 <code>https://…/pack.zip</code></li>
              <li><strong>本地</strong>：<code>.md</code> 文件 / <code>.zip</code> 压缩包 / 技能目录</li>
            </ul>
          </div>
          <button v-if="isTauri" class="import-browse" @click="browseFile">
            <FolderOpen :size="14" :stroke-width="1.8" />
            <span>选择本地 .md / .zip 文件…</span>
          </button>
          <div v-if="importError" class="form-error">{{ importError }}</div>
        </div>
        <div class="modal-foot">
          <button class="modal-btn secondary" @click="closeImportModal">取消</button>
          <button class="modal-btn primary" :disabled="importing" @click="submitImport">
            {{ importing ? "导入中…" : "导入" }}
          </button>
        </div>
      </div>
    </div>

    <!-- 创建弹窗 -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="closeCreateModal">
      <div class="modal">
        <div class="modal-head">
          <span class="modal-title">创建新技能</span>
          <button class="modal-close" @click="closeCreateModal">
            <X :size="16" :stroke-width="2" />
          </button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <label>名称</label>
            <input v-model="createForm.name" placeholder="例如: 高老师风格写作" @input="onNameInput" />
          </div>
          <div class="form-row">
            <label>ID（唯一标识，只能用小写字母、数字、-）</label>
            <input v-model="createForm.id" placeholder="gao-style-writer" />
          </div>
          <div class="form-row">
            <label>描述</label>
            <input v-model="createForm.description" placeholder="一句话描述这个技能的作用..." />
          </div>
          <div class="form-row">
            <label>System Prompt（核心指令）</label>
            <textarea
              v-model="createForm.systemPrompt"
              placeholder="# 角色定义&#10;&#10;你是...&#10;&#10;## 工作方式&#10;1. ..."
              rows="8"
            ></textarea>
          </div>
          <div v-if="createError" class="form-error">{{ createError }}</div>
        </div>
        <div class="modal-foot">
          <button class="modal-btn secondary" @click="closeCreateModal">取消</button>
          <button class="modal-btn primary" @click="submitCreate">创建</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.skill-center {
  height: 100%;
  overflow-y: auto;
  /* 主区底色跟设计稿走 #FAFAFA；左边距对齐正文列 */
  padding: 32px 32px 40px;
  background: var(--bg-chat);
}

/* 导入弹窗内的提示 */
.import-hint {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.7;
  background: var(--bg-soft);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
}
.import-hint ul {
  margin: 6px 0 0;
  padding-left: 18px;
}
.import-hint code {
  font-family: var(--mono);
  font-size: 11px;
  background: var(--panel);
  padding: 1px 4px;
  border-radius: 3px;
}
.import-browse {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: transparent;
  color: var(--text-2);
  border: 1px dashed var(--border);
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
}
.import-browse:hover {
  border-color: var(--brand);
  color: var(--brand);
  background: var(--active-bg);
}

/* ═══════ 顶部操作条（设计稿 Frame 28：1056×36.5，无分隔线） ═══════ */
.sc-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 26px;
}
.sc-tabs {
  display: flex;
  align-items: center;
  gap: 16px; /* 设计稿 Tab 间距 */
}
/* Tab 是这一页的标题级元素：20px，选中态用唯一强调色（绿渐变实底白字） */
.sc-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 105px;
  height: 36px;
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: var(--ink);
  font-size: 20px;
  font-weight: 500;
  letter-spacing: 0.05px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.sc-tab:hover:not(.active) {
  background: var(--active-bg);
}
.sc-tab.active {
  background: var(--brand-grad);
  color: #fff;
  font-weight: 700;
}
.sc-tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  /* 高亮退成中性灰；选中 Tab 上换成半透明白，保证在绿底上可读 */
  background: var(--active-bg);
  color: var(--text-2);
  border-radius: 9px;
  font-size: 11px;
  font-weight: 600;
}
.sc-tab.active .sc-tab-badge {
  background: rgba(255, 255, 255, 0.28);
  color: #fff;
}
.sc-toolbar-right {
  display: flex;
  align-items: center;
  gap: 11px;
}
/* 次级按钮：中性填充底 + radius 8，不再用描边/品牌色 */
.sc-ghost-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 36px;
  padding: 6px 12px;
  background: var(--active-bg);
  color: var(--text-2);
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
  letter-spacing: -0.23px;
  cursor: pointer;
  white-space: nowrap;
  transition: filter 0.15s;
}
.sc-new-btn {
  min-width: 88px;
}
.sc-import-btn {
  min-width: 88px;
}
.sc-ghost-btn:hover {
  filter: brightness(0.96);
}
/* 全圆角搜索框 260×36.5 */
.sc-search {
  display: flex;
  align-items: center;
  gap: 5px;
  background: var(--active-bg);
  border: none;
  border-radius: 1014px;
  padding: 9px 16px;
  width: 260px;
  height: 36.5px;
}
.sc-search-icon {
  color: var(--muted);
  flex-shrink: 0;
}
.sc-search input {
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: var(--text);
  width: 100%;
  letter-spacing: -0.15px;
}
.sc-search input::placeholder {
  color: rgba(117, 117, 117, 0.45);
}

/* ═══════ 卡片网格：定宽 201，列间距 13 ═══════ */
.sc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 201px);
  gap: 20px 13px;
}
.sc-group + .sc-group {
  margin-top: 30px;
}
.sc-group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
}
/* 分组小标题 16/700（设计稿「办公文档」「教学教研」） */
.sc-group-title {
  font-size: 16px;
  line-height: 36px;
  font-weight: 700;
  letter-spacing: 0.05px;
  color: var(--ink);
}
.sc-group-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  background: var(--active-bg);
  color: var(--muted);
  border-radius: 9px;
  font-size: 11px;
  font-weight: 600;
}

.sc-card {
  position: relative;
  width: 201px;
  height: 229px;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border: none;
  border-radius: 12px;
  padding: 0;
  overflow: hidden;
  box-shadow: var(--shadow-card);
  transition: transform 0.15s, box-shadow 0.15s;
}
/* 「我的技能」卡比精品推荐矮 8px（设计稿 221 vs 229） */
.sc-grid.mine .sc-card {
  height: 221px;
}
.sc-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.1);
}
/* 封面 201×103，只圆上面两角；无海报图时用占位底 + 技能图标 */
.sc-cover {
  width: 100%;
  height: 103px;
  flex-shrink: 0;
  border-radius: 12px 12px 0 0;
  background: var(--selection-bg);
  color: var(--muted);
  display: flex;
  align-items: center;
  justify-content: center;
}
.sc-card-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 6px 14px 14px;
}
.sc-card-name {
  font-size: 16px;
  line-height: 36px;
  font-weight: 600;
  letter-spacing: 0.05px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sc-card-sub {
  font-size: 14px;
  line-height: 17px;
  font-weight: 400;
  letter-spacing: -0.31px;
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sc-card-foot {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 动作胶囊 86×30 radius 36 */
.sc-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 86px;
  height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: 36px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.05px;
  color: #fff;
  cursor: pointer;
}
.sc-pill-install {
  /* 反色实底：走 token，黑夜模式不会白底白字 */
  background: var(--btn-solid-bg);
  color: var(--btn-solid-text);
}
.sc-pill-install:disabled {
  opacity: 0.55;
  cursor: default;
}
.sc-pill-installed {
  background: rgba(0, 0, 0, 0.25);
  cursor: default;
}
/* 「我的技能」的状态文字 */
.sc-installed-text {
  font-size: 13px;
  font-weight: 400;
  letter-spacing: 0.05px;
  color: #999999;
}
/* 删除图标固定右下角 */
.sc-card-delete {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--dim);
  border-radius: 6px;
  cursor: pointer;
}
.sc-card-delete:hover {
  color: var(--vermilion);
  background: var(--vermilion-soft);
}

/* ─── Toggle Switch 51×23，白色 19px 圆钮 ─── */
.switch {
  position: relative;
  display: inline-block;
  width: 51px;
  height: 23px;
  flex-shrink: 0;
}
.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: #bfbfbf; /* 关闭态灰 */
  border-radius: 36px;
  transition: 0.2s;
}
.slider::before {
  content: "";
  position: absolute;
  height: 19px;
  width: 19px;
  left: 2px;
  top: 2px;
  background: #fff;
  border-radius: 50%;
  transition: 0.2s;
}
/* 开启态是页面唯一强调色 */
input:checked + .slider {
  background: var(--brand-grad);
}
input:checked + .slider::before {
  transform: translateX(28px);
}

.sc-empty {
  text-align: center;
  padding: 60px 0;
  color: var(--muted);
  font-size: 14px;
}
.sc-empty-btn {
  margin-top: 12px;
  padding: 8px 18px;
  background: var(--brand-grad);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.sc-empty-btn:hover {
  filter: brightness(1.04);
}

/* 黑夜模式：写死的浅色需要各自兜底 */
html[data-theme="dark"] .sc-pill-installed {
  background: rgba(255, 255, 255, 0.22);
}
html[data-theme="dark"] .sc-installed-text {
  color: var(--muted);
}
html[data-theme="dark"] .slider {
  background: rgba(255, 255, 255, 0.24);
}
html[data-theme="dark"] .sc-search input::placeholder {
  color: var(--dim);
}
html[data-theme="dark"] .sc-card:hover {
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
}

/* ─────────── 创建弹窗 ─────────── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  width: 520px;
  max-width: 90vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-soft);
}
.modal-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}
.modal-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--muted);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.modal-close:hover {
  background: var(--bg-soft);
  color: var(--text);
}
.modal-body {
  padding: 16px 20px;
  overflow-y: auto;
}
.form-row {
  margin-bottom: 14px;
}
.form-row label {
  display: block;
  font-size: 12px;
  color: var(--text-2);
  margin-bottom: 5px;
}
.form-row input,
.form-row textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 13px;
  background: var(--bg);
  color: var(--text);
  outline: none;
  resize: vertical;
}
.form-row input:focus,
.form-row textarea:focus {
  /* 聚焦高亮改用唯一强调色（绿），不再用紫/蓝品牌色 */
  border-color: var(--brand);
}
.form-error {
  color: var(--vermilion);
  font-size: 12px;
  padding: 4px 0;
}
.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 20px 16px;
  border-top: 1px solid var(--border-soft);
}
.modal-btn {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 13px;
  border: none;
  cursor: pointer;
}
.modal-btn.secondary {
  background: var(--active-bg);
  color: var(--text-2);
}
.modal-btn.secondary:hover {
  filter: brightness(0.96);
}
.modal-btn.primary {
  background: var(--brand-grad);
  color: #fff;
  font-weight: 600;
}
.modal-btn.primary:hover {
  filter: brightness(1.04);
}
</style>

<script setup lang="ts">
/**
 * 「问知识库」可收纳侧栏 —— 知识库/星河图谱右侧那条能收起来的对话框。
 *
 * 同一个组件挂两处，只靠 theme 换皮:
 *   light = 知识库浏览页(白卡片、跟左右两栏同一套圆角/描边/投影)
 *   dark  = 星河图谱页(深空玻璃态，跟图例/节点卡同一套 rgba 玻璃)
 * 会话状态在 useKbAskStore 里，两处共用一条对话、切页面不断线。
 */
import { ref, watch, nextTick, onMounted } from "vue";
import { marked } from "marked";
import { sanitizeHtml } from "../lib/sanitize";
import { Sparkles, ChevronsRight, Send, Eraser, Loader } from "@lucide/vue";
import { useKbAskStore } from "../stores/kbAsk";

const props = withDefaults(
  defineProps<{
    theme?: "light" | "dark";
    /** 展开/收起状态的记忆键(两个宿主各记各的) */
    storageKey?: string;
  }>(),
  { theme: "light", storageKey: "kbAsk.open" },
);
// open   = 点来源角标，交给宿主决定怎么打开(知识库页打开正文；图谱页不接就只当提示)
// toggle = 展开/收起，宿主据此让位(星河页要把节点信息卡挪开，否则被面板压住)
const emit = defineEmits<{ open: [path: string]; toggle: [open: boolean] }>();

const store = useKbAskStore();

const open = ref(false);
onMounted(() => {
  open.value = localStorage.getItem(props.storageKey) === "1";
  emit("toggle", open.value);
  if (open.value) void store.ensureListener();
});
function setOpen(v: boolean) {
  open.value = v;
  emit("toggle", v);
  try {
    localStorage.setItem(props.storageKey, v ? "1" : "0");
  } catch {
    /* 隐私模式写不了 localStorage 也不影响用 */
  }
  if (v) void store.ensureListener();
}

const draft = ref("");
const listEl = ref<HTMLDivElement | null>(null);

const TIPS = ["库里都有些什么资料?", "挑三个重点讲讲", "哪些内容能直接用到课上?"];

// KB 正文来自导入文档/AI 生成(不可信来源)，同 WikiBrowse 一律过 DOMPurify 再 v-html
function render(md: string): string {
  return sanitizeHtml(marked.parse(md) as string);
}

function submit() {
  const q = draft.value.trim();
  if (!q || store.asking) return;
  draft.value = "";
  void store.send(q);
}
function quick(t: string) {
  if (store.asking) return;
  void store.send(t);
}

// 新消息/流式增量落地后贴底(用户手动往上翻时不抢滚动:离底 80px 内才跟)
watch(
  () => [store.msgs.length, store.msgs[store.msgs.length - 1]?.text, store.status],
  () => {
    const el = listEl.value;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (!nearBottom) return;
    void nextTick(() => {
      if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight;
    });
  },
);
</script>

<template>
  <div class="kb-ask" :class="[theme, { open }]">
    <!-- 收起态:右缘一条竖排把手，随时唤回 -->
    <button v-if="!open" class="rail" title="问知识库" @click="setOpen(true)">
      <Sparkles :size="14" :stroke-width="1.8" />
      <span class="rail-text">问知识库</span>
    </button>

    <div v-else class="panel">
      <div class="p-head">
        <Sparkles :size="14" :stroke-width="1.8" class="h-icon" />
        <span class="p-title">问知识库</span>
        <button
          class="icon-btn"
          title="清空对话"
          :disabled="store.asking || !store.msgs.length"
          @click="store.clear()"
        >
          <Eraser :size="14" :stroke-width="1.7" />
        </button>
        <button class="icon-btn" title="收起" @click="setOpen(false)">
          <ChevronsRight :size="15" :stroke-width="1.7" />
        </button>
      </div>

      <div ref="listEl" class="p-body">
        <div v-if="!store.msgs.length" class="p-empty">
          <div class="e-glyph">◈</div>
          <div class="e-title">问问你自己的知识库</div>
          <div class="e-hint">
            只依据已入库的资料作答，并给出来源出处；库里没有的会直说，不替你编。
          </div>
          <div class="e-tips">
            <button v-for="t in TIPS" :key="t" class="tip" @click="quick(t)">
              {{ t }}
            </button>
          </div>
        </div>

        <div v-for="(m, i) in store.msgs" :key="i" class="msg" :class="m.role">
          <div v-if="m.role === 'user'" class="bubble-user">{{ m.text }}</div>
          <template v-else>
            <div
              v-if="m.text"
              class="bubble-ai"
              :class="{ err: m.err }"
              v-html="render(m.text)"
            ></div>
            <div v-else-if="store.asking && i === store.msgs.length - 1" class="thinking">
              <Loader :size="13" class="spin" />
              <span>{{ store.status || "思考中…" }}</span>
            </div>
            <div v-if="m.sources?.length" class="srcs">
              <button
                v-for="s in m.sources"
                :key="s.path"
                class="src"
                :title="s.path"
                @click="emit('open', s.path)"
              >
                [{{ s.idx }}] {{ s.title }}
              </button>
            </div>
          </template>
        </div>
      </div>

      <div class="p-foot">
        <textarea
          v-model="draft"
          class="input"
          rows="2"
          spellcheck="false"
          placeholder="问点知识库里的事… (Enter 发送 / Shift+Enter 换行)"
          @keydown.enter.exact.prevent="submit"
        ></textarea>
        <button
          class="send"
          :disabled="store.asking || !draft.trim()"
          :title="store.asking ? '正在回答…' : '发送'"
          @click="submit"
        >
          <Loader v-if="store.asking" :size="14" class="spin" />
          <Send v-else :size="14" :stroke-width="1.8" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kb-ask {
  display: flex;
  height: 100%;
  min-height: 0;
  font-family: var(--sans);
}

/* ── 收起态把手 ───────────────────────────────────────── */
.rail {
  width: 34px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.rail-text {
  writing-mode: vertical-rl;
  letter-spacing: 3px;
  font-size: 12px;
}
.kb-ask.light .rail {
  background: var(--panel);
  border: 1px solid var(--border-soft);
  box-shadow: var(--shadow-card);
  color: var(--muted);
}
.kb-ask.light .rail:hover {
  color: var(--primary);
  border-color: var(--border-strong);
}
.kb-ask.dark .rail {
  background: rgba(10, 14, 28, 0.55);
  border: 1px solid rgba(150, 180, 255, 0.18);
  border-radius: 8px;
  color: rgba(214, 226, 255, 0.82);
  backdrop-filter: blur(8px);
}
.kb-ask.dark .rail:hover {
  background: rgba(16, 22, 42, 0.75);
  border-color: rgba(160, 195, 255, 0.36);
  color: #eaf1ff;
}

/* ── 展开态面板 ───────────────────────────────────────── */
.panel {
  width: 330px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-radius: 12px;
  overflow: hidden;
}
.kb-ask.light .panel {
  background: var(--panel);
  border: 1px solid var(--border-soft);
  box-shadow: var(--shadow-card);
}
.kb-ask.dark .panel {
  background: rgba(10, 14, 28, 0.72);
  border: 1px solid rgba(150, 180, 255, 0.2);
  border-radius: 8px;
  box-shadow: 0 10px 34px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
}

.p-head {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 11px 12px;
  flex-shrink: 0;
}
.p-title {
  flex: 1;
  font-family: var(--serif);
  font-size: 14px;
  letter-spacing: 1px;
}
.kb-ask.light .p-head {
  border-bottom: 1px solid var(--border-soft);
  color: var(--ink);
}
.kb-ask.light .h-icon {
  color: var(--primary);
}
.kb-ask.dark .p-head {
  border-bottom: 1px solid rgba(150, 180, 255, 0.16);
  color: #eaf1ff;
}
.kb-ask.dark .h-icon {
  color: #f0b24a;
}
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s;
}
.icon-btn:disabled {
  opacity: 0.35;
  cursor: default;
}
.kb-ask.light .icon-btn {
  color: var(--muted);
}
.kb-ask.light .icon-btn:not(:disabled):hover {
  color: var(--ink);
  background: var(--selection-bg);
}
.kb-ask.dark .icon-btn {
  color: rgba(190, 210, 250, 0.8);
}
.kb-ask.dark .icon-btn:not(:disabled):hover {
  color: #fff;
  background: rgba(150, 180, 255, 0.16);
}

.p-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 空态 */
.p-empty {
  margin: auto 0;
  text-align: center;
  padding: 12px 6px;
}
.e-glyph {
  font-size: 30px;
  margin-bottom: 8px;
}
.e-title {
  font-family: var(--serif);
  font-size: 14px;
  letter-spacing: 1px;
  margin-bottom: 7px;
}
.e-hint {
  font-size: 11.5px;
  line-height: 1.75;
  text-align: left;
}
.e-tips {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 14px;
}
.tip {
  padding: 7px 10px;
  font-size: 12px;
  text-align: left;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}
.kb-ask.light .e-glyph {
  color: var(--dim);
}
.kb-ask.light .e-title {
  color: var(--ink);
}
.kb-ask.light .e-hint {
  color: var(--muted);
}
.kb-ask.light .tip {
  border: 1px solid var(--border-soft);
  background: var(--bg-soft);
  color: var(--text-2);
}
.kb-ask.light .tip:hover {
  border-color: var(--primary);
  color: var(--primary);
}
.kb-ask.dark .e-glyph {
  color: rgba(150, 180, 255, 0.5);
}
.kb-ask.dark .e-title {
  color: #f1f5ff;
}
.kb-ask.dark .e-hint {
  color: rgba(190, 210, 250, 0.75);
}
.kb-ask.dark .tip {
  border: 1px solid rgba(150, 180, 255, 0.2);
  background: rgba(150, 180, 255, 0.08);
  color: rgba(214, 226, 255, 0.9);
}
.kb-ask.dark .tip:hover {
  border-color: rgba(180, 210, 255, 0.45);
  color: #fff;
}

/* 气泡 */
.msg {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.msg.user {
  align-items: flex-end;
}
.bubble-user {
  max-width: 90%;
  padding: 7px 11px;
  border-radius: 12px 12px 3px 12px;
  font-size: 12.5px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}
.bubble-ai {
  font-size: 12.5px;
  line-height: 1.8;
  word-break: break-word;
}
.kb-ask.light .bubble-user {
  background: var(--primary-soft);
  color: var(--primary-deep);
}
.kb-ask.light .bubble-ai {
  color: var(--text-2);
}
.kb-ask.light .bubble-ai.err {
  color: var(--vermilion);
}
.kb-ask.dark .bubble-user {
  background: rgba(111, 179, 255, 0.16);
  border: 1px solid rgba(150, 180, 255, 0.22);
  color: #eaf1ff;
}
.kb-ask.dark .bubble-ai {
  color: rgba(226, 236, 255, 0.92);
}
.kb-ask.dark .bubble-ai.err {
  color: #ff9a9a;
}

/* 回答里的 markdown（deep 穿透 v-html） */
.bubble-ai :deep(p) {
  margin: 0 0 8px;
}
.bubble-ai :deep(p:last-child) {
  margin-bottom: 0;
}
.bubble-ai :deep(ul),
.bubble-ai :deep(ol) {
  margin: 0 0 8px;
  padding-left: 18px;
}
.bubble-ai :deep(li) {
  margin: 2px 0;
}
.bubble-ai :deep(h1),
.bubble-ai :deep(h2),
.bubble-ai :deep(h3) {
  font-family: var(--serif);
  font-size: 13px;
  margin: 10px 0 6px;
}
.bubble-ai :deep(code) {
  font-family: var(--mono);
  font-size: 11px;
  padding: 1px 5px;
  border-radius: 3px;
}
.bubble-ai :deep(pre) {
  overflow-x: auto;
  padding: 8px 10px;
  border-radius: 6px;
  margin: 0 0 8px;
}
.bubble-ai :deep(a) {
  text-decoration: underline;
}
.kb-ask.light .bubble-ai :deep(code) {
  background: var(--code-bg);
  color: var(--code-text);
}
.kb-ask.light .bubble-ai :deep(pre) {
  background: var(--code-bg);
}
.kb-ask.light .bubble-ai :deep(strong) {
  color: var(--ink);
}
.kb-ask.dark .bubble-ai :deep(code) {
  background: rgba(150, 180, 255, 0.14);
  color: #cfe2ff;
}
.kb-ask.dark .bubble-ai :deep(pre) {
  background: rgba(4, 8, 20, 0.6);
}
.kb-ask.dark .bubble-ai :deep(strong) {
  color: #fff;
}

/* 思考中 */
.thinking {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
}
.kb-ask.light .thinking {
  color: var(--muted);
}
.kb-ask.dark .thinking {
  color: rgba(190, 210, 250, 0.8);
}
.spin {
  animation: kb-ask-spin 0.9s linear infinite;
}
@keyframes kb-ask-spin {
  to {
    transform: rotate(360deg);
  }
}

/* 来源角标 */
.srcs {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.src {
  max-width: 100%;
  padding: 3px 8px;
  font-size: 11px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: all 0.15s;
}
.kb-ask.light .src {
  border: 1px solid var(--border-soft);
  background: var(--bg-soft);
  color: var(--muted);
}
.kb-ask.light .src:hover {
  color: var(--primary);
  border-color: var(--primary);
}
.kb-ask.dark .src {
  border: 1px solid rgba(212, 176, 106, 0.35);
  background: rgba(212, 176, 106, 0.1);
  color: #f0dcae;
}
.kb-ask.dark .src:hover {
  border-color: #e8c878;
  color: #fff3d6;
}

/* 输入区 */
.p-foot {
  flex-shrink: 0;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 12px 12px;
}
.input {
  flex: 1;
  min-width: 0;
  resize: none;
  padding: 8px 10px;
  font-family: var(--sans);
  font-size: 12.5px;
  line-height: 1.6;
  border-radius: 8px;
  outline: none;
}
.send {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}
.send:disabled {
  opacity: 0.4;
  cursor: default;
}
.kb-ask.light .p-foot {
  border-top: 1px solid var(--border-soft);
}
.kb-ask.light .input {
  color: var(--ink);
  background: var(--bg-soft);
  border: 1px solid var(--border-soft);
}
.kb-ask.light .input:focus {
  border-color: var(--border-strong);
}
.kb-ask.light .send {
  border: none;
  background: var(--primary);
  color: #fff;
}
.kb-ask.light .send:not(:disabled):hover {
  background: var(--primary-deep);
}
.kb-ask.dark .p-foot {
  border-top: 1px solid rgba(150, 180, 255, 0.16);
}
.kb-ask.dark .input {
  color: #eaf1ff;
  background: rgba(4, 8, 20, 0.45);
  border: 1px solid rgba(150, 180, 255, 0.2);
}
.kb-ask.dark .input::placeholder {
  color: rgba(170, 190, 235, 0.55);
}
.kb-ask.dark .input:focus {
  border-color: rgba(180, 210, 255, 0.45);
}
.kb-ask.dark .send {
  border: 1px solid rgba(150, 180, 255, 0.3);
  background: rgba(111, 179, 255, 0.22);
  color: #eaf1ff;
}
.kb-ask.dark .send:not(:disabled):hover {
  background: rgba(111, 179, 255, 0.38);
}
</style>

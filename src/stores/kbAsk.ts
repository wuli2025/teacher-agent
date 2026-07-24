import { defineStore } from "pinia";
import { ref } from "vue";
import {
  kb,
  listen,
  type KbAskEvent,
  type KbAskSource,
  type KbAskTurn,
} from "../tauri";

export interface KbAskMsg {
  role: "user" | "assistant";
  text: string;
  /** 仅 assistant：本轮召回的资料(角标 chip) */
  sources?: KbAskSource[];
  err?: boolean;
}

// 「问知识库」的会话状态。
// 抬到 store 而不是留在组件里，有两个硬理由:
// ① 面板同时挂在**两处**(星河图谱页 + 知识库浏览页)，各自建监听会让同一条 kb:ask 事件
//    被追加两次；store 全局只订一次，两个面板天然同步、切页面不断线。
// ② 后端是独立线程 + 全局事件，问完切走再切回来，答案照样接得住。
export const useKbAskStore = defineStore("kbAsk", () => {
  const msgs = ref<KbAskMsg[]>([]);
  const asking = ref(false);
  /** 阶段提示(检索中/思考中/查阅了哪个工具)，答案首字落地即清空 */
  const status = ref("");
  const runId = ref("");

  // 内存治理:一问一答的气泡封顶，超出从头裁(一轮=2 条)
  const MAX_MSGS = 40;
  // 带回后端的历史轮次上限(后端还会再截一次)
  const HISTORY_TURNS = 6;

  let unlisten: (() => void) | null = null;
  // 同步闸:两个面板可能同一帧都调 ensureListener，只看 unlisten 会在 await 之前双双放行 → 重复订阅
  let wiring = false;

  async function ensureListener() {
    if (unlisten || wiring) return;
    wiring = true;
    unlisten = await listen<KbAskEvent>("kb:ask", (ev) => {
      // invoke 回执(runId)可能比后端首个事件晚到 → 运行中且还没拿到 id 时采纳首个事件的 id
      // (同一时刻只可能有一个 ask 在跑，由 asking 串行化)
      if (!runId.value && asking.value) runId.value = ev.runId;
      if (ev.runId !== runId.value) return;
      const cur = msgs.value[msgs.value.length - 1];
      if (!cur || cur.role !== "assistant") return;
      const t = ev.text ?? "";
      switch (ev.kind) {
        case "phase":
          status.value = t;
          break;
        case "tool":
          status.value = t ? `查阅资料(${t})…` : "查阅资料…";
          break;
        case "sources":
          cur.sources = ev.sources ?? [];
          break;
        case "delta":
          if (!t) break;
          // 后端一个 delta = claude 的一个文本块(已 trim)，块间补空行才不粘成一坨
          cur.text = cur.text ? `${cur.text}\n\n${t}` : t;
          status.value = "";
          break;
        case "error":
          cur.text = cur.text ? `${cur.text}\n\n[出错] ${t}` : `[出错] ${t}`;
          cur.err = true;
          break;
        case "done":
          if (!cur.text) {
            cur.text = "(这一轮没有拿到回答，可以再问一次)";
            cur.err = true;
          }
          asking.value = false;
          status.value = "";
          runId.value = "";
          break;
      }
    });
  }

  async function send(question: string) {
    const q = question.trim();
    if (!q || asking.value) return;
    await ensureListener();

    // 历史取当前已有的完整轮次(排掉出错气泡)，必须在 push 本轮之前取
    const history: KbAskTurn[] = msgs.value
      .filter((m) => m.text && !m.err)
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.role, text: m.text }));

    msgs.value.push({ role: "user", text: q });
    msgs.value.push({ role: "assistant", text: "" });
    if (msgs.value.length > MAX_MSGS)
      msgs.value.splice(0, msgs.value.length - MAX_MSGS);

    asking.value = true;
    status.value = "检索知识库…";
    runId.value = "";
    try {
      runId.value = await kb.ask(q, history);
    } catch (e: any) {
      const cur = msgs.value[msgs.value.length - 1];
      if (cur && cur.role === "assistant") {
        cur.text = `[出错] ${e?.message ?? e}`;
        cur.err = true;
      }
      asking.value = false;
      status.value = "";
    }
  }

  /** 清空对话(问答进行中不给清，免得答案落到空列表上) */
  function clear() {
    if (asking.value) return;
    msgs.value = [];
  }

  return { msgs, asking, status, send, clear, ensureListener };
});

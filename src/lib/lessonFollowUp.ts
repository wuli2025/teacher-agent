// 教案 → 配套课件追问:教案工坊发起的生成一到 done 终态,若教案确实落盘,
// 立即弹一条带按钮的询问 toast,一键在**同一条对话**里追加生成配套 PPT。
// 走同对话而不是新开对话:右抽屉的 deck/doc 两条链路本就设计为可共存于一次对话
// (一节课既有课件又有教案,见 RightDrawer),且 AI 带着刚写完的教案全文去做课件,
// 内容与教学环节天然对齐 —— 比拿着题目重新开一局强。
import { toast } from "../composables/useToast";
import { MODES } from "./teachSamples";

// convId → 教案主题(用户在工坊输入的原话)。只有教案工坊登记过的对话才会弹,
// 用户在普通聊天里顺口要的教案不打扰。
const pending = new Map<string, string>();

/** Home 教案工坊发起生成时登记(在 chat.send 之前调,发送失败 done 不来、自然不弹)。 */
export function registerLessonJob(convId: string, topic: string) {
  pending.set(convId, topic);
}

/** chat store 收到 done 终态时调用。登记过且教案 spec/.docx 真产出了才追问(失败/取消不弹)。 */
export function maybeAskDeckFollowUp(convId: string, artifactPaths: string[]) {
  const topic = pending.get(convId);
  if (topic === undefined) return;
  pending.delete(convId);
  if (!artifactPaths.some((p) => /polaris\.doc\.json$|\.docx$/i.test(p))) return;
  toast.ask("教案已生成，要不要顺手做一份配套的 PPT 课件？", [
    { label: "生成配套课件", primary: true, onClick: () => void sendDeckFollowUp(convId, topic) },
    { label: "暂不需要" },
  ]);
}

async function sendDeckFollowUp(convId: string, topic: string) {
  // 动态取 store:本模块被 chat store 静态引用,再静态 import 回去会成环
  const [{ useChatStore }, { useAppStore }] = await Promise.all([
    import("../stores/chat"),
    import("../stores/app"),
  ]);
  const chat = useChatStore();
  const app = useAppStore();
  if (chat.isSending(convId)) return; // 用户已在这条对话里另起了一轮,别撞车
  const m = MODES.ppt;
  const prompt =
    `请使用 polaris-deck-studio 技能，基于本对话刚生成的这份教案的内容与教学环节，` +
    `制作一份与之配套的【完整教学课件（.pptx，真文本框、可编辑）】，配图精美、版式混排、每页配口播稿，` +
    `课件的讲授顺序与教案的教学过程保持一致。` +
    (topic ? `\n\n课题：${topic}` : "");
  const display = `${m.badge}：${(topic || "教案配套课件").slice(0, 24)}`;
  try {
    await chat.send(convId, prompt, display, undefined, {
      permissionMode: "auto_current",
      skillIds: m.skillIds,
      goal: m.goal,
    });
    app.openConversationById(convId); // 把用户带回这条对话看生成
  } catch (e: any) {
    toast.error(`发起配套课件失败：${e?.message ?? e}`);
  }
}

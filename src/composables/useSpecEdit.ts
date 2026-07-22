/**
 * polaris.slides.json 的「改一次」事务:读盘 → 改对象 → 写盘 → 重建预览 → 重转 pptx。
 *
 * 演示工坊(DeckStudio)与右抽屉(RightDrawer)各自都挂着同一个 DeckViewer,原先各写了
 * 一份几乎逐字相同的读改写流程 —— 加一个能力就要改两处,漏一处就是两边行为不一致。
 * 这里收口成一个 composable,两边只需给出「spec 在哪、pptx 导出到哪、写完怎么刷预览」。
 *
 * 白送的红利是**撤销**:每次写盘前把旧文本压栈,Ctrl+Z 直接把旧文本写回去 ——
 * spec 是纯文本真源,所以撤销不需要任何 diff 逻辑,整份回滚即可。
 */
import { ref, computed } from "vue";
import { artifacts as artifactsApi } from "../tauri";

/** 撤销栈深度。spec 是几十 KB 的纯文本,20 步的内存代价可以忽略。 */
const UNDO_DEPTH = 20;

export interface SpecEditOpts {
  /** 当前 spec 文件的绝对路径(没有 → 所有操作静默跳过)。 */
  specPath: () => string | null;
  /** 本次要覆盖的成品路径(pptx / docx)。**必须**是用户认识的那份,别新造文件名(见各调用方注释)。 */
  pptxTarget: (specPath: string) => string | Promise<string>;
  /** 新 spec 文本写盘后:刷新预览(各家的 spec 状态形态不同,故由调用方自己接)。 */
  onWritten: (text: string, specPath: string) => void | Promise<void>;
  onError: (msg: string) => void;
  /**
   * spec 结构自检。缺省认 PPT 的 `slides` 数组;Word 教案(polaris.doc.json)传
   * `(o) => Array.isArray(o.blocks)`。放开这一处是为了让两个工坊共用同一套事务 ——
   * 撤销栈/竞态/「绝不改内存那份」这些坑没必要再踩第二遍。
   */
  validate?: (spec: any) => boolean;
  /** spec → 成品的转换。缺省 spec→pptx;Word 侧传 specToDocx。 */
  convert?: (specPath: string, out: string) => Promise<unknown>;
}

export function useSpecEdit(opts: SpecEditOpts) {
  const undoStack = ref<string[]>([]);
  const busy = ref(false);
  const canUndo = computed(() => undoStack.value.length > 0 && !busy.value);

  const validate = opts.validate ?? ((o: any) => Array.isArray(o?.slides));
  const convert = opts.convert ?? ((sp: string, out: string) => artifactsApi.specToPptx(sp, out));

  /** 落一份新 spec 文本:写盘 → 刷预览 → 重转成品(导出物不能与预览脱节)。 */
  async function commit(text: string, specPath: string) {
    await artifactsApi.write(specPath, text);
    await opts.onWritten(text, specPath);
    await convert(specPath, await opts.pptxTarget(specPath));
  }

  /**
   * 改一次。`fn` 拿到的是**从盘上重读**的 spec 对象 —— 绝不能改内存里那份:
   * 预览用的 spec 已把 image 换成 dataURL,回写会把几百 KB base64 灌进文件(真踩过)。
   * `fn` 返回 false 表示没实际改动 → 不写盘、不进撤销栈。
   */
  async function mutate(fn: (spec: any) => boolean): Promise<boolean> {
    const specPath = opts.specPath();
    if (!specPath || busy.value) return false;
    busy.value = true;
    try {
      const r = await artifactsApi.read(specPath);
      const before = r?.text ?? "";
      const obj = JSON.parse(before);
      if (!obj || !validate(obj)) throw new Error("spec 结构不符");
      if (!fn(obj)) return false;
      await commit(JSON.stringify(obj, null, 2), specPath);
      undoStack.value.push(before);
      if (undoStack.value.length > UNDO_DEPTH) undoStack.value.shift();
      return true;
    } catch (e: any) {
      opts.onError(`保存修改失败：${e?.message ?? e}`);
      return false;
    } finally {
      busy.value = false;
    }
  }

  /** 回到上一步:整份旧文本写回去(spec 是纯文本真源,不需要 diff)。 */
  async function undo(): Promise<boolean> {
    const specPath = opts.specPath();
    const prev = undoStack.value.pop();
    if (!specPath || prev === undefined || busy.value) return false;
    busy.value = true;
    try {
      await commit(prev, specPath);
      return true;
    } catch (e: any) {
      undoStack.value.push(prev); // 没撤成就别把这一步吃掉
      opts.onError(`撤销失败：${e?.message ?? e}`);
      return false;
    } finally {
      busy.value = false;
    }
  }

  /** 换了文件/重新生成:旧撤销栈对新 spec 无意义,必须清掉(否则会把别的文件写进来)。 */
  function resetHistory() {
    undoStack.value = [];
  }

  return { mutate, undo, canUndo, busy, resetHistory };
}

// 教案 spec 插图路径 → data URL 内联(DocEditor / RightDrawer 共用)。
//
// 与 specImages.ts 同因同构:预览容器加载不了 file:// 路径,必须把字节内联进来
// (artifact_read 对图片类会回 dataUrl)。读不到就把 src 留成原路径,docSpec 会渲染成
// 「配图待载入」占位框 —— 预览缺图不阻断,导出那边照样有图。
// 缓存按路径存,免得轮询每次都把几百 KB 的图重读一遍。
//
// 铁律(与 PPT 侧同):内联结果**绝不能回写盘** —— 那会把几百 KB base64 灌进 spec 文件。
// useSpecEdit.mutate 每次都从盘重读,就是为了不碰这份内存版。

import { artifacts as artifactsApi } from "../tauri";

const imgCache = new Map<string, string>();

/** 就地把 spec 里所有本地图路径换成 data URL(image 块的 src)。 */
export async function resolveDocImages(spec: any): Promise<any | null> {
  if (!spec || !Array.isArray(spec.blocks)) return spec;
  const targets = spec.blocks.filter(
    (b: any) => String(b?.type ?? "") === "image" && typeof b?.src === "string"
  );
  await Promise.all(
    targets.map(async (b: any) => {
      const path = String(b.src ?? "").trim();
      if (!path || /^(data:|https?:)/i.test(path)) return;
      const hit = imgCache.get(path);
      if (hit) {
        b.src = hit;
        return;
      }
      try {
        const r = await artifactsApi.read(path);
        if (r?.dataUrl) {
          imgCache.set(path, r.dataUrl);
          b.src = r.dataUrl;
        }
      } catch {
        /* 读不到就留原路径 → 占位框 */
      }
    })
  );
  return spec;
}

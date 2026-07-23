# -*- coding: utf-8 -*-
"""把做好的课件登记成应用内的「范例课件」。

按 src/lib/teachSamples.ts 头部约定的资源路径产出：
    public/sample-files/<deckId>.pptx            原文件（做同款 / 用 PowerPoint 打开）
    public/sample-slides/<deckId>/<n>.webp       高清页 2560×1440（点开看 / 全屏放映）
    public/sample-slides/<deckId>/t<n>.webp      缩略页 480×270（缩略条 / 卡片封面）
    public/sample-slides/pages.json              deckId → 页数（就地更新）

之后还要手动在 src/lib/teachSamples.ts 的 DECKS 与对应 XXX_SAMPLES 里登记一条
（title/subtitle/grade/by/prompt 是内容，脚本不该替作者拍板）。

用法：python publish_sample.py <deck_out_dir> <deckId> [原文件名.pptx]
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
PUB = os.path.join(REPO, "public")
RENDER = os.path.join(HERE, "render_pptx.ps1")

BIG = (2560, 1440)
THUMB = (480, 270)


def natural(name):
    d = "".join(c for c in os.path.basename(name) if c.isdigit())
    return int(d) if d else 0


def main():
    deck_dir = os.path.abspath(sys.argv[1])
    deck_id = sys.argv[2]
    pptxs = [f for f in os.listdir(deck_dir) if f.endswith(".pptx")]
    if not pptxs:
        print("找不到 pptx"); sys.exit(1)
    src_pptx = os.path.join(deck_dir, sys.argv[3] if len(sys.argv) > 3 else pptxs[0])

    # ① 用真 PowerPoint 渲 2560 宽——范例图必须来自实际导出的 pptx，不能用构建器内部预览
    tmp = tempfile.mkdtemp(prefix="sample-")
    r = subprocess.run(["pwsh", "-NoProfile", "-File", RENDER, "-Pptx", src_pptx,
                        "-Out", tmp, "-Width", str(BIG[0])],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    print((r.stdout or "").strip())
    if r.returncode != 0:
        print(r.stderr); sys.exit(1)
    pngs = sorted([os.path.join(tmp, f) for f in os.listdir(tmp)
                   if f.lower().endswith(".png")], key=natural)
    if not pngs:
        print("实渲没出图"); sys.exit(1)

    # ② 转 webp 两档
    out_dir = os.path.join(PUB, "sample-slides", deck_id)
    os.makedirs(out_dir, exist_ok=True)
    for f in os.listdir(out_dir):
        os.remove(os.path.join(out_dir, f))
    for i, p in enumerate(pngs, 1):
        im = Image.open(p).convert("RGB")
        if im.size != BIG:
            im = im.resize(BIG, Image.LANCZOS)
        im.save(os.path.join(out_dir, f"{i}.webp"), "WEBP", quality=84, method=6)
        im.resize(THUMB, Image.LANCZOS).save(
            os.path.join(out_dir, f"t{i}.webp"), "WEBP", quality=82, method=6)
    shutil.rmtree(tmp, ignore_errors=True)

    # ③ 原文件
    files_dir = os.path.join(PUB, "sample-files")
    os.makedirs(files_dir, exist_ok=True)
    shutil.copyfile(src_pptx, os.path.join(files_dir, deck_id + ".pptx"))

    # ④ 页数表
    pj = os.path.join(PUB, "sample-slides", "pages.json")
    pages = json.load(open(pj, encoding="utf-8")) if os.path.exists(pj) else {}
    pages[deck_id] = len(pngs)
    json.dump(pages, open(pj, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    size = sum(os.path.getsize(os.path.join(out_dir, f)) for f in os.listdir(out_dir))
    print(f"{deck_id}: {len(pngs)} 页 → sample-slides({size/1024/1024:.1f}MB) + "
          f"sample-files/{deck_id}.pptx({os.path.getsize(src_pptx)/1024/1024:.1f}MB)")
    print("下一步：在 src/lib/teachSamples.ts 的 DECKS 与 MATH_SAMPLES 里登记这条范例。")


if __name__ == "__main__":
    main()

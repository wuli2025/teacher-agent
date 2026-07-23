# -*- coding: utf-8 -*-
"""把课件里用到的每一条 LaTeX 导出成可运行的 Manim 场景脚本。

本机没有 TeX 发行版，日常出图走 KaTeX（见 render_tex.mjs），所以这个导出器的作用是：
  · 保留公式的 **LaTeX 源码**，可审计、可复现、可交给任何 TeX 工具链；
  · 谁装了 manim + MiKTeX/TeXLive，就能用同一批源码重出一遍 4K PNG 做交叉验证。

用法：python export_manim.py <deck_out_dir>
产出：<deck_out_dir>/manim/scenes.py + formulas.json + README.md
"""
import json
import os
import re
import sys


TEMPLATE_HEAD = '''# -*- coding: utf-8 -*-
"""本文件由 texkit/export_manim.py 自动生成 —— 课件里全部公式的 Manim 源码。

运行前提：pip install manim 且本机装有 LaTeX（MiKTeX / TeX Live）。
渲染 16:9 4K PNG：
    manim -sqh --format=png -r 3840,2160 scenes.py <SceneName>
一次全渲：
    manim -sqh --format=png -r 3840,2160 scenes.py -a
颜色沿用课件配色：主文字深蓝 #142B50，概念青 #0E7C86，结论珊瑚红 #E0534B。
"""
from manim import *

INK, CYAN, CORAL = "#142B50", "#0E7C86", "#E0534B"


class _Base(Scene):
    TEX = r""
    COLOR = INK

    def construct(self):
        self.camera.background_color = WHITE
        m = MathTex(self.TEX, color=self.COLOR)
        m.scale_to_fit_width(min(config.frame_width * 0.9,
                                 m.width * 6))      # 宽度不超过画面 90%
        if m.height > config.frame_height * 0.8:
            m.scale_to_fit_height(config.frame_height * 0.8)
        self.add(m)
'''

SCENE_TMPL = '''

class {name}(_Base):
    """{comment}"""
    TEX = r"""{tex}"""
    COLOR = "{color}"
'''


def slug(i, tex):
    s = re.sub(r"[^A-Za-z0-9]+", "", tex)[:24] or "F"
    return f"F{i:03d}_{s}"


def main():
    out_dir = os.path.abspath(sys.argv[1])
    rep_path = os.path.join(out_dir, "tex", "_render_report.json")
    if not os.path.exists(rep_path):
        print("找不到", rep_path)
        sys.exit(1)
    # 缓存目录里每条公式都有一份 <id>.json，比 _render_report 更全（含历史批次）
    metas = []
    for f in sorted(os.listdir(os.path.join(out_dir, "tex"))):
        if f.endswith(".json") and not f.startswith("_"):
            metas.append(json.load(open(os.path.join(out_dir, "tex", f), encoding="utf-8")))
    seen, items = set(), []
    for m in metas:
        t = m.get("tex", "").strip()
        if not t or t in seen:
            continue
        seen.add(t)
        items.append(m)

    mdir = os.path.join(out_dir, "manim")
    os.makedirs(mdir, exist_ok=True)
    src = TEMPLATE_HEAD
    index = []
    for i, m in enumerate(items, 1):
        name = slug(i, m["tex"])
        src += SCENE_TMPL.format(name=name, tex=m["tex"],
                                 color="#142B50",
                                 comment=f"PNG: {os.path.basename(m['file'])}  "
                                         f"{m['w']}×{m['h']}px")
        index.append({"scene": name, "latex": m["tex"],
                      "png": os.path.basename(m["file"]),
                      "px": f"{m['w']}x{m['h']}"})
    open(os.path.join(mdir, "scenes.py"), "w", encoding="utf-8").write(src)
    json.dump(index, open(os.path.join(mdir, "formulas.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    open(os.path.join(mdir, "README.md"), "w", encoding="utf-8").write(
        f"# 公式源码（{len(index)} 条）\n\n"
        "* `scenes.py` —— 每条公式一个 Manim Scene，需 manim + LaTeX 才能跑。\n"
        "* `formulas.json` —— LaTeX 源码 ↔ 课件里实际使用的 PNG 的对照表。\n"
        "* 课件里实际贴的 PNG 由 `texkit/render_tex.mjs`（KaTeX + 无头 Chrome）渲染，\n"
        "  零 TeX 依赖；本目录用于审计公式源码与跨工具链交叉验证。\n")
    print(f"导出 {len(index)} 条公式 -> {mdir}")


if __name__ == "__main__":
    main()

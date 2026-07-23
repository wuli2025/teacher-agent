# 公式源码（17 条）

* `scenes.py` —— 每条公式一个 Manim Scene，需 manim + LaTeX 才能跑。
* `formulas.json` —— LaTeX 源码 ↔ 课件里实际使用的 PNG 的对照表。
* 课件里实际贴的 PNG 由 `texkit/render_tex.mjs`（KaTeX + 无头 Chrome）渲染，
  零 TeX 依赖；本目录用于审计公式源码与跨工具链交叉验证。

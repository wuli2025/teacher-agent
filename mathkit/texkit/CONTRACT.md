# 数学课件制作工作流（texkit）· 权威契约

面向「公式密集的高中数学课件」。核心承诺两条：

1. **公式绝不乱** —— 所有数学表达走 LaTeX → KaTeX → 高清透明 PNG，字形来自 KaTeX 自带字体，
   宏不支持就直接报错，绝不静默出错字；贴进 PPT 时宽高同一比例因子换算，不可能被拉伸。
2. **版式绝不溢出** —— 文字按真实字体量宽，放不下就报错或撑框；导出后重开 pptx 静态体检，
   再用真 PowerPoint 逐页实渲目检。三道闸全过才算完成。

> 另一条链路 `mathdecks/AUTHORING.md`（spec JSON → Rust `pptx_native`）适合矢量动画图多、
> 公式简单的课；**公式复杂就走本链路**。

---

## 0. 环境

| 依赖 | 用途 | 本机状态 |
| --- | --- | --- |
| Node ≥ 20 + Chrome/Edge | KaTeX 渲染 + 裸 CDP 截图 | ✅ Node 24 / Chrome |
| `node_modules/katex` | 公式排版（仓库内已有，无需联网） | ✅ 0.17 |
| python-pptx / Pillow | 生成 pptx、量字宽 | ✅ |
| PowerPoint (COM) | 逐页实渲验收 | ✅ 16.0 |
| MiniMax `build/.mmkey` | 情境插图文生图 | ✅ |
| manim + LaTeX | **不需要**；仅在想交叉验证时才装 | ✖ |

## 1. 目录与角色

```
mathkit/
  texkit/                 ← 工具箱（改这里 = 改所有课件的底座）
    render_tex.mjs        KaTeX→PNG 批量渲染器（Node，零依赖）
    tex.py                TexPool：登记公式 / 缓存 / 等比贴图 / 字号下限守卫
    theme.py              配色·字号·安全区（唯一真源，不得就地写死）
    slides.py             Deck：页眉页脚 / 自动量高的 para,label / 等比 picture
    stepdeck.py           逐步累积讲解页（本工作流的招牌能力）
    diagram.py            数学示意图矢量绘制（坐标轴/曲线/空心点/夹逼）
    genimg.py             情境插图文生图（**只画不含数学关系的意象**）
    check.py              导出后静态体检
    render_pptx.ps1       PowerPoint COM 逐页实渲
    contact_sheet.py      实渲图拼联系表，便于一次目检
    report.py             构建结果记录 + 公式兼容性验证报告
    export_manim.py       导出全部公式的 Manim 源码（审计/交叉验证用）
    test_formula_matrix.py 22 条难点符号的兼容性硬测
  decks/<课件>.py         ← 只写内容，不写像素
  out/<课件>/             ← 产物：pptx / tex / img / manim / preview / sheets / 报告
```

## 2. 标准流程（一条都不能省）

```powershell
# ① 审查输入课件 → 写「内容审查报告.md」（课题/原页数/知识点/例题/易错点/复杂公式清单/原版式问题）
# ② 写 decks/<课件>.py，构建
python decks/<课件>.py
# ③ 导出后静态体检（越界/溢出/贴边/压页脚/变形/重叠/字号）
python texkit/check.py out/<课件>/*.pptx
# ④ 用真 PowerPoint 重渲实际导出的 pptx，拼联系表，逐页目检
pwsh -File texkit/render_pptx.ps1 -Pptx out/<课件>/x.pptx -Out out/<课件>/preview
python texkit/contact_sheet.py out/<课件>/preview out/<课件>/sheets 6
# ⑤ 生成交付报告 + 公式源码
python texkit/report.py out/<课件> "<课题名>"
python texkit/export_manim.py out/<课件>
```
③④ 任一不通过 → **改 decks 源码重来**，不许手工改 pptx。

## 3. 写内容脚本的硬规矩

### 3.1 公式
* 一律 `pool.add(latex, pt=..., color=...)` 登记 → 全部登记完再 `pool.render()` → 之后才能 `place()`。
  一次浏览器启动渲染整份课件；按内容 hash 落盘缓存，改一条只重渲一条。
* **pt 就是公式在幻灯片上的实际字号**（1 CSS px = 1 pt）。展示公式 26–34pt，步骤行 20–23pt。
* `place(..., max_w=, max_h=, min_pt=)`：放不下会**报错**并打印需要缩到多少 pt。
  正确做法是拆行 / 换写法 / 加宽版面，**不是**降 min_pt。
* 公式里的中文写 `\text{中文}`（已配 CJK 回退字体）。不要为了好渲染把说明写成英文。
* 已验证可用（见 `test_formula_matrix.py`，22/22）：
  `\int` 上下限、`\sum`/`\prod`、多层上下标、`\frac`/`\dfrac` 套嵌、`bmatrix`/`vmatrix`、
  `array` + 竖线（增广矩阵）、`\xrightarrow{r_2-2r_1}`(行变换)、`\lim`、`\|·\|`、`\iff`/`\implies`、
  `\forall ∃ ε δ`、`cases`(分段函数)、`\vec`、`aligned`(多行推导)、`\underbrace`/`\overbrace`。

### 3.2 文字
* 只用 `deck.para()` / `deck.label()`：它们**先量高再建框**并返回占高，调用方直接累加 y。
  绝不手填一个拍脑袋的高度。
* 字号分层（`check.py` 按形状名前缀判定下限）：
  `body_` ≥ 20pt（正文）、`h1_` ≥ 24pt、`tag_`/`cap_` ≥ 15pt（标签、图注）、`footer_` ≥ 11pt。
* 字体统一 `Microsoft YaHei`，并且 **latin/ea/cs 三个字面都要设**（`set_run_font`）。
  只设 latin 会让中文落到主题字体（等线），量宽与实排不一致 → 静态检查通过、实机溢出。
* 折行测量**刻意不做避头尾**：PowerPoint 在中英混排处会把「2。」拆成「2」+「。」，
  按悬挂算就会少算一行。宁可高估一行。短标签末尾的句号建议直接删掉。

### 3.3 图
* **承载数学关系的示意图 → `diagram.py` 矢量绘制。**
  实测文生图（MiniMax image-01，开关 prompt_optimizer 都试过）画不对数学关系：
  要求「直线在中点断开留空心点」，出来的是装饰性色块、实心点、甚至冒出类字母笔画，
  违反 goal「数学关系正确」「不得含字母」两条硬要求。
* **文生图只画情境意象**（封面、现实情境），`genimg.py` 会自动追加
  「16:9 / 白底 / 无文字无字母无数字无水印」的约束串。
* 贴图一律 `deck.picture(..., mode="contain"|"cover")`，等比；`cover` 走 crop 而不是拉伸。

### 3.4 逐步讲解页（招牌能力）
`stepdeck.StepProblem` 一道题铺成若干页：题目区固定，右栏公式逐页累积一行，
左栏是当前步的大号序号 + 步骤标题 + 一句注解。**不依赖 PPT 动画**，翻页即推进。

* `steps[i] = {"head": 标题, "tex": [latex...], "note": 短语(≤20字), "final": 结论步, "speak": 讲者备注}`
* `note` 是左栏短语标签，长了会报错并告诉你要压到几个字；详细讲法写 `speak`（进备注页）。
* 一屏放不下会自动开新屏，并把上一屏最后一步带过来做「衔接行」。
* 题干 `stem` 尽量一行；`stem_note` 只进讲者备注 —— 题目卡每多一行，右栏就少累积一步。

## 4. 页面结构基线（12 页起，复杂课题可加页，不许缩字号硬塞）

封面 / 问题驱动 / 学习路线 / 概念理解(左问题右图) / 核心公式 / 概念拆解(三关键词) /
例题推导(逐步累积，每题 4–6 步) / 方法清单(四步) / 易错辨析(一卡一错) / 迁移应用 /
课堂练习(两题，先说方法再写表达) / 课堂总结(三句话 + 离堂检验)。

## 5. 验收清单

- [ ] `check.py` 全绿：越界 / 溢出 / 贴边 / 压页脚 / 图片变形 / 重叠 / 字号
- [ ] PowerPoint 实渲页数 = pptx 页数，联系表逐页目检无裁切、无压字、无变形
- [ ] 公式全部渲染成功（`公式兼容性验证报告.md`），无一条降级或跳过
- [ ] 每页都有讲者备注
- [ ] 交付物齐全：pptx / tex(PNG) / img / manim(源码) / preview / sheets /
      构建结果记录.json / 公式兼容性验证报告.md / 内容审查报告.md

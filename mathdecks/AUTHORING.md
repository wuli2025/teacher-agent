# 高中数学动画课件 · spec 编写契约（权威）

产出：一个 `polaris.slides.json`（顶层 `{"theme":..,"slides":[..]}`），由 Rust 原生引擎
`pptx_native.rs` 确定性渲染成**原生可编辑 .pptx**。你只出 spec，不画像素。

## 坐标系
画布 **1280×720 逻辑 px**，16:9。`x` 向右、`y` 向下，原点左上角。freeform 里所有盒子按此定位。

## 顶层
```json
{"theme":"minimal-white","slides":[ …每页一个对象… ]}
```
`theme` 六选一：`minimal-white`（推荐，数学课清爽）、`ink-gold`、`warm-paper`、`forest`、`slate-night`。
每页可加 `"notes":"讲者备注（本页怎么讲、追问、时间）"` —— **每页都要写**，这是撑满 50 分钟的关键。

## 固定版式（排版由引擎定，你只给内容）
- `{"layout":"title","kicker":"…","title":"…","subtitle":"…"}` 封面
- `{"layout":"section","kicker":"环节X","title":"…"}` 章节过渡
- `{"layout":"bullets","title":"…","points":["…",{"text":"…","sub":["…"]}]}` 要点（缺省）
- `{"layout":"two-col","title":"…","left":{"head":"…","points":[…]},"right":{…}}` 左右分栏
- `{"layout":"compare","title":"…","items":[{"head":"…","body":"…"},…]}` 2–4 卡对比
- `{"layout":"stats","title":"…","items":[{"value":"…","label":"…","desc":"…"},…]}` 1–4 大数字
- `{"layout":"timeline","title":"…","steps":[{"head":"…","body":"…"},…]}` 2–5 步流程
- `{"layout":"quote","text":"…","by":"…"}` 金句
- `{"layout":"closing","title":"…","subtitle":"…"}` 结尾
- `{"layout":"image-full","image":"<绝对路径>","title":"…","subtitle":"…","kicker":"…"}` 情境大图
- `{"layout":"image-text","image":"<绝对路径>","side":"left|right","title":"…","head":"…","points":[…]}`

## ⭐ freeform 自由版式 + 单击动画（数学图的核心）
```json
{"layout":"freeform","boxes":[ …盒子按 z 序，先画的在下… ]}
```
每个盒子必给 `x,y,w,h`（部分类型见下）。**`"click":N`** = 第 N 次单击时淡入出现（0/省略=随页显示）。
同一 `click` 号的盒子**一次单击一起出现** → 数学图「一笔笔加上去」就靠给每一步不同 click 号。

盒子类型：
- `text`：`text`（单行）或 `lines`（多行数组）；`size`(pt) `color` `align`(l/ctr/r) `anchor`(t/ctr/b) `bold` `italic`
- `line` / `arrow` / `axis`：从 `(x,y)` 到 `(x2,y2)`；`color` `width`(px) `dash`(bool)。`axis`/`arrow` 自带末端箭头
- `curve` / `polyline` / `polygon`：`"points":[[x,y],[x,y],…]`；`color` `width`；`polygon` 或 `closed:true` 闭合，`fill` 填充色
- `ellipse` / `circle`：外接框 `x,y,w,h` 描边；或圆心式 `{"type":"circle","x":cx,"y":cy,"r":半径}`；`color`(描边) `width` `fill`(可选实心)
- `point` / `dot`：以 `(x,y)` 为圆心的实心标记点，`r`(默认6) `fill`
- `rect`/`bar`（实色块）、`card`（圆角卡）、`scrim`（半透明蒙版,`alpha`0–100）、`image`（真图，`image`路径,`cover`,`rounded`）

颜色：`#RRGGBB`/`#RGB` 或色板词 `ink muted accent card line bg bg2 white black`。

### 画数学图的实用约定
- 坐标轴：两条 `axis`，x 轴 `(200,600)->(1120,600)`，y 轴 `(250,650)->(250,110)`，同 `click:1` 一起出。
- 函数曲线：`curve` 给 8–12 个采样点，落在轴范围内（x∈[250,1120]，y 越小越高，注意 y 轴翻转：函数值大→y 小）。
- 标点+标签：`point` 配一个 `text` 标签，同一 click 号。
- 逐步讲解：一个几何证明/构造拆成 3–6 个 click 步，每步加一条辅助线/一个结论文字。
- 图别铺满整页：给标题(顶部 text)、图形区(中部)、结论/公式(底部 text) 留位。

## 时长要求（硬）
**≥50 分钟 / 单份**。据此至少 **32–40 页**，结构参考：
1. 封面(title) 2. 本课目标(bullets) 3. 情境导入(image-full 或 freeform 图) 4–6. 概念建构（含≥1 个动画 freeform 图）
7–10. 定义/定理 + 推导（≥1 个逐步动画证明） 11–18. 典型例题 3–5 道（每道 1–2 页，freeform 图解 + 解题步骤 bullets/notes）
19–24. 变式训练 / 易错点(compare) 25–30. 课堂练习 + 讲评 31–34. 小结(timeline/stats) + 作业(bullets) + 结尾(closing)
- 每份至少 **6 个 freeform 动画图**（带 click 逐步显现）。
- 每页 notes 写足：例题给完整解法与追问，让老师照着能讲 1–2 分钟。
- 数学符号用 Unicode：² ³ √ π ∫ ≤ ≥ ≠ ± ∞ △ ∠ ∈ → ′（导数）。**不要写 LaTeX `$...$`、不要写 Markdown**。

## 配图（AI 情境图，非数学图）
需要真实感情境插图（封面、应用场景）的页，`image` 字段填**占位绝对路径**：
`D:\polaris\教师助手\mathdecks\img\<deckid>_<name>.png`，并在该页对象里额外加一个字段
`"_imgprompt":"英文或中文生图提示词,写实/插画,无文字"`（引擎会忽略下划线字段；我会据此批量生图后再打包）。
数学图形一律用 freeform 矢量画，**不要**用 AI 图。每份 2–4 张情境图即可，别滥用。

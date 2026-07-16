---
id: polaris-deck-studio
name: Polaris 演示工坊（传统 PPT / 课件）
description: 把教案、讲稿或任意文案做成**原生可编辑**的 .pptx。模型只出 spec(polaris.slides.json)决策版式与内容，Polaris 自带引擎确定性落 OOXML——真文本框、真形状，PowerPoint/WPS/Keynote 里 100% 可改。11 种固定版式 + `freeform` 自由版式（9 类盒子：文本/矩形/圆角卡/蒙版/图片/线条箭头/折线多边形/椭圆/标记点，可画坐标轴与受力图）、6 套色板、每页可带口播备注、freeform 盒子可加 `click` 做**单击逐步动画**（真 OOXML `<p:timing>`）；还想更自由可切 `engine:"python"` 走 python-pptx 桥。
source: official
author: Polaris
created_at: 0
---

# Polaris 演示工坊

> 输入教案/讲稿/文案 → 你把它编排成 **spec**（`polaris.slides.json`）→ 引擎转成**原生可编辑**的 `.pptx`。
> **你的职责是内容与版式决策，不是画像素。** 排版、坐标、字号、配色由引擎按色板确定性渲染，你不用管也管不了。

技能资源目录（已随 App 落盘）：`~/PolarisTeacher/skills/polaris-deck-studio/`
```
assets/themes.css   17 套网页主题（[data-theme]，仅「网页 PPT」模式与网站生成用；传统 PPT 走下面 6 套色板）
designers/          11 位设计师人格 + 美学地基(_foundation) + 花名册(INDEX.md)
```

## 这个技能的核心约定（先读这段）

**传统 PPT = spec 路线，这是主路径。**你**不写 HTML、不截图、不调浏览器**，只产出一个 JSON：

```
polaris.slides.json  →  polaris-forge spec-pptx  →  演示.pptx
```

为什么这么设计：引擎手写 OOXML，产物是真文本框/真形状/真填充，用户拿到 .pptx 能直接改字换色挪位置。截图式 PPT（每页一张大图）做不到这点。副作用是纯文本模型即可驱动，无 chromium 的环境也能出 PPT。

**铁律**：spec 是唯一真源。预览、导出、继续修改全部基于它。改稿就改 spec 再重转，**绝不**另起新文件。

---

## 一、spec v1 格式（权威，与引擎逐字对齐）

```json
{
  "version": 1,
  "theme": "minimal-white",
  "slides": [
    {"layout": "title", "kicker": "…", "title": "…", "subtitle": "…", "notes": "…"}
  ]
}
```

顶层三个键：`version` 恒为 `1`；`theme` 取下面 6 套色板之一；`slides` 是页数组，**最多 300 页**，不能为空。
**每页都可带 `"notes": "…"`** → 写进 PowerPoint 的演讲者备注页（口播稿/讲述提示，学生看不到，投影也不显示）。多行用 `\n`。

### 6 套色板（`theme` 取值）

| id | 气质 | 适用 |
|---|---|---|
| `minimal-white` | 近白暖米 + 赭金强调（**默认**） | 最稳的传统 PPT 气质，公开课/汇报通吃 |
| `warm-paper` | 暖纸米黄 + 赭橘 | 语文/历史/人文,有纸感 |
| `forest` | 浅绿白 + 森绿 | 生物/地理/环境 |
| `tech-blue` | 白 + 亮蓝 | 数理化/信息技术/工作汇报 |
| `ink-gold` | 墨黑 + 暗金（深色） | 高年级/讲座/发布会式 |
| `deep-space` | 深蓝黑 + 蓝紫（深色） | 天文/科技/未来感 |

写错或未知色板 → 静默回退 `minimal-white`，但会进 warnings。**大小写敏感,照抄 id。**

### 11 种固定版式（+ `freeform` 自由版式）

字段表如下。**未列出的字段引擎不读**，写了也是白写；`layout` 缺失或未知 → 降级按 `bullets` 渲染（进 warnings）。

#### `title` / `closing` — 封面 / 结尾
```json
{"layout": "title", "kicker": "八年级下·物理", "title": "浮力", "subtitle": "第一课时　阿基米德原理"}
```
- `kicker` 小字眉标（强调色，可选）、`title` 主标题、`subtitle` 副标题（可选）
- `closing` 字段与 `title` 完全相同；`closing` 省略 `title` 时自动填「谢谢」

#### `section` — 章节过渡页
```json
{"layout": "section", "kicker": "环节二", "title": "探究：浮力大小与什么有关"}
```
- 只有 `kicker`（可选）+ `title`。左侧有强调色竖条。**没有 subtitle，别写。**

#### `bullets` — 要点页（缺省版式）
```json
{"layout": "bullets", "title": "学习目标", "points": [
  "能说出浮力的定义",
  {"text": "会用弹簧测力计测浮力", "sub": ["称重法：F浮 = G - F示", "误差来源：读数与水面接触"]}
]}
```
- `points` 数组，每项两种写法：
  - **字符串** → 一级 bullet（`•`，强调色）
  - **对象** `{"text": "…", "sub": ["…", "…"]}` → 一级 bullet + 二级子条（`–`，弱化色，小 3pt）
- `points` 不是数组（比如误给了字符串）→ 整页内容被丢弃并进 warnings。**务必给数组。**

#### `two-col` — 左右分栏
```json
{"layout": "two-col", "title": "浮力 vs 重力",
 "left":  {"head": "浮力", "points": ["方向竖直向上", "来自液体压强差"]},
 "right": {"head": "重力", "points": ["方向竖直向下", "来自地球吸引"]}}
```
- `left` / `right` 各是 `{head, points}`：`head` 栏标题（强调色粗体，可选）、`points` 同 bullets 规则（支持 `sub`）
- 两栏各自渲染成一张圆角卡片。左右都空则整页空白。

#### `compare` — 并列对比卡（**2–4 张**）
```json
{"layout": "compare", "title": "三种测量方法", "items": [
  {"head": "称重法", "body": "先测重力\n再测浸入后示数", "points": ["最常用", "误差小"]},
  {"head": "排水法", "body": "测排开液体的重力"}
]}
```
- `items` 每项 `{head, body, points}`，三个都可选：
  - `head` 卡标题（强调色粗体）
  - `body` 正文，**`\n` 分行**，每行一段
  - `points` bullet 列表（同 bullets 规则）— *引擎支持但头注释没写，可放心用*
- **超过 4 张只渲染前 4 张**，其余丢弃并进 warnings。要 5 项以上就拆页。

#### `stats` — 大数字指标（**1–4 张**）
```json
{"layout": "stats", "title": "这节课的三个数", "items": [
  {"value": "9.8", "label": "N/kg", "desc": "本节取 g = 9.8"},
  {"value": "1×10³", "label": "水的密度", "desc": "kg/m³"}
]}
```
- `items` 每项 `{value, label, desc}`：`value` 超大强调色数字、`label` 名称（粗体）、`desc` 补充说明（弱化小字，可选）
- **超过 4 张只渲染前 4 张**并进 warnings。

#### `timeline` — 流程 / 步骤（**2–5 步**）
```json
{"layout": "timeline", "title": "探究步骤", "steps": [
  {"head": "提出问题", "body": "浮力大小跟什么有关？"},
  {"head": "猜想", "body": "可能跟排开液体体积有关\n也可能跟液体密度有关"}
]}
```
- `steps` 每项 `{head, body}`：`head` 步骤名、`body` 说明（**`\n` 分行**）
- 引擎自动编号（1,2,3…）画圆节点 + 连接线，**不要自己在 head 里写「1.」「第一步」**
- **超过 5 步只渲染前 5 步**并进 warnings。多了就拆成两页。

#### `quote` — 引语 / 金句
```json
{"layout": "quote", "text": "纸上得来终觉浅，绝知此事要躬行。", "by": "陆游"}
```
- `text` 引语正文（斜体大字）、`by` 出处（可选，引擎自动加「—— 」前缀，**别自己加破折号**）
- **没有 `title`**，别写。

#### `image-full` — 全幅配图 + 大标题（封面 / 情境页）
```json
{"layout": "image-full", "image": "D:/课件/img/spring.png",
 "kicker": "语文 · 二年级下册", "title": "找春天", "subtitle": "第一课时"}
```
- `image` 配图的**本地绝对路径**（png/jpg），引擎自动铺满整页并压一层半透明暗蒙版垫文字
- 其余字段同 `title`：`kicker` / `title` / `subtitle`
- 蒙版上的字**恒为白色**（不随色板变），所以配图**别用大面积浅色/高频细节**——中间留白的图最好

#### `image-text` — 图文分栏（讲解页主力）
```json
{"layout": "image-text", "image": "D:/课件/img/bud.png", "side": "left",
 "title": "春天藏在哪里", "head": "仔细找一找",
 "points": ["嫩芽 —— 春天的眉毛", {"text": "小溪 —— 春天的琴声", "sub": ["听：叮叮咚咚"]}]}
```
- `image` 同上；`side`：`"left"`（默认，图在左）或 `"right"`
- `title` 页标题、`head` 文字侧小标题（可选）、`points` 同 bullets 规则（支持 `sub`）

**配图的三条硬约定**：
1. **只有这两个版式吃 `image`**。在 bullets/compare/stats 上写 `image` → 忽略 + warning。
2. 图按 **cover** 填满图框（等比缩放 + 两侧对称裁切），**不会变形**。但极端长条图会被裁掉很多，配图请尽量接近目标画幅：`image-full` 用 `16:9`，`image-text` 用 `1:1` 或 `4:3`。
3. 图**必须先存在于磁盘**再写进 spec。路径错 / 图坏 → 该页降级成无图版式 + warning，不会中断出片，但你会得到一页平淡的字。

#### `freeform` — 自由版式（固定版式框不住时的出口）
固定 11 种版式排不出你要的效果时用它：一页里任意摆放盒子，坐标用 **1280×720 逻辑 px**（16:9 画布，`x` 向右、`y` 向下）。
```json
{"layout": "freeform", "boxes": [
  {"type": "scrim", "x": 0, "y": 0, "w": 1280, "h": 720, "color": "#000", "alpha": 30},
  {"type": "rect",  "x": 0, "y": 0, "w": 1280, "h": 10, "color": "accent"},
  {"type": "card",  "x": 80, "y": 120, "w": 500, "h": 420},
  {"type": "text",  "x": 110, "y": 150, "w": 440, "h": 120, "text": "自由标题",
   "size": 40, "color": "ink", "align": "ctr", "bold": true},
  {"type": "text",  "x": 110, "y": 300, "w": 440, "h": 200,
   "lines": ["第一行", "第二行"], "size": 18, "color": "muted"},
  {"type": "image", "x": 640, "y": 120, "w": 560, "h": 420,
   "image": "D:/课件/img/a.png", "cover": true, "rounded": true}
]}
```
**盒子 `type` 一览（9 类，17 个取值）**——`|` 两侧是同义词，随便写哪个：

| type | 是什么 | 专属字段 |
|---|---|---|
| `text` | 文本框 | `text` 单行 **或** `lines` 多行数组；`size`（默认 18，范围 4–400）、`align`(`l`/`ctr`/`r`)、`anchor`(`t`/`ctr`/`b`)、`bold`、`italic` |
| `rect` \| `bar` | 实色矩形/色条 | `color`（默认 accent） |
| `card` | 圆角卡片 | 无（配色随色板走） |
| `scrim` | 半透明蒙版 | `color`（默认 `#000`）、`alpha` 0–100（默认 50） |
| `image` \| `pic` | 真图片框 | `cover`（默认 true）、`rounded`（默认 false） |
| `line` \| `arrow` \| `axis` | 直线 / 箭头 / 坐标轴 | 终点 `x2`（默认 `x+w`）、`y2`（默认 `y`）；`arrow`/`axis` 自带箭头，`line` 写 `"arrow": true` 也能带；`"dash": true` 虚线 |
| `polyline` \| `curve` \| `polygon` | 折线 / 曲线 / 多边形 | `points` 点数组（**≥2 点**，不足则跳过该盒 + warning）；`polygon` 或 `"closed": true` 闭合；闭合后可 `fill` 填充 |
| `ellipse` \| `circle` | 椭圆 / 圆 | 给 `r` → 以 `(x,y)` 为**圆心**画半径 r 的圆；不给 `r` → 用 `x/y/w/h` 当外接框。可 `fill` |
| `point` \| `dot` | 实心标记点 | 以 `(x,y)` 为**圆心**，`r` 默认 6 |

- **线条/形状类通用**：`color` 描边色、`width` 线宽 1–40（默认 3）、`fill` 填充色（可选，不给则空心）。
- **每盒必给 `x/y/w/h`**（`line` 可用 `x2/y2` 定终点，`circle`/`point` 可用 `r` 定半径）。
- 颜色可写 `#RRGGBB`/`#RGB` 或色板词：`ink muted accent card line bg bg2 white black`。
- 一页可放多张 `image`，各自带 `image` 路径，按出现顺序嵌图。缺盒/坏图/未知 type 只降级该盒 + warning，不毁整页。

**⚠️ `freeform` 的 `text` 不走自适应字号。** 固定版式的字号由引擎按内容量自动算（放不下会自己缩），但 freeform 的 `size` **你给多少就是多少**（只 clamp 到 4–400）。字多框小 → 直接溢出，引擎不救你。写完自己按 1280×720 心算一遍：一个汉字宽 ≈ `size × 1.33` px，一行放得下 `w ÷ (size × 1.33)` 个字。

##### freeform 专属：`click` 单击逐步动画

任意盒子可加 `"click": N` —— **第 N 次单击时淡入出现**（`0` 或不写 = 随页立即显示）。

```json
{"layout": "freeform", "boxes": [
  {"type": "axis", "x": 200, "y": 560, "x2": 1080, "y2": 560, "color": "ink"},
  {"type": "axis", "x": 200, "y": 560, "x2": 200,  "y2": 140, "color": "ink"},
  {"type": "text", "x": 240, "y": 180, "w": 300, "h": 40, "text": "① 先看纵轴：浮力", "click": 1},
  {"type": "polyline", "points": [[200,560],[500,400],[900,200]], "color": "accent", "width": 4, "click": 2},
  {"type": "point", "x": 500, "y": 400, "r": 8, "fill": "accent", "click": 2},
  {"type": "text", "x": 560, "y": 380, "w": 400, "h": 40, "text": "② 排开体积越大，浮力越大", "click": 3}
]}
```

- **同一个 `click` 号的盒子在一次单击里一起出现**（上例第 2 击同时出曲线和那个点）；号从小到大依次触发，**不必连号**。
- 引擎生成的是**真 OOXML `<p:timing>`**，写法与 PowerPoint 自身一致 —— 放映时真能一步步点出来，导出后在 PowerPoint 里也还是真动画，不是假的。
- **这是课件的杀手锏**：数学/物理的图「一笔笔加」（先坐标轴 → 再曲线 → 再标注）、解题步骤逐步揭示、先问后答（问题 `click:0`，答案 `click:1`）。**讲授节奏能被控制**，学生不会一上来就看到答案。
- **只有 `freeform` 支持**；固定版式没有这个字段，写了也不读。

**别滥用 freeform**：能用固定版式就用固定版式（它们已调好间距字号，且自适应）。`freeform` 是「就差这一页排不出来」时才动的手术刀 —— 但**画图（坐标轴/受力分析/几何图形/流程连线）和需要逐步动画的页，它是唯一的路**，该用就用。用了就自己负责别让元素重叠出界。

---

## 一·五、配图怎么来：`polaris-forge image`

```bash
polaris-forge image --prompt="<画面描述>" --out=<绝对路径.png> [--ratio=16:9]
```
- 走 MiniMax `image-01`，纯 Rust、零 Python。画幅：`1:1` `16:9` `4:3` `3:2` `2:3` `3:4` `9:16` `21:9`
- key 自动取（供应商坞的 MiniMax 条目 / 环境变量 `MINIMAX_API_KEY`），**你不用管也不要去找 key**
- 返回 JSON 里 `format` 是**真实**格式：MiniMax 常在你写 `out.png` 时回 JPEG。**这不影响使用**——按你写的路径引用即可，pptx 打包按内容认格式。别改扩展名，改了 spec 引用就断
- 生图失败（额度/限流）→ 报错。**不要卡在这里**：去掉该页 `image` 改用无图版式，把课件先交出来，末尾说明哪几页缺图

**写 prompt 的纪律（课件配图 ≠ 艺术创作）**：
- **必须写「无文字」**。生图模型写中文必糊成鬼画符，一旦入页整份课件的可信度就没了
- 说清**风格 + 主体 + 光线 + 背景**，例：`儿童水彩插画,特写,一株嫩芽从泥土里探出头,嫩绿色,晨光,干净背景,无文字`
- 学段对味：小学用水彩/手绘/明亮；初中写实清晰；高中克制专业、少卡通
- **配图是教具不是装饰**：只给「讲不清楚才需要看」的地方配图（观察对象、情境导入、实验装置）。为好看而配的图是认知负担，不如留白

---

## 一·六、engine：要「无限版式 / 复用 Python 排版」时
spec **顶层**可加 `"engine"` 字段选渲染梯队（缺省 = 原生 Rust 引擎，零安装、最稳）：
- `"native"`（或不写）：纯 Rust 原生引擎。零依赖、三平台恒可用，就是上面这些版式 + `freeform`。**默认走这条**。
- `"python"`：交给 `py/pptx_bridge.py`（python-pptx）渲染**同一份 spec**——想用 Python 完整能力造任意版式、或复用 `build/engine.py` 已调好的排版时用。**代价：需本机装 `python-pptx`，非零安装**；装不上直接报错。
- `"auto"`：优先 Python，本机没有 python-pptx 就**静默回退原生引擎**并在 warnings 里留痕。想「能用 Python 就用、不能也别断」时选它。
```json
{"engine": "auto", "theme": "ink-gold", "slides": [ … ]}
```
> 加版式的正路：先试 `freeform`（零安装）；还不够，就在 `py/pptx_bridge.py` 里加分支（该文件头有扩展说明），走 `engine:"python"`。

---

## 二、制作流程

### 0. 选设计师（可选，但强烈建议）
读 `designers/INDEX.md` 花名册。**教学场景**：`pedagogy-clarity`（课件大师·认知减负师，「一页只教一件事」）是默认人选；**中小学/亲子**可用 `doodle-hand`（手绘涂鸦）或 `clay-soft`（粘土）的气质取向。用户指定就用指定的。

传统 PPT 由引擎渲染，设计师**不影响像素**，但影响你的**内容决策**：一页放多少信息、用哪种版式、标题怎么起、什么该拆页。读该设计师 `.md` 的信息架构与禁忌部分，据此编排。

### 1. 读懂输入
用户可能给：正文文案、素材文件绝对路径（**先 Read**）、一份教案。有教案时**服从教案的活动流程**，不自作主张重排教学环节。

### 2. 编排 spec
把内容按信息类型**混排版式**——这是好 PPT 与烂 PPT 的分水岭：

- 讲**并列关系** → `compare`，不是 bullets
- 讲**先后/流程** → `timeline`，不是 bullets
- 讲**数据/量级** → `stats`，不是 bullets
- 讲**对立/对照** → `two-col`
- **要看见才讲得清**（观察对象/情境/装置）→ `image-text`；**封面与情境导入** → `image-full`
- **换大主题** → 插 `section` 过渡
- 剩下的才 `bullets`

**通篇 bullets 是失败的 spec。** 一份 12 页的课件至少该出现 3 种以上版式。

### 2.5 先落 spec，再生图，最后转换（边做边可见）
顺序必须是：**①写盘 → ②生图 → ③转换**。

1. **编排完就立刻把完整 spec 存盘**。要配图的页直接把**计划路径**写进 `image` 字段（如 `<产物目录>/img/01.png`，此刻文件还不存在没关系）——Polaris 的实时预览是逐页点亮的，spec 一落盘用户就能看到全部文字页，没生出来的图显示「配图待载入」占位框。**别把 spec 攒到生完图才写**，那会让用户对着空屏干等几分钟。
2. 内容很长时，可以先存一份**只含前几页的合法 spec**（JSON 必须完整合法），再增补到全量——每保存一次，预览就多亮几页。
3. 然后跑 `polaris-forge image` 把图逐张生到刚才写的路径上（可连跑几条），预览里的占位框会自动变成真图。
4. **最后**才做第四步的 spec→pptx 转换——带着不存在的图路径转换会得到「配图不可用」warning，全部图落盘后再转就没有。

配图**宁少勿滥**：一份课件 2–5 张足矣，全是图会盖过内容。

### 3. 存到产物目录
文件名**必须**是 `polaris.slides.json`（前端靠这个名字找它做预览和兜底转换，改名整条路线瘫痪）。

### 4. 转 .pptx
```bash
polaris-forge spec-pptx --spec=<产物目录>/polaris.slides.json --out=<产物目录>/演示.pptx
```
CLI 在 `~/Polaris/bin/`（Windows 为 `polaris-forge.exe`）。

**CLI 不存在也不用慌**：把 spec 按上述文件名存好即可，Polaris 桌面端会自动调内置引擎完成转换。**不要**因为 CLI 缺失就改去写 HTML 或截图——那会毁掉可编辑性。

### 5. 回答末尾用**绝对路径**列出产物文件。

---

## 三、内容纪律（课件尤其吃这套）

- **一页一个认知焦点**。单页正文超 6 行就拆页。
- **标题短**：能 6 字不写 12 字。标题是路标，不是句子。
- **要点凝练**：bullet 写关键词短语，不写完整长句；完整表述放 `notes` 口播稿里。
- **`notes` 别偷懒**：每页写清这页要讲什么、怎么引导、可能的学生疑问。这是课件相对普通 PPT 的核心价值——投影给学生看的是骨架，教师看的是备注。
- **深色色板慎用于课件**：教室投影/日光下深色底常糊。`ink-gold`/`deep-space` 适合讲座，日常课优先浅色板。
- **不要在 spec 里塞 Markdown**：`**加粗**`、`# 标题`、`- 列表` 会被原样当文字渲染出来。加粗/字号/颜色全由版式决定。

## 四、改稿协议

用户说「第 3 页换成对比卡」「换个主题」「再加一页总结」时：

1. **直接改 `polaris.slides.json` 原文件**，文件名不变，别另起新文件
2. 重新跑 `polaris-forge spec-pptx` **覆盖导出**同一个 `.pptx`
3. CLI 不可用则改完 spec 即可（桌面端按 mtime 判旧，会自动重转）

只改 spec 不重转 pptx 是常见疏忽——用户拿到的导出会永远停在第一版。**能跑 CLI 就一定重跑。**

## 五、「网页 PPT」模式（次要路径）

用户明确要 `.html` 网页幻灯片而非 `.pptx` 时走这条：产出**自包含单文件** `.html`（所有 CSS/JS 内联，双击即开）。可从 `assets/themes.css` 取 17 套 `data-theme` 主题的配色作参考，把用到的部分内联进 `<style>`。翻页交互自己写（键盘左右/点击），保持零外部依赖。

这条路线没有 spec，也不经引擎——**它出不了可编辑的 .pptx**。用户要「PPT」而没说「网页」时，一律走传统 PPT。

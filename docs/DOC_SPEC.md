# polaris.doc.json — Word 教案 spec 契约 v1

Word 教案工坊的**唯一数据真源**。三端各自实现、逐字段对齐：

| 端 | 文件 | 职责 |
|---|---|---|
| 前端渲染器 | `src/lib/docSpec.ts` | spec → 预览 HTML（**权威实现**，有歧义以它为准） |
| 导出引擎 | `src-tauri/crates/polaris-forge/src/forge/docx_native.rs` | spec → `.docx`（纯 Rust 直写 OOXML） |
| 导入引擎 | `src-tauri/crates/polaris-forge/src/forge/docx_import.rs` | `.docx` → spec |
| 技能 | `src-tauri/src/templates/skills/polaris-doc-studio/SKILL.md` | 教 AI 写 spec |

铁律与 PPT 侧一致：**预览即导出**。预览一个样、导出 `.docx` 另一个样是不可接受的回归。

---

## 1. 顶层

```jsonc
{
  "version": 1,
  "theme": "qingjiao",              // 见 §4
  "page": { "size": "a4", "mt": 25.4, "mr": 31.7, "mb": 25.4, "ml": 31.7,
            "header": "", "footer": "第 {page} 页" },   // 边距单位=毫米
  "blocks": [ /* §2 */ ]
}
```

`page` 全字段可省。`footer` 里的 `{page}` 导出时换成 Word 页码域。

## 2. 块（blocks[]）

一个块 = 文档里一个段落级实体。**顺序即文档顺序**，没有嵌套（表格单元格里也只放纯文本 + 行内标记）。

| type | 语义 | 用到的字段 |
|---|---|---|
| `title` | 文档大标题（居中） | `text` |
| `subtitle` | 副标题（居中、楷体灰） | `text` |
| `h1` | 一级标题，渲染时自动加主题色方块前缀 —— **`text` 里不要再写「■」** | `text` |
| `h2` `h3` | 二三级标题 | `text` |
| `p` | 正文段，**默认首行缩进 2 字符** | `text`, `indent:"none"` |
| `bullet` | 无序要点（渲染「·」，导出走 numbering）—— **`text` 里不要再写「· 」** | `text` |
| `num` | 有序要点（序号自动排，spec 不存死数字） | `text` |
| `quote` | 引文（左侧主题色竖条 + 楷体） | `text` |
| `callout` | 提示框（浅底描边），用于重点/难点/易错 | `head`, `text` |
| `table` | 表格 | `rows`, `head0`, `widths` |
| `image` | 插图 | `src`, `w`, `cap` |
| `hr` | 分隔线 | — |
| `pagebreak` | 硬分页 | — |

通用可选字段（任何文字块）：

- `align`: `left`(默认) \| `center` \| `right` \| `both`
- `indent`: `first`(p 默认) \| `none`
- `pad`: 整块左缩进，单位 em
- `size`: 覆盖主题字号，单位**磅(pt)**
- `color`: 主题色词 `ink|accent|muted|line|soft` 或 `#RRGGBB`
- `bold` / `italic`: 布尔

表格：

- `rows`: `string[][]`，每格是含行内标记的字符串；行长不齐按最长行补空
- `head0`: 首行是否表头（默认 `true`，表头有底色 + 居中 + 加粗）
- `widths`: 各列宽比例数组，长度必须等于列数，内部归一化；缺省等分

插图：

- `src`: 本地**绝对路径**；预览前由 `resolveDocImages` 换成 data URL
- `w`: 宽度占正文宽的百分比 1–100（默认 100）
- `cap`: 图注

## 3. 行内标记

**故意不做富文本树**：点字直改要求叶子必须是 `string`。所有文字字段支持同一套轻量语法：

| 写法 | 效果 |
|---|---|
| `**粗**` | 加粗 |
| `*斜*` | 斜体 |
| `__下划线__` | 下划线 |
| `~~删除~~` | 删除线 |
| `` `代码` `` | 等宽 |
| `$x^2+1$` | 行内公式（LaTeX 子集） |

解析顺序（三端必须一致）：先切出 `` `code` `` 与 `$math$`（内部不再解析），再依次 `**` → `__` → `~~` → `*`。

### 公式子集

导入时 OMML → LaTeX、导出时 LaTeX → OMML，双向只覆盖这些结构，超出的降级成纯文本：

`m:r`(裸符号) · `m:f`(分式 `\frac{}{}`) · `m:sSup`(`^{}`) · `m:sSub`(`_{}`) · `m:sSubSup`
· `m:rad`(`\sqrt{}` / `\sqrt[n]{}`) · `m:d`(括号 `\left(...\right)`) · `m:nary`(`\sum/\int` 带上下限)
· `m:func`(`\sin` 等) · `m:acc`(`\vec{}` `\bar{}`) · `m:bar`

## 4. 主题（THEMES）

`docSpec.ts` 的 `DOC_THEMES` 是权威表，Rust 端逐字段抄：

| id | 名称 | 正文字体 / 标题字体 | accent | 正文磅值 | 行距 |
|---|---|---|---|---|---|
| `qingjiao` | 青教赛范式 | 微软雅黑 / 微软雅黑 | `#2C4661` | 12 | 1.6 |
| `songti` | 公文宋体 | 宋体 / 黑体 | `#8C2B2B` | 12 | 1.75 |
| `kaiti` | 楷体清雅 | 楷体 / 微软雅黑 | `#3E6B4F` | 12 | 1.7 |
| `modern` | 现代蓝 | 微软雅黑 / 微软雅黑 | `#2563EB` | 11.5 | 1.65 |
| `warm` | 暖橘手账 | 微软雅黑 / 微软雅黑 | `#C2643A` | 12 | 1.7 |

字号完整表（title/subtitle/h1/h2/h3/body）见 `DOC_THEMES` 常量。

单位换算（写 OOXML 用）：`w:sz` = 磅 × 2（半磅）；`w:ind`/`w:spacing` 单位 twips = 磅 × 20；
1 毫米 = 56.6929 twips；行距用 `w:spacing w:line=行距×正文磅×20 w:lineRule="auto"`。

## 5. 分页

spec **不描述分页**（除显式 `pagebreak` 块）。预览端 `DocViewer` 在浏览器实测块高后切纸；
Word 自己按同样的纸张/边距/字号排版。两边的自然分页点可能差半行，这是流式文档的固有属性，
不算回归 —— 需要精确断页的地方用 `pagebreak` 块。

## 6. 落盘与命令

- 源稿：`<会话产物目录>/polaris.doc.json`
  **必须**登记进 `polaris-kernel/src/chat/artifacts.rs` 的 `DISPLAY_NAMES`，否则被产物白名单滤掉，整条链路瘫（PPT 侧 v1.0.2 踩过）。
- 导出：与源稿同目录的 `.docx`。**覆盖已有的那份**，找不到才用兜底名 `教案.docx`
  （写死新文件名 = 用户认识的那份纹丝不动，看起来就是没保存）。
- Tauri 命令：`forge_spec_to_docx { spec, out }` / `forge_docx_to_spec { path }`
  （`spec` 参数兼容「文件路径」或「JSON 字符串」，要剥 BOM —— 带 BOM 的 JSON 会被误判成路径）
- CLI（给 agent 用）：`polaris-forge spec-docx --spec=<json|path> --out=<x.docx>`
  `polaris-forge docx-spec --in=<x.docx> --out=<polaris.doc.json>`

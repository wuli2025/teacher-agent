use super::*;

// ═══════════════════════════════════════════════════════════════
// 统一目录 Catalog（编译期，只读）
// ═══════════════════════════════════════════════════════════════

#[derive(Debug, Clone)]
pub struct CatalogSkill {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub source: &'static str, // official | third-party
    /// true = 预装（始终可用，无需安装），false = 市场技能（需点安装）
    pub preinstalled: bool,
    pub system_prompt: &'static str,
}

pub(crate) fn catalog() -> Vec<CatalogSkill> {
    vec![
        // ── 演示工坊（传统 PPT / 课件，spec 路线 → 原生可编辑 .pptx） ──
        // 与 wechat-md-typesetter 同机制：catalog 里挂 system_prompt(SKILL.md 同一份内嵌常量)，
        // 同时 seed_deck_studio_skill() 把 skill.md + designers/ 落到磁盘供 agent Read。
        // 两处缺一不可：只注册不落盘 → 模型读不到 designers；只落盘不注册 → find() miss，
        // DeckStudio.vue 的 skillIds 与 PPT 意图注入全部落空。
        CatalogSkill {
            id: "polaris-deck-studio",
            name: "演示工坊 · 传统 PPT / 课件",
            description: "把教案/讲稿/文案做成**原生可编辑**的 .pptx：模型只出 spec(polaris.slides.json)决策版式与内容，Polaris 引擎确定性落 OOXML —— 真文本框真形状，PowerPoint/WPS 里随便改。11 版式混排、6 套色板、每页可带口播备注；freeform 自由版式可画坐标轴/受力图/几何图，并做单击逐步动画。零截图零浏览器",
            source: "official",
            preinstalled: true,
            system_prompt: DECK_SKILL_MD,
        },
        // ── 文档工坊（Word 教案 / 教学设计，spec 路线 → 原生可编辑 .docx） ──
        // 与 deck-studio 同机制：catalog 里挂 system_prompt(SKILL.md 同一份内嵌常量)，同时
        // seed_doc_studio_skill() 把 skill.md 落到磁盘供 agent Read。两处缺一不可：
        // 只注册不落盘 → agent 在盘上找不到技能；只落盘不注册 → find() miss，教案意图注入落空。
        // 注意与市场技能 `docx`（Anthropic 官方 python-docx 路线）并存：那条是通用 Word 处理，
        // 这条是 Polaris 自家 spec 引擎 + 青教赛范式，教案场景优先走这条。
        CatalogSkill {
            id: "polaris-doc-studio",
            name: "文档工坊 · Word 教案 / 教学设计",
            description: "把课题/讲稿/素材写成**原生可编辑**的 .docx 教案：模型只出 spec(polaris.doc.json)决策结构与内容，Polaris 引擎确定性直写 OOXML —— 真段落真表格真公式(OMML)，Word/WPS 里随便改。14 种块类型、5 套主题、行内公式 $LaTeX$；内置青教赛教案范式十节骨架（基本信息表/课标考情/学情/三维目标/重难点/教法学法/教学过程四栏表/板书设计/分层作业/教学反思/课程思政）",
            source: "official",
            preinstalled: true,
            system_prompt: DOC_SKILL_MD,
        },
        // ── GitHub 高星教师适用技能（anthropics/skills 官方文档四件套 + humanizer） ──
        CatalogSkill {
            id: "docx",
            name: "Word 文档（教案 / 试卷 / 公文）",
            description: "创建、编辑、读取 Word 文档(.docx)：教案、试卷、通知、家长信等，支持目录/页眉页脚/表格/图片/修订批注。来自 Anthropic 官方 skills 仓库",
            source: "official",
            preinstalled: false,
            system_prompt: include_str!("../../../../src/templates/skills/gh-docx.md"),
        },
        CatalogSkill {
            id: "xlsx",
            name: "Excel 表格（成绩册 / 统计分析）",
            description: "创建、编辑、分析 Excel 表格(.xlsx)：成绩册、班级名单、量化考核表，支持公式/图表/数据透视。来自 Anthropic 官方 skills 仓库",
            source: "official",
            preinstalled: false,
            system_prompt: include_str!("../../../../src/templates/skills/gh-xlsx.md"),
        },
        CatalogSkill {
            id: "pdf",
            name: "PDF 处理（试卷 / 资料）",
            description: "处理 PDF 文件：提取试卷/教材内容、合并拆分、填表单、生成新 PDF。来自 Anthropic 官方 skills 仓库",
            source: "official",
            preinstalled: false,
            system_prompt: include_str!("../../../../src/templates/skills/gh-pdf.md"),
        },
        CatalogSkill {
            id: "doc-coauthoring",
            name: "文档共创（论文 / 总结 / 汇报）",
            description: "结构化共同写作流程：厘清目标→搭骨架→逐节共创→整体打磨，适合教学总结、课题申报、评职称材料等重要文档。来自 Anthropic 官方 skills 仓库",
            source: "official",
            preinstalled: false,
            system_prompt: include_str!("../../../../src/templates/skills/gh-doc-coauthoring.md"),
        },
        CatalogSkill {
            id: "humanizer",
            name: "去 AI 味润色",
            description: "按维基百科「AI 写作痕迹」清单逐条检测并改写：去掉套话、排比堆砌、空洞总结等 AI 腔，让教案、评语、公开文稿读起来像真人写的。GitHub 高星开源技能(blader/humanizer, MIT)",
            source: "third-party",
            preinstalled: false,
            system_prompt: include_str!("../../../../src/templates/skills/gh-humanizer.md"),
        },
        // ── 自媒体全链路运营（交互决策版，与「自动化」里的两条流程同源） ──
        CatalogSkill {
            id: "wechat-pipeline",
            name: "微信公众号 · 全链路运营",
            description: "选题→风格→成稿→排版出图一条龙；每个决策点先讲思考再给编号选项让你挑、也可直接输入覆盖；风格可调；支持全自动",
            source: "third-party",
            preinstalled: true,
            system_prompt: include_str!("../../../../src/templates/skills/wechat-pipeline.md"),
        },
        CatalogSkill {
            id: "xiaohongshu-pipeline",
            name: "小红书 · 全链路运营",
            description: "选题→风格→文案→图卡渲染一条龙；每个决策点先讲思考再给编号选项让你挑、也可直接输入覆盖；风格可调；支持全自动",
            source: "third-party",
            preinstalled: true,
            system_prompt: include_str!("../../../../src/templates/skills/xiaohongshu-pipeline.md"),
        },
        // ── 自媒体全链路·配套三件套（选题前置 / 数据复盘 / 社群应对，补全闭环） ──
        CatalogSkill {
            id: "hot-topic-radar",
            name: "选题雷达",
            description: "联网抓热点+对标爆文，归纳成 3-5 个选题方向、每个给 2-3 个具体选题并做爆款拆解（为什么火/适合哪个平台/时效难度），编号供勾选；读 KB 避免撞题。可独立用，也是全链路第一步",
            source: "third-party",
            preinstalled: true,
            system_prompt: include_str!("../../../../src/templates/skills/hot-topic-radar.md"),
        },
        CatalogSkill {
            id: "content-analytics-report",
            name: "数据复盘 · 运营周报",
            description: "把一批已发文章/笔记的数据做成运营周报：逐篇打优劣势、找「哪类选题/标题/发布时机」数据好的规律、给下轮主攻方向，并回写 KB 反哺选题",
            source: "third-party",
            preinstalled: true,
            system_prompt: include_str!("../../../../src/templates/skills/content-analytics-report.md"),
        },
        CatalogSkill {
            id: "community-engagement",
            name: "评论 · 社群应对",
            description: "把评论/私信分类（提问/夸赞/抬杠/求合作/负面），按账号人格逐条起草回复，标出需本人亲自处理的高敏感项，并把高频疑问提炼成选题线索回写 KB",
            source: "third-party",
            preinstalled: true,
            system_prompt: include_str!("../../../../src/templates/skills/community-engagement.md"),
        },
        CatalogSkill {
            id: "xhs-mao-pipeline",
            name: "小红书 · 毛选风格发布",
            description: "调毛主席知识库析毛选文风→就给定主题写小红书爆款文案→出图(HTML图卡转截图 或 AI配图)→调 post-to-xhs 浏览器自动发布;发前必人工确认、可先预览、需扫码登录",
            source: "third-party",
            preinstalled: true,
            system_prompt: include_str!("../../../../src/templates/skills/xhs-mao-pipeline.md"),
        },
        // ── 壹伴排版优化（公众号排版 + CloakBrowser 直送草稿，根治格式错） ──
        CatalogSkill {
            id: "wechat-md-typesetter",
            name: "壹伴排版优化",
            description: "壹伴式排版：只产出干净语义正文（零内联样式），随包壹伴脚本在 CloakBrowser 公众号编辑器 DOM 上按约定风格一键套样式（标题色块/引用卡/分割线/列表转段落全内联），填标题存草稿（绝不自动发布）——根治粘贴格式错乱",
            source: "third-party",
            preinstalled: true,
            system_prompt: WECHAT_TS_SKILL_MD,
        },
        // ── 多平台草稿投递官（7 平台草稿直送 + Seedream 配图，随包脚本启动落盘） ──
        CatalogSkill {
            id: "media-publisher",
            name: "多平台草稿投递官",
            description: "把写好的稿件自动送进知乎/头条/B站创作者后台并存草稿（粘贴通道直传），百家号/抖音开编辑页+剪贴板辅助，公众号/小红书转交专用链路；AI直传与手动辅助双模式，登录态持久化；附火山方舟 Seedream 生图配图。铁律只存草稿绝不发布",
            source: "third-party",
            preinstalled: true,
            system_prompt: MEDIA_PUB_SKILL_MD,
        },
        // ── 源自 ClaudeSkills 合集的两个内容创作技能（全链路成稿/出图时调用） ──
        CatalogSkill {
            id: "gz-wechat-article-writer",
            name: "公众号文章创作（ClaudeSkills）",
            description: "微信公众号文章创作助手：风格灵活适配（企业官号/个人技术博客/活动回顾/产品评测），优化标题与结构。全链路成稿阶段的内容引擎",
            source: "third-party",
            preinstalled: true,
            system_prompt: include_str!("../../../../src/templates/skills/gz-wechat-article-writer.md"),
        },
        CatalogSkill {
            id: "gz-notion-infographic",
            name: "信息图 / 小红书图文（ClaudeSkills）",
            description: "按大纲自动研究并生成高质量可视化：Notion 手绘风信息图组图 / PPTX，适合小红书图文与社媒传播图。全链路渲染阶段的图卡引擎",
            source: "third-party",
            preinstalled: true,
            system_prompt: include_str!("../../../../src/templates/skills/gz-notion-infographic.md"),
        },
    ]
}

pub(crate) fn find_catalog(id: &str) -> Option<CatalogSkill> {
    catalog().into_iter().find(|c| c.id == id)
}

/// 目录技能的市场分组。集中一处映射，新增技能记得来这里归组，漏归落「通用」。
pub(crate) fn skill_category(id: &str) -> &'static str {
    match id {
        // 办公文档
        "polaris-deck-studio" | "polaris-doc-studio" | "pdf" | "xlsx" | "docx"
        | "doc-coauthoring" | "pptx" | "deep-research" | "web-search" => "办公文档",
        // 教学教研
        "humanizer" => "教学教研",
        // 财务会计
        "financial-model" | "invoice-audit" | "bookkeeping-recon" => "财务会计",
        // 开发编程
        "project-skill"
        | "git-commit"
        | "gh-cli"
        | "frontend-ui"
        | "rest-api-design"
        | "docker-deploy"
        | "sql-optimization"
        | "security-audit"
        | "tech-writing"
        | "systematic-debugging"
        | "writing-plans"
        | "verification-before-completion"
        | "mcp-builder" => "开发编程",
        // 测试质检
        "webapp-testing" | "e2e-test-pipeline" | "bug-report-repro" => "测试质检",
        // 设计美工
        "canvas-design" | "brand-guidelines" | "algorithmic-art" | "image-gen" => "设计美工",
        // 自媒体运营
        "wechat-pipeline"
        | "xiaohongshu-pipeline"
        | "hot-topic-radar"
        | "content-analytics-report"
        | "community-engagement"
        | "xhs-mao-pipeline"
        | "wechat-md-typesetter"
        | "media-publisher"
        | "gz-wechat-article-writer"
        | "gz-notion-infographic" => "自媒体运营",
        // 音视频
        "edge-tts" | "hyperframes" | "web-video-presentation" | "web-video-presentation-guide" => {
            "音视频"
        }
        // 自动化与浏览器
        "cloak-browser" | "browser-use" | "turbo-download" | "wechat-tasks" => "自动化与浏览器",
        _ => "通用",
    }
}

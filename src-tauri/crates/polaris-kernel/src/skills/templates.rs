use super::*;

// ───────── 「演示工坊」技能（传统 PPT / 课件，编译期内嵌，启动落盘）─────────
// 支撑「PPT 演示」UI 入口与对话里的 PPT 意图。主路径是 **spec 路线**:模型只产
// polaris.slides.json(版式+内容决策),polaris-forge 的原生引擎(pptx_native.rs)确定性落
// OOXML → 真文本框/真形状、100% 可编辑的 .pptx,零截图零浏览器。
//
// SKILL.md 是 spec v1 的权威说明,**必须与 pptx_native.rs 的字段逐字对齐**——改了引擎的
// 版式字段/色板/上限,这里同步改并 +1 版本号,否则模型按旧约定产 spec,内容会被静默丢弃。
//
// themes.css 与 designers/ 由本技能与「网站生成」(web-studio) 共用同一份源文件,两边落盘。
pub(crate) const DECK_ID: &str = "polaris-deck-studio";
// 改动 SKILL.md 后必须 +1，让已安装用户下次启动拿到更新。
// v2: 补 image-full / image-text 配图版式 + polaris-forge image 生图流程。
// v3: 修文档漂移 —— 版式数 9→11（正文早已写全 11 种，只有计数是错的）；freeform 盒子
//     5 类 → 补全 9 类（line/arrow/axis、polyline/curve/polygon、ellipse/circle、
//     point/dot 四类此前完全没写，模型不知道能画坐标轴/受力图/几何图）；补 `click`
//     单击逐步动画（引擎 build_timing() 早就出真 <p:timing>，此前零文档）；标注
//     freeform 的 text 不走 autofit。**引擎能力早就有，只是模型读不到 → 白白用不上。**
// v6: freeform 新增 table(真 a:tbl 表格)/chart(形状化图表) 两类盒子;通用修饰字段
//     rot/opacity + text 盒 font:"serif";富元素动画 anim{effect,trigger,dur,delay,dir}
//     (13 种效果,真 p:timing);页级 transition{type,dir,speed} 切换动画(真 p:transition)。
// v7: chart 盒新增 native:true → 导出真 OOXML 图表 part + 内嵌 xlsx 数据源
//     (PowerPoint 里「编辑数据」可用);缺省仍是形状组。
// v8: 色板 6→7(新增 midnight-gold 深蓝黑+香槟金,高级感首选);「叙事骨架」硬要求:
//     ≥8 页必须 封面→freeform 编号目录页→section 章节页→closing,附四章目录页 JSON 样例;
//     封面/章节页 fade transition 指引。
pub(crate) const DECK_VERSION: &str = "8";
pub(crate) const DECK_SKILL_MD: &str =
    include_str!("../../../../src/templates/skills/polaris-deck-studio/SKILL.md");
pub(crate) const DECK_THEMES_CSS: &str =
    include_str!("../../../../src/templates/skills/polaris-deck-studio/assets/themes.css");

// ───────── 「文档工坊」技能（Word 教案 / 教学设计，编译期内嵌，启动落盘）─────────
// 与 deck-studio 完全同构的另一条 spec 路线:模型只产 polaris.doc.json(结构+内容决策),
// polaris-forge 的原生引擎(docx_native.rs)确定性直写 OOXML → 真段落/真表格/真 OMML 公式、
// 100% 可编辑的 .docx,零 python-docx 零截图。
//
// SKILL.md 是 spec v1 的权威说明,**必须与 docs/DOC_SPEC.md + docx_native.rs 的字段逐字对齐**
// ——改了块类型/主题表/行内标记,这里同步改并 +1 版本号,否则模型按旧约定产 spec,内容会被静默丢弃。
//
// 技能灵魂是「青教赛教案范式」十节骨架(基本信息表 + 课标考情 + 学情 + 三维目标 + 重难点 +
// 教法学法 + 教学过程四栏表 + 板书设计 + 分层作业 + 教学反思 + 课程思政),范式沉淀自 15 篇真范例。
pub(crate) const DOC_ID: &str = "polaris-doc-studio";
// 改动 SKILL.md 后必须 +1，让已安装用户下次启动拿到更新。
pub(crate) const DOC_VERSION: &str = "1";
pub(crate) const DOC_SKILL_MD: &str =
    include_str!("../../../../src/templates/skills/polaris-doc-studio/SKILL.md");

// ───────── 设计师人格包（designers/，编译期内嵌，随 deck-studio / web-studio 落盘）─────────
// 「选设计师」体系：11 位设计师人格 + 美学地基(_foundation) + 总索引(INDEX.md)。
// auto 模式按 INDEX.md 路由表按内容气质选人；用户指定则用指定的。两个工坊复用同一份包。
// 传统 PPT 由引擎渲染像素,设计师在那条线上只影响**内容决策**(信息密度/版式选择/拆页)。
pub(crate) const DECK_DESIGNERS: &[(&str, &str)] = &[
    (
        "INDEX.md",
        include_str!("../../../../src/templates/skills/polaris-deck-studio/designers/INDEX.md"),
    ),
    (
        "_foundation/aesthetics.md",
        include_str!("../../../../src/templates/skills/polaris-deck-studio/designers/_foundation/aesthetics.md"),
    ),
    (
        "_foundation/rubric.md",
        include_str!("../../../../src/templates/skills/polaris-deck-studio/designers/_foundation/rubric.md"),
    ),
    (
        "_foundation/taste.md",
        include_str!("../../../../src/templates/skills/polaris-deck-studio/designers/_foundation/taste.md"),
    ),
    (
        "bento-grid.md",
        include_str!("../../../../src/templates/skills/polaris-deck-studio/designers/bento-grid.md"),
    ),
    (
        "clay-soft.md",
        include_str!("../../../../src/templates/skills/polaris-deck-studio/designers/clay-soft.md"),
    ),
    (
        "doodle-hand.md",
        include_str!("../../../../src/templates/skills/polaris-deck-studio/designers/doodle-hand.md"),
    ),
    (
        "glass-crisp.md",
        include_str!("../../../../src/templates/skills/polaris-deck-studio/designers/glass-crisp.md"),
    ),
    (
        "keynote-tech.md",
        include_str!("../../../../src/templates/skills/polaris-deck-studio/designers/keynote-tech.md"),
    ),
    (
        "memphis-pop.md",
        include_str!("../../../../src/templates/skills/polaris-deck-studio/designers/memphis-pop.md"),
    ),
    (
        "mist-gradient.md",
        include_str!("../../../../src/templates/skills/polaris-deck-studio/designers/mist-gradient.md"),
    ),
    (
        "oriental-grandeur.md",
        include_str!("../../../../src/templates/skills/polaris-deck-studio/designers/oriental-grandeur.md"),
    ),
    (
        "pedagogy-clarity.md",
        include_str!("../../../../src/templates/skills/polaris-deck-studio/designers/pedagogy-clarity.md"),
    ),
    (
        "swiss-modernist.md",
        include_str!("../../../../src/templates/skills/polaris-deck-studio/designers/swiss-modernist.md"),
    ),
    (
        "xhs-life.md",
        include_str!("../../../../src/templates/skills/polaris-deck-studio/designers/xhs-life.md"),
    ),
];

/// 把设计师人格包写到 <dest>/designers/（含 _foundation 子目录）。deck-studio / web-studio
/// 落盘时各调一次（两个技能目录各存一份，互不依赖对方是否安装）。
pub(crate) fn write_designers(dest: &Path) -> Result<(), String> {
    let designers = dest.join("designers");
    fs::create_dir_all(designers.join("_foundation")).map_err(|e| e.to_string())?;
    // 先剪除已裁撤的旧人格文件：write 只覆盖不删除，裁掉的设计师 .md 会残留在旧安装里，
    // 让 auto 路由仍能选到「不存在于花名册」的幽灵设计师。只扫顶层 *.md（_foundation 在子目录，
    // read_dir 非递归，不受影响），凡不在 DECK_DESIGNERS 白名单里的一律删。
    let keep: std::collections::HashSet<&str> =
        DECK_DESIGNERS.iter().map(|(rel, _)| *rel).collect();
    if let Ok(entries) = fs::read_dir(&designers) {
        for e in entries.flatten() {
            let p = e.path();
            if p.extension().and_then(|s| s.to_str()) == Some("md") {
                if let Some(name) = p.file_name().and_then(|s| s.to_str()) {
                    if !keep.contains(name) {
                        let _ = fs::remove_file(&p);
                    }
                }
            }
        }
    }
    for (rel, content) in DECK_DESIGNERS {
        fs::write(designers.join(rel), content).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ───────── 「网站生成」技能（落地页/单页站点，Polaris 自研，编译期内嵌，启动落盘）─────────
// 支撑「网站生成」UI 入口。复用 deck-studio 的 17 套主题（DECK_THEMES_CSS，不重复源文件），
// 配一套网站组件 site.css + 滚动揭示 runtime.js + 站点模板 + SKILL.md。
pub(crate) const WEB_ID: &str = "polaris-web-studio";
pub(crate) const WEB_VERSION: &str = "6";
pub(crate) const WEB_SKILL_MD: &str =
    include_str!("../../../../src/templates/skills/polaris-web-studio/SKILL.md");
pub(crate) const WEB_LICENSE: &str = include_str!("../../../../src/templates/skills/polaris-web-studio/LICENSE");
pub(crate) const WEB_SITE_CSS: &str =
    include_str!("../../../../src/templates/skills/polaris-web-studio/assets/site.css");
pub(crate) const WEB_RUNTIME_JS: &str =
    include_str!("../../../../src/templates/skills/polaris-web-studio/assets/runtime.js");
pub(crate) const WEB_MOTION_CSS: &str =
    include_str!("../../../../src/templates/skills/polaris-web-studio/assets/motion.css");
pub(crate) const WEB_MOTION_JS: &str =
    include_str!("../../../../src/templates/skills/polaris-web-studio/assets/motion.js");
pub(crate) const WEB_TEMPLATE: &str =
    include_str!("../../../../src/templates/skills/polaris-web-studio/templates/site.html");

// ───────── 「壹伴排版优化」多文件技能（公众号排版，编译期内嵌，启动落盘）─────────
// 升级成多文件：SKILL.md（只产语义正文）+ scripts/wechat_yiban.py（壹伴样式引擎 + CloakBrowser
// 驱动）。编译期内嵌、启动确保落到 ~/Polaris/skills（靠版本号比对覆盖），这样脚本能被 spawn
// 的 claude agent 在磁盘上直接 `python …/wechat_yiban.py` 执行。
pub(crate) const WECHAT_TS_ID: &str = "wechat-md-typesetter";
// 改动 SKILL.md 或 wechat_yiban.py 后必须 +1，让已安装用户下次启动拿到更新。
pub(crate) const WECHAT_TS_VERSION: &str = "11";
pub(crate) const WECHAT_TS_SKILL_MD: &str =
    include_str!("../../../../src/templates/skills/wechat-md-typesetter/SKILL.md");
pub(crate) const WECHAT_TS_YIBAN_PY: &str =
    include_str!("../../../../src/templates/skills/wechat-md-typesetter/scripts/wechat_yiban.py");

// ───────── 「多平台草稿投递官」多文件技能（自媒体投递，编译期内嵌，启动落盘）─────────
// SKILL.md（投递说明书）+ scripts/draft_uploader.py（7 平台草稿投递引擎，CloakBrowser 粘贴通道）
// + scripts/ark_image.py（火山方舟 Seedream 生图 CLI）。与 wechat-md-typesetter 同机制：
// 编译期内嵌、启动确保落到 ~/PolarisTeacher/skills，spawn 的 claude agent 直接 `python …` 跑脚本。
pub(crate) const MEDIA_PUB_ID: &str = "media-publisher";
// 改动 SKILL.md 或任一 py 后必须 +1，让已安装用户下次启动拿到更新。
pub(crate) const MEDIA_PUB_VERSION: &str = "1";
pub(crate) const MEDIA_PUB_SKILL_MD: &str =
    include_str!("../../../../src/templates/skills/media-publisher/SKILL.md");
pub(crate) const MEDIA_PUB_UPLOADER_PY: &str =
    include_str!("../../../../src/templates/skills/media-publisher/scripts/draft_uploader.py");
pub(crate) const MEDIA_PUB_ARK_PY: &str =
    include_str!("../../../../src/templates/skills/media-publisher/scripts/ark_image.py");

// ───────── 「项目检测」默认检查技能 id（技能本体已裁撤，仅保留 id 供 polaris-collab 检查闸引用）─────────
// polaris-collab 的检查闸(collab/checks.rs / http.rs)以此为默认 check_skill id。技能模板与
// seed 已随本次裁剪移除，运行期若未安装同名检查技能，检查闸会回退到「技能缺失=fail」。
pub const PROJECT_CHECK_ID: &str = "project-check-default";

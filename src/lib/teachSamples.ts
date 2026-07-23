// 教师助手首页「三大工坊」的数据真源：模式定义 + 各自范例库。
// 点侧栏/首页不同功能 → 切换 mode → 换一套 hero 文案、输入占位、生成技能与「范例库」。
// PPT 范例封面用 public/sample-covers 下的真图（原生引擎批量生成的课件封面），
// 渲染时优先 .png（真图），缺则回退 .svg 占位；无 cover 时取该课件第 1 页缩略图。
// 挂 deckId 的范例带「原课件真源」：
//   原文件  /sample-files/<deckId>.pptx          —— 「做同款」喂给对话作参考附件；「用 PowerPoint 放映」也用它
//   高清页  /sample-slides/<deckId>/<n>.webp     —— 「点开看」大图与全屏放映（2560×1440，n 从 1 起）
//   缩略页  /sample-slides/<deckId>/t<n>.webp    —— 缩略图条与卡片封面（480×270）
// 分两档是因为：200% DPI 屏全屏时大图会被拉到 2880 物理像素，单档 960 必糊；
// 而缩略图条一次要加载十几张，用高清档纯属浪费。

export type TeachMode = "ppt" | "lesson" | "math" | "chat";

export type Grade = "全部" | "小学" | "初中" | "高中" | "其他";

export interface TeachSample {
  id: string;
  title: string;
  subtitle: string;
  /** 封面文件名（不含扩展名，位于 /sample-covers/）。渲染时优先取 .png，回退 .svg；空串则用第 1 页截图。 */
  cover: string;
  grade: Exclude<Grade, "全部">;
  /** 点该范例时预填进输入框的提示词 */
  prompt: string;
  /** 学科/来源署名（卡片底部） */
  by?: string;
  /** 原课件 id：有则可「点开看」逐页预览与「做同款」（见文件头注释的路径约定） */
  deckId?: string;
  /** 原始文件名（做同款时附件的展示名，保留中文课名） */
  fileName?: string;
  /** 课件页数（预览翻页用） */
  pages?: number;
  /**
   * 原教案 id：有则可「看 Word 版」与「做同款」。与 deckId 互斥（一个范例要么是课件要么是教案）。
   *   原文件  /sample-doc-files/<docId>.docx   —— 「做同款」喂给对话作参考附件；「用 Word 打开」也用它
   *   源  稿  /sample-docs/<docId>.json        —— 预览用的 polaris.doc.json，喂 DocViewer 渲染成真纸张
   * 教案是流式长文档，没有「逐页截图」这回事：预览走渲染器而不是图片，因此点开看到的
   * 就是能改的那份（与 PPT 的截图预览是有意的不同）。
   */
  docId?: string;
  /** 教案字数（卡片角标与预览页脚用） */
  words?: number;
}

export interface ModeDef {
  key: TeachMode;
  label: string;
  hero: string;
  placeholder: string;
  badge: string;
  skillIds: string[];
  goal: string;
  buildPrompt: (userText: string) => string;
  samples: TeachSample[];
}

// ─────────── 原课件真源登记表：deckId → 原文件名 + 页数 ───────────
// 真源文件在 public/sample-files/<deckId>.pptx，页截图在 public/sample-slides/<deckId>/。
const DECKS: Record<string, { fileName: string; pages: number }> = {
  pri_chinese_spring: { fileName: "找春天_课件.pptx", pages: 16 },
  pri_math_fraction: { fileName: "分数的初步认识_课件.pptx", pages: 14 },
  moral_honesty: { fileName: "诚实守信_课件.pptx", pages: 16 },
  english_season: { fileName: "My Favourite Season_课件.pptx", pages: 16 },
  chinese_cibeiguu: { fileName: "次北固山下_课件.pptx", pages: 16 },
  math_pythagoras: { fileName: "勾股定理_课件.pptx", pages: 16 },
  physics_lever: { fileName: "杠杆及其平衡条件_课件.pptx", pages: 16 },
  chem_mass: { fileName: "质量守恒定律_课件.pptx", pages: 16 },
  bio_photosynthesis: { fileName: "绿色植物的光合作用_课件.pptx", pages: 16 },
  history_silkroad: { fileName: "沟通中外文明的丝绸之路_课件.pptx", pages: 16 },
  pri_math_angle: { fileName: "角的度量_课件.pptx", pages: 16 },
  pri_chinese_autumn: { fileName: "秋天的雨_课件.pptx", pages: 15 },
  chinese_beiying: { fileName: "背影_课件.pptx", pages: 16 },
  math_rational_add: { fileName: "有理数的加法_课件.pptx", pages: 16 },
  physics_ohm: { fileName: "欧姆定律_课件.pptx", pages: 16 },
  chem_neutral: { fileName: "酸和碱的中和反应_课件.pptx", pages: 16 },
  bio_circulation: { fileName: "人体的血液循环_课件.pptx", pages: 16 },
  history_opium: { fileName: "鸦片战争_课件.pptx", pages: 16 },
  geo_earth_orbit: { fileName: "地球的公转与四季变化_课件.pptx", pages: 16 },
  english_invite: { fileName: "Can you come to my party_课件.pptx", pages: 16 },
  senior_chinese_qinyuanchun: { fileName: "沁园春·长沙_课件.pptx", pages: 16 },
  senior_physics_newton3: { fileName: "牛顿第三定律_课件.pptx", pages: 16 },
  fanben_wenyan: { fileName: "语文·高考文言文阅读突破.pptx", pages: 13 },
  fanben_yilunwen: { fileName: "语文·高考议论文写作提升.pptx", pages: 16 },
  fanben_shanshui: { fileName: "语文·山水田园诗鉴赏.pptx", pages: 21 },
  fanben_xiaoshuo: { fileName: "语文·现代文阅读·小说.pptx", pages: 14 },
  fanben_chun: { fileName: "语文《春》朱自清·精读课.pptx", pages: 19 },
  fanben_solar: { fileName: "English·Solar System.pptx", pages: 19 },
  fanben_seasons: { fileName: "English·The Four Seasons.pptx", pages: 19 },
  // 高中数学 10 套核心概念课（2026-07 批次交付，16:9，公式/推导图 Manim 渲染）
  senior_math_derivative: { fileName: "导数的概念与几何意义_课件.pptx", pages: 12 },
  senior_math_integral: { fileName: "定积分与微积分基本定理_课件.pptx", pages: 12 },
  senior_math_ellipse: { fileName: "椭圆的定义与性质_课件.pptx", pages: 12 },
  senior_math_induction: { fileName: "数列与数学归纳法_课件.pptx", pages: 12 },
  senior_math_bayes: { fileName: "条件概率与贝叶斯定理_课件.pptx", pages: 16 },
  senior_math_trig_graph: { fileName: "三角函数图像与变换_课件.pptx", pages: 12 },
  senior_math_complex: { fileName: "复数与复平面_课件.pptx", pages: 12 },
  senior_math_space_vector: { fileName: "空间向量与立体几何_课件.pptx", pages: 12 },
  senior_math_matrix: { fileName: "线性方程组与矩阵_课件.pptx", pages: 12 },
  senior_math_limit: { fileName: "函数的极限与连续_课件.pptx", pages: 12 },
};

/** 给范例挂上原课件真源。deckId 缺省时：范例 id 本身是 deck，否则封面名即 deck（数学/教案范例复用课件封面）。 */
function withDecks(list: TeachSample[]): TeachSample[] {
  return list.map((s) => {
    const id = s.deckId ?? (DECKS[s.id] ? s.id : s.cover);
    const d = DECKS[id];
    return d ? { ...s, deckId: id, fileName: d.fileName, pages: d.pages } : s;
  });
}

// ─────────── AI 课件（PPT）：原生引擎批量生成的 22 套真课件 + 7 套精品范本 ───────────
const PPT_SAMPLES: TeachSample[] = withDecks([
  { id: "pri_chinese_spring", title: "找春天", subtitle: "写景识字 · 春之美", cover: "pri_chinese_spring", grade: "小学", by: "语文", prompt: "生成一份小学语文《找春天》的完整教学课件，含识字、朗读指导与写景想象。" },
  { id: "pri_math_fraction", title: "分数的初步认识", subtitle: "平均分 · 初步认识", cover: "pri_math_fraction", grade: "小学", by: "数学", prompt: "生成一份小学数学《分数的初步认识》完整课件，含平均分情境、几分之一与直观图示。" },
  { id: "pri_math_angle", title: "角的度量", subtitle: "量角器 · 度数", cover: "pri_math_angle", grade: "小学", by: "数学", prompt: "生成一份小学数学《角的度量》完整课件，含量角器用法、度数读取与练习。" },
  { id: "pri_chinese_autumn", title: "秋天的雨", subtitle: "写景散文 · 朗读", cover: "pri_chinese_autumn", grade: "小学", by: "语文", prompt: "生成一份小学语文《秋天的雨》完整课件，含优美语句品读与朗读指导。" },
  { id: "moral_honesty", title: "诚实守信", subtitle: "品德养成 · 明理", cover: "moral_honesty", grade: "小学", by: "政治", prompt: "生成一份《诚实守信》道德与法治课件，含故事情境、辨析与行为指导。" },
  { id: "english_season", title: "My Favourite Season", subtitle: "季节主题 · 口语", cover: "english_season", grade: "小学", by: "英语", prompt: "Generate a complete courseware on 'My Favourite Season' for a primary English class." },
  { id: "fanben_seasons", deckId: "fanben_seasons", title: "The Four Seasons", subtitle: "四季 · 词汇句型", cover: "", grade: "小学", by: "英语 · 精品范本", prompt: "Generate a complete primary English courseware on 'The Four Seasons' with vocabulary, sentence patterns and activities." },
  { id: "chinese_cibeiguu", title: "次北固山下", subtitle: "律诗鉴赏 · 情景交融", cover: "chinese_cibeiguu", grade: "初中", by: "语文", prompt: "生成一份初中语文《次北固山下》完整课件，含律诗格律、意象与思乡情感赏析。" },
  { id: "chinese_beiying", title: "背影", subtitle: "叙事散文 · 父爱", cover: "chinese_beiying", grade: "初中", by: "语文", prompt: "生成一份初中语文《背影》完整课件，含细节描写、父爱主题与语言品味。" },
  { id: "math_pythagoras", title: "勾股定理", subtitle: "证明 · 应用", cover: "math_pythagoras", grade: "初中", by: "数学", prompt: "生成一份初中数学《勾股定理》完整课件，含多种证明方法与实际应用题。" },
  { id: "math_rational_add", title: "有理数的加法", subtitle: "法则 · 数轴", cover: "math_rational_add", grade: "初中", by: "数学", prompt: "生成一份初中数学《有理数的加法》完整课件，含数轴模型、加法法则与例题。" },
  { id: "physics_lever", title: "杠杆及其平衡条件", subtitle: "杠杆 · 平衡", cover: "physics_lever", grade: "初中", by: "物理", prompt: "生成一份初中物理《杠杆及其平衡条件》完整课件，含五要素、平衡条件与实验。" },
  { id: "physics_ohm", title: "欧姆定律", subtitle: "电流 · 电压 · 电阻", cover: "physics_ohm", grade: "初中", by: "物理", prompt: "生成一份初中物理《欧姆定律》完整课件，含定律推导、电路图与计算例题。" },
  { id: "chem_mass", title: "质量守恒定律", subtitle: "守恒 · 微观解释", cover: "chem_mass", grade: "初中", by: "化学", prompt: "生成一份初中化学《质量守恒定律》完整课件，含实验探究与微观原子解释。" },
  { id: "chem_neutral", title: "酸和碱的中和反应", subtitle: "中和 · 盐与水", cover: "chem_neutral", grade: "初中", by: "化学", prompt: "生成一份初中化学《酸和碱的中和反应》完整课件，含反应实质、指示剂与应用。" },
  { id: "bio_photosynthesis", title: "绿色植物的光合作用", subtitle: "光合 · 能量转化", cover: "bio_photosynthesis", grade: "初中", by: "生物", prompt: "生成一份初中生物《绿色植物的光合作用》完整课件，含过程、条件与实验验证。" },
  { id: "bio_circulation", title: "人体的血液循环", subtitle: "血液 · 循环路径", cover: "bio_circulation", grade: "初中", by: "生物", prompt: "生成一份初中生物《人体的血液循环》完整课件，含体循环、肺循环与心脏结构。" },
  { id: "history_silkroad", title: "沟通中外文明的丝绸之路", subtitle: "丝路 · 文明交流", cover: "history_silkroad", grade: "初中", by: "历史", prompt: "生成一份初中历史《沟通中外文明的丝绸之路》完整课件，含路线、意义与文明交流。" },
  { id: "history_opium", title: "鸦片战争", subtitle: "近代史 · 转折", cover: "history_opium", grade: "初中", by: "历史", prompt: "生成一份初中历史《鸦片战争》完整课件，含背景、经过、条约与历史影响。" },
  { id: "geo_earth_orbit", title: "地球的公转与四季变化", subtitle: "公转 · 四季", cover: "geo_earth_orbit", grade: "初中", by: "地理", prompt: "生成一份初中地理《地球的公转与四季变化》完整课件，含公转示意、太阳直射与四季成因。" },
  { id: "english_invite", title: "Can you come to my party?", subtitle: "邀请 · 情态动词", cover: "english_invite", grade: "初中", by: "英语", prompt: "Generate a complete courseware on 'Can you come to my party?' with invitations and modal verbs." },
  { id: "fanben_chun", deckId: "fanben_chun", title: "《春》朱自清 · 精读课", subtitle: "写景抒情 · 语言品味", cover: "", grade: "初中", by: "语文 · 精品范本", prompt: "生成一份初中语文《春》（朱自清）精读课完整课件，含写景层次、修辞品味与朗读设计。" },
  { id: "fanben_solar", deckId: "fanben_solar", title: "Solar System", subtitle: "太阳系 · 科普英语", cover: "", grade: "初中", by: "英语 · 精品范本", prompt: "Generate a complete English courseware on 'The Solar System' with planet facts, comparatives and a quiz." },
  { id: "senior_chinese_qinyuanchun", title: "沁园春·长沙", subtitle: "词 · 豪情", cover: "senior_chinese_qinyuanchun", grade: "高中", by: "语文", prompt: "生成一份高中语文《沁园春·长沙》完整课件，含意象、意境与豪迈情感赏析。" },
  { id: "senior_physics_newton3", title: "牛顿第三定律", subtitle: "作用力 · 反作用力", cover: "senior_physics_newton3", grade: "高中", by: "物理", prompt: "生成一份高中物理《牛顿第三定律》完整课件，含作用力与反作用力特征及应用。" },
  { id: "fanben_wenyan", deckId: "fanben_wenyan", title: "高考文言文阅读突破", subtitle: "实虚词 · 断句翻译", cover: "", grade: "高中", by: "语文 · 精品范本", prompt: "生成一份高考文言文阅读专题复习课件，含实虚词积累、断句技巧与翻译规范训练。" },
  { id: "fanben_yilunwen", deckId: "fanben_yilunwen", title: "高考议论文写作提升", subtitle: "立意 · 结构 · 论证", cover: "", grade: "高中", by: "语文 · 精品范本", prompt: "生成一份高考议论文写作提升课件，含审题立意、结构布局与论证方法及范文剖析。" },
  { id: "fanben_shanshui", deckId: "fanben_shanshui", title: "山水田园诗鉴赏", subtitle: "意象 · 手法 · 情感", cover: "", grade: "高中", by: "语文 · 精品范本", prompt: "生成一份高中语文山水田园诗鉴赏专题课件，含意象梳理、艺术手法与情感主旨分析。" },
  { id: "fanben_xiaoshuo", deckId: "fanben_xiaoshuo", title: "现代文阅读 · 小说", subtitle: "情节 · 人物 · 主题", cover: "", grade: "高中", by: "语文 · 精品范本", prompt: "生成一份高考现代文阅读（小说）专题课件，含情节结构、人物形象与主题探究答题法。" },
]);

// ─────────── 生成数学课件（难度更高）：高中 10 套核心概念课（真课件）+ 初小 4 套 ───────────
// 高中 10 套无 cover 名：卡片封面直接用课件第 1 页缩略图（真版式即封面）。
const MATH_SAMPLES: TeachSample[] = withDecks([
  { id: "senior_math_derivative", title: "导数的概念与几何意义", subtitle: "瞬时变化率 · 切线斜率", cover: "", grade: "高中", by: "数学", prompt: "生成一份高中数学《导数的概念与几何意义》课件，从平均变化率到瞬时变化率，用切线读懂局部变化，含完整推导与典型例题。" },
  { id: "senior_math_limit", title: "函数的极限与连续", subtitle: "极限思想 · 连续性", cover: "", grade: "高中", by: "数学", prompt: "生成一份高中数学《函数的极限与连续》课件，含极限的直观理解、严谨表述、连续性判定与典型例题。" },
  { id: "senior_math_integral", title: "定积分与微积分基本定理", subtitle: "曲边梯形 · 牛顿-莱布尼茨", cover: "", grade: "高中", by: "数学", prompt: "生成一份高中数学《定积分与微积分基本定理》课件，从曲边梯形面积引入，含定积分定义、基本定理推导与计算例题。" },
  { id: "senior_math_ellipse", title: "椭圆的定义与性质", subtitle: "定义 · 标准方程", cover: "", grade: "高中", by: "数学", prompt: "生成一份高中数学《椭圆的定义与性质》课件，含定义生成过程、标准方程推导、几何性质与典型例题。" },
  { id: "senior_math_induction", title: "数列与数学归纳法", subtitle: "递推 · 归纳证明", cover: "", grade: "高中", by: "数学", prompt: "生成一份高中数学《数列与数学归纳法》课件，含递推关系、归纳法两步框架、证明规范与变式训练。" },
  { id: "senior_math_bayes", title: "条件概率与贝叶斯定理", subtitle: "条件概率 · 逆向推断", cover: "", grade: "高中", by: "数学", prompt: "生成一份高中数学《条件概率与贝叶斯定理》课件，含条件概率定义、乘法公式、全概率公式、贝叶斯定理与易错辨析。" },
  { id: "senior_math_trig_graph", title: "三角函数图像与变换", subtitle: "图像 · 平移伸缩", cover: "", grade: "高中", by: "数学", prompt: "生成一份高中数学《三角函数图像与变换》课件，含 y=Asin(ωx+φ) 的图像、平移伸缩变换规律与典型例题。" },
  { id: "senior_math_complex", title: "复数与复平面", subtitle: "复数运算 · 几何意义", cover: "", grade: "高中", by: "数学", prompt: "生成一份高中数学《复数与复平面》课件，含复数概念、四则运算、复平面几何意义与模的应用。" },
  { id: "senior_math_space_vector", title: "空间向量与立体几何", subtitle: "向量法 · 空间角", cover: "", grade: "高中", by: "数学", prompt: "生成一份高中数学《空间向量与立体几何》课件，含空间向量基础、法向量求法与用向量法求空间角、距离的完整例题。" },
  { id: "senior_math_matrix", title: "线性方程组与矩阵", subtitle: "消元 · 矩阵表示", cover: "", grade: "高中", by: "数学", prompt: "生成一份高中数学《线性方程组与矩阵》课件，含消元法、矩阵表示、初等行变换与解的讨论。" },
  { id: "m_pythagoras", title: "勾股定理", subtitle: "多种证明 · 应用", cover: "math_pythagoras", grade: "初中", by: "数学", prompt: "生成一份《勾股定理》数学课件，含面积法/拼图法等多种严谨证明与实际应用题（公式规范排版）。" },
  { id: "m_rational_add", title: "有理数的加法", subtitle: "数轴模型 · 法则", cover: "math_rational_add", grade: "初中", by: "数学", prompt: "生成一份《有理数的加法》数学课件，含数轴模型、同异号法则推导与分层练习。" },
  { id: "m_fraction", title: "分数的初步认识", subtitle: "平均分 · 直观", cover: "pri_math_fraction", grade: "小学", by: "数学", prompt: "生成一份《分数的初步认识》数学课件，含平均分情境、几分之一直观图与操作活动。" },
  { id: "m_angle", title: "角的度量", subtitle: "量角器 · 度数", cover: "pri_math_angle", grade: "小学", by: "数学", prompt: "生成一份《角的度量》数学课件，含角的概念、量角器读数步骤与易错辨析。" },
]);

// ─────────── AI 教案：15 篇高中青教赛范式真教案（Word 原稿 + 可编辑源稿）───────────
// 真源登记表：docId → 原文件名 + 字数。原文件在 public/sample-doc-files/<docId>.docx,
// 预览用的源稿在 public/sample-docs/<docId>.json（polaris.doc.json 结构，喂 DocViewer）。
// 与 DECKS 分表而不合表：课件按「页」计、教案按「字」计，卡片角标与预览形态都不同。
const DOCS: Record<string, { fileName: string; words: number }> = {
  lesson_math_derivative: { fileName: "01_数学_导数与函数单调性极值最值(高考一轮专题).docx", words: 2487 },
  lesson_math_ellipse_chord: { fileName: "02_数学_直线与椭圆的位置关系及弦长问题(高考冲刺专题).docx", words: 2646 },
  lesson_math_series_sum: { fileName: "03_数学_数列求和之错位相减与裂项相消(专题突破).docx", words: 2516 },
  lesson_math_trig_identity: { fileName: "04_数学_三角恒等变换与求值(高考专题).docx", words: 2648 },
  lesson_math_distribution: { fileName: "05_数学_二项分布与正态分布(高考概率统计专题).docx", words: 2304 },
  lesson_english_continuation: { fileName: "06_英语_读后续写情节构建与语言升级(高考写作专题).docx", words: 2125 },
  lesson_english_grammar_fill: { fileName: "07_英语_语法填空解题策略(高考专题).docx", words: 1882 },
  lesson_english_inference: { fileName: "08_英语_阅读理解推理判断题解题策略(高考专题).docx", words: 1965 },
  lesson_english_summary: { fileName: "09_英语_概要写作Summary Writing(高考写作专题).docx", words: 1876 },
  lesson_chinese_poetry_diction: { fileName: "10_语文_古代诗歌鉴赏之炼字炼句(高考专题).docx", words: 1857 },
  lesson_chinese_classical_translation: { fileName: "11_语文_文言文翻译得分点突破(高考专题).docx", words: 1776 },
  lesson_politics_contradiction: { fileName: "12_政治_用对立统一观点看问题(矛盾分析法·高考专题).docx", words: 1885 },
  lesson_history_xinhai: { fileName: "13_历史_辛亥革命与中华民国的建立(高考专题).docx", words: 2013 },
  lesson_geography_weather_system: { fileName: "14_地理_常见天气系统之锋与气旋(高考专题).docx", words: 1899 },
  lesson_physics_magnetic_field: { fileName: "15_物理_带电粒子在匀强磁场中的运动(高考专题).docx", words: 2286 },
};

/** 给教案范例挂上原 Word 真源（范例 id 即 docId）。 */
function withDocs(list: TeachSample[]): TeachSample[] {
  return list.map((s) => {
    const d = DOCS[s.id];
    return d ? { ...s, docId: s.id, fileName: d.fileName, words: d.words } : s;
  });
}

const LESSON_SAMPLES: TeachSample[] = withDocs([
  { id: "lesson_math_derivative", title: "导数与单调性、极值、最值", subtitle: "含参讨论 · 一轮专题", cover: "lesson_math_derivative", grade: "高中", by: "数学", prompt: "写一份高中数学《导数在函数单调性、极值与最值中的应用》的青教赛范式教案，含课标考情、学情分析、教学目标、重难点、教学过程表与分层作业。" },
  { id: "lesson_math_ellipse_chord", title: "直线与椭圆 · 弦长与中点弦", subtitle: "解析几何 · 冲刺专题", cover: "lesson_math_ellipse_chord", grade: "高中", by: "数学", prompt: "写一份高中数学《直线与椭圆的位置关系及弦长、中点弦问题》的青教赛范式教案，含课标考情、学情分析、教学目标、重难点、教学过程表与分层作业。" },
  { id: "lesson_math_series_sum", title: "数列求和：错位相减与裂项相消", subtitle: "数列 · 方法突破", cover: "lesson_math_series_sum", grade: "高中", by: "数学", prompt: "写一份高中数学《数列求和的核心方法：错位相减与裂项相消》的青教赛范式教案，含课标考情、学情分析、教学目标、重难点、教学过程表与分层作业。" },
  { id: "lesson_math_trig_identity", title: "三角恒等变换与化简求值", subtitle: "公式选择 · 角的变换", cover: "lesson_math_trig_identity", grade: "高中", by: "数学", prompt: "写一份高中数学《三角恒等变换与三角函数的化简求值》的青教赛范式教案，含课标考情、学情分析、教学目标、重难点、教学过程表与分层作业。" },
  { id: "lesson_math_distribution", title: "二项分布与正态分布", subtitle: "概率统计 · 模型辨析", cover: "lesson_math_distribution", grade: "高中", by: "数学", prompt: "写一份高中数学《二项分布与正态分布的辨析与应用》的青教赛范式教案，含课标考情、学情分析、教学目标、重难点、教学过程表与分层作业。" },
  { id: "lesson_english_continuation", title: "读后续写：情节构建与语言升级", subtitle: "Continuation · 写作专题", cover: "lesson_english_continuation", grade: "高中", by: "英语", prompt: "写一份高中英语《读后续写（Continuation Writing）：情节构建与语言升级》的青教赛范式教案，含课标考情、学情分析、教学目标、重难点、教学过程表与分层作业。" },
  { id: "lesson_english_grammar_fill", title: "语法填空解题策略", subtitle: "有无提示词 · 二轮突破", cover: "lesson_english_grammar_fill", grade: "高中", by: "英语", prompt: "写一份高中英语《语法填空（Grammar Filling）解题策略》的青教赛范式教案，含课标考情、学情分析、教学目标、重难点、教学过程表与分层作业。" },
  { id: "lesson_english_inference", title: "阅读理解 · 推理判断题", subtitle: "Inference · 阅读专题", cover: "lesson_english_inference", grade: "高中", by: "英语", prompt: "写一份高中英语《阅读理解之推理判断题（Inference）解题策略》的青教赛范式教案，含课标考情、学情分析、教学目标、重难点、教学过程表与分层作业。" },
  { id: "lesson_english_summary", title: "概要写作：要点提炼与同义改写", subtitle: "Summary · 写作专题", cover: "lesson_english_summary", grade: "高中", by: "英语", prompt: "写一份高中英语《概要写作（Summary Writing）：要点提炼与同义改写》的青教赛范式教案，含课标考情、学情分析、教学目标、重难点、教学过程表与分层作业。" },
  { id: "lesson_chinese_poetry_diction", title: "古代诗歌鉴赏之炼字炼句", subtitle: "诗歌鉴赏 · 答题范式", cover: "lesson_chinese_poetry_diction", grade: "高中", by: "语文", prompt: "写一份高中语文《古代诗歌鉴赏之炼字炼句》的青教赛范式教案，含课标考情、学情分析、教学目标、重难点、教学过程表与分层作业。" },
  { id: "lesson_chinese_classical_translation", title: "文言文翻译得分点突破", subtitle: "采分点 · 直译规范", cover: "lesson_chinese_classical_translation", grade: "高中", by: "语文", prompt: "写一份高中语文《文言文翻译的得分点突破》的青教赛范式教案，含课标考情、学情分析、教学目标、重难点、教学过程表与分层作业。" },
  { id: "lesson_politics_contradiction", title: "用对立统一的观点看问题", subtitle: "矛盾分析法 · 哲学与文化", cover: "lesson_politics_contradiction", grade: "高中", by: "政治", prompt: "写一份高中政治《用对立统一的观点看问题——矛盾分析法》的青教赛范式教案，含课标考情、学情分析、教学目标、重难点、教学过程表与分层作业。" },
  { id: "lesson_history_xinhai", title: "辛亥革命与中华民国的建立", subtitle: "纲要(上) · 主题复习", cover: "lesson_history_xinhai", grade: "高中", by: "历史", prompt: "写一份高中历史《辛亥革命与中华民国的建立》的青教赛范式教案，含课标考情、学情分析、教学目标、重难点、教学过程表与分层作业。" },
  { id: "lesson_geography_weather_system", title: "常见天气系统 · 锋与气旋", subtitle: "锋面 · 气旋反气旋", cover: "lesson_geography_weather_system", grade: "高中", by: "地理", prompt: "写一份高中地理《常见天气系统——锋面、低压（气旋）与高压（反气旋）》的青教赛范式教案，含课标考情、学情分析、教学目标、重难点、教学过程表与分层作业。" },
  { id: "lesson_physics_magnetic_field", title: "带电粒子在匀强磁场中的运动", subtitle: "定圆心 · 求半径 · 算时间", cover: "lesson_physics_magnetic_field", grade: "高中", by: "物理", prompt: "写一份高中物理《带电粒子在匀强磁场中的运动》的青教赛范式教案，含课标考情、学情分析、教学目标、重难点、教学过程表与分层作业。" },
]);

export const MODES: Record<TeachMode, ModeDef> = {
  // 「新建对话」= 通用智能助手：不注入课件技能、原样发问，首页为居中问候 + 底部输入（无案例广场）。
  // 与三大工坊（ppt/lesson/math）是两种不同的首页版式（设计稿 1-新建对话主页 vs 2-AI课件PPT）。
  chat: {
    key: "chat",
    label: "新建对话",
    hero: "LUMI {你的智能助手}",
    placeholder: "有什么问题都可以问我，或把文件拖进来一起看…",
    badge: "对话",
    skillIds: [],
    goal: "",
    buildPrompt: (t) => t,
    samples: [],
  },
  ppt: {
    key: "ppt",
    label: "AI 课件PPT",
    hero: "一句话生成{完整教学课件}",
    placeholder: "生成讲解一元二次方程的教学完整课件…（可拖文件进来作为素材）",
    badge: "AI 完整课件",
    skillIds: ["polaris-deck-studio"],
    goal: "制作一份完整教学课件（.pptx）并保存到产物目录",
    buildPrompt: (t) =>
      `请使用 polaris-deck-studio 技能，为下面的主题制作一份【完整教学课件（.pptx，真文本框、可编辑）】，配图精美、版式混排、每页配口播稿：\n\n${t}`,
    samples: PPT_SAMPLES,
  },
  lesson: {
    key: "lesson",
    label: "AI 教案",
    hero: "一句话生成{规范教学教案}",
    placeholder: "为朱自清《背影》写一份完整教案…",
    badge: "AI 教案",
    // 与课件同构:教案也走技能 + spec 路线(polaris.doc.json → .docx),
    // 出的是**能在应用内逐段编辑、一键导出的真 Word**,不再是一段聊天里的 Markdown。
    skillIds: ["polaris-doc-studio"],
    goal: "撰写一份规范、可直接使用的教学教案（.docx）并保存到产物目录",
    buildPrompt: (t) =>
      `请使用 polaris-doc-studio 技能，按【青教赛范式】撰写一份规范、可直接拿去上课的【教学教案（.docx，真表格、可编辑）】，` +
      `十个板块齐全（课标与考情 / 学情 / 教学目标 / 重难点 / 教法学法 / 教学过程四栏表 / 板书设计 / 分层作业 / 教学反思 / 课程思政），` +
      `教学目标用可观察可评价的行为动词，教学过程每一行的「设计意图」必须写实、不许空话，作业遵守双减分层可选。\n\n主题：\n\n${t}`,
    samples: LESSON_SAMPLES,
  },
  math: {
    key: "math",
    label: "生成数学课件",
    hero: "一句话生成{严谨数学课件}",
    placeholder: "生成讲解三角函数初步的数学课件，公式要严谨…",
    badge: "AI 数学课件",
    skillIds: ["polaris-deck-studio"],
    goal: "制作一份公式严谨、推导完整的数学教学课件（.pptx）并保存到产物目录",
    buildPrompt: (t) =>
      `请使用 polaris-deck-studio 技能，制作一份【数学教学课件（.pptx）】。要求：数学公式用规范排版（不得写错），关键结论给出完整推导步骤，配典型例题与变式训练，难度与逻辑严谨度高于普通课件。主题：\n\n${t}`,
    samples: MATH_SAMPLES,
  },
};

export const MODE_ORDER: TeachMode[] = ["lesson", "ppt", "math"];
export const GRADES: Grade[] = ["全部", "小学", "初中", "高中", "其他"];

// ─────────── 学科筛选 ───────────
// 学科真源就是范例的 by 署名，但 by 里可能带后缀（如「语文 · 精品范本」），取「·」前一段做学科名。
/** 从范例的署名里取出学科名；无署名返回空串（不进学科 tab）。 */
export function subjectOf(s: TeachSample): string {
  return (s.by ?? "").split("·")[0].trim();
}
/** 当前模式下实际有范例的学科，按 SUBJECT_RANK 排序 —— 每个 tab 点开都有内容，不会是空白。 */
export function subjectsOf(samples: TeachSample[]): string[] {
  const set = new Set(samples.map(subjectOf).filter(Boolean));
  return [...set].sort((a, b) => (SUBJECT_RANK[a] ?? 99) - (SUBJECT_RANK[b] ?? 99));
}
const SUBJECT_RANK: Record<string, number> = {
  语文: 0, 数学: 1, 英语: 2, 物理: 3, 化学: 4, 生物: 5, 政治: 6, 历史: 7, 地理: 8,
};

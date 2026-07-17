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

export type TeachMode = "ppt" | "lesson" | "math";

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
  { id: "moral_honesty", title: "诚实守信", subtitle: "品德养成 · 明理", cover: "moral_honesty", grade: "小学", by: "道法", prompt: "生成一份《诚实守信》道德与法治课件，含故事情境、辨析与行为指导。" },
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

// ─────────── 生成数学课件（难度更高）：取数学学科的真课件作示例 ───────────
const MATH_SAMPLES: TeachSample[] = withDecks([
  { id: "m_pythagoras", title: "勾股定理", subtitle: "多种证明 · 应用", cover: "math_pythagoras", grade: "初中", by: "数学", prompt: "生成一份《勾股定理》数学课件，含面积法/拼图法等多种严谨证明与实际应用题（公式规范排版）。" },
  { id: "m_rational_add", title: "有理数的加法", subtitle: "数轴模型 · 法则", cover: "math_rational_add", grade: "初中", by: "数学", prompt: "生成一份《有理数的加法》数学课件，含数轴模型、同异号法则推导与分层练习。" },
  { id: "m_fraction", title: "分数的初步认识", subtitle: "平均分 · 直观", cover: "pri_math_fraction", grade: "小学", by: "数学", prompt: "生成一份《分数的初步认识》数学课件，含平均分情境、几分之一直观图与操作活动。" },
  { id: "m_angle", title: "角的度量", subtitle: "量角器 · 度数", cover: "pri_math_angle", grade: "小学", by: "数学", prompt: "生成一份《角的度量》数学课件，含角的概念、量角器读数步骤与易错辨析。" },
]);

// ─────────── AI 教案：取几套真课件主题作教案示例 ───────────
const LESSON_SAMPLES: TeachSample[] = withDecks([
  { id: "lp_beiying", title: "《背影》教学设计", subtitle: "评价任务 · 教学流程", cover: "chinese_beiying", grade: "初中", by: "语文", prompt: "为朱自清《背影》写一份完整教案，含教学目标、重难点、教学过程与板书设计。" },
  { id: "lp_qinyuanchun", title: "《沁园春·长沙》教案", subtitle: "学情分析 · 课时安排", cover: "senior_chinese_qinyuanchun", grade: "高中", by: "语文", prompt: "为《沁园春·长沙》写一份完整教案，含学情分析、诵读设计与意象探究活动。" },
  { id: "lp_photosynthesis", title: "光合作用 · 教案", subtitle: "实验探究 · 概念建构", cover: "bio_photosynthesis", grade: "初中", by: "生物", prompt: "为《绿色植物的光合作用》写一份完整教案，含探究实验设计、教学过程与作业。" },
  { id: "lp_opium", title: "《鸦片战争》教案", subtitle: "史料 · 家国情怀", cover: "history_opium", grade: "初中", by: "历史", prompt: "为《鸦片战争》写一份完整教案，含史料研读、时间线梳理与家国情怀渗透。" },
]);

export const MODES: Record<TeachMode, ModeDef> = {
  ppt: {
    key: "ppt",
    label: "AI 课件（PPT）",
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
    skillIds: [],
    goal: "撰写一份规范、可直接使用的教学教案（Markdown/文档）并保存到产物目录",
    buildPrompt: (t) =>
      `请撰写一份规范、可直接拿去上课的【教学教案】，按新课标核心素养导向设计，结构与顺序如下：\n` +
      `1. 学情分析（本班学生已有基础与可能的障碍）\n` +
      `2. 教学目标：指向学科核心素养，每条都用可观察可评价的行为动词，不写「了解」「体会」这类无法检测的空目标\n` +
      `3. 教学重难点\n` +
      `4. 评价任务：先写「怎么知道学生学会了」，再写「怎么教」——每条目标都要有对应的评价任务\n` +
      `5. 教学准备\n` +
      `6. 教学过程：分环节写，每环节含师生活动、设计意图与时间分配，各环节时间加起来等于课时总长\n` +
      `7. 预设学生典型错误与应对：至少两处，标在对应环节里\n` +
      `8. 板书要点\n` +
      `9. 作业设计：遵守双减，总量克制、分层可选，不布置机械重复抄写\n` +
      `10. 末尾用一句话说明「本课的评价任务如何检测目标达成」\n\n` +
      `主题：\n\n${t}`,
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

export const MODE_ORDER: TeachMode[] = ["ppt", "lesson", "math"];
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
  语文: 0, 数学: 1, 英语: 2, 物理: 3, 化学: 4, 生物: 5, 道法: 6, 历史: 7, 地理: 8,
};

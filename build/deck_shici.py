# -*- coding: utf-8 -*-
"""语文 · 高考古诗词鉴赏专题 (约45分钟)"""
from engine import Deck, THEMES

THEME = "poetry"
IMAGES = {
    "hero":   ("Chinese ink-wash landscape, a lone poet on a riverside pavilion at dusk, distant misty peaks, willow and plum branches, a rising moon, elegant classical poetic mood, wide cinematic, refined brushwork", "16:9"),
    "xingxiang":("close up of a single plum blossom branch in snow, delicate petals, subtle moonlight, ink-wash painting style, symbolism of noble character, serene minimal", "16:9"),
    "yijing": ("a tranquil autumn scene, lone boat on a wide misty lake, distant mountains, falling leaves, soft twilight, evocative empty space, Chinese landscape painting, poetic atmosphere", "16:9"),
    "shoufa": ("an open ancient poetry book with elegant brush calligraphy, inkstone and brush beside it, warm lamplight, soft focus, scholarly artistic close up", "16:9"),
    "qinggan": ("a traveler looking back toward distant home over autumn fields at sunset, geese flying south, nostalgic melancholic mood, warm golden light, painterly landscape", "16:9"),
    "answer": ("a calm study desk with organized notes and a brush, morning light through a lattice window, sense of method and clarity, warm scholarly still life", "16:9"),
    "quote":  ("brush writing flowing Chinese calligraphy of a poem on rice paper, fresh ink, artistic close up, warm tone, soft background", "16:9"),
    "close":  ("a bright moon rising over serene mountains and a quiet river, a single pavilion, timeless poetic beauty, cinematic wide landscape, tranquil hopeful", "16:9"),
}


def build(P):
    d = Deck(THEMES[THEME])

    d.title_hero(P["hero"], "语文 · 高考鉴赏专题",
                 ["古诗词鉴赏", "——读懂诗心，答出章法"],
                 "从形象、语言到技巧、情感，四把钥匙打开诗歌的门",
                 "HIGH SCHOOL SENIOR · CLASSICAL POETRY · 45 MIN")

    d.bullets("本课导航 · LESSON MAP", "古诗鉴赏的四大命题方向", [
        ("一、鉴赏形象", "人物、景物、事物形象，读懂“写了什么”"),
        ("二、品味语言", "炼字炼句、语言风格，体会“怎么写的”"),
        ("三、赏析技巧", "修辞、表现手法、抒情方式，看清“为何这样写”"),
        ("四、体悟情感", "知人论世，把握诗歌的思想感情与主旨"),
        ("五、答题规范", "术语准、要点全、结合诗句——拿满得分点"),
    ], pageno=2)

    d.divider(P["xingxiang"], "01", "鉴赏形象", "一切景语皆情语——先看诗人写了什么")

    d.two_col("形象 · 三大类型", "读懂形象，是鉴赏的第一步",
              "人物与事物形象", ["人物形象：诗中的“我”或他人，看其身份、处境、情态",
                           "事物形象（咏物）：借物寄志，如梅之高洁、竹之坚贞",
                           "常见意象要熟记：月—思乡、柳—送别、鸿雁—书信"],
              "景物形象与意境", ["景物形象：由意象组合而成的画面",
                           "意境：景与情交融所营造的氛围与境界",
                           "常见意境词：雄浑壮阔、清幽宁静、萧瑟凄凉、明丽欢快"],
              pageno=3)

    d.image_text(P["yijing"], "意境 · 分析范式", "怎样描绘并概括意境？",
                 ["第一步 · 绘画面：抓住诗中意象，用自己的语言再现画面，忠于原诗又有文采。",
                  "第二步 · 点氛围：用两个双音节词准确概括意境特点（如“孤寂冷清”“恬静优美”）。",
                  "第三步 · 析情感：由境入情，说明这种意境传达了诗人怎样的思想感情。",
                  "口诀：画面 + 氛围 + 情感，三步走，答案就完整。"],
                 side="left", pageno=4)

    d.divider(P["shoufa"], "02", "语言与技巧", "同一景物，为什么他写得动人？")

    d.two_col("炼字 · 品味语言", "一个字，如何撑起一句诗？",
              "炼字答题四步", ["释义：解释该字在句中的含义",
                          "描景：把该字放回句中，描述其展现的景象",
                          "点法：指出手法（拟人、化静为动、通感……）",
                          "析情：分析该字营造的意境或表达的情感"],
              "语言风格", ["清新自然、平淡质朴、绚丽飘逸",
                        "沉郁顿挫、雄浑豪放、婉约含蓄",
                        "答题要“风格词 + 诗句印证 + 效果”"],
              pageno=5)

    d.two_col("技巧 · 三大类手法", "看清诗人“怎么表达”",
              "修辞 & 描写", ["修辞：比喻、拟人、夸张、对偶、用典、互文",
                          "描写：动静结合、虚实相生、远近高低、白描工笔",
                          "感官：视听嗅触多角度，色彩与声音的调配"],
              "抒情 & 结构", ["抒情：直抒胸臆 vs 借景抒情、托物言志、用典抒情",
                          "结构：起承转合、以景结情、卒章显志",
                          "手法题答法：点手法 + 析运用 + 说效果情感"],
              pageno=6)

    d.image_text(P["qinggan"], "情感 · 知人论世", "诗到底在抒发什么情？",
                 ["常见情感类别：思乡怀人、送别惜别、忧国伤时、建功报国、寄情山水、怀才不遇。",
                  "抓“情语”：诗中直接的情感词（愁、恨、喜、独、空……）是最直接的线索。",
                  "读注释与背景：作者生平、时代处境、写作缘由，往往藏着答题的钥匙。",
                  "警惕先入为主：同一意象在不同语境情感不同，一切以本诗为准。"],
                 side="right", pageno=7)

    d.quote("感时花溅泪，恨别鸟惊心。",
            "—— 杜甫 · 移情于物，以乐景写哀情，愈见沉痛", img=P["quote"])

    d.image_text(P["answer"], "答题 · 规范与得分", "会读，更要会答",
                 ["先审题型：是形象题、语言题、技巧题，还是情感题？对症下药。",
                  "用术语：手法、意境、风格都有专门术语，用准了才踩得中得分点。",
                  "结合诗句：任何结论都要回到原诗，引出具体字句作依据，忌空谈。",
                  "分点作答：一问一答、要点清晰，按分值估要点数，宁全勿漏。"],
                 side="left", pageno=8)

    d.bullets("鉴赏 · 四步通用流程", "拿到一首陌生诗，这样读", [
        ("看标题作者", "题目常点明题材，作者暗示风格与情感基调"),
        ("读注释背景", "注释是命题人给的“送分线索”，务必用上"),
        ("圈意象情语", "找出核心意象与直接的情感词，把握画面"),
        ("扣题型作答", "判断题型，套用范式，术语+诗句+情感一并给全"),
    ], pageno=9)

    d.closing(P["close"], "读懂一首诗，就是读懂一颗心",
              ["古诗词考的是语感、积累与方法的合力——多背名篇，多练规范，语感自然会长。",
               "愿你不仅会“答诗”，更能真正“懂诗”，在字里行间遇见千年之前的那轮明月。"],
              "语文组 · 高三鉴赏专题 · 下课")

    return d

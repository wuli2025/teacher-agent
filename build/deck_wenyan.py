# -*- coding: utf-8 -*-
"""语文 · 高考文言文阅读突破 (约45分钟)"""
from engine import Deck, THEMES

THEME = "poetry"
IMAGES = {
    "hero":   ("ancient Chinese bamboo scrolls unfurled on a wooden desk, brush and inkstone, dim warm lamplight in a scholar's study, classical dignified atmosphere, wide cinematic, ink-wash aesthetic", "16:9"),
    "shici":  ("close up of ancient Chinese characters brushed on aged bamboo slips, weathered texture, warm light, scholarly detail, shallow depth of field", "16:9"),
    "juishi": ("an old Chinese scholar tracing lines of text in an ancient book with his finger, spectacles and lamp, focused study, warm intimate lamplight, painterly", "16:9"),
    "fanyi":  ("a bridge connecting two riverbanks in misty morning, ancient stone arch, symbolic of translation between old and new, serene landscape, soft light, ink-wash style", "16:9"),
    "duanju": ("a flowing river dividing naturally around smooth stones, sense of pause and rhythm, calm water, morning mist, minimal poetic landscape", "16:9"),
    "changshi":("an ancient Chinese imperial examination hall with rows of desks, robed scholars writing, grand solemn architecture, warm historical atmosphere, illustration", "16:9"),
    "quote":  ("brush writing elegant classical Chinese calligraphy on rice paper, fresh confident strokes, artistic close up, warm tone", "16:9"),
    "close":  ("sunrise over an ancient Chinese academy courtyard, old pine trees, stone path, hopeful warm light, timeless scholarly serenity, cinematic wide", "16:9"),
}


def build(P):
    d = Deck(THEMES[THEME])

    d.title_hero(P["hero"], "语文 · 高考阅读专题",
                 ["文言文阅读突破", "——从读懂字句到读通文脉"],
                 "实词、虚词、句式、翻译、断句——一套可迁移的解题内功",
                 "HIGH SCHOOL SENIOR · CLASSICAL CHINESE · 45 MIN")

    d.bullets("本课导航 · LESSON MAP", "文言文得分的五个关口", [
        ("一、实词", "一词多义、古今异义、通假、词类活用"),
        ("二、虚词", "之、以、而、其、于——高频虚词的用法辨析"),
        ("三、句式", "判断、被动、省略、倒装，读通特殊句式"),
        ("四、翻译", "字字落实，直译为主，信达为要"),
        ("五、断句", "抓标志、明结构，把句子断准"),
    ], pageno=2)

    d.divider(P["shici"], "01", "实词与虚词", "文言的根基——先过字词关")

    d.two_col("实词 · 四类考点", "实词是文言阅读的地基",
              "四种常见现象", ["一词多义：结合语境定义项，忌生搬硬套",
                          "古今异义：如“妻子”“地方”“可以”，古今大不同",
                          "通假字：音近或形近替代，据音义还原本字",
                          "词类活用：名词作动词、使动、意动、为动"],
              "推断实词五法", ["语境推断：上下文照应",
                          "结构推断：对偶、排比中同位互训",
                          "语法推断：看词在句中充当的成分",
                          "字形推断：形旁表意；联想推断：迁移课内"],
              pageno=3)

    d.image_text(P["juishi"], "虚词 · 化繁为简", "高频虚词怎么记？",
                 ["“之”：作代词、助词（的/取独/宾语前置标志）、动词（往、到）。",
                  "“以”：介词（用、凭、因为）、连词（表目的/结果/修饰）、动词（认为）。",
                  "“而”：连词，辨清并列、承接、递进、转折、修饰五种关系。",
                  "方法：把虚词代回原句，看它连接什么、充当什么——用法自明。"],
                 side="left", pageno=4)

    d.divider(P["fanyi"], "02", "句式与翻译", "读通句子，才谈得上读懂文章")

    d.two_col("句式 · 四种特殊句式", "识别句式，是翻译准确的前提",
              "判断句 & 被动句", ["判断句：“……者，……也”“……，……也”，或用“乃/为/则”",
                            "被动句：“为……所……”“见……于……”，或意念被动",
                            "识别标志词，翻译时补出“是”“被”"],
              "省略句 & 倒装句", ["省略句：省主语、宾语、介词，翻译时括号补全",
                            "倒装句：宾语前置、状语后置、定语后置、主谓倒装",
                            "翻译时按现代汉语语序还原调整"],
              pageno=5)

    d.image_text(P["fanyi"], "翻译 · 六字诀", "字字落实的翻译方法",
                 ["留：人名、地名、官名、年号等专有名词保留不译。",
                  "删：删去无实义的发语词、语气助词（夫、盖、之、也）。",
                  "换：把单音节词换成现代双音节词，古今异义换成今义。",
                  "补：补出省略的成分，使句子完整通顺。",
                  "调：调整倒装语序，符合现代汉语习惯。",
                  "贯：直译为主，个别难句意译贯通，力求“信、达、雅”。"],
                 side="right", pageno=6)

    d.quote("古之学者必有师。师者，所以传道受业解惑也。",
            "—— 韩愈《师说》· 判断句式，开宗明义，气象堂正", img=P["quote"])

    d.image_text(P["duanju"], "断句 · 抓标志", "没有标点，如何断句？",
                 ["先通文意：读懂大意再断，切忌见词就断。",
                  "抓名代：主语、宾语（人名、地名、官名）常在句首句尾，前后可断。",
                  "抓虚词：“夫、盖、故”常在句首；“也、矣、乎、焉”常在句尾。",
                  "抓对称：排比、对偶结构整齐，可据句式对称处断开。",
                  "抓对话：“曰”“云”后多为引语，是断句的明显标志。"],
                 side="left", pageno=7)

    d.two_col("内容 · 概括与分析", "读懂文脉，答对信息题",
              "常见题型", ["文言实词/虚词辨析（选择）",
                        "断句（选择或主观）",
                        "文化常识判断",
                        "内容理解与概括分析（选择）"],
              "概括分析题避坑", ["张冠李戴：把甲的事安到乙头上",
                           "无中生有：选项添加原文没有的信息",
                           "曲解文意：故意错译关键词",
                           "时序颠倒：把事件先后顺序弄反"],
              pageno=8)

    d.bullets("解题 · 通用流程", "拿到一篇文言文，这样读", [
        ("速读通大意", "抓人物、事件、时间线，建立整体印象"),
        ("借题读文", "先看概括分析题，用选项帮助理解原文"),
        ("字词精推断", "遇难词用五法推断，联系课内已学"),
        ("翻译六字诀", "字字落实、语序还原，踩准采分点"),
        ("断句抓标志", "文意为先，虚词名代对称为辅"),
    ], pageno=9)

    d.closing(P["close"], "读通文言，是与古人对话的能力",
              ["文言文没有捷径，却有方法——课内实词虚词是根，规范方法是干，多读多译是枝叶。",
               "把课本读透，把方法用熟，那些看似艰深的字句，终会在你眼前豁然开朗。"],
              "语文组 · 高三文言专题 · 下课")

    return d

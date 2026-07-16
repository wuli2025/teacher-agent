# -*- coding: utf-8 -*-
"""语文 · 高考现代文阅读·小说 (约45分钟)"""
from engine import Deck, THEMES

THEME = "poetry"
IMAGES = {
    "hero":   ("a cozy reading nook with an open novel, a rain-streaked window, warm lamplight, teacup, immersive storytelling mood, soft cinematic light, painterly, literary atmosphere", "16:9"),
    "renwu":  ("a thoughtful portrait of an ordinary person by a window, expressive face revealing inner emotion, warm rembrandt lighting, novelistic character study, painterly", "16:9"),
    "qingjie":("a winding mountain road with unexpected turns rising through mist, symbolic of plot twists and rising tension, dramatic soft light, cinematic landscape", "16:9"),
    "huanjing":("a lonely small town street at dusk in the rain, glowing shop lights reflected on wet pavement, atmospheric moody environment, cinematic literary mood", "16:9"),
    "zhuti":  ("a single lit candle in a dark room casting warm light, symbolic of theme and meaning emerging, contemplative minimal, painterly still life", "16:9"),
    "answer": ("an organized desk with reading notes, highlighted book pages and a pen, warm daylight, sense of analytical method and clarity, scholarly still life", "16:9"),
    "quote":  ("brush writing elegant Chinese calligraphy on paper beside an open literary book, warm artistic close up, soft background", "16:9"),
    "close":  ("a person closing a book and looking out toward a bright window with warm sunrise light, sense of understanding and reflection, cinematic hopeful, painterly", "16:9"),
}


def build(P):
    d = Deck(THEMES[THEME])

    d.title_hero(P["hero"], "语文 · 现代文阅读",
                 ["小说阅读", "——读懂人物、情节与那颗跳动的主题之心"],
                 "从三要素到叙事艺术，把“会读”变成“会答”",
                 "HIGH SCHOOL SENIOR · FICTION READING · 45 MIN")

    d.bullets("本课导航 · LESSON MAP", "小说阅读的五个核心", [
        ("一、人物形象", "概括性格，分析塑造手法与作用"),
        ("二、情节结构", "梳理脉络，分析情节的作用与技巧"),
        ("三、环境描写", "自然与社会环境的多重功能"),
        ("四、主题意蕴", "由表及里，读懂作者的深层表达"),
        ("五、叙事艺术", "视角、顺序、语言——现代命题的新宠"),
    ], pageno=2)

    d.divider(P["renwu"], "01", "人物形象", "小说的核心，永远是人")

    d.two_col("人物 · 分析范式", "怎样分析一个人物形象？",
              "概括性格三步", ["找依据：从人物的言行、心理、外貌中提取信息",
                          "作分析：由具体表现推断性格特征",
                          "扣文本：结论紧扣原文，忌贴标签、空概括"],
              "塑造手法", ["正面描写：肖像、语言、动作、心理、神态",
                        "侧面烘托：以他人、环境、情节反衬",
                        "细节描写：一个动作、一件小物见人物之魂"],
              pageno=3)

    d.image_text(P["renwu"], "人物 · 作用题", "这个人物在文中有什么作用？",
                 ["主要人物：承载主题，作者借其命运表达思想情感。",
                  "次要人物：衬托主角、推动情节、渲染氛围、见证叙事。",
                  "“我”的作用：作为线索串联全文，增强真实感与代入感。",
                  "答法：从情节、人物（主角）、主题三个维度分点作答。"],
                 side="right", pageno=4)

    d.divider(P["qingjie"], "02", "情节与环境", "故事怎样展开，世界怎样铺陈")

    d.two_col("情节 · 结构与作用", "情节不只是“发生了什么”",
              "情节手法", ["线索：明线暗线、单线复线，串起全文",
                        "技巧：伏笔、铺垫、悬念、突转、照应",
                        "结尾：欧·亨利式突转、戛然而止、留白"],
              "情节作用四角度", ["对情节：推动发展、制造波澜",
                           "对人物：表现或丰富人物性格",
                           "对主题：暗示、深化、揭示主旨",
                           "对读者：设置悬念、引发思考"],
              pageno=5)

    d.image_text(P["huanjing"], "环境 · 描写的功能", "环境从来不是背景板",
                 ["自然环境：交代时间地点、渲染气氛、烘托心情、暗示社会背景。",
                  "社会环境：交代时代与人物关系，揭示人物命运的根源。",
                  "推动情节：特定环境常成为事件发生的契机或转折。",
                  "深化主题：环境往往是主题的象征与投射，切忌只答“交代背景”。"],
                 side="left", pageno=6)

    d.quote("悲剧就是把有价值的东西毁灭给人看。",
            "—— 鲁迅 · 读小说，要读出人物命运背后的那份深意", img=P["quote"])

    d.divider(P["zhuti"], "03", "主题与叙事", "读到最后，作者到底想说什么")

    d.image_text(P["zhuti"], "主题 · 由表及里", "怎样准确把握主题？",
                 ["从人物命运看：主角的遭遇与结局往往指向作者的态度。",
                  "从情节冲突看：矛盾冲突的实质，常是主题的所在。",
                  "从环境背景看：时代与社会背景暗示主题的深广。",
                  "从标题细节看：标题、反复出现的意象往往是主题的钥匙。",
                  "表述要有分寸：既不拔高，也不矮化，忠于文本作合理解读。"],
                 side="right", pageno=7)

    d.two_col("叙事艺术 · 新题型", "现代命题越来越考“怎么讲故事”",
              "叙事视角与人称", ["第一人称：真实亲切，便于抒情，但视野受限",
                           "第三人称：全知视角，自由灵活，客观全面",
                           "视角转换：丰富层次，制造张力"],
              "叙事顺序与语言", ["顺叙、倒叙、插叙、补叙各有其用",
                           "叙事节奏：详略、快慢控制阅读体验",
                           "语言风格：质朴、幽默、冷峻、诗化——各成韵味"],
              pageno=8)

    d.bullets("答题 · 通用心法", "小说题这样拿分", [
        ("先通读", "把握情节脉络与人物关系，建立整体感"),
        ("审题型", "判断考人物、情节、环境还是主题，对症下药"),
        ("多角度", "作用题从情节、人物、主题、读者多维展开"),
        ("扣文本", "任何结论都要有原文依据，引词句佐证"),
        ("分点答", "术语准确、要点清晰，按分值给足要点"),
    ], pageno=9)

    d.closing(P["close"], "读懂一篇小说，就是读懂一段人生",
              ["小说阅读考的是共情与思辨——既要走进人物的悲欢，也要跳出来看清作者的匠心。",
               "多读经典，多做规范训练，你会发现：那些文字里，藏着理解世界的另一种方式。"],
              "语文组 · 高三小说专题 · 下课")

    return d

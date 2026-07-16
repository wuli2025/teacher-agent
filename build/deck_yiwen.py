# -*- coding: utf-8 -*-
"""语文 · 高考议论文写作提升 (约45分钟)"""
from engine import Deck, THEMES

THEME = "poetry"
IMAGES = {
    "hero":   ("Chinese ink-wash painting style, a scholar's desk by a bright window, open scroll, brush and inkstone, morning light, distant misty mountains, elegant and intellectual atmosphere, wide cinematic, refined brushwork", "16:9"),
    "shenti": ("a person standing before many diverging mountain paths at dawn, choosing a direction, symbolic of decision and interpretation, soft light, contemplative mood, painterly illustration", "16:9"),
    "liyi":   ("a single strong tree with deep roots and one clear tall trunk reaching to bright sky, other thin crooked saplings around it, metaphor for a clear central idea, serene, ink and light watercolor", "16:9"),
    "jiegou": ("architectural blueprint of a grand elegant pavilion, clean geometric structure, pillars and beams, drafting lines, warm parchment tone, sense of order and framework, minimal", "16:9"),
    "skeleton":("an elegant temple pavilion under construction showing its clean wooden frame and pillars against a soft sky, exposed structural beams, symbol of essay structure, warm light, refined illustration", "16:9"),
    "lunzheng":("a courtroom-like scholarly debate scene in ancient China, two robed scholars reasoning with gestures, scrolls and evidence on a table, warm lamplight, dignified, ink illustration", "16:9"),
    "sucai":  ("an old library with towering shelves of ancient bound books, a warm reading lamp, dust motes in a shaft of light, treasure of knowledge and materials, cozy scholarly, painterly", "16:9"),
    "quote":  ("close up of a brush writing elegant Chinese calligraphy on rice paper, fresh ink strokes, soft focus background, artistic, warm tone", "16:9"),
    "yugan":  ("a bright winding road leading up a hill toward a glowing sunrise, cypress trees along the way, hopeful uplifting mood, cinematic wide landscape, warm golden light", "16:9"),
}


def build(P):
    d = Deck(THEMES[THEME])

    d.title_hero(P["hero"], "语文 · 高考写作专题",
                 ["议论文写作提升", "——把观点写得清楚、深刻、有力"],
                 "从审题立意到语言升格，搭一座能得高分的思辨之桥",
                 "HIGH SCHOOL SENIOR · ARGUMENTATIVE WRITING · 45 MIN")

    d.bullets("本课导航 · LESSON MAP", "这节课我们要解决五个问题", [
        ("一、审题立意", "读懂材料，找准角度，让立意“准、深、新”"),
        ("二、结构搭建", "掌握并列式、递进式、对照式三种经典骨架"),
        ("三、论证方法", "举例、引用、对比、比喻——把道理讲透"),
        ("四、素材运用", "同一素材如何多角度化用，避免堆砌"),
        ("五、语言升格", "让句子有思辨的张力与文采的光泽"),
    ], pageno=2)

    d.divider(P["shenti"], "01", "审题立意", "写作的第一颗纽扣——扣错了，满盘皆输")

    d.image_text(P["shenti"], "审题 · 三步法", "怎样读懂一则材料？",
                 ["第一步 · 抓关键：圈出材料中的核心词与关系词，找出对象与话题。",
                  "第二步 · 明关系：辨清材料中概念的关系——是并列、因果，还是对立、递进？",
                  "第三步 · 定角度：由果溯因、由现象到本质，追问“为什么”“怎么办”，锁定最能写深的角度。",
                  "一句话检验：把你的观点浓缩成一个判断句，若能斩钉截铁地说出来，立意就立住了。"],
                 side="left", pageno=3)

    d.two_col("立意 · 高下之分", "好立意的三个层次：准、深、新",
              "三个层次", ["准：不偏题、不泛化，紧扣材料核心",
                        "深：透过现象看本质，追问因果与价值",
                        "新：换角度、破常规，写出人所未见"],
              "四种常见失误", ["脱离材料，自说自话",
                          "面面俱到，观点游移",
                          "以叙代议，例多理少",
                          "口号堆砌，空喊无据"],
              pageno=4)

    d.divider(P["jiegou"], "02", "结构搭建", "好文章是“搭”出来的——先有骨架，再有血肉")

    d.two_col("结构 · 三种经典骨架", "选一种结构，把思路立起来",
              "并列式 & 递进式", ["并列式：从不同侧面并列展开，用“是什么/为什么/怎么办”统领分论点",
                            "递进式：由浅入深、层层推进，分论点之间有逻辑台阶",
                            "适合：论题内涵丰富、需要多角度或深层剖析"],
              "对照式 & 总分总", ["对照式：正反对比，在破立之间凸显观点",
                             "总分总：开门见山提出中心论点，中间分论点支撑，结尾升华",
                             "口诀：凤头、猪肚、豹尾——开头亮、中间实、结尾响"],
              pageno=5)

    d.fullbleed_caption(P["skeleton"],
                        "议论文的骨架 · 中心论点统领，三个分论点支撑，事实与道理充实血肉",
                        "分论点要“并列而不重复、递进而有梯度”，每段首句即观点，段中即论证",
                        pageno=6)

    d.divider(P["lunzheng"], "03", "论证方法", "有观点还不够——要让人心服口服")

    d.two_col("论证 · 四种利器", "把道理讲透的四种方法",
              "举例 & 引用", ["举例论证：事实胜于雄辩，例子要典型、简洁、扣题",
                          "引用论证：借名言、经典增强权威，引后必须有分析",
                          "切忌：例子一摆就完，缺少“分析扣题”的临门一脚"],
              "对比 & 比喻", ["对比论证：正反、古今、中外对照，观点在反差中鲜明",
                          "比喻论证：化抽象为形象，把深理讲得通俗可感",
                          "叠加使用：一段之内多法并用，论证更立体有力"],
              pageno=7)

    d.image_text(P["lunzheng"], "分论点 · 写法示范", "一个好段落长什么样？",
                 ["观点句：段首亮出分论点，一句话说清本段要证明什么。",
                  "阐释句：一两句解释这个观点，界定内涵，避免空泛。",
                  "材料句：摆事实或引名言，材料紧扣观点，简洁不拖沓。",
                  "分析句：这是关键——揭示材料与观点的逻辑联系，回扣中心。",
                  "小结句：收束本段，呼应分论点，自然过渡到下一段。"],
                 side="right", pageno=8)

    d.quote("文章合为时而著，歌诗合为事而作。",
            "—— 白居易 · 好的议论，永远回应着时代与现实的追问", img=P["quote"])

    d.image_text(P["sucai"], "素材 · 一材多用", "让积累真正变成分数",
                 ["同一素材可从不同角度切入：司马迁受辱著《史记》，既可论“坚韧”，也可论“选择”“价值”。",
                  "用材三原则：贴合观点、点到为止、夹叙夹议——叙述为分析服务，绝不为叙而叙。",
                  "新鲜与厚度并重：既要有时事热点显思考，也要有经典人物见底蕴。",
                  "建立你的“素材本”：按主题分类（家国、奋斗、理性、担当……），考场信手拈来。"],
                 side="left", pageno=9)

    d.two_col("语言 · 升格三招", "让句子有思辨的张力与文采",
              "让说理更有力", ["用整句造气势：排比、对偶让论证节奏铿锵",
                          "用关联词显逻辑：“不是……而是……”“惟其……才……”",
                          "多用判断句：把观点说得斩钉截铁、掷地有声"],
              "让文字更有味", ["善用比喻与化用：把道理写得可感可触",
                          "适度引用诗文：一句恰当的引用胜过十句空话",
                          "克制而精准：删去空洞形容词，留下有分量的表达"],
              pageno=10)

    d.bullets("考场 · 满分自检清单", "落笔前后，问自己这几个问题", [
        ("立意准不准？", "观点是否紧扣材料，能否用一句判断句说清"),
        ("结构清不清？", "是否有明确的中心论点与三个分论点，层次分明"),
        ("论证透不透？", "每个例子后是否有分析，有没有“摆而不议”"),
        ("素材新不新？", "是否避开人尽皆知的滥例，有没有自己的思考"),
        ("语言亮不亮？", "开头结尾是否出彩，有没有一两处令人眼前一亮的句子"),
    ], pageno=11)

    d.closing(P["yugan"], "把观点写清楚，就是把思想擦亮",
              ["议论文考的从来不只是文采，而是你如何看待世界、如何有理有据地说服他人。",
               "从今天起：多读、多思、多写、多改——让每一次落笔，都离“清楚、深刻、有力”更近一步。"],
              "语文组 · 高三写作专题 · 下课")

    return d

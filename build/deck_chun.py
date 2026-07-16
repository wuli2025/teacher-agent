# -*- coding: utf-8 -*-
"""语文 · 朱自清《春》 精读课 (约46分钟)"""
from engine import Deck, THEMES
from pptx.enum.text import PP_ALIGN

THEME = "spring"
IMAGES = {
    "hero":   ("Chinese classical painting, lush spring meadow at dawn, peach and willow trees, soft golden mist, a winding river, rolling green hills, poetic serene atmosphere, delicate brushwork, wide cinematic", "16:9"),
    "grass":  ("close up of tender green spring grass sprouting through soil, morning dew drops, soft bokeh sunlight, fresh vivid green, macro nature photography, gentle warm light", "16:9"),
    "flowers":("a hillside full of blooming peach apricot and pear flowers, pink white and red blossoms, bees flying, bright spring sunshine, vibrant colorful, dreamy soft focus", "16:9"),
    "wind":   ("willow branches swaying in gentle spring breeze beside a river, petals drifting in the air, birds flying, warm afternoon light, impressionist painterly style, tranquil", "16:9"),
    "rain":   ("fine gentle spring rain over a quiet Chinese village, misty green fields, glistening wet leaves, a lone lamp glowing, oil paint texture, soft muted atmosphere, poetic", "16:9"),
    "people": ("Chinese countryside in early spring, people of all ages flying kites and walking on the fields, children playing, hopeful bright sky, warm folk-art illustration, lively", "16:9"),
    "author": ("elegant vintage study desk with an open book, ink brush, teacup, warm lamplight, 1930s Chinese scholar atmosphere, nostalgic sepia tones, quiet and refined", "16:9"),
    "child":  ("a newborn baby taking first steps in a sunlit spring garden, symbol of new life and hope, warm tender illustration, glowing backlight, joyful", "16:9"),
    "close":  ("panoramic spring landscape at golden hour, endless green fields, blossoming trees, a bright road leading to the horizon, hopeful uplifting mood, cinematic wide shot", "16:9"),
}


def build(P):
    d = Deck(THEMES[THEME])
    C = d.t

    d.title_hero(P["hero"], "语文 · 现代散文精读",
                 ["朱自清《春》", "——盼望着，盼望着"],
                 "一堂关于生命、希望与美的语言课", "PART OF THE MODERN PROSE SERIES · 45 MIN")

    d.bullets("本课导航 · LESSON MAP", "这节课我们要做什么", [
        ("一、走近作者与文章", "了解朱自清其人，把握写作背景与情感基调"),
        ("二、整体感知·理清结构", "盼春—绘春—赞春，梳理文章的脉络"),
        ("三、品读五幅春景图", "春草、春花、春风、春雨、迎春图逐一赏析"),
        ("四、赏析语言之美", "比喻、拟人、叠词与感官描写的妙处"),
        ("五、诵读与拓展写作", "有感情朗读，仿写属于你的季节"),
    ], pageno=2)

    d.image_text(P["author"], "AUTHOR · 作者名片", "朱自清与他的散文",
                 ["朱自清（1898—1948），原名自华，字佩弦，现代著名散文家、诗人、学者。",
                  "他的散文清新质朴、感情真挚，善于在平凡景物中寄托深情，代表作有《背影》《荷塘月色》《春》等。",
                  "《春》写于20世纪30年代，是一篇写景抒情的经典散文，字里行间洋溢着对生命与希望的礼赞。"],
                 side="left", pageno=3)

    d.divider(P["grass"], "01", "整体感知", "盼春 · 绘春 · 赞春——一篇文章的三重呼吸")

    d.two_col("STRUCTURE · 文章结构", "文章是怎样谋篇布局的？",
              "三大板块", ["盼春（开篇）：反复呼唤，奠定期盼与喜悦的基调",
                        "绘春（主体）：五幅画面，多角度描绘春天",
                        "赞春（结尾）：三个比喻，升华对春的赞美"],
              "五幅春景图", ["春草图 · 生机勃勃", "春花图 · 姹紫嫣红",
                         "春风图 · 和煦轻柔", "春雨图 · 细密宁静", "迎春图 · 人勤春早"],
              pageno=4)

    d.quote("盼望着，盼望着，东风来了，春天的脚步近了。",
            "—— 开篇 · 反复与拟人，写尽急切的期盼", img=P["hero"])

    d.divider(P["flowers"], "02", "品读五幅春景图", "跟着朱自清，用五种感官走进春天")

    d.image_text(P["grass"], "画面一 · 春草图", "小草偷偷地钻出来",
                 ["“小草偷偷地从土里钻出来，嫩嫩的，绿绿的。”",
                  "“偷偷地”“钻”把小草写活了——拟人手法赋予它顽皮的生命力。",
                  "叠词“嫩嫩的、绿绿的”突出质感与色彩，读来轻快而富有节奏。",
                  "由草及人：“坐着，躺着，打两个滚……”侧面烘托春草带来的欢乐。"],
                 side="left", pageno=5)

    d.image_text(P["flowers"], "画面二 · 春花图", "花下成千成百的蜜蜂",
                 ["“红的像火，粉的像霞，白的像雪。”——三个比喻，绘出繁花的色彩与热烈。",
                  "由高到低、由实到虚：树上繁花、花下蜜蜂蝴蝶、遍地野花，层次分明。",
                  "“闹”字传神——不只写声音，更写出春天的生机与喧腾。",
                  "调动视觉、听觉、嗅觉，多感官交织，画面立体可感。"],
                 side="right", pageno=6)

    d.fullbleed_caption(P["wind"], "画面三 · 春风图 · “像母亲的手抚摸着你”",
                        "以触觉写无形之风，再借泥土味、青草味、鸟鸣与笛声，让春风可闻、可听、可感",
                        pageno=7)

    d.image_text(P["rain"], "画面四 · 春雨图", "像牛毛，像花针，像细丝",
                 ["三个比喻连用，写出春雨细密、闪亮、绵长的特点。",
                  "“一层薄烟”“绿得发亮”“青得逼你的眼”——雨中景物朦胧而清新。",
                  "由景及人：撑伞的行人、披蓑戴笠的农夫、静默的房屋，宁静而温情。",
                  "动静结合，为喧闹的春天添上一笔沉静的诗意。"],
                 side="left", pageno=8)

    d.image_text(P["people"], "画面五 · 迎春图", "一年之计在于春",
                 ["由自然之春转向人事之春：城里乡下，家家户户，老老小小都出来了。",
                  "“舒活舒活筋骨，抖擞抖擞精神”——叠词连用，写出蓬勃的干劲。",
                  "引用俗语“一年之计在于春”，点明珍惜时光、奋发向上的主题。",
                  "画面由景入情，为下文的“赞春”蓄势。"],
                 side="right", pageno=9)

    d.divider(P["child"], "03", "赏析语言之美", "为什么这些句子，读一遍就忘不掉？")

    d.cards("LANGUAGE · 语言赏析", "四种让文字活起来的手法", [
        ("比喻", "“红的像火，粉的像霞，白的像雪”——化抽象为具体，让色彩与情态跃然纸上。"),
        ("拟人", "“小草偷偷地钻”“春天的脚步近了”——赋予景物以人的情态，亲切生动。"),
        ("叠词", "“嫩嫩的、绿绿的、轻悄悄、软绵绵”——增强节奏感与画面的质感。"),
        ("排比", "结尾三喻连排，层层递进，把赞美之情推向高潮。"),
    ], cols=2, pageno=10)

    d.quote("春天像刚落地的娃娃，从头到脚都是新的，它生长着。",
            "—— 结尾三喻之一 · 新生 · 美丽 · 力量", img=P["child"])

    d.two_col("THEME · 主旨探究", "朱自清究竟在“赞”什么？",
              "写的是春", ["生机勃勃的自然春景", "五幅画面，多感官交织",
                        "细腻传神的语言艺术"],
              "赞的是情", ["对生命萌发的欣喜", "对希望与未来的憧憬",
                        "催人奋进、珍惜光阴的力量"],
              pageno=11)

    d.bullets("ACTIVITY · 课堂活动", "诵读 · 品味 · 表达", [
        ("① 有感情朗读（8分钟）", "分组朗读五幅春景图，注意语速、重音与情感起伏"),
        ("② 找一找、品一品（6分钟）", "各组选一处最打动你的句子，说说妙在哪里"),
        ("③ 小练笔·仿写（10分钟）", "仿照本文，写一段你眼中的“夏”或“秋”，至少用两种修辞"),
    ], img=P["wind"], pageno=12)

    d.cards("WRITING · 仿写支架", "照着这个“脚手架”写，就不难", [
        ("第一步 · 定基调", "用反复或拟人开头，先喊出你对这个季节的情感。"),
        ("第二步 · 绘画面", "选2—3个典型景物，调动视觉、听觉、触觉去描写。"),
        ("第三步 · 用修辞", "至少一处比喻、一处拟人，试着用上叠词。"),
        ("第四步 · 抒真情", "结尾用一个比喻收束，让景物承载你的心情。"),
    ], cols=2, pageno=13)

    d.closing(P["close"], "一年之计在于春",
              ["愿你像春草一样，偷偷地、努力地生长；",
               "像春花一样，热烈而坦率地绽放。",
               "作业：完成仿写练笔，并背诵课文第4—5自然段。"],
              "语文 · 现代散文精读系列 · 朱自清《春》")

    return d

# -*- coding: utf-8 -*-
"""语文 · 山水田园诗鉴赏 (约46分钟)"""
from engine import Deck, THEMES

THEME = "poetry"
IMAGES = {
    "hero":   ("majestic Chinese ink wash landscape painting, towering misty mountains, a waterfall, pine trees, a small pavilion, a scholar gazing, vast serene atmosphere, traditional shan shui, elegant negative space", "16:9"),
    "wangwei":("tranquil empty mountain forest after rain, moonlight filtering through pines, a clear spring flowing over stones, Chinese ink painting style, meditative peaceful, soft green and grey tones", "16:9"),
    "taoqian":("idyllic Chinese pastoral scene, a thatched cottage among chrysanthemums, distant southern mountains, a farmer with a hoe returning at dusk, warm autumn light, folk painting, peaceful", "16:9"),
    "libai":   ("dramatic waterfall plunging down a towering misty cliff on Mount Lu, sunlight creating a purple haze, romantic grand scale, Chinese classical painting, awe-inspiring", "16:9"),
    "menghr": ("a quiet riverside village at dusk, a lone boat moored under willow trees, mist over calm water, a traveler gazing at the distant sky, melancholic poetic ink wash, twilight", "16:9"),
    "mountain":("layered mountain ranges in morning fog, sea of clouds, sunrise glow on peaks, epic vast Chinese landscape photography, tranquil and sublime", "16:9"),
    "field":  ("terraced rice fields and pastoral farmland in soft light, a water buffalo, scattered farmhouses, birds, idyllic rural China, gentle warm palette, serene", "16:9"),
    "brush":  ("elegant close up of a Chinese calligraphy brush writing a poem on rice paper, ink stone, seal, warm lamplight, refined scholarly still life, artistic", "16:9"),
    "close":  ("a lone scholar standing on a mountain peak overlooking a vast sea of clouds at sunrise, sense of transcendence and freedom, Chinese landscape painting, inspiring wide shot", "16:9"),
}


def build(P):
    d = Deck(THEMES[THEME])

    d.title_hero(P["hero"], "语文 · 古典诗词鉴赏",
                 ["山水田园诗", "——诗中有画，画中有诗"],
                 "从王维到陶渊明，读懂中国人的山水情怀", "CLASSICAL CHINESE POETRY · 45 MIN")

    d.bullets("本课导航 · LESSON MAP", "我们将一起完成", [
        ("一、什么是山水田园诗", "厘清概念、源流与两大流派"),
        ("二、精读四首名作", "王维、陶渊明、李白、孟浩然，一诗一境"),
        ("三、掌握鉴赏方法", "意象—意境—情感，三步读懂一首诗"),
        ("四、体会诗中哲思", "山水之中，古人安放了怎样的心灵"),
        ("五、诵读与创作", "吟诵名句，尝试写景抒情的小诗"),
    ], pageno=2)

    d.image_text(P["brush"], "CONCEPT · 概念界定", "何谓山水田园诗？",
                 ["山水田园诗，是以自然山水与乡村田园为主要描写对象的诗歌。",
                  "山水诗多写名山大川的壮丽与清幽，代表诗人如谢灵运、王维、李白。",
                  "田园诗多写农村生活的恬淡与安宁，代表诗人如陶渊明、孟浩然、范成大。",
                  "它们共同的追求：在自然中寄托情感，于景物中体悟人生。"],
                 side="left", pageno=3)

    d.two_col("SCHOOLS · 两大流派", "山水与田园，气质有何不同？",
              "山水诗", ["描绘名山胜水，气象开阔", "追求清幽、雄奇之境",
                       "多含隐逸、超脱之思", "代表：王维、李白、谢灵运"],
              "田园诗", ["描绘农事村居，质朴亲切", "追求恬淡、宁静之趣",
                       "多含归隐、知足之乐", "代表：陶渊明、孟浩然"],
              pageno=4)

    d.divider(P["wangwei"], "01", "王维 · 《山居秋暝》", "空山新雨后，天气晚来秋")

    d.quote("空山新雨后，天气晚来秋。\n明月松间照，清泉石上流。",
            "—— 王维《山居秋暝》 · “诗中有画”的典范", img=P["wangwei"])

    d.bullets("READING · 精读", "王维如何“以画入诗”", [
        ("动静结合", "“明月松间照”是静，“清泉石上流”是动，一幅有声有色的山居图"),
        ("视听交织", "明月清泉是视觉，泉声竹喧是听觉，画面立体可感"),
        ("以景写心", "空明澄澈的山景，正映照诗人淡泊宁静的心境"),
        ("尾联言志", "“随意春芳歇，王孙自可留”——甘愿归隐山林的情怀"),
    ], img=P["wangwei"], pageno=5)

    d.divider(P["taoqian"], "02", "陶渊明 · 《饮酒·其五》", "采菊东篱下，悠然见南山")

    d.image_text(P["taoqian"], "田园之祖 · 陶渊明", "心远地自偏",
                 ["“结庐在人境，而无车马喧。问君何能尔？心远地自偏。”",
                  "身处人世，却不闻喧嚣——不是环境偏远，而是内心超脱。",
                  "“采菊东篱下，悠然见南山”——一个“见”字，写出不期而遇的自然与从容。",
                  "“此中有真意，欲辨已忘言”——最高的领悟，往往超越语言。"],
                 side="left", pageno=6)

    d.quote("采菊东篱下，悠然见南山。\n此中有真意，欲辨已忘言。",
            "—— 陶渊明《饮酒·其五》 · 田园诗的巅峰", img=P["taoqian"])

    d.divider(P["libai"], "03", "李白 · 《望庐山瀑布》", "飞流直下三千尺，疑是银河落九天")

    d.bullets("READING · 精读", "李白的浪漫与夸张", [
        ("夸张之美", "“三千尺”“落九天”——极度夸张，写尽瀑布的磅礴气势"),
        ("想象奇绝", "把瀑布想象成从天而降的银河，天马行空"),
        ("色彩壮丽", "“日照香炉生紫烟”——阳光、水汽、紫烟，画面绚烂"),
        ("诗如其人", "豪放飘逸的诗风，正是李白个性的写照"),
    ], img=P["libai"], pageno=7)

    d.fullbleed_caption(P["libai"], "“飞流直下三千尺，疑是银河落九天。”",
                        "同是写山水，王维清幽、陶潜恬淡、李白豪放——诗风即人格", pageno=8)

    d.divider(P["menghr"], "04", "孟浩然 · 《宿建德江》", "野旷天低树，江清月近人")

    d.image_text(P["menghr"], "田园与羁旅之间", "江清月近人",
                 ["“移舟泊烟渚，日暮客愁新。”——日暮泊舟，愁绪悄然而生。",
                  "“野旷天低树，江清月近人。”——旷野无垠，天似乎比树还低；江水清澈，明月仿佛与人相亲。",
                  "以景写愁：越是空旷宁静，越显游子内心的孤独。",
                  "情景交融，是山水诗最动人的境界。"],
                 side="left", pageno=9)

    d.divider(P["brush"], "05", "鉴赏方法总结", "三步读懂一首山水田园诗")

    d.cards("METHOD · 鉴赏三步法", "意象 → 意境 → 情感", [
        ("第一步 · 抓意象", "圈出诗中的景物：明月、松、泉、菊、南山……它们是情感的载体。"),
        ("第二步 · 想意境", "把意象连成画面，感受整体氛围是清幽、恬淡还是雄奇。"),
        ("第三步 · 悟情感", "由景入情，体会诗人寄托的隐逸、超脱、乡愁或豪情。"),
        ("小贴士 · 知人论世", "结合诗人生平与时代背景，理解会更深一层。"),
    ], cols=2, pageno=10)

    d.two_col("COMPARE · 对比赏析", "四首诗，四种心境",
              "境·景", ["王维：空山明月，清幽", "陶潜：东篱南山，恬淡",
                      "李白：飞瀑银河，雄奇", "孟浩然：野旷江清，孤寂"],
              "情·志", ["王维：淡泊归隐", "陶潜：超然物外",
                      "李白：豪放洒脱", "孟浩然：羁旅乡愁"],
              pageno=11)

    d.statement("山水，是古人安放心灵的地方。",
                "读山水田园诗，就是在读中国人对自由、宁静与本真的永恒向往。")

    d.bullets("ACTIVITY · 课堂活动", "吟 · 品 · 写", [
        ("① 配乐诵读（8分钟）", "任选一首，读出它的节奏与情感，同学互评"),
        ("② 意境描绘（8分钟）", "用自己的话把一联诗改写成一段写景文字"),
        ("③ 小诗创作（10分钟）", "以“校园的清晨”为题，写四句写景抒情的小诗"),
    ], img=P["field"], pageno=12)

    d.closing(P["close"], "诗中有画，画中有诗",
              ["愿你在山水之间，读懂古人的从容与辽阔；",
               "也在喧嚣之外，为自己留一片“心远地自偏”的天地。",
               "作业：背诵《山居秋暝》，完成一首写景小诗。"],
              "语文 · 古典诗词鉴赏系列 · 山水田园诗")

    return d

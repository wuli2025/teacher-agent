# -*- coding: utf-8 -*-
"""为 15 篇 AI 教案范例生成封面图（文生图，MiniMax image-01）。

为什么换掉原来的 SVG 封面：原封面是脚本按学科主色画的「假纸张」——把标题又印了一遍
（卡片下方已经有标题，重复）、右下角还漏出了内部 docId（lesson_math_ellip…），
15 张长得几乎一样，整面案例墙是一片白。

新封面的设计约束（成组感比单张好看更重要）：
  · 统一版画/编辑插画语言 + 统一配色（深靛蓝 / 青 / 琥珀 / 米白），15 张放一起像一套；
  · 每张一个与课题直接相关的**单一主体**，一眼能认出学科；
  · 不出现任何文字、字母、数字、汉字 —— 标题由卡片下方的原生文本负责；
  · 左上角与右下角要留白：那两处压着「学段」和「字数」两个徽标。

用法：python scripts/gen-lesson-covers.py [docId ...]   # 不给参数则全生成（已存在的跳过）
      python scripts/gen-lesson-covers.py --force lesson_math_derivative
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(REPO, "mathkit", "texkit"))

OUT = os.path.join(REPO, "public", "sample-covers")

# 全组共用的视觉语言。放在每条提示词后面，保证 15 张是「一套」。
STYLE = (", flat editorial vector illustration, limited palette of deep indigo navy, "
         "teal green and warm amber on a soft cream background, subtle paper grain, "
         "one single centered subject, thick clean shapes, calm and elegant, "
         "generous empty margins especially in the top-left and bottom-right corners, "
         "16:9 horizontal, no text, no letters, no numbers, no chinese characters, "
         "no calligraphy glyphs, no watermark, no logo, no ui, no border frame, "
         # 实测：不这么写死，模型会给统计图配上刻度数字和图注（image-01 的 prompt_optimizer
         # 会自行补细节），那就违反了「封面不得含文字数字」这条
         "no axis, no tick marks, no axis labels, no caption, no legend, nothing written, "
         # 实测还冒出过角落里的印章/签名小图形，一并禁掉
         "no stamp, no seal, no signature, no artist mark in any corner")

COVERS = {
    # ── 数学 5 ──
    "lesson_math_derivative":
        "one single smooth wave-like curved line sweeping across the middle of the picture, "
        "and one perfectly straight horizontal bar resting flat exactly on the curve's highest "
        "point and touching it at a single solid dot; the straight bar is clearly separate "
        "from the curve",
    "lesson_math_ellipse_chord":
        "one complete unbroken oval ring, wide and low like a stretched circle, drawn as an "
        "even outline all the way round; one perfectly straight slender line runs right "
        "through the oval from its left edge to its right edge, and three small solid dots "
        "sit on that line: one where it meets the left edge, one at its middle, one where it "
        "meets the right edge",
    "lesson_math_series_sum":
        "a row of upright rectangular blocks of steadily decreasing height, slightly offset "
        "from each other like staggered dominoes about to be summed",
    "lesson_math_trig_identity":
        "a circle with one radius arm pointing up-right, and a smooth sine wave unrolling "
        "horizontally from the circle to the right",
    "lesson_math_distribution":
        "a symmetric bell-shaped curved line drawn over a row of plain upright bars that rise "
        "to one tall bar in the middle and fall away on both sides, floating on empty "
        "background with nothing beneath them",
    # ── 英语 4 ──
    "lesson_english_continuation":
        "an open book whose right-hand pages lift off and turn into a flowing ribbon that "
        "curves away into the distance",
    "lesson_english_grammar_fill":
        "a horizontal strip with several empty rectangular slots, and a few jigsaw puzzle "
        "pieces floating just above, ready to drop into the slots",
    "lesson_english_inference":
        "a magnifying glass hovering over several overlapping sheets of paper, thin arrows "
        "linking small marks on different sheets",
    "lesson_english_summary":
        "a wide funnel with many small scattered shapes pouring in at the top and one single "
        "compact rounded block coming out at the bottom",
    # ── 语文 2 ──
    "lesson_chinese_poetry_diction":
        "a single expressive ink brush stroke forming a slender plum branch with three small "
        "blossoms, and one ink drop below it, an ink brush resting nearby",
    "lesson_chinese_classical_translation":
        "a partially unrolled bamboo slip scroll lying flat, its slats clearly visible but "
        "completely blank, with an ink brush resting across it",
    # ── 政治 1 ──
    "lesson_politics_contradiction":
        "two large curved arcs of contrasting color interlocking and balancing each other in "
        "a circular composition, neither one dominating",
    # ── 历史 1 ──
    "lesson_history_xinhai":
        "a long horizontal timeline arrow on aged paper with one prominent circular node "
        "marking a turning point, the line changing color after that node",
    # ── 地理 1 ──
    "lesson_geography_weather_system":
        "a weather map seen from above: one long curved boundary line sweeping across the "
        "picture with small solid triangles spaced along one side of it and small semicircular "
        "bumps along the other side, plus a set of closed concentric oval rings nested around "
        "a single point beside the line",
    # ── 物理 1 ──
    "lesson_physics_magnetic_field":
        "concentric curved magnetic field lines looping around a horizontal bar magnet, with "
        "one small particle tracing a circular path among the field lines",
}


def main():
    args = [a for a in sys.argv[1:]]
    force = "--force" in args
    if force:
        args.remove("--force")
    todo = {k: v + STYLE for k, v in COVERS.items() if not args or k in args}
    if not todo:
        print("没有匹配的 docId"); sys.exit(2)
    from genimg import gen_all
    gen_all(todo, OUT, force=force)
    print(f"完成 {len(todo)} 张 → {OUT}")


if __name__ == "__main__":
    main()

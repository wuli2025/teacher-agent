# -*- coding: utf-8 -*-
"""逐步解题页（累积式）—— 从参考课件《高中数学解题步骤演示_Manim逐步版》吸取的核心能力。

参考课件的做法：同一题连续多页，题目区固定，解题过程逐页累积一行；
左栏是当前步的大号序号 + 步骤标题 + 一句注解，右栏是已完成步骤的公式清单。
好处是**不依赖 PPT 动画**，任何播放器、任何打印稿都能按步讲，翻页即推进。

相对参考课件的三处改进（参考课件实测存在这些毛病）：
  1. 参考课件把整屏（步骤标题、示意图、公式）烘成一张大 PNG，标题文字压在示意图上；
     这里改为「原生文本 + 逐条公式 PNG」，标题/注解永远可编辑，各自独立定位，不会互相压。
  2. 参考课件为了让 LaTeX 好渲染，把说明写成英文（coordinates → normal vectors、θ is obtuse）；
     这里中文说明走 PPT 原生文本，公式内的中文走 KaTeX \\text{}，全中文课堂可读。
  3. 步骤累积超出正文区时自动开新屏并写「承上」，绝不把行距或字号压小硬塞。
"""
import os
import sys

from pptx.util import Inches, Pt
from pptx.enum.shapes import MSO_SHAPE

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from theme import (INK, INK_SOFT, MUTED, CYAN, CORAL, AMBER, BG2, RULE, WHITE,
                   FONT, MARGIN_L, MARGIN_R, CONTENT_W, BODY_TOP, BODY_BOTTOM,
                   PT_BODY, H_INK, H_CORAL, H_CYAN)
from slides import LayoutError

TEX_PT = 20          # 步骤公式目标字号
ROW_GAP = 0.12       # 公式行之间的间隙
LEFT_W = 3.20        # 左栏（序号 + 当前步标题 + 注解）宽度
GUTTER = 0.42        # 左右栏之间的留白（含竖分隔线）
PT_HEAD = 21
PT_NOTE = 18
PT_STEMNOTE = 17


class StepProblem:
    """一道题的逐步讲解。

    steps 里每一项：
        {"head": "步骤小标题", "tex": [r"...", ...], "note": "一句口头解释(可空)",
         "final": True/False,  "speak": "只进讲者备注的话(可空)"}
    """

    def __init__(self, pool, no, kind, title, stem, steps, tag=None, stem_note=None):
        self.pool, self.no, self.kind, self.title = pool, no, kind, title
        self.stem, self.stem_note, self.steps = stem, stem_note, steps
        self.tag = tag or kind
        # 每条公式登记两份：常态深蓝 + 当前步高亮（结论步用珊瑚红，其余用青）
        for st in steps:
            st["_h_norm"] = [pool.add(t, pt=TEX_PT, color=H_INK) for t in st.get("tex", [])]
            hi = H_CORAL if st.get("final") else H_CYAN
            st["_h_hi"] = [pool.add(t, pt=TEX_PT, color=hi) for t in st.get("tex", [])]

    # ── 高度测算 ──
    def _rows_h(self, st):
        """一步在右栏占的高度（只算公式行）。"""
        h = 0.0
        for tid in st["_h_norm"]:
            h += self.pool.size_in(tid)[1] + ROW_GAP
        return h

    # 题目卡刻意做成「标签与题干同一行」的窄条：题干区每页固定，但不能吃掉右栏的累积空间，
    # 否则一道 5 步的题会被切成两屏，「累积」这个最有价值的效果就没了。
    # stem_note 因此只进讲者备注，不占版面。
    STEM_LABEL_W = 0.95

    def _stem_h(self, deck, w):
        return 0.14 + deck.measure_text_h(
            self.stem, PT_BODY, w - 0.32 - self.STEM_LABEL_W, spacing=1.24,
            space_after=0) + 0.14

    # ── 出页 ──
    def emit(self, deck):
        """把这道题铺成若干页，返回生成的页数。"""
        stem_h = self._stem_h(deck, CONTENT_W)
        top = BODY_TOP + stem_h + 0.30
        avail = BODY_BOTTOM - top

        # 按右栏可用高度把步骤切屏
        screens, cur, used = [], [], 0.0
        for i, st in enumerate(self.steps):
            h = self._rows_h(st)
            if cur and used + h > avail:
                screens.append(cur)
                # 新屏顶部要留出「衔接行」（上一屏最后一步）的高度
                cur, used = [], self._rows_h(self.steps[cur[-1]])
            cur.append(i); used += h
        if cur:
            screens.append(cur)
        # 末屏只剩 1 步而前一屏 ≥3 步时前移一步，避免出现「一页只有一行」的空页
        if len(screens) >= 2 and len(screens[-1]) == 1 and len(screens[-2]) >= 3:
            screens[-1].insert(0, screens[-2].pop())

        total = len(self.steps)
        done = 0
        for si, sc in enumerate(screens):
            # 跨屏时把上一屏的最后一步带过来做衔接，新屏才不会只剩孤零零一行
            carry = screens[si - 1][-1] if si > 0 else None
            for k in range(1, len(sc) + 1):
                done += 1
                self._page(deck, sc[:k], sc[k - 1], done, total, si, sc[0], stem_h, top, carry)
        return sum(len(s) for s in screens)

    def _page(self, deck, shown, cur_idx, done, total, screen_i, first_idx, stem_h, top,
              carry=None):
        s = deck.blank(purpose=f"题{self.no}·步骤{done}")
        deck.header(s, f"题 {self.no}　{self.title}", kicker=f"解题步骤演示 · {self.kind}",
                    tag=f"STEP {done:02d} / {total:02d}", tag_color=CYAN)

        # ── 题目卡（每页固定，位置一模一样）──
        y = BODY_TOP
        deck.card(s, MARGIN_L, y, CONTENT_W, stem_h, fill=BG2, line=RULE, bar=AMBER)
        deck.label(s, MARGIN_L + 0.16, y + 0.20, self.STEM_LABEL_W, "题目", pt=15, color=AMBER)
        deck.para(s, MARGIN_L + 0.16 + self.STEM_LABEL_W, y + 0.14,
                  CONTENT_W - 0.32 - self.STEM_LABEL_W, self.stem,
                  pt=PT_BODY, color=INK, spacing=1.24)

        cur = self.steps[cur_idx]
        hi = CORAL if cur.get("final") else CYAN

        # ── 左栏：大号序号 + 当前步标题 + 注解 ──
        ly = top
        deck.text(s, MARGIN_L, ly - 0.10, LEFT_W, 0.80, f"{cur_idx + 1:02d}",
                  pt=46, color=AMBER, bold=True, spacing=1.0, space_after=0,
                  wrap_text=False, role="h1")
        ly += 0.84
        ly += deck.para(s, MARGIN_L, ly, LEFT_W, cur["head"], pt=PT_HEAD, color=hi,
                        bold=True, spacing=1.16) + 0.14
        if cur.get("note"):
            # 左栏注解是短语标签而非句子：去掉句末句号，避免 PowerPoint 把孤零零一个「。」
            # 挤到第二行（它在中英混排处不做避头尾）
            cur["note"] = cur["note"].rstrip("。")
            nh = deck.measure_text_h(cur["note"], PT_NOTE, LEFT_W, spacing=1.26,
                                     space_after=0)
            if ly + nh > BODY_BOTTOM:
                raise LayoutError(
                    f"题{self.no} 第{cur_idx+1}步 左栏注解放不下（需到 {ly+nh:.2f} > {BODY_BOTTOM}）：\n"
                    f"  «{cur['note']}»\n"
                    f"  这条注解请压到 {int((BODY_BOTTOM-ly)/nh*len(cur['note']))} 字以内，"
                    f"详细说法放进 speak（讲者备注）。")
            deck.para(s, MARGIN_L, ly, LEFT_W, cur["note"], pt=PT_NOTE, color=MUTED,
                      spacing=1.26, role="cap")
        deck.vrule(s, MARGIN_L + LEFT_W + GUTTER / 2, top - 0.06, BODY_BOTTOM - top + 0.06)

        # ── 右栏：累积的公式行 ──
        rx = MARGIN_L + LEFT_W + GUTTER
        rw = CONTENT_W - LEFT_W - GUTTER
        ry = top
        rows = shown
        if screen_i > 0:
            deck.label(s, rx, ry - 0.36, 7.2,
                       f"（承上）前 {first_idx} 步已完成，下面第 {first_idx} 步为衔接",
                       pt=15, color=MUTED, bold=False, role="cap")
            if carry is not None:
                rows = [carry] + list(shown)
        for i in rows:
            st = self.steps[i]
            is_cur = (i == cur_idx)
            for j, _t in enumerate(st.get("tex", [])):
                tid = (st["_h_hi"] if is_cur else st["_h_norm"])[j]
                th = self.pool.size_in(tid)[1]
                if j == 0:
                    d = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(rx), Inches(ry + th / 2 - 0.07),
                                           Inches(0.14), Inches(0.14))
                    d.name = "tag_dot"
                    d.fill.solid()
                    d.fill.fore_color.rgb = (CORAL if st.get("final") else CYAN) if is_cur else RULE
                    d.line.fill.background(); d.shadow.inherit = False
                self.pool.place(s, tid, rx + 0.32, ry, max_w=rw - 0.34, min_pt=16,
                                name=f"tex_p{self.no}_s{i+1}_{j}")
                ry += th + ROW_GAP

        if ry > BODY_BOTTOM + 0.08:
            raise LayoutError(f"题{self.no} 第{done}步 右栏溢出（底 {ry:.2f} > {BODY_BOTTOM}）")

        note = f"【题 {self.no}·第 {done}/{total} 步】{cur['head']}\n"
        if self.stem_note:
            note += f"（本题定位）{self.stem_note}\n"
        note += (cur.get("speak") or "") + ("\n" + cur["note"] if cur.get("note") else "")
        deck.notes(s, note)
        return s

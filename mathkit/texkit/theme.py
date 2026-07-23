# -*- coding: utf-8 -*-
"""高中数学课件统一视觉规范（goal 第四节配色/字号/安全区的唯一真源）。

所有 build 脚本必须 import 本模块取色取字号，不得就地写死，保证整套课件同一副面孔。
"""
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor

# ───────────────────────── 配色（goal 第四节 3.） ─────────────────────────
INK      = RGBColor(0x14, 0x2B, 0x50)   # 主文字：深蓝
INK_SOFT = RGBColor(0x3D, 0x54, 0x74)   # 次要文字（深蓝调浅）
MUTED    = RGBColor(0x6B, 0x7A, 0x8C)   # 弱化说明
CYAN     = RGBColor(0x0E, 0x7C, 0x86)   # 概念强调：青
CORAL    = RGBColor(0xE0, 0x53, 0x4B)   # 重点结论：珊瑚红
AMBER    = RGBColor(0xC8, 0x86, 0x1E)   # 辅助强调：琥珀
BG       = RGBColor(0xFF, 0xFF, 0xFF)   # 背景：白
BG2      = RGBColor(0xF5, 0xF7, 0xFA)   # 极浅灰（卡片底）
RULE     = RGBColor(0xD6, 0xDD, 0xE6)   # 分隔线
WHITE    = RGBColor(0xFF, 0xFF, 0xFF)

HEX = lambda c: "#%02X%02X%02X" % (c[0], c[1], c[2])
H_INK, H_CYAN, H_CORAL, H_AMBER, H_MUTED = HEX(INK), HEX(CYAN), HEX(CORAL), HEX(AMBER), HEX(MUTED)

# ───────────────────────── 字体 ─────────────────────────
# 只用本机确实装了的字体，避免 PowerPoint 回退导致字宽变化 → 溢出。
FONT    = "Microsoft YaHei"        # 正文/标题（黑体系，投影可读性最好）
FONT_EN = "Microsoft YaHei"

# ───────────────────────── 画布与安全区 ─────────────────────────
SLIDE_W_IN, SLIDE_H_IN = 13.333, 7.5           # 16:9
MARGIN_L, MARGIN_R = 0.75, 0.75
CONTENT_W = SLIDE_W_IN - MARGIN_L - MARGIN_R   # 11.833
TITLE_Y   = 0.42                                # 标题基线（全套统一）
TITLE_H   = 0.72
RULE_Y    = 1.22                                # 标题下分隔线
BODY_TOP  = 1.52                                # 正文区上沿
FOOTER_Y  = 6.86                                # 页脚区上沿 —— 正文不得越过
BODY_BOTTOM = 6.70                              # 正文区下沿（留 0.16 缓冲）
BODY_H    = BODY_BOTTOM - BODY_TOP              # 5.18

# ───────────────────────── 字号（投影下限） ─────────────────────────
PT_TITLE   = 30
PT_H2      = 24
PT_BODY    = 21
PT_SMALL   = 18      # 仅用于卡片副说明/页脚，正文正文不得用
PT_FOOTER  = 12
PT_MIN_BODY = 20     # 正文硬下限
PT_TEX_DISPLAY = 30  # 独立展示公式的目标字号
PT_TEX_INLINE  = 22  # 行内/步骤条公式目标字号

# 文本框内边距（goal 第四节 6.：文字不能贴框）
PAD_L = Inches(0.20)
PAD_R = Inches(0.20)
PAD_T = Inches(0.05)
PAD_B = Inches(0.05)

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""高中数学动画课件生成器 → polaris.slides.json(喂 Rust 原生引擎 pptx_native.rs)。

为什么用程序生成:数学图(函数曲线/几何构造)的坐标必须精确,程序采样 sin/x²/椭圆等
远比手写 JSON 靠谱;单击逐步动画(click)也能成体系地编排。每份≥32 页、每页带讲者备注、
≥6 个矢量动画图,目标单周目 50 分钟。
"""
import json
import math
import os

CANVAS_W, CANVAS_H = 1280, 720
OUT = os.path.join(os.path.dirname(__file__), "specs")
os.makedirs(OUT, exist_ok=True)

# ────────────────────────── 通用盒子/幻灯片 ──────────────────────────

def txt(x, y, w, h, text=None, lines=None, size=18, color="ink", align="l",
        anchor="t", bold=False, italic=False, click=0):
    b = {"type": "text", "x": x, "y": y, "w": w, "h": h, "size": size,
         "color": color, "align": align, "anchor": anchor}
    if bold: b["bold"] = True
    if italic: b["italic"] = True
    if lines is not None: b["lines"] = lines
    else: b["text"] = text if text is not None else ""
    if click: b["click"] = click
    return b

def rect(x, y, w, h, color="accent", click=0):
    b = {"type": "rect", "x": x, "y": y, "w": w, "h": h, "color": color}
    if click: b["click"] = click
    return b

def card(x, y, w, h, click=0):
    b = {"type": "card", "x": x, "y": y, "w": w, "h": h}
    if click: b["click"] = click
    return b

def line(x1, y1, x2, y2, color="ink", width=3, dash=False, arrow=False, click=0):
    t = "arrow" if arrow else "line"
    b = {"type": t, "x": x1, "y": y1, "x2": x2, "y2": y2, "color": color, "width": width}
    if dash: b["dash"] = True
    if click: b["click"] = click
    return b

def curve(points, color="accent", width=4, closed=False, fill=None, click=0):
    b = {"type": "polygon" if closed else "curve",
         "points": [[round(px), round(py)] for px, py in points],
         "color": color, "width": width}
    if fill: b["fill"] = fill
    if click: b["click"] = click
    return b

def dot(x, y, r=7, fill="#D64545", click=0):
    b = {"type": "point", "x": round(x), "y": round(y), "r": r, "fill": fill}
    if click: b["click"] = click
    return b

def circ(cx, cy, r, color="ink", width=3, fill=None, click=0):
    b = {"type": "circle", "x": round(cx), "y": round(cy), "r": round(r), "color": color, "width": width}
    if fill: b["fill"] = fill
    if click: b["click"] = click
    return b

def free(boxes, notes=None):
    s = {"layout": "freeform", "boxes": boxes}
    if notes: s["notes"] = notes
    return s

def title(t, sub="", kicker="", notes=None):
    s = {"layout": "title", "title": t, "subtitle": sub, "kicker": kicker}
    if notes: s["notes"] = notes
    return s

def section(t, kicker="", notes=None):
    s = {"layout": "section", "title": t, "kicker": kicker}
    if notes: s["notes"] = notes
    return s

def bullets(t, points, notes=None):
    s = {"layout": "bullets", "title": t, "points": points}
    if notes: s["notes"] = notes
    return s

def twocol(t, lhead, lpts, rhead, rpts, notes=None):
    s = {"layout": "two-col", "title": t,
         "left": {"head": lhead, "points": lpts},
         "right": {"head": rhead, "points": rpts}}
    if notes: s["notes"] = notes
    return s

def compare(t, items, notes=None):
    s = {"layout": "compare", "title": t, "items": items}
    if notes: s["notes"] = notes
    return s

def stats(t, items, notes=None):
    s = {"layout": "stats", "title": t, "items": items}
    if notes: s["notes"] = notes
    return s

def timeline(t, steps, notes=None):
    s = {"layout": "timeline", "title": t, "steps": steps}
    if notes: s["notes"] = notes
    return s

def quote(text, by="", notes=None):
    s = {"layout": "quote", "text": text, "by": by}
    if notes: s["notes"] = notes
    return s

def closing(t, sub="", notes=None):
    s = {"layout": "closing", "title": t, "subtitle": sub}
    if notes: s["notes"] = notes
    return s

# ────────────────────────── 坐标系(数学→画布 px) ──────────────────────────

class Axes:
    """把数学坐标映射到画布像素。ox/oy=原点像素;sx/sy=每单位像素(y 向上为正)。"""
    def __init__(self, ox=340, oy=560, sx=60, sy=60):
        self.ox, self.oy, self.sx, self.sy = ox, oy, sx, sy

    def P(self, mx, my):
        return (self.ox + mx * self.sx, self.oy - my * self.sy)

    def axis_boxes(self, xmin, xmax, ymin, ymax, click=1, color="ink",
                   xlabel="x", ylabel="y"):
        x0 = self.ox + xmin * self.sx
        x1 = self.ox + xmax * self.sx
        y0 = self.oy - ymin * self.sy
        y1 = self.oy - ymax * self.sy
        bs = [
            line(x0 - 15, self.oy, x1 + 25, self.oy, color=color, width=3, arrow=True, click=click),
            line(self.ox, y0 + 15, self.ox, y1 - 25, color=color, width=3, arrow=True, click=click),
            txt(x1 + 10, self.oy + 8, 30, 26, xlabel, size=16, color=color, italic=True, click=click),
            txt(self.ox - 30, y1 - 26, 30, 26, ylabel, size=16, color=color, italic=True, click=click),
            txt(self.ox - 26, self.oy + 6, 22, 22, "O", size=15, color=color, click=click),
        ]
        return bs

    def plot(self, f, xmin, xmax, click, color="accent", width=4, n=60):
        pts = []
        for i in range(n + 1):
            mx = xmin + (xmax - xmin) * i / n
            try:
                my = f(mx)
            except Exception:
                continue
            pts.append(self.P(mx, my))
        return curve(pts, color=color, width=width, click=click)

    def poly_pts(self, math_pts):
        return [self.P(mx, my) for mx, my in math_pts]

    def pt(self, mx, my, click=0, r=7, fill="#D64545"):
        px, py = self.P(mx, my)
        return dot(px, py, r=r, fill=fill, click=click)

    def seg(self, m1, m2, click=0, color="ink", width=3, dash=False, arrow=False):
        x1, y1 = self.P(*m1); x2, y2 = self.P(*m2)
        return line(x1, y1, x2, y2, color=color, width=width, dash=dash, arrow=arrow, click=click)

    def label(self, mx, my, text, dx=8, dy=-28, click=0, size=16, color="ink", bold=False):
        px, py = self.P(mx, my)
        return txt(px + dx, py + dy, 160, 26, text, size=size, color=color, bold=bold, click=click)

# ────────────────────────── 页面小工具 ──────────────────────────

def figtitle(t):
    return txt(60, 34, 1160, 44, t, size=26, color="ink", bold=True)

def underline():
    return rect(60, 86, 70, 4, color="accent")

def note_pad(*parts):
    return "  ".join(p for p in parts if p)

def write_deck(deckid, theme, slides):
    spec = {"theme": theme, "slides": slides}
    path = os.path.join(OUT, f"{deckid}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(spec, f, ensure_ascii=False, indent=1)
    # 自校验合法 JSON
    json.load(open(path, encoding="utf-8"))
    nfree = sum(1 for s in slides if s.get("layout") == "freeform")
    print(f"{deckid}: {len(slides)} 页, {nfree} 个 freeform 图 -> {path}")
    return path

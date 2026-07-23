# -*- coding: utf-8 -*-
"""TexPool：把一份课件里所有 LaTeX 公式一次性交给 KaTeX 渲染成高清透明 PNG，
并按「1 CSS px = 1 pt」的铁律贴进 PPT —— 公式在幻灯片上的字号 = 渲染时给的 font_pt，
宽高由同一个比例因子换算，**不可能被拉伸变形**。

用法：
    pool = TexPool(cache_dir)
    h = pool.add(r"\\lim_{x\\to x_0}f(x)=A", pt=30, color=H_INK)
    ...                       # 收集完整份课件的公式
    pool.render()             # 只起一次浏览器，批量渲染 + 落盘缓存
    pool.place(slide, h, x=0.8, y=2.0, max_w=11.8)   # 贴图（等比，绝不拉伸）

渲染失败（KaTeX 报错/包围盒为空）会在 render() 里直接抛异常并打印出错公式，
绝不静默跳过 —— 这就是「公式不会乱」的兜底。
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys

from pptx.util import Inches

HERE = os.path.dirname(os.path.abspath(__file__))
RENDERER = os.path.join(HERE, "render_tex.mjs")


class TexError(RuntimeError):
    pass


class TexPool:
    def __init__(self, cache_dir, scale=4):
        """cache_dir: 公式 PNG 落盘目录（同时是缓存，按内容 hash 命名，改公式才重渲）。
        scale: 截图倍率。4 → 30pt 的公式 PNG 有效 288 DPI，投影/打印都够。"""
        self.cache_dir = os.path.abspath(cache_dir)
        os.makedirs(self.cache_dir, exist_ok=True)
        self.scale = scale
        self._items = {}     # id -> spec
        self._info = {}      # id -> {file,w,h,cssW,cssH}
        self._loaded = False

    # ── 收集 ──────────────────────────────────────────────
    def add(self, tex, pt=30, color="#142B50", display=True, max_pt_width=11.0):
        """登记一条公式，返回句柄(id)。
        pt          : 公式在幻灯片上的目标字号（= 渲染时的 CSS font-size）
        max_pt_width: 允许的最大排版宽度（英寸），超出会在 render 时告警并等比缩小
        """
        tex = tex.strip()
        key = hashlib.sha1(
            f"v3|{tex}|{pt}|{color}|{int(display)}|{self.scale}".encode("utf-8")
        ).hexdigest()[:16]
        tid = "f_" + key
        if tid not in self._items:
            self._items[tid] = {
                "id": tid, "tex": tex, "display": bool(display),
                "color": color, "fontPx": float(pt),
                "maxWidthPx": int(max_pt_width * 72),
            }
        return tid

    # ── 渲染 ──────────────────────────────────────────────
    def render(self, force=False):
        todo = []
        for tid, spec in self._items.items():
            png = os.path.join(self.cache_dir, tid + ".png")
            meta = os.path.join(self.cache_dir, tid + ".json")
            if not force and os.path.exists(png) and os.path.exists(meta):
                self._info[tid] = json.load(open(meta, encoding="utf-8"))
                continue
            todo.append(spec)

        if todo:
            man = {"outDir": self.cache_dir, "scale": self.scale, "items": todo}
            mpath = os.path.join(self.cache_dir, "_manifest.json")
            with open(mpath, "w", encoding="utf-8") as f:
                json.dump(man, f, ensure_ascii=False, indent=1)
            node = shutil.which("node") or r"C:\Program Files\nodejs\node.exe"
            r = subprocess.run([node, RENDERER, mpath], capture_output=True, text=True,
                               encoding="utf-8", errors="replace")
            sys.stdout.write(r.stdout or "")
            if r.returncode != 0:
                sys.stderr.write(r.stderr or "")
                raise TexError("KaTeX 渲染失败，见上方 ✗ 行（不允许跳过，请修 LaTeX 或换等价写法）")
            rep = json.load(open(os.path.join(self.cache_dir, "_render_report.json"), encoding="utf-8"))
            for it in rep:
                if not it.get("ok"):
                    raise TexError(f"{it['id']} 渲染失败: {it.get('error')}\n  {it.get('tex')}")
                info = {k: it[k] for k in ("file", "w", "h", "cssW", "cssH", "scale")}
                info["tex"] = it["tex"]
                self._info[it["id"]] = info
                with open(os.path.join(self.cache_dir, it["id"] + ".json"), "w", encoding="utf-8") as f:
                    json.dump(info, f, ensure_ascii=False)
        self._loaded = True
        return self

    # ── 尺寸查询 ──────────────────────────────────────────
    def size_in(self, tid):
        """公式按目标字号排版时的 (宽, 高)，单位英寸。1 CSS px = 1 pt = 1/72 in。
        高度由 **PNG 真实像素比** 反算，而不是各自四舍五入的 cssW/cssH —— 否则
        显示宽高比会跟原图差千分之几，被变形检测判成拉伸。"""
        i = self._info[tid]
        w_in = i["cssW"] / 72.0
        return w_in, w_in * (i["h"] / float(i["w"]))

    def info(self, tid):
        return self._info[tid]

    # ── 贴图 ──────────────────────────────────────────────
    def place(self, slide, tid, x, y, max_w=None, max_h=None, align="l", valign="t",
              min_pt=18, name=None):
        """把公式贴进幻灯片。等比缩放，绝不拉伸。
        align: l/ctr/r —— 在 [x, x+max_w] 区间内的水平对齐
        valign: t/ctr/b —— 在 [y, y+max_h] 区间内的垂直对齐
        若因宽/高受限缩到有效字号 < min_pt，直接报错（宁可重排版，也不让公式变小看不清）。
        """
        if not self._loaded:
            raise TexError("先调用 pool.render() 再 place()")
        w_in, h_in = self.size_in(tid)
        k = 1.0
        if max_w and w_in > max_w:
            k = min(k, max_w / w_in)
        if max_h and h_in > max_h:
            k = min(k, max_h / h_in)
        eff_pt = self._items[tid]["fontPx"] * k if tid in self._items else 999
        if k < 1.0 and eff_pt < min_pt:
            raise TexError(
                f"公式 {tid} 需缩到 {eff_pt:.1f}pt(<{min_pt}pt) 才放得下：\n"
                f"  {self._info[tid]['tex']}\n"
                f"  可用区 {max_w}×{max_h} in，公式实际 {w_in:.2f}×{h_in:.2f} in。"
                f"  请拆行(\\\\)、降 pt、或加宽版面。")
        pw, ph = w_in * k, h_in * k
        ox = x
        if max_w:
            if align == "ctr":
                ox = x + (max_w - pw) / 2.0
            elif align == "r":
                ox = x + (max_w - pw)
        oy = y
        if max_h:
            if valign == "ctr":
                oy = y + (max_h - ph) / 2.0
            elif valign == "b":
                oy = y + (max_h - ph)
        pic = slide.shapes.add_picture(self._info[tid]["file"], Inches(ox), Inches(oy),
                                       width=Inches(pw), height=Inches(ph))
        if name:
            pic.name = name
        return pic

# -*- coding: utf-8 -*-
"""本文件由 texkit/export_manim.py 自动生成 —— 课件里全部公式的 Manim 源码。

运行前提：pip install manim 且本机装有 LaTeX（MiKTeX / TeX Live）。
渲染 16:9 4K PNG：
    manim -sqh --format=png -r 3840,2160 scenes.py <SceneName>
一次全渲：
    manim -sqh --format=png -r 3840,2160 scenes.py -a
颜色沿用课件配色：主文字深蓝 #142B50，概念青 #0E7C86，结论珊瑚红 #E0534B。
"""
from manim import *

INK, CYAN, CORAL = "#142B50", "#0E7C86", "#E0534B"


class _Base(Scene):
    TEX = r""
    COLOR = INK

    def construct(self):
        self.camera.background_color = WHITE
        m = MathTex(self.TEX, color=self.COLOR)
        m.scale_to_fit_width(min(config.frame_width * 0.9,
                                 m.width * 6))      # 宽度不超过画面 90%
        if m.height > config.frame_height * 0.8:
            m.scale_to_fit_height(config.frame_height * 0.8)
        self.add(m)


class F001_int02biglx21bigrmathrmdx(_Base):
    """PNG: f_0cf07d7b4ccb072a.png  2168×288px"""
    TEX = r"""\int_{0}^{2}\bigl|x^{2}-1\bigr|\mathrm{d}x=\int_{0}^{1}\left(1-x^{2}\right)\mathrm{d}x+\int_{1}^{2}\left(x^{2}-1\right)\mathrm{d}x"""
    COLOR = "#142B50"


class F002_intbafintabf(_Base):
    """PNG: f_1aa69fa125afeba9.png  800×316px"""
    TEX = r"""\int_{b}^{a} f=-\int_{a}^{b} f"""
    COLOR = "#142B50"


class F003_int02x1mathrmdx(_Base):
    """PNG: f_1bfc40226ceaaeb3.png  880×384px"""
    TEX = r"""\int_{0}^{2}(x-1)\,\mathrm{d}x"""
    COLOR = "#142B50"


class F004_AxintaxftmathrmdtLongrig(_Base):
    """PNG: f_216fd3eef031ff95.png  1980×320px"""
    TEX = r"""A(x)=\int_{a}^{x} f(t)\,\mathrm{d}t\ \Longrightarrow\ A'(x)=f(x)"""
    COLOR = "#142B50"


class F005_leftxfracx33right01leftf(_Base):
    """PNG: f_2a675c1f15fcf050.png  1904×312px"""
    TEX = r"""=\left[x-\frac{x^{3}}{3}\right]_{0}^{1}+\left[\frac{x^{3}}{3}-x\right]_{1}^{2}=\frac{2}{3}+\left(\frac{2}{3}+\frac{2}{3}\right)"""
    COLOR = "#142B50"


class F006_int02biglx21bigrmathrmdx(_Base):
    """PNG: f_45f11c1056ededa0.png  844×288px"""
    TEX = r"""\int_{0}^{2}\bigl|x^{2}-1\bigr|\mathrm{d}x=2"""
    COLOR = "#142B50"


class F007_frac1n3cdotfracnn12n16fr(_Base):
    """PNG: f_4a8803c584cf0c56.png  2136×284px"""
    TEX = r"""=\frac{1}{n^{3}}\cdot\frac{n(n+1)(2n+1)}{6}=\frac{1}{6}\left(1+\frac{1}{n}\right)\left(2+\frac{1}{n}\right)"""
    COLOR = "#142B50"


class F008_WintabFxmathrmdx(_Base):
    """PNG: f_4bc48077c4073973.png  1024×364px"""
    TEX = r"""W=\int_{a}^{b} F(x)\,\mathrm{d}x"""
    COLOR = "#142B50"


class F009_int02biglx21bigrmathrmdx(_Base):
    """PNG: f_4e648d86fef67db4.png  1248×300px"""
    TEX = r"""\int_{0}^{2}\bigl|x^{2}-1\bigr|\mathrm{d}x\neq\left[\tfrac{x^{3}}{3}-x\right]_{0}^{2}"""
    COLOR = "#142B50"


class F010_int01x2mathrmdxfrac13(_Base):
    """PNG: f_4ee4350be94731ef.png  668×288px"""
    TEX = r"""\int_{0}^{1}x^{2}\,\mathrm{d}x=\frac{1}{3}"""
    COLOR = "#142B50"


class F011_limntoinftysumi1n(_Base):
    """PNG: f_564d4f806324fa9f.png  564×448px"""
    TEX = r"""\lim_{n\to\infty}\sum_{i=1}^{n}"""
    COLOR = "#142B50"


class F012_intabfxmathrmdxlimntoinf(_Base):
    """PNG: f_56532390e20520f1.png  2268×476px"""
    TEX = r"""\int_{a}^{b} f(x)\,\mathrm{d}x=\lim_{n\to\infty}\sum_{i=1}^{n}f(\xi_i)\cdot\frac{b-a}{n}"""
    COLOR = "#142B50"


class F013_limntoinftySnfrac16cdot1(_Base):
    """PNG: f_581df6a0368d4329.png  1032×244px"""
    TEX = r"""\lim_{n\to\infty}S_n=\frac{1}{6}\cdot 1\cdot 2=\frac{1}{3}"""
    COLOR = "#142B50"


class F014_sintt1t2vtmathrmdtqquade(_Base):
    """PNG: f_5caf1fb07d7692be.png  1900×348px"""
    TEX = r"""s=\int_{t_1}^{t_2} v(t)\,\mathrm{d}t,\qquad \ell=\int_{t_1}^{t_2}\bigl|v(t)\bigr|\,\mathrm{d}t"""
    COLOR = "#142B50"


class F015_Sint01x2mathrmdx(_Base):
    """PNG: f_63b49f4f542d4708.png  1276×432px"""
    TEX = r"""S=\int_{0}^{1}x^{2}\,\mathrm{d}x=\ ?"""
    COLOR = "#142B50"


class F016_Snsumi1nleftfracinright2(_Base):
    """PNG: f_74869a919037e243.png  1396×332px"""
    TEX = r"""S_n=\sum_{i=1}^{n}\left(\frac{i}{n}\right)^{2}\cdot\frac{1}{n}=\frac{1}{n^{3}}\sum_{i=1}^{n} i^{2}"""
    COLOR = "#142B50"


class F017_int01left3x22xrightmathr(_Base):
    """PNG: f_84e9a589783ef821.png  1048×360px"""
    TEX = r"""\int_{0}^{1}\left(3x^{2}+2x\right)\mathrm{d}x"""
    COLOR = "#142B50"


class F018_Deltaxfracban(_Base):
    """PNG: f_a7e419df41ed0de8.png  796×328px"""
    TEX = r"""\Delta x=\frac{b-a}{n}"""
    COLOR = "#142B50"


class F019_biglx21bigrbegincases1x2(_Base):
    """PNG: f_b0356408d110ce65.png  1436×348px"""
    TEX = r"""\bigl|x^{2}-1\bigr|=\begin{cases}1-x^{2}, & 0\le x\le 1\\[2pt]x^{2}-1, & 1<x\le 2\end{cases}"""
    COLOR = "#142B50"


class F020_intabfxmathrmdxFbFabiglF(_Base):
    """PNG: f_b99dcd9c20eb52ef.png  3132×380px"""
    TEX = r"""\int_{a}^{b} f(x)\,\mathrm{d}x=F(b)-F(a)=\bigl[F(x)\bigr]_{a}^{b},\quad F'(x)=f(x)"""
    COLOR = "#142B50"


class F021_F1xxfracx33qquadF2xfracx(_Base):
    """PNG: f_bbaf452019dc40b0.png  1640×260px"""
    TEX = r"""F_1(x)=x-\frac{x^{3}}{3},\qquad F_2(x)=\frac{x^{3}}{3}-x"""
    COLOR = "#142B50"


class F022_Deltaxfrac1nqquadxiifrac(_Base):
    """PNG: f_bd8bc6b37ea660c3.png  1712×244px"""
    TEX = r"""\Delta x=\frac{1}{n},\qquad \xi_i=\frac{i}{n}\quad(i=1,2,\dots,n)"""
    COLOR = "#142B50"


class F023_fxiiDeltax(_Base):
    """PNG: f_c8e2e349e4e08afe.png  596×232px"""
    TEX = r"""f(\xi_i)\,\Delta x"""
    COLOR = "#142B50"


class F024_textstylelimntoinftysumi(_Base):
    """PNG: f_d8087bc1f9cc64b6.png  812×216px"""
    TEX = r"""\textstyle\lim_{n\to\infty}\sum_{i=1}^{n}"""
    COLOR = "#142B50"


class F025_vtt24t30letle3(_Base):
    """PNG: f_ea9d82b4ecd3e43a.png  1564×204px"""
    TEX = r"""v(t)=t^{2}-4t+3\ (0\le t\le 3)"""
    COLOR = "#142B50"


class F026_Stexttexttimestext(_Base):
    """PNG: f_fb8dff940b8c29b4.png  932×216px"""
    TEX = r"""S_{\text{矩形}}=\text{底}\times\text{高}"""
    COLOR = "#142B50"


class F027_Sintabbiglfxbigrmathrmdx(_Base):
    """PNG: f_fd8fedb1081e0b49.png  872×316px"""
    TEX = r"""S=\int_{a}^{b}\bigl|f(x)\bigr|\,\mathrm{d}x"""
    COLOR = "#142B50"

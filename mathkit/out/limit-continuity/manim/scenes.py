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


class F001_limxto0fracxx1neq1(_Base):
    """PNG: f_0707bd52472bb080.png  936×284px"""
    TEX = r"""\lim_{x\to0^{-}}\frac{|x|}{x}=-1\neq 1"""
    COLOR = "#142B50"


class F002_0xadelta(_Base):
    """PNG: f_0c3e5df0b168878d.png  1044×244px"""
    TEX = r"""0<|x-a|<\delta"""
    COLOR = "#142B50"


class F003_existsdelta0(_Base):
    """PNG: f_1130b48deb2f3733.png  540×244px"""
    TEX = r"""\exists\,\delta>0"""
    COLOR = "#142B50"


class F004_fxbegincasesdfracx21x1xn(_Base):
    """PNG: f_1573f326cac9aa17.png  1152×416px"""
    TEX = r"""f(x)=\begin{cases}\dfrac{x^{2}-1}{x-1}, & x\neq 1\\[4pt] a, & x=1\end{cases}"""
    COLOR = "#142B50"


class F005_limxto1fracx21x12(_Base):
    """PNG: f_1b1de6d15b29bf8a.png  776×292px"""
    TEX = r"""\lim_{x\to1}\frac{x^{2}-1}{x-1}=2"""
    COLOR = "#142B50"


class F006_limxtoafxL(_Base):
    """PNG: f_2a5a1699efa2f79d.png  1184×364px"""
    TEX = r"""\lim_{x\to a}f(x)=L"""
    COLOR = "#142B50"


class F007_fxLbigl3x15bigr3x63x2(_Base):
    """PNG: f_303f2fc2c2811236.png  2136×176px"""
    TEX = r"""|f(x)-L|=\bigl|(3x-1)-5\bigr|=|3x-6|=3|x-2|"""
    COLOR = "#142B50"


class F008_limxto1x12limxto1x1(_Base):
    """PNG: f_33cd98ec93daa103.png  1364×212px"""
    TEX = r"""\lim_{x\to1^{-}}(x+1)=2=\lim_{x\to1^{+}}(x+1)"""
    COLOR = "#142B50"


class F009_forallvarepsilon0(_Base):
    """PNG: f_33eec9930630bc68.png  536×244px"""
    TEX = r"""\forall\,\varepsilon>0"""
    COLOR = "#142B50"


class F010_3x2varepsiloniffx2fracva(_Base):
    """PNG: f_341b16a3b55062a5.png  1360×224px"""
    TEX = r"""3|x-2|<\varepsilon\iff|x-2|<\frac{\varepsilon}{3}"""
    COLOR = "#142B50"


class F011_limxto34x57(_Base):
    """PNG: f_3edf4150d38eb540.png  960×256px"""
    TEX = r"""\lim_{x\to 3}(4x-5)=7"""
    COLOR = "#142B50"


class F012_limxtoafxLifflimxtoafxli(_Base):
    """PNG: f_4016f9c46c0f70ac.png  2612×260px"""
    TEX = r"""\lim_{x\to a}f(x)=L\iff\lim_{x\to a^{-}}f(x)=\lim_{x\to a^{+}}f(x)=L"""
    COLOR = "#142B50"


class F013_limxto2fracx24x2(_Base):
    """PNG: f_422e234ea5d8244e.png  716×356px"""
    TEX = r"""\lim_{x\to 2}\frac{x^{2}-4}{x-2}"""
    COLOR = "#142B50"


class F014_limxtoafxLiffforallvarep(_Base):
    """PNG: f_572185a305982ecf.png  4068×256px"""
    TEX = r"""\lim_{x\to a}f(x)=L\iff\forall\,\varepsilon>0,\ \exists\,\delta>0,\ \text{使}\ 0<|x-a|<\delta\Rightarrow|f(x)-L|<\varepsilon"""
    COLOR = "#142B50"


class F015_ftextx1textifflimxto1fxf(_Base):
    """PNG: f_670d62a5961c7b55.png  1876×208px"""
    TEX = r"""f\ \text{在}\ x=1\ \text{连续}\iff\lim_{x\to1}f(x)=f(1)=a"""
    COLOR = "#142B50"


class F016_a2(_Base):
    """PNG: f_74ea6ea3e79cb664.png  328×176px"""
    TEX = r"""a=2"""
    COLOR = "#142B50"


class F017_xto1textfxto(_Base):
    """PNG: f_768667ff5bad85c4.png  1272×244px"""
    TEX = r"""x\to 1\ \text{时}\ f(x)\to\ ?"""
    COLOR = "#142B50"


class F018_textdeltafracvarepsilon3(_Base):
    """PNG: f_7ca6f2a881b46f1f.png  644×224px"""
    TEX = r"""\text{取}\ \delta=\frac{\varepsilon}{3}>0"""
    COLOR = "#142B50"


class F019_limxto0fracsinxx1(_Base):
    """PNG: f_857b221ab840ed41.png  1028×388px"""
    TEX = r"""\lim_{x\to 0}\frac{\sin x}{x}=1"""
    COLOR = "#142B50"


class F020_forallvarepsilon0existsd(_Base):
    """PNG: f_86ce00b4ac09974e.png  2524×176px"""
    TEX = r"""\forall\,\varepsilon>0,\ \exists\,\delta=\tfrac{\varepsilon}{3}>0,\ 0<|x-2|<\delta\Rightarrow|(3x-1)-5|<\varepsilon"""
    COLOR = "#142B50"


class F021_deltafracvarepsilon3text(_Base):
    """PNG: f_998536b4eacb957c.png  608×240px"""
    TEX = r"""\delta=\frac{\varepsilon}{3}\ \text{或}\ \frac{\varepsilon}{4}"""
    COLOR = "#142B50"


class F022_limxto1fracx21x1limxto1f(_Base):
    """PNG: f_9d40d19e9ea60b06.png  2188×268px"""
    TEX = r"""\lim_{x\to1}\frac{x^{2}-1}{x-1}=\lim_{x\to1}\frac{(x+1)(x-1)}{x-1}=\lim_{x\to1}(x+1)=2"""
    COLOR = "#142B50"


class F023_limntoinftyleft1frac1nri(_Base):
    """PNG: f_a2f1988f6c155057.png  1284×408px"""
    TEX = r"""\lim_{n\to\infty}\left(1+\frac{1}{n}\right)^{\!n}=e"""
    COLOR = "#142B50"


class F024_0x2deltaRightarrowfx53x2(_Base):
    """PNG: f_d6fdb1fa4866773d.png  2140×176px"""
    TEX = r"""0<|x-2|<\delta\Rightarrow|f(x)-5|=3|x-2|<3\delta=\varepsilon"""
    COLOR = "#142B50"


class F025_fxfracx21x1quadxneq1(_Base):
    """PNG: f_dbfba272cc94e843.png  1808×420px"""
    TEX = r"""f(x)=\frac{x^{2}-1}{x-1}\quad(x\neq 1)"""
    COLOR = "#142B50"


class F026_fxbegincasesdfracsqrtx11(_Base):
    """PNG: f_e80eac559249f8ed.png  1616×492px"""
    TEX = r"""f(x)=\begin{cases}\dfrac{\sqrt{x+1}-1}{x}, & x>0\\[4pt] a x+2, & x\le 0\end{cases}"""
    COLOR = "#142B50"


class F027_ftextxatextifflimxtoafxf(_Base):
    """PNG: f_ea15aa077301b3c5.png  2396×260px"""
    TEX = r"""f\ \text{在}\ x=a\ \text{处连续}\iff\lim_{x\to a}f(x)=f(a)"""
    COLOR = "#142B50"


class F028_gxlefxlehxtextlimxtoagxl(_Base):
    """PNG: f_fd26e0b74bfd7912.png  3096×224px"""
    TEX = r"""g(x)\le f(x)\le h(x)\ \text{且}\ \lim_{x\to a}g(x)=\lim_{x\to a}h(x)=L\ \Rightarrow\ \lim_{x\to a}f(x)=L"""
    COLOR = "#142B50"

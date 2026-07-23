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


class F001_A000B200C220D020P002(_Base):
    """PNG: f_01dce712af1aa25b.png  2288×176px"""
    TEX = r"""A(0,0,0),\ B(2,0,0),\ C(2,2,0),\ D(0,2,0),\ P(0,0,2)"""
    COLOR = "#142B50"


class F002_x2yz2Rightarrowx22cdot12(_Base):
    """PNG: f_0557f65ca452b9e2.png  1776×176px"""
    TEX = r"""x+2y-z=2\ \Rightarrow\ x=2-2\cdot 1+2=2"""
    COLOR = "#142B50"


class F003_xyz212(_Base):
    """PNG: f_0a500c1455159c33.png  916×176px"""
    TEX = r"""(x,\,y,\,z)=(2,\,1,\,2)"""
    COLOR = "#142B50"


class F004_leftbeginarraycccc121221(_Base):
    """PNG: f_18ead367216dc55a.png  1040×400px"""
    TEX = r"""\left[\begin{array}{ccc|c}1&2&-1&2\\ 2&-1&3&9\\ -1&1&2&3\end{array}\right]"""
    COLOR = "#142B50"


class F005_Sn2Sn1222cdots2n1ncdot2n(_Base):
    """PNG: f_1c2e22a3ebe9dbe3.png  1920×176px"""
    TEX = r"""S_n-2S_n=1+2+2^{2}+\cdots+2^{\,n-1}-n\cdot 2^{\,n}"""
    COLOR = "#142B50"


class F006_vecPB202vecBC020Rightarr(_Base):
    """PNG: f_206345e6febe5c17.png  2152×176px"""
    TEX = r"""\vec{PB}=(2,0,-2),\ \vec{BC}=(0,2,0)\ \Rightarrow\ \vec n_1=(1,0,1)"""
    COLOR = "#142B50"


class F007_Snsumk1nkcdot2k1(_Base):
    """PNG: f_341a087b42af1163.png  800×336px"""
    TEX = r"""S_n=\sum_{k=1}^{n}k\cdot 2^{\,k-1}"""
    COLOR = "#142B50"


class F008_angleBtextPCtextDtextRig(_Base):
    """PNG: f_37f33397a9cee70a.png  2080×244px"""
    TEX = r"""\angle(B\text{-}PC\text{-}D)\ \text{为钝角}\ \Rightarrow\ \cos\angle(B\text{-}PC\text{-}D)=-\frac{1}{2}"""
    COLOR = "#142B50"


class F009_vecPD022vecDC200Rightarr(_Base):
    """PNG: f_43dbafc53b65432c.png  2160×176px"""
    TEX = r"""\vec{PD}=(0,2,-2),\ \vec{DC}=(2,0,0)\ \Rightarrow\ \vec n_2=(0,1,1)"""
    COLOR = "#142B50"


class F010_Sn12cdot23cdot22cdotsncd(_Base):
    """PNG: f_49931472ba120130.png  1660×176px"""
    TEX = r"""S_n=1+2\cdot 2+3\cdot 2^{2}+\cdots+n\cdot 2^{\,n-1}"""
    COLOR = "#142B50"


class F011_Snfrac12n12ncdot2n2n1ncd(_Base):
    """PNG: f_5ca72cc209f56c42.png  1816×256px"""
    TEX = r"""-S_n=\frac{1-2^{\,n}}{1-2}-n\cdot 2^{\,n}=2^{\,n}-1-n\cdot 2^{\,n}"""
    COLOR = "#142B50"


class F012_Snn12n1(_Base):
    """PNG: f_84a96f79e8020e5b.png  924×176px"""
    TEX = r"""S_n=(n-1)\,2^{\,n}+1"""
    COLOR = "#142B50"


class F013_xrightarrowr22r1r3r1left(_Base):
    """PNG: f_895b3fbc7d40ddac.png  1516×400px"""
    TEX = r"""\xrightarrow{\;r_2-2r_1,\ r_3+r_1\;}\left[\begin{array}{ccc|c}1&2&-1&2\\ 0&-5&5&5\\ 0&3&1&5\end{array}\right]"""
    COLOR = "#142B50"


class F014_2Sn1cdot22cdot22cdotsn12(_Base):
    """PNG: f_a97467feb6211d2b.png  2068×176px"""
    TEX = r"""2S_n=1\cdot 2+2\cdot 2^{2}+\cdots+(n-1)2^{\,n-1}+n\cdot 2^{\,n}"""
    COLOR = "#142B50"


class F015_xrightarrowr2div5r33r2le(_Base):
    """PNG: f_ad1f26a7ecf7a38c.png  1596×400px"""
    TEX = r"""\xrightarrow{\;r_2\div(-5),\ r_3-3r_2\;}\left[\begin{array}{ccc|c}1&2&-1&2\\ 0&1&-1&-1\\ 0&0&4&8\end{array}\right]"""
    COLOR = "#142B50"


class F016_coslanglevecn1vecn2rangl(_Base):
    """PNG: f_bedaf03f6cb1555d.png  1692×276px"""
    TEX = r"""\cos\langle \vec n_1,\vec n_2\rangle=\frac{\vec n_1\cdot\vec n_2}{|\vec n_1|\,|\vec n_2|}=\frac{1}{\sqrt2\cdot\sqrt2}=\frac{1}{2}"""
    COLOR = "#142B50"


class F017_4z8Rightarrowz2qquadyz1R(_Base):
    """PNG: f_f212079d4bd277cb.png  1936×176px"""
    TEX = r"""4z=8\ \Rightarrow\ z=2,\qquad y-z=-1\ \Rightarrow\ y=1"""
    COLOR = "#142B50"

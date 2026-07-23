# -*- coding: utf-8 -*-
"""公式兼容性验证：把 goal 第五节 3. 点名的全部难点符号逐条渲染，产出验证报告。
运行：python test_formula_matrix.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tex import TexPool, TexError  # noqa: E402

CASES = [
    ("积分号与上下限", r"\int_{0}^{\pi/2}\sin^{2}x\,\mathrm{d}x=\frac{\pi}{4}"),
    ("变限积分与微分", r"\frac{\mathrm{d}}{\mathrm{d}x}\int_{a}^{x}f(t)\,\mathrm{d}t=f(x)"),
    ("求和号上下限", r"S_n=\sum_{k=1}^{n}k\cdot 2^{k-1}=(n-1)2^{n}+1"),
    ("连乘与阶乘", r"\prod_{k=1}^{n}\frac{k+1}{k}=n+1,\qquad \binom{n}{k}=\frac{n!}{k!\,(n-k)!}"),
    ("多层上下标", r"a_{n+1}^{\,2}=\left(a_{n}^{\,2}\right)^{\!2}+x_{i_{j}}^{\,k^{2}}"),
    ("长分式套分式", r"\cos\langle \vec n_1,\vec n_2\rangle=\frac{\vec n_1\cdot\vec n_2}{|\vec n_1|\,|\vec n_2|}=\frac{\dfrac{1}{2}+\dfrac{1}{3}}{\sqrt{2}\cdot\sqrt{3}}"),
    ("矩阵 2x3 含负号", r"A=\begin{bmatrix}1 & -2 & 3\\ -4 & 5 & -6\end{bmatrix}"),
    ("行列式竖线", r"\det A=\begin{vmatrix}a & b\\ c & d\end{vmatrix}=ad-bc"),
    ("增广矩阵与行变换箭头", r"\left[\begin{array}{cc|c}1 & -2 & 3\\ 2 & 1 & 4\end{array}\right]\xrightarrow{\;r_2-2r_1\;}\left[\begin{array}{cc|c}1 & -2 & 3\\ 0 & 5 & -2\end{array}\right]"),
    ("范数与绝对值", r"\|\vec a\|=\sqrt{x^2+y^2+z^2},\qquad \bigl||a|-|b|\bigr|\le |a-b|"),
    ("极限与蕴含", r"\lim_{x\to x_0}f(x)=A \iff \lim_{x\to x_0^-}f(x)=\lim_{x\to x_0^+}f(x)=A"),
    ("量词链 epsilon-delta", r"\forall\,\varepsilon>0,\ \exists\,\delta>0,\ 0<|x-x_0|<\delta \implies |f(x)-A|<\varepsilon"),
    ("分段函数", r"f(x)=\begin{cases}\dfrac{x^{2}-1}{x-1}, & x\neq 1\\[6pt] a, & x=1\end{cases}"),
    ("向量与坐标", r"\vec{PB}=(2,0,-2),\quad \vec n_1=(1,0,1),\quad \vec a\cdot\vec b=|\vec a||\vec b|\cos\theta"),
    ("希腊字母全家", r"\alpha\ \beta\ \gamma\ \delta\ \varepsilon\ \theta\ \lambda\ \mu\ \pi\ \rho\ \sigma\ \varphi\ \omega\ \Delta\ \Omega"),
    ("中文混排", r"\text{当且仅当}\ \Delta=b^{2}-4ac\ge 0\ \text{时，方程有实根}"),
    ("多行对齐推导", r"\begin{aligned}(1-q)S_n&=1+q+\cdots+q^{n-1}-nq^{n}\\ &=\frac{1-q^{n}}{1-q}-nq^{n}\end{aligned}"),
    ("导数与二阶导", r"f'(x_0)=\lim_{\Delta x\to 0}\frac{\Delta y}{\Delta x},\qquad f''(x)=\frac{\mathrm{d}^{2}y}{\mathrm{d}x^{2}}"),
    ("集合与区间", r"A\cap B=\{x\mid x\in\mathbb{R},\ -1\le x<3\}\subseteq(-\infty,3)"),
    ("根式嵌套与三角", r"\sqrt{2+\sqrt{3}}=\frac{\sqrt6+\sqrt2}{2},\qquad \tan\frac{\pi}{12}=2-\sqrt3"),
    ("大括号方程组", r"\begin{cases}x+2y-z=1\\ 2x-y+3z=4\\ -x+y+2z=0\end{cases}"),
    ("上下叠标注", r"\underbrace{a_1+a_2+\cdots+a_n}_{n\ \text{项}}=\overbrace{n\bar a}^{\text{均值}\times n}"),
]


def main():
    out = os.path.join(HERE_OUT, "_selftest")
    pool = TexPool(out, scale=3)
    ids = [(name, pool.add(tex, pt=30)) for name, tex in CASES]
    ok, bad = [], []
    try:
        pool.render()
    except TexError as e:
        print(e)
    rep = []
    for (name, tid), (_, tex) in zip(ids, CASES):
        try:
            w, h = pool.size_in(tid)
            rep.append({"项目": name, "状态": "通过", "排版尺寸(in)": f"{w:.2f}×{h:.2f}",
                        "PNG": os.path.basename(pool.info(tid)["file"]),
                        "像素": f"{pool.info(tid)['w']}×{pool.info(tid)['h']}", "latex": tex})
            ok.append(name)
        except KeyError:
            rep.append({"项目": name, "状态": "失败", "latex": tex})
            bad.append(name)
    path = os.path.join(out, "公式兼容性验证报告.json")
    json.dump(rep, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\n通过 {len(ok)}/{len(CASES)}；报告 → {path}")
    for r in rep:
        print(f"  [{r['状态']}] {r['项目']:<14} {r.get('排版尺寸(in)','')}\t{r.get('像素','')}")
    if bad:
        print("失败项：", bad)
        sys.exit(1)


HERE_OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
if __name__ == "__main__":
    main()

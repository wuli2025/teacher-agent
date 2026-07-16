# -*- coding: utf-8 -*-
"""deck01《导数的几何意义——切线的斜率》"""
from gen import *


def build():
    S = []
    S.append(title("导数的几何意义", "——从割线到切线，斜率的极限", "高二数学 · 选择性必修",
                   notes="开场：初中我们会求直线斜率，但曲线上每一点的‘陡峭程度’不同。本节把‘斜率’从直线推广到曲线上一点，得到导数的几何意义。用 3 分钟回顾斜率 k=Δy/Δx。"))
    S.append(bullets("学习目标", [
        "理解曲线在一点处切线的定义：割线的极限位置",
        {"text": "掌握导数 f′(x₀) 的几何意义：切线斜率", "sub": ["切线斜率 = 平均变化率的极限"]},
        "会求曲线在某点处的切线方程",
        "体会‘无限逼近’的极限思想",
    ], notes="用 2 分钟解读目标。重点是第 2 条——本节的核心结论 f′(x₀)=切线斜率。"))
    S.append(section("一、情境：如何刻画‘瞬时陡峭’", kicker="环节一 · 导入",
                     notes="过渡页。提问：过山车俯冲最陡的一瞬间，如何量化那一点的陡峭？这就是切线斜率。"))

    # 图1:曲线上不同点陡峭不同
    ax = Axes(ox=300, oy=560, sx=70, sy=44)
    f = lambda x: x * x
    boxes = [figtitle("同一条曲线，各点陡峭不同"), underline()]
    boxes += ax.axis_boxes(-0.3, 4.2, -0.3, 9.5, click=1)
    boxes.append(ax.plot(f, 0, 3.6, click=2, color="2563EB", width=4))
    for i, xx in enumerate([0.6, 1.6, 2.8]):
        boxes.append(ax.pt(xx, f(xx), click=3 + i))
        # 短切线段示意
        k = 2 * xx
        boxes.append(ax.seg((xx - 0.5, f(xx) - 0.5 * k), (xx + 0.5, f(xx) + 0.5 * k),
                            click=3 + i, color="#D64545", width=3))
    boxes.append(txt(720, 150, 470, 120, lines=["越往右，曲线越陡；", "切线越来越‘立’。", "斜率就是陡峭程度的度量。"],
                     size=20, color="muted", click=6))
    S.append(free(boxes, notes="单击1出坐标轴，2出抛物线 y=x²，3/4/5 依次在三点画切线段。引导学生观察：同一曲线不同点切线倾斜不同，所以需要‘每点一个斜率’。"))

    S.append(section("二、割线逼近切线", kicker="环节二 · 建构",
                     notes="核心动画环节。切线不是‘只碰一点的直线’这种直观定义，而是割线的极限位置。"))
    S.append(bullets("从割线到切线的思路", [
        "在曲线上取定点 P，另取动点 Q",
        {"text": "连 PQ 得割线，斜率 k=Δy/Δx", "sub": ["Δy=f(x₀+Δx)−f(x₀)，Δx=Q 与 P 横坐标之差"]},
        "让 Q 沿曲线滑向 P（Δx→0）",
        "割线的极限位置，就是 P 处的切线",
    ], notes="讲清逻辑链：割线可算斜率→让 Q 逼近 P→割线趋于切线→切线斜率=割线斜率的极限。为下一页动画铺垫。"))

    # 图2:割线逼近切线(核心动画)
    ax = Axes(ox=280, oy=570, sx=150, sy=95)
    f = lambda x: x * x
    x0 = 1.0
    boxes = [figtitle("割线 PQ 如何逼近切线（点击演示）"), underline()]
    boxes += ax.axis_boxes(-0.2, 3.2, -0.2, 5.2, click=1)
    boxes.append(ax.plot(f, 0, 2.3, click=1, color="2563EB", width=4))
    boxes.append(ax.pt(x0, f(x0), click=1, fill="#111111"))
    boxes.append(ax.label(x0, f(x0), "P", dx=-34, dy=-6, click=1, bold=True))
    qs = [2.6, 2.1, 1.6, 1.25]
    for i, xq in enumerate(qs):
        c = 2 + i
        k = (f(xq) - f(x0)) / (xq - x0)
        # 割线延长一点
        boxes.append(ax.seg((x0 - 0.2, f(x0) - 0.2 * k), (xq + 0.15, f(xq) + 0.15 * k),
                            click=c, color="#9AA0A6", width=2, dash=True))
        boxes.append(ax.pt(xq, f(xq), click=c, fill="#D64545", r=6))
        boxes.append(txt(560, 120 + i * 26, 620, 26, f"Q{i+1}: x={xq}，割线斜率 k={k:.2f}",
                         size=16, color="muted", click=c))
    # 切线 click 6
    kt = 2 * x0
    boxes.append(ax.seg((x0 - 0.6, f(x0) - 0.6 * kt), (x0 + 0.9, f(x0) + 0.9 * kt),
                        click=6, color="#D64545", width=4))
    boxes.append(txt(560, 240, 620, 60, "Q→P 时 k→2，切线斜率 = 2 = f′(1)", size=20,
                     color="accent", bold=True, click=6))
    S.append(free(boxes, notes="全场最关键一页。单击1出轴、曲线与定点P；2~5每击把Q向P挪近一步，报出割线斜率 3.6→3.1→2.6→2.25，一路逼近2；第6击画出切线并点明 k→2=f′(1)。让学生念出斜率数列的收敛趋势。"))

    S.append(bullets("切线的严格定义", [
        "设 P(x₀, f(x₀)) 是曲线 y=f(x) 上一点",
        {"text": "当 Δx→0 时，若割线 PQ 的斜率趋于确定值 k", "sub": ["则称直线：过 P 且斜率为 k 的直线为曲线在 P 处的切线"]},
        "切线是割线的极限位置，不是‘只有一个公共点’的直线",
    ], notes="强调反例：y=x³ 在原点的切线与曲线还相交；圆的切线才是‘一个公共点’，一般曲线不能这样定义。"))

    S.append(section("三、导数的几何意义", kicker="环节三 · 核心",
                     notes="把上面的极限写成导数记号。"))
    # 图3:导数定义式几何
    ax = Axes(ox=300, oy=560, sx=170, sy=95)
    f = lambda x: x * x
    x0 = 1.0; dx = 0.8
    boxes = [figtitle("平均变化率 → 瞬时变化率"), underline()]
    boxes += ax.axis_boxes(-0.2, 3.0, -0.2, 5.0, click=1)
    boxes.append(ax.plot(f, 0, 2.1, click=1, color="2563EB", width=4))
    P = (x0, f(x0)); Q = (x0 + dx, f(x0 + dx))
    boxes.append(ax.pt(*P, click=1, fill="#111"))
    boxes.append(ax.pt(*Q, click=2, fill="#D64545"))
    # Δx, Δy 直角边
    boxes.append(ax.seg(P, (Q[0], P[1]), click=2, color="#2E7D32", width=3))
    boxes.append(ax.seg((Q[0], P[1]), Q, click=2, color="#B5651D", width=3))
    boxes.append(ax.label((x0 + Q[0]) / 2, P[1], "Δx", dy=6, dx=-10, click=2, color="2E7D32"))
    boxes.append(ax.label(Q[0], (P[1] + Q[1]) / 2, "Δy", dx=8, dy=-8, click=2, color="B5651D"))
    boxes.append(ax.seg(P, Q, click=2, color="#9AA0A6", width=2, dash=True))
    boxes.append(txt(720, 300, 470, 150, lines=[
        "平均变化率 Δy/Δx", "= 割线斜率", "", "令 Δx→0：", "f′(x₀)=lim Δy/Δx", "= 切线斜率"],
        size=20, color="ink", click=3))
    S.append(free(boxes, notes="单击1轴+曲线+P；2画出Δx(绿)、Δy(橙)直角三角形与割线；3给出定义式 f′(x₀)=lim(Δx→0)Δy/Δx=切线斜率。把几何三角形和代数式对应起来讲。"))

    S.append(compare("三个说法是一回事", [
        {"head": "平均变化率", "body": "Δy/Δx\n割线斜率"},
        {"head": "瞬时变化率", "body": "Δx→0 的极限\nf′(x₀)"},
        {"head": "几何意义", "body": "切线斜率\ntan α（倾斜角）"},
    ], notes="三卡对照，落到一句话：f′(x₀)=切线斜率=tanα。α 是切线的倾斜角。"))
    S.append(bullets("由导数看切线的‘走向’", [
        {"text": "f′(x₀)>0：切线上升，函数在该点附近递增", "sub": ["斜率越大越陡"]},
        {"text": "f′(x₀)<0：切线下降，函数递减", "sub": []},
        "f′(x₀)=0：切线水平，常是极值点的候选",
        "f′(x₀) 不存在：如尖点、竖直切线",
    ], notes="为后面单调性、极值埋线索。举 f′=0 例：y=x² 在 x=0 切线水平。"))

    S.append(section("四、求切线方程", kicker="环节四 · 方法",
                     notes="把几何意义落到会算切线方程。"))
    S.append(bullets("求切线方程三步", [
        "① 求导，代入得斜率 k=f′(x₀)",
        "② 求切点纵坐标 y₀=f(x₀)",
        "③ 点斜式：y−y₀=k(x−x₀)",
    ], notes="强调切点必在曲线上，别忘算 y₀。板书三步框架。"))

    # 例题1
    ax = Axes(ox=310, oy=560, sx=90, sy=52)
    f = lambda x: x * x
    x0 = 1.0; k = 2.0
    boxes = [figtitle("例1  求 y=x² 在 P(1,1) 处的切线"), underline()]
    boxes += ax.axis_boxes(-0.5, 3.2, -0.5, 6, click=1)
    boxes.append(ax.plot(f, -0.6, 2.6, click=1, color="2563EB", width=4))
    boxes.append(ax.pt(x0, 1, click=2, fill="#111"))
    boxes.append(ax.label(x0, 1, "P(1,1)", dx=10, dy=-4, click=2, bold=True))
    boxes.append(ax.seg((x0 - 1.3, 1 - 1.3 * k), (x0 + 1.2, 1 + 1.2 * k), click=3, color="#D64545", width=4))
    boxes.append(txt(720, 150, 470, 260, lines=[
        "f(x)=x² ⇒ f′(x)=2x", "k=f′(1)=2", "切点 (1,1)", "切线：y−1=2(x−1)", "即 y=2x−1"],
        size=22, color="ink", click=4))
    S.append(free(boxes, notes="例1完整板演。单击1轴+曲线，2标切点，3画切线，4逐行写解：f′(x)=2x→k=2→点斜式→y=2x−1。追问：切线与 x 轴交点？(0.5,0)。"))

    S.append(bullets("例1 解答（详解）", [
        "求导：f′(x)=2x",
        "斜率：k=f′(1)=2×1=2",
        "切点：(1, 1)（已在曲线上）",
        "点斜式：y−1=2(x−1) ⇒ y=2x−1",
    ], notes="与上页图对应，给出规范书写。提醒：只写 k=2 不写切点会丢分。"))

    # 例2 切点未知
    S.append(bullets("例2  过点作切线（切点未知）", [
        "求曲线 y=x² 过点 A(0,−1) 的切线方程",
        {"text": "陷阱：A 不在曲线上，不能直接代！", "sub": ["设切点 (t, t²) 为未知量"]},
    ], notes="典型易错。强调：题中给的点不一定是切点。引出设切点参数 t 的通法。"))
    ax = Axes(ox=360, oy=470, sx=95, sy=42)
    f = lambda x: x * x
    boxes = [figtitle("例2  设切点 (t, t²)，两条切线"), underline()]
    boxes += ax.axis_boxes(-2.6, 2.8, -1.5, 5.2, click=1)
    boxes.append(ax.plot(f, -2.3, 2.3, click=1, color="2563EB", width=4))
    boxes.append(ax.pt(0, -1, click=2, fill="#111"))
    boxes.append(ax.label(0, -1, "A(0,−1)", dx=10, dy=6, click=2, bold=True))
    for t, c in [(1.0, 3), (-1.0, 4)]:
        boxes.append(ax.pt(t, t * t, click=c, fill="#D64545", r=6))
        k = 2 * t
        boxes.append(ax.seg((t - 1.6, t * t - 1.6 * k), (t + 0.4, t * t + 0.4 * k), click=c, color="#D64545", width=3))
    boxes.append(txt(720, 360, 470, 120, lines=["切线过 A：t²−(−1)=2t·(t−0)", "解得 t=±1", "两条切线：y=2x−1，y=−2x−1"],
                     size=19, color="accent", click=5))
    S.append(free(boxes, notes="单击1轴曲线，2标A，3/4画出两条切线(t=1、t=−1)，5给方程。核心方程：切线斜率2t，过A ⇒ (t²+1)/(t−0)=2t ⇒ t²=1。让学生体会‘设切点’通法与两解。"))
    S.append(bullets("例2 解答（详解）", [
        "设切点 P(t, t²)，斜率 k=2t",
        "切线：y−t²=2t(x−t)",
        "过 A(0,−1)：−1−t²=2t(0−t) ⇒ −1−t²=−2t² ⇒ t²=1",
        "t=±1 ⇒ 两条切线 y=2x−1 与 y=−2x−1",
    ], notes="板书完整。强调曲线外一点可能有多条切线；解出 t 有几个就有几条。"))

    S.append(section("五、变式与易错", kicker="环节五 · 巩固",
                     notes="拉练与踩坑提醒，撑起练习时段。"))
    S.append(twocol("‘在’与‘过’一字之差",
                    "在某点处的切线", ["点一定是切点", "直接求 f′(x₀)", "唯一一条"],
                    "过某点的切线", ["点未必是切点", "设切点参数 t", "可能多条"],
                    notes="最高频失分点。让学生用一句话复述区别。"))
    S.append(bullets("易错清单", [
        "忘记验证给定点是否在曲线上",
        "只求斜率不写切点坐标",
        "把‘公共点唯一’当切线定义（对一般曲线错）",
        {"text": "导数值 f′(x₀) 与函数值 f(x₀) 混淆", "sub": ["前者是斜率，后者是切点高度"]},
    ], notes="逐条点名。可现场出小判断题让学生举手。"))

    # 课堂练习
    S.append(bullets("课堂练习（先独立完成）", [
        "① 求 y=x²−2x 在 x=2 处的切线方程",
        "② 求 y=√x 在 (1,1) 处的切线（提示 f′=1/(2√x)）",
        "③ 过原点作 y=x²+1 的切线，求切线方程",
    ], notes="留 8 分钟。巡视。答案：①y=2x−4；②y=½x+½；③设切点 (t,t²+1)，t²+1=2t·t⇒t=±1，y=±2x。"))
    ax = Axes(ox=340, oy=520, sx=95, sy=48)
    f = lambda x: x * x - 2 * x
    boxes = [figtitle("练习①  y=x²−2x 在 x=2 处"), underline()]
    boxes += ax.axis_boxes(-0.8, 3.6, -1.6, 3.6, click=1)
    boxes.append(ax.plot(f, -0.5, 3.3, click=1, color="2563EB", width=4))
    x0 = 2.0; k = 2 * x0 - 2
    boxes.append(ax.pt(x0, f(x0), click=2, fill="#111"))
    boxes.append(ax.label(x0, f(x0), "(2,0)", dx=8, dy=8, click=2, bold=True))
    boxes.append(ax.seg((x0 - 1.4, f(x0) - 1.4 * k), (x0 + 1.0, f(x0) + 1.0 * k), click=3, color="#D64545", width=4))
    boxes.append(txt(720, 200, 470, 160, lines=["f′(x)=2x−2", "k=f′(2)=2", "切点 (2,0)", "y=2(x−2)=2x−4"], size=21, color="ink", click=4))
    S.append(free(boxes, notes="练习①讲评。逐击对答案：f′=2x−2→k=2→y=2x−4。图上验证切线在(2,0)处与曲线相切。"))

    S.append(stats("这节课的三个数", [
        {"value": "f′(x₀)", "label": "切线斜率", "desc": "导数的几何意义"},
        {"value": "3步", "label": "求切线", "desc": "导→斜率→点斜式"},
        {"value": "Δx→0", "label": "极限思想", "desc": "割线→切线"},
    ], notes="用数字收束。请学生分别解释每个数背后的含义。"))
    S.append(timeline("知识脉络", [
        {"head": "平均变化率", "body": "Δy/Δx 割线斜率"},
        {"head": "取极限", "body": "Δx→0"},
        {"head": "瞬时变化率", "body": "f′(x₀)"},
        {"head": "几何意义", "body": "切线斜率"},
    ], notes="串讲脉络，形成闭环。"))
    S.append(bullets("课堂小结", [
        "切线是割线的极限位置",
        "f′(x₀)=切线斜率=tanα",
        "求切线三步：求导→斜率→点斜式",
        "‘在’与‘过’要分清，切点未知设参数 t",
    ], notes="学生齐述四句话。为下节‘导数与单调性’预告。"))
    S.append(bullets("作业", [
        "课本 P__ 习题：求切线方程 4 题",
        "思考：f′(x₀)=0 的几何意义是什么？举一例",
        "预习：导数与函数单调性",
    ], notes="布置作业，说明思考题下节课提问。"))
    S.append(closing("下节：导数与单调性", "斜率的正负 → 函数的升降",
                     notes="收尾。一句话预告：既然 f′ 是斜率，f′ 的正负就决定曲线的升降。"))
    return S


if __name__ == "__main__":
    write_deck("deck01", "minimal-white", build())

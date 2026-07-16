# -*- coding: utf-8 -*-
"""deck02《正弦函数 y=sinx 的图象与性质》"""
import math
from gen import *

PI = math.pi


def build():
    S = []
    S.append(title("正弦函数的图象与性质", "y = sin x 的一切，都藏在单位圆里", "高一数学 · 必修第一册",
                   notes="开场：单位圆上一点绕圈，它的纵坐标随角度变化，就是正弦。本节把这种变化‘展开’成一条波浪曲线，并读出它的全部性质。"))
    S.append(bullets("学习目标", [
        "理解正弦函数图象的生成：单位圆纵坐标的展开",
        "掌握‘五点作图法’画 y=sinx",
        {"text": "掌握正弦函数五大性质", "sub": ["定义域、值域、周期、奇偶性、单调性"]},
        "会用性质比较大小、求值域与单调区间",
    ], notes="解读目标，强调五点法与五性质是本节骨架。"))
    S.append(section("一、图象怎么来：单位圆的展开", kicker="环节一 · 生成",
                     notes="过渡。别急着背图象，先看它从哪来。"))

    # 图1:单位圆生成一个正弦值
    cx, cy, R = 260, 360, 120
    boxes = [figtitle("单位圆上一点的纵坐标 = sinθ"), underline()]
    boxes.append(circ(cx, cy, R, color="ink", width=3, click=1))
    boxes.append(line(cx - R - 20, cy, cx + R + 20, cy, color="muted", width=2, arrow=True, click=1))
    boxes.append(line(cx, cy + R + 20, cx, cy - R - 30, color="muted", width=2, arrow=True, click=1))
    th = math.radians(50)
    ex, ey = cx + R * math.cos(th), cy - R * math.sin(th)
    boxes.append(line(cx, cy, ex, ey, color="#2563EB", width=3, click=2))  # 动径
    boxes.append(dot(ex, ey, r=6, fill="#D64545", click=2))
    boxes.append(line(ex, ey, ex, cy, color="#D64545", width=3, dash=True, click=3))  # 纵坐标投影
    boxes.append(txt(cx - 40, cy - 8, 40, 24, "θ", size=16, color="2563EB", click=2))
    boxes.append(txt(ex + 8, (ey + cy) / 2 - 12, 200, 24, "sinθ", size=16, color="D64545", bold=True, click=3))
    boxes.append(txt(620, 200, 560, 200, lines=[
        "动径转过角 θ，", "交单位圆于点 P，", "P 的纵坐标就是 sinθ。", "", "θ 变化 → 纵坐标上下起伏", "→ 这就是正弦函数。"],
        size=22, color="ink", click=4))
    S.append(free(boxes, notes="单击1画单位圆与坐标轴，2画动径与交点P，3把P的纵坐标投影下来标 sinθ，4文字点题。让学生想象θ从0转到2π，红色高度如何变化。"))

    # 图2:单位圆同步生成正弦曲线(多点)
    ox_s, oy_s = 560, 360
    sx = 150 / PI  # 每弧度像素
    sy = 120
    boxes = [figtitle("角度展开 → 正弦曲线（点击逐点生成）"), underline()]
    # 左侧小单位圆
    cx, cy, R = 300, 360, 110
    boxes.append(circ(cx, cy, R, color="muted", width=2, click=1))
    boxes.append(line(cx, cy + R + 10, cx, cy - R - 20, color="muted", width=2, click=1))
    # 右侧坐标轴
    boxes.append(line(cx + 130, oy_s, ox_s + 2 * PI * sx + 30, oy_s, color="ink", width=3, arrow=True, click=1))
    boxes.append(line(ox_s, oy_s + sy + 20, ox_s, oy_s - sy - 20, color="ink", width=3, arrow=True, click=1))
    # 逐点(0, π/2, π, 3π/2, 2π 以及中间)
    key = [0, PI / 6, PI / 3, PI / 2, 2 * PI / 3, 5 * PI / 6, PI, 7 * PI / 6, 4 * PI / 3, 3 * PI / 2, 5 * PI / 3, 11 * PI / 6, 2 * PI]
    for i, a in enumerate(key):
        c = 2 + i // 4  # 分 4 击铺点
        px = ox_s + a * sx
        py = oy_s - sy * math.sin(a)
        boxes.append(dot(px, py, r=5, fill="#2563EB", click=c))
    # 平滑曲线 click 6
    pts = [(ox_s + (2 * PI * j / 80) * sx, oy_s - sy * math.sin(2 * PI * j / 80)) for j in range(81)]
    boxes.append(curve(pts, color="#D64545", width=4, click=6))
    boxes.append(txt(760, 150, 420, 60, "连成光滑曲线：一条正弦波", size=20, color="accent", bold=True, click=6))
    S.append(free(boxes, notes="核心动画。单击1出单位圆与坐标框，2~5把一个周期内的采样点逐批打上(对应圆上转动),6连成光滑正弦曲线。强调横轴是角度(弧度),纵轴是sin值∈[−1,1]。"))

    S.append(section("二、五点作图法", kicker="环节二 · 画法",
                     notes="手工快速画正弦图象的标准方法。"))
    S.append(bullets("关键五点", [
        "在一个周期 [0, 2π] 内取五个点",
        {"text": "(0,0)、(π/2,1)、(π,0)、(3π/2,−1)、(2π,0)", "sub": ["‘零—顶—零—谷—零’"]},
        "描点后用光滑曲线连接",
        "向左右平移复制即得整条曲线",
    ], notes="让学生背口诀‘零顶零谷零’。下页动画演示。"))
    # 图3:五点作图
    ox_s, oy_s = 300, 360
    sx = 150 / PI; sy = 120
    boxes = [figtitle("五点作图法（点击逐点）"), underline()]
    boxes.append(line(ox_s - 30, oy_s, ox_s + 2 * PI * sx + 40, oy_s, color="ink", width=3, arrow=True, click=1))
    boxes.append(line(ox_s, oy_s + sy + 25, ox_s, oy_s - sy - 25, color="ink", width=3, arrow=True, click=1))
    five = [(0, 0, "0"), (PI / 2, 1, "π/2"), (PI, 0, "π"), (3 * PI / 2, -1, "3π/2"), (2 * PI, 0, "2π")]
    for i, (a, v, lab) in enumerate(five):
        px = ox_s + a * sx; py = oy_s - sy * v
        boxes.append(dot(px, py, r=7, fill="#D64545", click=2 + i))
        boxes.append(txt(px - 24, oy_s + 10 if v <= 0 else py - 30, 60, 22, lab, size=15, color="muted", click=2 + i))
    pts = [(ox_s + (2 * PI * j / 80) * sx, oy_s - sy * math.sin(2 * PI * j / 80)) for j in range(81)]
    boxes.append(curve(pts, color="#2563EB", width=4, click=7))
    boxes.append(txt(ox_s + 10, oy_s - sy - 24, 120, 22, "y", size=15, italic=True, click=1))
    S.append(free(boxes, notes="单击1轴,2~6逐个描五点并标横坐标,7连成曲线。让学生在练习本上同步描点。"))

    S.append(section("三、正弦函数的性质", kicker="环节三 · 性质",
                     notes="从图象读性质,这是本节落点。"))
    S.append(compare("看图说性质（一）", [
        {"head": "定义域", "body": "全体实数 R"},
        {"head": "值域", "body": "[−1, 1]"},
        {"head": "周期", "body": "T = 2π"},
    ], notes="定义域R(角可任意大);值域看波峰波谷;周期看重复间隔2π。"))
    # 图4:周期性(平移重复)
    ox_s, oy_s = 180, 360
    sx = 95 / PI; sy = 95
    boxes = [figtitle("周期性：每隔 2π 重复"), underline()]
    boxes.append(line(ox_s - 20, oy_s, ox_s + 6 * PI * sx + 30, oy_s, color="ink", width=3, arrow=True, click=1))
    boxes.append(line(ox_s, oy_s + sy + 20, ox_s, oy_s - sy - 20, color="ink", width=3, arrow=True, click=1))
    def sinseg(a0, a1, c, color):
        pts = [(ox_s + (a0 + (a1 - a0) * j / 60) * sx, oy_s - sy * math.sin(a0 + (a1 - a0) * j / 60)) for j in range(61)]
        return curve(pts, color=color, width=4, click=c)
    boxes.append(sinseg(0, 2 * PI, 2, "#D64545"))
    boxes.append(sinseg(2 * PI, 4 * PI, 3, "#2563EB"))
    boxes.append(sinseg(4 * PI, 6 * PI, 4, "#2E7D32"))
    for k in range(1, 4):
        px = ox_s + 2 * PI * k * sx
        boxes.append(line(px, oy_s - 6, px, oy_s + 6, color="muted", width=2, click=1))
        boxes.append(txt(px - 20, oy_s + 10, 60, 20, f"{2*k}π", size=13, color="muted", click=1))
    boxes.append(txt(760, 150, 420, 80, "f(x+2π)=f(x)\n最小正周期 T=2π", size=22, color="accent", bold=True, click=4))
    S.append(free(boxes, notes="单击1轴,2/3/4每击复制一个周期(换色),直观看到‘每隔2π完全重复’。给出周期定义 f(x+2π)=f(x)。"))

    S.append(twocol("看图说性质（二）",
                    "奇偶性", ["sin(−x)=−sinx", "奇函数", "图象关于原点对称"],
                    "单调性", ["增区间 [−π/2+2kπ, π/2+2kπ]", "减区间 [π/2+2kπ, 3π/2+2kπ]", "k∈Z"],
                    notes="奇函数——图象中心对称;单调区间要带周期2kπ。强调k∈Z不能漏。"))
    # 图5:单调区间标注
    ox_s, oy_s = 260, 370
    sx = 150 / PI; sy = 110
    boxes = [figtitle("单调区间（一个周期内）"), underline()]
    boxes.append(line(ox_s - 40, oy_s, ox_s + 2.2 * PI * sx, oy_s, color="ink", width=3, arrow=True, click=1))
    boxes.append(line(ox_s, oy_s + sy + 20, ox_s, oy_s - sy - 20, color="ink", width=3, arrow=True, click=1))
    # 增区间 -π/2..π/2, 减区间 π/2..3π/2
    inc = [(ox_s + (-PI / 2 + (PI) * j / 60) * sx, oy_s - sy * math.sin(-PI / 2 + PI * j / 60)) for j in range(61)]
    dec = [(ox_s + (PI / 2 + (PI) * j / 60) * sx, oy_s - sy * math.sin(PI / 2 + PI * j / 60)) for j in range(61)]
    boxes.append(curve(inc, color="#2E7D32", width=5, click=2))
    boxes.append(curve(dec, color="#D64545", width=5, click=3))
    boxes.append(txt(ox_s + 20, oy_s + 30, 260, 24, "增 [−π/2, π/2]", size=17, color="2E7D32", bold=True, click=2))
    boxes.append(txt(ox_s + 300, oy_s + 30, 260, 24, "减 [π/2, 3π/2]", size=17, color="D64545", bold=True, click=3))
    S.append(free(boxes, notes="单击1轴,2绿色画增区间那段,3红色画减区间那段。强调加上周期2kπ得一般式。"))

    S.append(section("四、典型例题", kicker="环节四 · 应用",
                     notes="用性质解题。"))
    S.append(bullets("例1  求值域与最值", [
        "求 y=2sinx+1 的值域",
        "解：sinx∈[−1,1] ⇒ 2sinx∈[−2,2] ⇒ y∈[−1,3]",
        "最大值 3（当 sinx=1，即 x=π/2+2kπ）；最小值 −1",
    ], notes="换元思想:先框住sinx范围,再线性放缩。追问取到最值时的x。"))
    S.append(bullets("例2  比较大小", [
        "比较 sin(π/5) 与 sin(2π/5)",
        {"text": "两角都在增区间 [0,π/2] 内", "sub": ["π/5 < 2π/5，函数递增 ⇒ sin(π/5) < sin(2π/5)"]},
        "口诀：同一单调区间内，比角度大小即可",
    ], notes="强调必须先判断‘是否在同一单调区间’,否则不能直接比。"))
    S.append(bullets("例3  求单调区间", [
        "求 y=sin(x+π/3) 的单调递增区间",
        "令 −π/2+2kπ ≤ x+π/3 ≤ π/2+2kπ",
        "解得 −5π/6+2kπ ≤ x ≤ π/6+2kπ，k∈Z",
    ], notes="整体代换法:把x+π/3看成整体套用sin的增区间,再解不等式。这是复合正弦的通法,重点。"))
    # 图6:例3 y=sin(x+π/3) 平移
    ox_s, oy_s = 250, 370
    sx = 150 / PI; sy = 105
    boxes = [figtitle("例3  y=sin(x+π/3)：左移 π/3"), underline()]
    boxes.append(line(ox_s - 40, oy_s, ox_s + 2.2 * PI * sx, oy_s, color="ink", width=3, arrow=True, click=1))
    boxes.append(line(ox_s, oy_s + sy + 20, ox_s, oy_s - sy - 20, color="ink", width=3, arrow=True, click=1))
    base = [(ox_s + (2 * PI * j / 80) * sx, oy_s - sy * math.sin(2 * PI * j / 80)) for j in range(81)]
    shift = [(ox_s + (2 * PI * j / 80) * sx, oy_s - sy * math.sin(2 * PI * j / 80 + PI / 3)) for j in range(81)]
    boxes.append(curve(base, color="#9AA0A6", width=3, click=2))
    boxes.append(curve(shift, color="#2563EB", width=4, click=3))
    boxes.append(txt(760, 160, 420, 90, lines=["灰：y=sinx", "蓝：y=sin(x+π/3)", "整体左移 π/3"], size=19, color="ink", click=3))
    S.append(free(boxes, notes="单击1轴,2灰色画y=sinx参照,3蓝色画左移后的图象。让学生看清‘+π/3是向左移’,并与整体代换法呼应。"))

    S.append(compare("易错提醒", [
        {"head": "漏 k∈Z", "body": "单调区间/最值点\n必须带周期"},
        {"head": "移动方向", "body": "sin(x+φ)\nφ>0 向左移"},
        {"head": "先判区间", "body": "比较大小前\n先看同一单调区间"},
    ], notes="三大高频错。逐条强调。"))
    S.append(bullets("课堂练习", [
        "① 求 y=1−sinx 的值域",
        "② 比较 sin1 与 sin1.5（弧度）",
        "③ 求 y=sin(2x) 的最小正周期",
    ], notes="留8分钟。答案:①[0,2];②都在[0,π/2]增,1<1.5⇒sin1<sin1.5;③T=2π/2=π。"))
    S.append(stats("正弦函数速记", [
        {"value": "R→[−1,1]", "label": "定义/值域", "desc": ""},
        {"value": "T=2π", "label": "周期", "desc": "最小正周期"},
        {"value": "奇函数", "label": "对称", "desc": "关于原点"},
    ], notes="数字卡收束核心性质。"))
    S.append(timeline("本节脉络", [
        {"head": "单位圆", "body": "纵坐标=sinθ"},
        {"head": "展开", "body": "得正弦曲线"},
        {"head": "五点法", "body": "快速作图"},
        {"head": "读性质", "body": "五大性质"},
    ], notes="脉络回顾,强调图象是性质之源。"))
    S.append(bullets("课堂小结", [
        "图象来自单位圆纵坐标的展开",
        "五点作图：零顶零谷零",
        "五性质：R、[−1,1]、2π、奇、分段单调",
        "复合正弦用整体代换求单调区间",
    ], notes="齐述。预告余弦函数与图象变换。"))
    S.append(bullets("作业", [
        "用五点法画 y=sinx 在 [−2π,2π] 的图象",
        "求 y=3sin(x−π/6)+1 的值域与增区间",
        "预习：余弦函数 y=cosx",
    ], notes="布置作业。"))
    S.append(closing("下节：余弦函数与图象变换", "cosx = sin(x+π/2)",
                     notes="收尾,一句话预告余弦与正弦的平移关系。"))
    return S


if __name__ == "__main__":
    write_deck("deck02", "minimal-white", build())

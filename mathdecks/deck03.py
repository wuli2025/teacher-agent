# -*- coding: utf-8 -*-
"""deck03《正弦定理与余弦定理——解三角形》"""
import math
from gen import *


def tri(A, B, C, click_edges=None, color="ink", width=3):
    """三角形三顶点(画布px)。返回三条边(可分 click)。"""
    ce = click_edges or [0, 0, 0]
    return [
        line(*A, *B, color=color, width=width, click=ce[0]),
        line(*B, *C, color=color, width=width, click=ce[1]),
        line(*C, *A, color=color, width=width, click=ce[2]),
    ]


def build():
    S = []
    S.append(title("正弦定理与余弦定理", "——不用直角，也能解三角形", "高一/高二 · 解三角形",
                   notes="开场:直角三角形能用勾股与锐角三角函数。一般三角形呢?本节两大定理把边与角联系起来,任意三角形都能解。"))
    S.append(bullets("学习目标", [
        "掌握正弦定理 a/sinA=b/sinB=c/sinC=2R",
        "掌握余弦定理 a²=b²+c²−2bc·cosA",
        "会判断三角形解的个数（重点难点）",
        "会用定理解决测量等实际问题",
    ], notes="解读目标,强调解的个数讨论是难点。"))
    S.append(section("一、正弦定理", kicker="环节一",
                     notes="先建立正弦定理并推导。"))
    # 图1:三角形边角标注
    A, B, C = (300, 520), (900, 520), (560, 180)
    boxes = [figtitle("三角形 ABC 的边与角"), underline()]
    boxes += tri(A, B, C, click_edges=[2, 2, 2], color="#2563EB", width=4)
    boxes += [dot(*A, click=1, fill="#111"), dot(*B, click=1, fill="#111"), dot(*C, click=1, fill="#111")]
    boxes += [txt(A[0] - 40, A[1] + 6, 40, 26, "A", size=20, bold=True, click=1),
              txt(B[0] + 10, B[1] + 6, 40, 26, "B", size=20, bold=True, click=1),
              txt(C[0] - 12, C[1] - 40, 40, 26, "C", size=20, bold=True, click=1)]
    boxes += [txt((B[0] + C[0]) // 2 + 20, (B[1] + C[1]) // 2 - 20, 40, 26, "a", size=18, italic=True, color="D64545", click=3),
              txt((A[0] + C[0]) // 2 - 40, (A[1] + C[1]) // 2 - 20, 40, 26, "b", size=18, italic=True, color="D64545", click=3),
              txt((A[0] + B[0]) // 2 - 10, B[1] + 12, 40, 26, "c", size=18, italic=True, color="D64545", click=3)]
    boxes.append(txt(980, 220, 260, 200, lines=["边 a 对角 A", "边 b 对角 B", "边 c 对角 C", "", "大边对大角"], size=20, color="muted", click=4))
    S.append(free(boxes, notes="单击1标三顶点,2画三边,3标边a/b/c,4文字说明‘边角对应、大边对大角’。约定记号,为定理铺垫。"))
    S.append(bullets("正弦定理", [
        "在任意△ABC 中：a/sinA = b/sinB = c/sinC = 2R",
        {"text": "R 为外接圆半径", "sub": ["三边与其对角正弦成正比"]},
        "作用①：已知两角一边 → 解三角形",
        "作用②：已知两边及一边对角 → 求另一角（可能多解）",
    ], notes="给出定理与两类用途。第二类是多解来源,后面重点。"))
    # 图2:正弦定理推导(作高)
    A, B, C = (300, 520), (900, 520), (560, 200)
    H = (560, 520)
    boxes = [figtitle("推导：作高 CH=h"), underline()]
    boxes += tri(A, B, C, click_edges=[1, 1, 1], color="#2563EB", width=3)
    boxes.append(line(*C, *H, color="#D64545", width=3, dash=True, click=2))
    boxes.append(txt(C[0] + 8, (C[1] + H[1]) // 2 - 12, 40, 24, "h", size=17, color="D64545", click=2))
    boxes.append(txt(300, 240, 430, 240, lines=[
        "在 △ACH：h=b·sinA", "在 △BCH：h=a·sinB", "∴ b·sinA=a·sinB", "⇒ a/sinA=b/sinB"], size=21, color="ink", click=3))
    S.append(free(boxes, notes="单击1画三角形,2作高h,3两次用直角三角形表示h,消去h得a/sinA=b/sinB。同理可推第三个比。让学生体会‘作高’是连接一般与直角三角形的桥。"))
    S.append(bullets("例1  已知两角一边", [
        "△ABC 中，A=45°，B=60°，a=2，求 b",
        "由正弦定理 b=a·sinB/sinA=2·sin60°/sin45°",
        "=2·(√3/2)/(√2/2)=√6",
    ], notes="正弦定理最直接的应用。板演代入。追问C与c如何求(C=75°,c由比例)。"))

    S.append(section("二、余弦定理", kicker="环节二",
                     notes="处理‘两边夹角’或‘三边’的情形。"))
    S.append(bullets("余弦定理", [
        "a² = b² + c² − 2bc·cosA",
        "b² = a² + c² − 2ac·cosB",
        "c² = a² + b² − 2ab·cosC",
        {"text": "变形：cosA=(b²+c²−a²)/(2bc)", "sub": ["已知三边求角"]},
    ], notes="三式对称,记一个即可。变形式用于已知三边求角。当A=90°退化为勾股定理,提醒这一点。"))
    # 图3:余弦定理坐标推导
    boxes = [figtitle("推导：放进坐标系"), underline()]
    Ax, Ay = 320, 520
    Bx, By = 880, 520
    Cx, Cy = 470, 220
    boxes.append(line(Ax - 30, Ay, Bx + 40, Ay, color="muted", width=2, arrow=True, click=1))
    boxes.append(line(Ax, Ay + 20, Ax, 160, color="muted", width=2, arrow=True, click=1))
    boxes += tri((Ax, Ay), (Bx, By), (Cx, Cy), click_edges=[2, 2, 2], color="#2563EB", width=3)
    boxes += [txt(Ax - 34, Ay + 6, 60, 24, "A(0,0)", size=15, click=2),
              txt(Bx - 10, By + 8, 90, 24, "B(c,0)", size=15, click=2),
              txt(Cx - 10, Cy - 34, 160, 24, "C(b·cosA, b·sinA)", size=15, click=2)]
    boxes.append(txt(560, 260, 430, 200, lines=["a²=|BC|²", "=(b·cosA−c)²+(b·sinA)²", "=b²+c²−2bc·cosA"], size=20, color="ink", click=3))
    S.append(free(boxes, notes="单击1建坐标系(A在原点、B在x轴),2标三点坐标,3用两点间距离公式算a²,展开化简得余弦定理。坐标法是最干净的推导。"))
    S.append(bullets("例2  已知两边夹角", [
        "△ABC 中，b=2，c=3，A=60°，求 a",
        "a²=b²+c²−2bc·cosA=4+9−2·2·3·½=7",
        "a=√7",
    ], notes="余弦定理正用。提醒cos60°=½。追问:再求B可用正弦或余弦定理。"))
    S.append(bullets("例3  已知三边求角", [
        "△ABC 中，a=7，b=5，c=3，求最大角",
        {"text": "最大边 a 对最大角 A", "sub": ["cosA=(b²+c²−a²)/(2bc)=(25+9−49)/30=−½"]},
        "A=120°",
    ], notes="三边求角用变形式。技巧:先判最大边对最大角。cosA为负说明钝角,合理。"))

    S.append(section("三、解的个数讨论（难点）", kicker="环节三",
                     notes="已知两边及一边对角(SSA)时解不唯一,本节难点。"))
    # 图4:SSA 多解
    boxes = [figtitle("已知 a、b、A：可能 0/1/2 解"), underline()]
    Ax, Ay = 300, 520
    boxes.append(line(Ax - 20, Ay, 1050, Ay, color="ink", width=2, click=1))  # 底边射线
    # 从A出发一条角为A的射线(边c方向) -> 定点B在射线上? 这里画 b 固定长,以 A 为端点摆角
    ang = math.radians(35)
    L = 360
    Cx, Cy = Ax + L * math.cos(ang), Ay - L * math.sin(ang)
    boxes.append(line(Ax, Ay, Cx, Cy, color="#2563EB", width=3, click=1))  # AC = b
    boxes.append(dot(Ax, Ay, click=1, fill="#111"))
    boxes.append(dot(Cx, Cy, click=1, fill="#111"))
    boxes.append(txt(Ax - 30, Ay + 6, 40, 24, "A", size=18, bold=True, click=1))
    boxes.append(txt(Cx - 4, Cy - 34, 40, 24, "C", size=18, bold=True, click=1))
    boxes.append(txt((Ax + Cx) / 2 - 30, (Ay + Cy) / 2 - 24, 40, 24, "b", size=16, italic=True, color="2563EB", click=1))
    # 以C为圆心 半径a 画弧,交底边于两点(用两点示意)
    r = 250
    boxes.append(circ(Cx, Cy, r, color="#D64545", width=2, click=2))
    # 交点:底边 y=Ay, 求 x
    dyc = Ay - Cy
    if r > dyc:
        dxc = math.sqrt(r * r - dyc * dyc)
        for xx, c in [(Cx - dxc, 3), (Cx + dxc, 4)]:
            boxes.append(dot(xx, Ay, r=6, fill="#2E7D32", click=c))
            boxes.append(line(Cx, Cy, xx, Ay, color="#2E7D32", width=2, dash=True, click=c))
    boxes.append(txt(720, 150, 470, 140, lines=["以 C 为圆心、a 为半径画弧", "交底边几个点，就有几个解", "本例 a 取值得两解"], size=19, color="ink", click=4))
    S.append(free(boxes, notes="难点可视化。单击1画A、AC=b与角A;2以C为圆心、半径a画弧;3/4弧与底边的交点即B的可能位置——两个交点=两解。让学生想象半径a变化时交点0/1/2个,对应无解/一解/两解。"))
    S.append(compare("SSA 解的个数", [
        {"head": "a<b·sinA", "body": "无解\n弧够不到底边"},
        {"head": "a=b·sinA 或 a≥b", "body": "一解"},
        {"head": "b·sinA<a<b", "body": "两解"},
    ], notes="给出判据(A为锐角时)。建议记‘画弧交点法’而非死背,理解更牢。"))
    S.append(bullets("例4  判断解的个数", [
        "△ABC 中，b=2，a=√2，B=45°，判断解的个数",
        "b·sinA? 改用 a、B：a·sinB=√2·(√2/2)=1",
        {"text": "a·sinB=1 < b=2 < a? 不，a=√2<b", "sub": ["a<b 且 a>b·sin? 计算得两解需 b·sinA<a<b"]},
        "此题：由 sinA=a·sinB/b=√2·sin45°/2=½，A=30°或150°；A=150°时 A+B>180°舍，∴一解",
    ], notes="用正弦定理求sinA,得A可能两值,再用‘内角和<180°’筛。这是判断解个数的代数方法,与画弧法互补。板演清楚。"))

    S.append(section("四、实际应用", kicker="环节四",
                     notes="测量问题:不可到达点的距离/高度。"))
    # 图5:测河宽
    boxes = [figtitle("例5  测量河对岸两点距离"), underline()]
    Ax, Ay = 320, 540
    Bx, By = 720, 540
    Cx, Cy = 560, 230
    boxes.append(rect(200, 545, 900, 60, color="#DCE6F5", click=1))  # 河
    boxes += [dot(Ax, Ay, click=1, fill="#111"), dot(Bx, By, click=1, fill="#111"), dot(Cx, Cy, click=2, fill="#D64545")]
    boxes += [txt(Ax - 26, Ay + 8, 40, 24, "A", size=18, bold=True, click=1),
              txt(Bx + 6, By + 8, 40, 24, "B", size=18, bold=True, click=1),
              txt(Cx - 6, Cy - 34, 60, 24, "C(对岸)", size=15, bold=True, click=2)]
    boxes.append(line(Ax, Ay, Bx, By, color="#2563EB", width=3, click=1))
    boxes.append(line(Ax, Ay, Cx, Cy, color="#2E7D32", width=3, click=3))
    boxes.append(line(Bx, By, Cx, Cy, color="#2E7D32", width=3, click=3))
    boxes.append(txt(760, 250, 430, 200, lines=["测出基线 AB 与两角", "∠CAB、∠CBA", "正弦定理求 AC、BC", "→ 得对岸距离"], size=19, color="ink", click=4))
    S.append(free(boxes, notes="单击1画河与可达基线AB,2标对岸点C,3连视线AC、BC,4说明测角后用正弦定理求距离。这是测量学经典。让学生说出需要实测哪些量(AB长、两个角)。"))
    S.append(bullets("解三角形的策略", [
        {"text": "已知两角一边 → 正弦定理", "sub": []},
        {"text": "两边夹角 / 三边 → 余弦定理", "sub": []},
        "两边及一边对角(SSA) → 正弦定理 + 讨论解的个数",
        "先找‘已知与所求’的边角对应，再选定理",
    ], notes="方法选择表,是全节抓手。让学生对着做题先分类再动手。"))
    S.append(bullets("课堂练习", [
        "① A=30°,C=105°,b=8,求 a（提示先求B）",
        "② a=3,b=4,C=60°,求 c",
        "③ a=2,b=√3,A=45°,判断解的个数",
    ], notes="留10分钟。答案:①B=45°,a=b·sinA/sinB=8·sin30°/sin45°=4√2;②c²=9+16−2·3·4·½=13,c=√13;③sinB=b·sinA/a=√6/4<1且b<a? b=√3<2=a⇒一解。"))
    S.append(stats("两大定理", [
        {"value": "a/sinA=2R", "label": "正弦定理", "desc": "边角成正比"},
        {"value": "a²=b²+c²−2bc·cosA", "label": "余弦定理", "desc": "含夹角"},
        {"value": "0/1/2", "label": "SSA 解数", "desc": "需讨论"},
    ], notes="收束核心公式。"))
    S.append(bullets("课堂小结", [
        "正弦定理：边角对应成比例，2R 联系外接圆",
        "余弦定理：勾股定理的推广，处理夹角/三边",
        "SSA 要讨论解的个数（画弧法 / 内角和法）",
        "实际测量：转化为解三角形",
    ], notes="齐述。预告:利用两定理求三角形面积。"))
    S.append(bullets("作业", [
        "已知 a=√3,b=1,B=30°,解三角形",
        "三角形三边 4,5,6，求最大角的余弦",
        "预习：三角形面积公式 S=½ab·sinC",
    ], notes="布置作业。"))
    S.append(closing("下节：三角形面积与综合", "S = ½ab·sinC",
                     notes="收尾预告面积公式。"))
    return S


if __name__ == "__main__":
    write_deck("deck03", "minimal-white", build())

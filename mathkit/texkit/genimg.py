# -*- coding: utf-8 -*-
"""概念图批量生成（文生图，MiniMax image-01）。数学公式一律不走文生图 —— 那是 KaTeX 的活。

用法（在 build 脚本里）：
    from genimg import gen_all
    gen_all(IMAGES, IMG_DIR)      # IMAGES = {name: prompt}
命令行：python genimg.py <目录> <name=prompt> ...
"""
import concurrent.futures as cf
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CLI = os.path.abspath(os.path.join(HERE, "..", "..", "build", "genimg"))
KEYFILE = os.path.abspath(os.path.join(HERE, "..", "..", "build", ".mmkey"))

# 所有概念图统一追加的约束（goal 第二节 2.）
GUARD = (" 16:9 horizontal composition, clean flat vector textbook illustration, "
         "white background, generous white space, single clear focal point, "
         "no text, no letters, no numbers, no formulas, no labels, no watermark, no logo")


def _key():
    k = os.environ.get("MINIMAX_API_KEY")
    if k:
        return k.strip()
    if os.path.exists(KEYFILE):
        return open(KEYFILE, encoding="utf-8").read().strip()
    raise RuntimeError("缺少 MINIMAX_API_KEY（或 build/.mmkey）")


def gen_one(name, prompt, out_dir, force=False):
    path = os.path.join(out_dir, name + ".png")
    if not force and os.path.exists(path) and os.path.getsize(path) > 20000:
        return name, True, "cached"
    env = dict(os.environ, MINIMAX_API_KEY=_key(), PYTHONIOENCODING="utf-8")
    for _ in range(2):
        r = subprocess.run([sys.executable, CLI, prompt + GUARD, path, "--ratio", "16:9"],
                           capture_output=True, text=True, encoding="utf-8",
                           errors="replace", env=env, timeout=420)
        if r.returncode == 0 and os.path.exists(path) and os.path.getsize(path) > 20000:
            return name, True, ""
    return name, False, (r.stderr or "").strip()[:160]


def gen_all(images, out_dir, force=False):
    os.makedirs(out_dir, exist_ok=True)
    res = {}
    with cf.ThreadPoolExecutor(max_workers=4) as ex:
        futs = {ex.submit(gen_one, k, v[0] if isinstance(v, (list, tuple)) else v,
                          out_dir, force): k for k, v in images.items()}
        for f in cf.as_completed(futs):
            n, ok, msg = f.result()
            res[n] = ok
            print(f"[img] {'OK  ' if ok else 'FAIL'} {n}.png {msg}")
    bad = [k for k, v in res.items() if not v]
    if bad:
        raise RuntimeError("概念图生成失败: " + ", ".join(bad))
    return {k: os.path.join(out_dir, k + ".png") for k in images}


if __name__ == "__main__":
    d = sys.argv[1]
    imgs = dict(a.split("=", 1) for a in sys.argv[2:])
    gen_all(imgs, d)

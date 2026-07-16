# -*- coding: utf-8 -*-
import os, sys, subprocess, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(__file__))

HERE = os.path.dirname(os.path.abspath(__file__))
IMGDIR = os.path.join(HERE, "img")
GENIMG = os.path.join(HERE, "genimg")
DESKTOP = "/mnt/c/Users/mi/Desktop"
os.makedirs(IMGDIR, exist_ok=True)

import deck_chun, deck_shanshui, deck_seasons, deck_cosmos

DECKS = [
    ("语文《春》朱自清·精读课", deck_chun),
    ("语文·山水田园诗鉴赏", deck_shanshui),
    ("English·The Four Seasons", deck_seasons),
    ("English·Solar System", deck_cosmos),
]

# ---- collect image jobs ----
jobs = {}   # abspath -> (prompt, ratio)
for _, mod in DECKS:
    pref = mod.__name__
    for k, (prompt, ratio) in mod.IMAGES.items():
        path = os.path.join(IMGDIR, f"{pref}_{k}.png")
        jobs[path] = (prompt, ratio, mod, k)

# ---- generate in parallel (skip existing) ----
todo = {p: v for p, v in jobs.items() if not (os.path.exists(p) and os.path.getsize(p) > 10000)}
print(f"[img] {len(jobs)} total, {len(todo)} to generate", flush=True)

def gen(path):
    prompt, ratio = jobs[path][0], jobs[path][1]
    for attempt in range(2):
        r = subprocess.run([sys.executable, GENIMG, prompt, path, "--ratio", ratio],
                           capture_output=True, text=True, timeout=400)
        if r.returncode == 0 and os.path.exists(path) and os.path.getsize(path) > 10000:
            return path, True, ""
    return path, False, r.stderr.strip()[:160]

fails = []
if todo:
    with cf.ThreadPoolExecutor(max_workers=6) as ex:
        futs = {ex.submit(gen, p): p for p in todo}
        done = 0
        for f in cf.as_completed(futs):
            path, ok, err = f.result()
            done += 1
            name = os.path.basename(path)
            print(f"[img] {done}/{len(todo)} {'OK ' if ok else 'FAIL'} {name} {err}", flush=True)
            if not ok:
                fails.append((path, err))

if fails:
    print("!!! image generation failures:", flush=True)
    for p, e in fails:
        print("   ", os.path.basename(p), e, flush=True)
    sys.exit(1)

# ---- build decks ----
os.makedirs(DESKTOP, exist_ok=True)
for title, mod in DECKS:
    pref = mod.__name__
    P = {k: os.path.join(IMGDIR, f"{pref}_{k}.png") for k in mod.IMAGES}
    deck = mod.build(P)
    out = os.path.join(DESKTOP, f"{title}.pptx")
    n = len(deck.prs.slides._sldIdLst)
    try:
        deck.save(out)
        print(f"[deck] saved {n} slides -> {out}", flush=True)
    except PermissionError:
        out2 = os.path.join(DESKTOP, f"{title}-新版.pptx")
        deck.save(out2)
        print(f"[deck] (原文件被占用) saved {n} slides -> {out2}", flush=True)

print("ALL DONE", flush=True)

# -*- coding: utf-8 -*-
import os, sys, subprocess, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(__file__))

HERE = os.path.dirname(os.path.abspath(__file__))
IMGDIR = os.path.join(HERE, "img")
GENIMG = os.path.join(HERE, "genimg")
DESKTOP = "/mnt/c/Users/mi/Desktop"
os.makedirs(IMGDIR, exist_ok=True)

import deck_yiwen as mod

pref = mod.__name__
jobs = {}
for k, (prompt, ratio) in mod.IMAGES.items():
    jobs[os.path.join(IMGDIR, f"{pref}_{k}.png")] = (prompt, ratio)

todo = {p: v for p, v in jobs.items() if not (os.path.exists(p) and os.path.getsize(p) > 10000)}
print(f"[img] {len(jobs)} total, {len(todo)} to generate", flush=True)

def gen(path):
    prompt, ratio = jobs[path]
    for attempt in range(2):
        r = subprocess.run([sys.executable, GENIMG, prompt, path, "--ratio", ratio],
                           capture_output=True, text=True, timeout=400)
        if r.returncode == 0 and os.path.exists(path) and os.path.getsize(path) > 10000:
            return path, True, ""
    return path, False, r.stderr.strip()[:200]

fails = []
if todo:
    with cf.ThreadPoolExecutor(max_workers=6) as ex:
        futs = {ex.submit(gen, p): p for p in todo}
        done = 0
        for f in cf.as_completed(futs):
            path, ok, err = f.result()
            done += 1
            print(f"[img] {done}/{len(todo)} {'OK ' if ok else 'FAIL'} {os.path.basename(path)} {err}", flush=True)
            if not ok:
                fails.append((path, err))

if fails:
    print("!!! image generation failures:", flush=True)
    for p, e in fails:
        print("   ", os.path.basename(p), e, flush=True)
    sys.exit(1)

P = {k: os.path.join(IMGDIR, f"{pref}_{k}.png") for k in mod.IMAGES}
deck = mod.build(P)
out = os.path.join(DESKTOP, "语文·高考议论文写作提升.pptx")
n = len(deck.prs.slides._sldIdLst)
try:
    deck.save(out)
    print(f"[deck] saved {n} slides -> {out}", flush=True)
except PermissionError:
    out = os.path.join(DESKTOP, "语文·高考议论文写作提升-新版.pptx")
    deck.save(out)
    print(f"[deck] (原文件被占用) saved {n} slides -> {out}", flush=True)
print("ALL DONE", flush=True)

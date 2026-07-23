# -*- coding: utf-8 -*-
"""把实渲出来的逐页 PNG 拼成联系表，便于一次性目检整份课件。
用法：python contact_sheet.py <preview目录> <输出目录> [每张张数=6]
"""
import os
import re
import sys

from PIL import Image, ImageDraw


def natural(p):
    m = re.search(r"(\d+)", os.path.basename(p))
    return int(m.group(1)) if m else 0


def main():
    src, dst = sys.argv[1], sys.argv[2]
    per = int(sys.argv[3]) if len(sys.argv) > 3 else 6
    cols = 2
    os.makedirs(dst, exist_ok=True)
    files = sorted([os.path.join(src, f) for f in os.listdir(src)
                    if f.lower().endswith(".png")], key=natural)
    tw, th = 1200, 675
    made = []
    for k in range(0, len(files), per):
        chunk = files[k:k + per]
        rows = (len(chunk) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * tw + (cols + 1) * 12, rows * th + (rows + 1) * 12),
                          (225, 228, 232))
        d = ImageDraw.Draw(sheet)
        for i, f in enumerate(chunk):
            im = Image.open(f).convert("RGB").resize((tw, th), Image.LANCZOS)
            x = 12 + (i % cols) * (tw + 12)
            y = 12 + (i // cols) * (th + 12)
            sheet.paste(im, (x, y))
            d.rectangle([x, y, x + tw - 1, y + th - 1], outline=(150, 158, 168), width=2)
            d.text((x + 8, y + 6), f"P{natural(f):02d}", fill=(200, 40, 40))
        out = os.path.join(dst, f"sheet_{k // per + 1:02d}.png")
        sheet.save(out)
        made.append(out)
        print(out)
    return made


if __name__ == "__main__":
    main()

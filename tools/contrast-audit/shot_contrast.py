import subprocess, sys
from PIL import Image

TESS = r"C:/Program Files/Tesseract-OCR/tesseract.exe"

def lum_rgb(rgb):
    def f(x):
        x = x / 255.0
        return x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4
    r, g, b = rgb
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)

def ratio(l1, l2):
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)

def analyze(path):
    im = Image.open(path).convert("RGB")
    W, H = im.size
    out = subprocess.run([TESS, path, "stdout", "--psm", "11", "tsv"],
                         capture_output=True, text=True).stdout
    rows = []
    seen = set()
    for line in out.splitlines()[1:]:
        p = line.split("\t")
        if len(p) < 12:
            continue
        try:
            conf = float(p[10])
        except ValueError:
            continue
        text = p[11].strip()
        if not text or conf < 40:
            continue
        left, top, width, height = int(p[6]), int(p[7]), int(p[8]), int(p[9])
        if width < 4 or height < 4:
            continue
        x1, y1 = max(0, left), max(0, top)
        x2, y2 = min(W, left + width), min(H, top + height)
        if x2 - x1 < 4 or y2 - y1 < 4:
            continue
        crop = im.crop((x1, y1, x2, y2))
        px = list(crop.getdata())
        if len(px) < 8:
            continue
        L = [lum_rgb(c) for c in px]
        i_min = L.index(min(L))
        i_max = L.index(max(L))
        r = ratio(L[i_min], L[i_max])
        key = (x1 // 20, y1 // 20, text)
        if key in seen:
            continue
        seen.add(key)
        rows.append((r, text, x1, y1, x2, y2, px[i_min], px[i_max]))
    rows.sort(key=lambda t: t[0])
    return rows

for path in sys.argv[1:]:
    rows = analyze(path)
    print("\n===== %s =====" % path.split("/")[-1])
    bad = [r for r in rows if r[0] < 4.5]
    print("words below 4.5:1 (worst first):")
    for r in bad[:45]:
        print("  [%.2f] %-30s box=(%d,%d %dx%d) dark=%s light=%s" %
              (r[0], r[1], r[2], r[3], r[4] - r[2], r[5] - r[3], r[6], r[7]))
    print("  total words=%d, bad=%d" % (len(rows), len(bad)))

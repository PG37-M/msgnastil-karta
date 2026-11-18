"""Строит синюю растровую подложку с рельефом (веб-меркатор, плитки 512px, z0..z4).
Вход: Natural Earth GRAY_50M_SR_OB.tif (общественное достояние) и data/countries.json.
Запуск: python3 make_relief.py GRAY_50M_SR_OB.tif ../data/countries.json ../data/relief
"""
import sys, os, json, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
Image.MAX_IMAGE_PIXELS = None
src, geo, out = sys.argv[1:4]
THEME = sys.argv[4] if len(sys.argv) > 4 else 'dark'   # dark | light
W, H = 8192, 4096
Z = 4; T = 512

gray = np.asarray(Image.open(src).convert('L').resize((W, H), Image.LANCZOS), dtype=np.float32) / 255.0

fc = json.load(open(geo, encoding='utf-8'))
land_img = Image.new('L', (W, H), 0); rus_img = Image.new('L', (W, H), 0)
dl, dr = ImageDraw.Draw(land_img), ImageDraw.Draw(rus_img)
px = lambda lon, lat: ((lon + 180) / 360 * W, (90 - lat) / 180 * H)
for f in fc['features']:
    polys = f['geometry']['coordinates'] if f['geometry']['type'] == 'MultiPolygon' else [f['geometry']['coordinates']]
    for poly in polys:
        for i, ring in enumerate(poly):
            pts = [px(x, y) for x, y in ring]
            if len(pts) < 3: continue
            fill = 255 if i == 0 else 0
            dl.polygon(pts, fill=fill)
            if f['properties']['name'] == 'Russia': dr.polygon(pts, fill=fill)
land = np.asarray(land_img.filter(ImageFilter.GaussianBlur(0.9)), dtype=np.float32) / 255.0
rus = np.asarray(rus_img.filter(ImageFilter.GaussianBlur(0.9)), dtype=np.float32) / 255.0
glow = np.asarray(land_img.filter(ImageFilter.GaussianBlur(16)), dtype=np.float32) / 255.0

def hexc(h): return np.array([int(h[i:i+2], 16) for i in (1, 3, 5)], dtype=np.float32)
def ramp(t, stops):
    t = np.clip(t, 0, 1) * (len(stops) - 1)
    i = np.minimum(t.astype(np.int32), len(stops) - 2); f = (t - i)[..., None]
    s = np.stack([hexc(c) for c in stops])
    return s[i] * (1 - f) + s[i + 1] * f

lm = land > 0.5
lo, hi = np.percentile(gray[lm], [3, 99.5]); tl = (gray - lo) / (hi - lo)
tl = np.clip(tl, 0, 1) ** 0.9
oc = ~lm
lo2, hi2 = np.percentile(gray[oc], [1, 99]); to = (gray - lo2) / (hi2 - lo2)

if THEME == 'light':
    c_land = ramp(tl, ['#3b74ba', '#5a90d0', '#7caae0', '#a0c6ec'])
    c_rus = ramp(tl, ['#3b74ba', '#5a90d0', '#7caae0', '#a0c6ec'])
    c_oc = ramp(to, ['#86b6e2', '#9ac4ea', '#aed1f0', '#c0ddf5'])
    c_oc += glow[..., None] * np.array([40, 36, 26], dtype=np.float32) * 0.9      # светлая отмель у берегов
else:
    c_land = ramp(tl, ['#2f6db5', '#4a8fd4', '#78b2ea', '#c4e0f8'])
    c_rus = ramp(tl, ['#4b8dd3', '#76b0e8', '#aed2f4', '#eef7ff'])
    c_oc = ramp(to, ['#071b3b', '#0e2f5e', '#17477f', '#2563a6'])
    c_oc += glow[..., None] * np.array([40, 110, 190], dtype=np.float32) * 0.6   # свечение у берегов
land_c = c_land * (1 - rus[..., None]) + c_rus * rus[..., None]
img = c_oc * (1 - land[..., None]) + land_c * land[..., None]
img = np.clip(img, 0, 255).astype(np.uint8)
del gray, c_land, c_rus, c_oc, land_c

# равнопромежуточная -> веб-меркатор (только пересчёт строк)
N = W
y = (np.arange(N) + 0.5) / N
lat = np.degrees(np.arctan(np.sinh(math.pi * (1 - 2 * y))))
r = (90 - lat) / 180 * H - 0.5
r0 = np.clip(np.floor(r).astype(np.int32), 0, H - 2); fr = np.clip(r - r0, 0, 1)[:, None, None]
merc = (img[r0].astype(np.float32) * (1 - fr) + img[r0 + 1].astype(np.float32) * fr).astype(np.uint8)
del img
full = Image.fromarray(merc); del merc

n = 0
for z in range(Z + 1):
    size = T * 2 ** z
    im = full if size == full.width else full.resize((size, size), Image.LANCZOS)
    for tx in range(2 ** z):
        for ty in range(2 ** z):
            d = os.path.join(out, str(z), str(tx)); os.makedirs(d, exist_ok=True)
            im.crop((tx * T, ty * T, (tx + 1) * T, (ty + 1) * T)).save(os.path.join(d, f'{ty}.webp'), 'WEBP', quality=80, method=4)
            n += 1
print('tiles', n)

# 生成 public/landing/*.svg 示意插画（等真实照片替换）。运行：python3 qa/gen_landing_art.py
import math, os, random

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'landing')
os.makedirs(OUT, exist_ok=True)

GRAIN = ('<filter id="g"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" stitchTiles="stitch"/>'
         '<feColorMatrix values="0 0 0 0 .3 0 0 0 0 .22 0 0 0 0 .14 0 0 0 .09 0"/></filter>'
         '<filter id="soft"><feGaussianBlur stdDeviation="18"/></filter>'
         '<filter id="soft2"><feGaussianBlur stdDeviation="6"/></filter>')


def svg(name, w, h, defs, body):
    s = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" preserveAspectRatio="xMidYMid slice">'
         f'<defs>{GRAIN}{defs}</defs>{body}<rect width="{w}" height="{h}" filter="url(#g)"/></svg>')
    with open(os.path.join(OUT, f'{name}.svg'), 'w', encoding='utf-8') as f:
        f.write(s)


def lg(id_, stops, x2=0, y2=1):
    st = ''.join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
    return f'<linearGradient id="{id_}" x1="0" y1="0" x2="{x2}" y2="{y2}">{st}</linearGradient>'


def rg(id_, stops, cx=.5, cy=.5, r=.5):
    st = ''.join(f'<stop offset="{o}" stop-color="{c}" stop-opacity="{op}"/>' for o, c, op in stops)
    return f'<radialGradient id="{id_}" cx="{cx}" cy="{cy}" r="{r}">{st}</radialGradient>'


def hills(w, base, amp, n, color, seed, op=1):
    random.seed(seed)
    pts = [(0, base)]
    for i in range(1, n + 1):
        x = w * i / n
        pts.append((x, base - amp * (0.4 + 0.6 * random.random())))
    d = f'M0 {base + 400} L' + ' L'.join(f'{x:.0f} {y:.0f}' for x, y in pts) + f' L{w} {base + 400} Z'
    # 平滑一点：用二次贝塞尔
    d = f'M0 {base + 600} L0 {pts[0][1]:.0f} ' + ' '.join(
        f'Q{(pts[i][0] + pts[i + 1][0]) / 2:.0f} {pts[i + 1][1] - amp * .25:.0f} {pts[i + 1][0]:.0f} {pts[i + 1][1]:.0f}' for i in range(len(pts) - 1)) + f' L{w} {base + 600} Z'
    return f'<path d="{d}" fill="{color}" opacity="{op}"/>'


def pines(x0, x1, base, h, color, seed, n=14):
    random.seed(seed)
    out = ''
    for i in range(n):
        x = x0 + (x1 - x0) * (i + random.random() * .6) / n
        hh = h * (0.6 + 0.6 * random.random())
        ww = hh * .32
        out += f'<path d="M{x:.0f} {base - hh:.0f} L{x + ww:.0f} {base:.0f} L{x - ww:.0f} {base:.0f} Z" fill="{color}"/>'
    return out


W, H = 1600, 1000

# 1 富士与湖
svg('fuji-lake', W, H,
    lg('sky', [(0, '#F6D9C4'), (.45, '#EBC9B8'), (1, '#AFC3D3')]) + lg('lake', [(0, '#9FB5C6'), (1, '#6F8BA2')]) + lg('mt', [(0, '#7C8FA8'), (1, '#4F6684')]),
    f'<rect width="{W}" height="{H}" fill="url(#sky)"/>'
    '<circle cx="1180" cy="250" r="70" fill="#FBEBD8" opacity=".85"/>'
    '<path d="M300 640 L700 300 Q800 230 900 300 L1320 640 Z" fill="url(#mt)"/>'
    '<path d="M700 300 Q800 230 900 300 L960 352 Q930 340 905 368 Q880 340 850 372 Q820 345 795 370 Q770 342 740 366 Q715 345 690 360 L640 352 Z" fill="#F7F4EE"/>'
    + hills(W, 660, 70, 6, '#5E7184', 3) +
    f'<rect y="680" width="{W}" height="320" fill="url(#lake)"/>'
    '<path d="M420 690 L700 950 Q800 990 900 950 L1180 690 Z" fill="#5C7792" opacity=".45"/>'
    '<g stroke="#E9EEF2" stroke-width="3" opacity=".5"><path d="M200 760h220M900 800h300M520 860h160M1100 900h220"/></g>'
    + pines(-40, 420, 720, 220, '#2F3B36', 5, 9) + pines(1220, 1660, 720, 200, '#2F3B36', 6, 8))

# 2 老街与寺门
facade = ''
for i in range(6):
    t = i / 6
    x = 40 + 520 * t
    hh = 760 - 380 * t
    facade += f'<rect x="{x:.0f}" y="{1000 - hh:.0f}" width="{120 - 60 * t:.0f}" height="{hh:.0f}" fill="#7A5638" opacity="{1 - t * .3:.2f}"/>'
    facade += f'<rect x="{1560 - x - (120 - 60 * t):.0f}" y="{1000 - hh:.0f}" width="{120 - 60 * t:.0f}" height="{hh:.0f}" fill="#6B4A30" opacity="{1 - t * .3:.2f}"/>'
    for side in (x + 30 - 15 * t, 1560 - x - 90 + 45 * t):
        facade += f'<ellipse cx="{side:.0f}" cy="{1000 - hh + 90:.0f}" rx="{22 - 10 * t:.0f}" ry="{32 - 14 * t:.0f}" fill="#D9573C"/><rect x="{side - 3:.0f}" y="{1000 - hh + 50:.0f}" width="6" height="12" fill="#3B2A1C"/>'
svg('old-street', W, H,
    lg('sky', [(0, '#F7E3C6'), (1, '#E9C9A2')]) + lg('road', [(0, '#B79C7E'), (1, '#8C7258')]) + rg('sun', [(0, '#FFF3D9', .9), (1, '#FFF3D9', 0)], .5, .45, .4),
    f'<rect width="{W}" height="{H}" fill="url(#sky)"/><rect width="{W}" height="{H}" fill="url(#sun)"/>'
    '<path d="M560 1000 L760 560 L840 560 L1040 1000 Z" fill="url(#road)"/>'
    '<g fill="#B4372A"><rect x="650" y="430" width="300" height="26" rx="6"/><rect x="630" y="400" width="340" height="24" rx="10"/>'
    '<rect x="690" y="456" width="22" height="200"/><rect x="888" y="456" width="22" height="200"/><rect x="680" y="500" width="240" height="14"/></g>'
    '<path d="M640 400 Q800 360 960 400" stroke="#3B2A1C" stroke-width="10" fill="none"/>' + facade)

# 3 城市夜景
random.seed(9)
bld = ''
for i in range(26):
    x = i * 64 - 20
    hh = 180 + random.random() * 340
    bld += f'<rect x="{x}" y="{1000 - hh:.0f}" width="58" height="{hh:.0f}" fill="#1E2638"/>'
    for r in range(int(hh // 34)):
        for c in range(3):
            if random.random() < .45:
                bld += f'<rect x="{x + 8 + c * 16}" y="{1000 - hh + 14 + r * 34:.0f}" width="9" height="14" fill="#F2C879" opacity="{.5 + random.random() * .5:.2f}"/>'
bokeh = ''.join(f'<circle cx="{random.random() * W:.0f}" cy="{760 + random.random() * 240:.0f}" r="{8 + random.random() * 26:.0f}" fill="{random.choice(["#F2B45E", "#E8735A", "#F6DFA6"])}" opacity="{.25 + random.random() * .35:.2f}" filter="url(#soft2)"/>' for _ in range(40))
tower = '<g stroke="#E2683F" stroke-width="7" fill="none"><path d="M1060 1000 L1160 260 L1260 1000"/><path d="M1090 780h140M1110 640h100M1128 500h64M1145 380h30"/><path d="M1090 780 L1210 640 M1230 780 L1110 640 M1110 640 L1192 500 M1210 640 L1128 500"/></g><rect x="1150" y="200" width="20" height="70" fill="#E2683F"/>'
svg('city-night', W, H,
    lg('sky', [(0, '#1B2236'), (.7, '#3A3557'), (1, '#6B4B5E')]) + rg('glow', [(0, '#F08C5A', .55), (1, '#F08C5A', 0)], .72, .6, .45),
    f'<rect width="{W}" height="{H}" fill="url(#sky)"/><rect width="{W}" height="{H}" fill="url(#glow)"/>' + tower + bld + bokeh)

# 4 运河夜景
lamps = ''
for i, x in enumerate([200, 420, 600, 740]):
    y = 470 + i * 30
    hh = 300 - i * 50
    lamps += f'<circle cx="{x}" cy="{y}" r="{90 - i * 15}" fill="url(#lamp)"/><rect x="{x - 4}" y="{y}" width="8" height="{hh}" fill="#2A2420"/><rect x="{x - 14}" y="{y - 20}" width="28" height="34" rx="4" fill="#F5C77A"/>'
    lamps += f'<rect x="{1560 - x}" y="{y + 10}" width="6" height="{hh}" fill="#2A2420"/><circle cx="{1563 - x}" cy="{y + 4}" r="{70 - i * 12}" fill="url(#lamp)"/><rect x="{1551 - x}" y="{y - 12}" width="24" height="30" rx="4" fill="#F5C77A"/>'
svg('canal-night', W, H,
    lg('sky', [(0, '#24324E'), (1, '#5B6585')]) + lg('water', [(0, '#3A4A66'), (1, '#1E2A40')]) + rg('lamp', [(0, '#F7C978', .8), (1, '#F7C978', 0)]),
    f'<rect width="{W}" height="{H}" fill="url(#sky)"/>'
    '<path d="M0 360 L560 520 L560 700 L0 760 Z" fill="#6F5A4A"/><path d="M0 330 L560 500 L560 520 L0 360 Z" fill="#E9EEF3"/>'
    '<g fill="#F2C47E" opacity=".85"><rect x="90" y="470" width="40" height="60"/><rect x="230" y="500" width="34" height="52"/><rect x="370" y="530" width="28" height="44"/></g>'
    '<path d="M0 760 L560 700 L1040 700 L1600 760 L1600 1000 L0 1000 Z" fill="url(#water)"/>'
    '<g stroke="#F7C978" stroke-width="6" opacity=".55"><path d="M220 800v120M440 780v90M620 740v60M1340 800v120M1160 780v90M980 740v60"/></g>'
    '<path d="M1040 700 L1600 640 L1600 760 Z" fill="#E9EEF3" opacity=".9"/>' + lamps)

# 5 雪中钟楼
trees = ''.join(f'<g stroke="#5A4A40" stroke-width="5" fill="none"><path d="M{x} 1000 V{760 - k}"/><path d="M{x} {860 - k} l-50 -60 M{x} {820 - k} l46 -70 M{x} {900 - k} l40 -40"/></g>' for x, k in [(140, 40), (300, 0), (1300, 20), (1480, 60)])
svg('snow-city', W, H,
    lg('sky', [(0, '#D7E0E6'), (1, '#F1EEE8')]),
    f'<rect width="{W}" height="{H}" fill="url(#sky)"/>'
    '<rect x="520" y="430" width="560" height="420" fill="#A6523C"/><path d="M500 440 L800 300 L1100 440 Z" fill="#7C3A2B"/><path d="M520 440 L800 312 L1080 440 L1080 452 L520 452 Z" fill="#F4F5F2"/>'
    '<rect x="720" y="170" width="160" height="200" fill="#B5604A"/><path d="M700 180 L800 90 L900 180 Z" fill="#5E6E5E"/><path d="M712 178 L800 102 L888 178 Z" fill="#F4F5F2" opacity=".85"/>'
    '<circle cx="800" cy="260" r="46" fill="#F5EFE2" stroke="#3B2A1C" stroke-width="6"/><path d="M800 260 V228 M800 260 L824 272" stroke="#3B2A1C" stroke-width="6" stroke-linecap="round"/>'
    + ''.join(f'<rect x="{560 + c * 90}" y="{500 + r * 110}" width="44" height="66" rx="20" fill="#F1E2C6" opacity=".9"/>' for c in range(6) for r in range(3))
    + '<path d="M0 840 Q800 780 1600 840 L1600 1000 L0 1000 Z" fill="#F7F7F4"/>' + trees
    + ''.join(f'<circle cx="{random.random() * W:.0f}" cy="{random.random() * 900:.0f}" r="{2 + random.random() * 4:.1f}" fill="#FFFFFF" opacity=".8"/>' for _ in range(120)))

# 6 雪原孤树
svg('snow-field', W, H,
    lg('sky', [(0, '#B9CADB'), (.6, '#E6E9EA'), (1, '#F4EFE6')]),
    f'<rect width="{W}" height="{H}" fill="url(#sky)"/><circle cx="420" cy="260" r="60" fill="#FFF6E6" opacity=".9"/>'
    + hills(W, 560, 120, 5, '#E3E7EB', 11) + hills(W, 680, 110, 4, '#EEF0F1', 12) + hills(W, 820, 90, 3, '#FAFAF8', 13) +
    '<g fill="#3E3A36"><rect x="1060" y="520" width="10" height="190"/></g>'
    '<ellipse cx="1065" cy="520" rx="86" ry="110" fill="#4A4A40"/><ellipse cx="1065" cy="500" rx="70" ry="80" fill="#5A5A4C" opacity=".6"/>'
    '<path d="M300 900 Q700 860 1100 900" stroke="#C9D3DC" stroke-width="5" fill="none" stroke-dasharray="14 18"/>')

# 7 雪景温泉
steam = ''.join(f'<ellipse cx="{500 + i * 120}" cy="{520 - (i % 3) * 60}" rx="{160 + (i % 2) * 60}" ry="90" fill="#FFFFFF" opacity=".35" filter="url(#soft)"/>' for i in range(6))
rocks = ''.join(f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="#5E5650"/><ellipse cx="{x}" cy="{y - ry * .55:.0f}" rx="{rx * .9:.0f}" ry="{ry * .45:.0f}" fill="#F3F4F2"/>' for x, y, rx, ry in [(260, 700, 150, 70), (460, 640, 110, 50), (1180, 650, 130, 55), (1400, 720, 170, 80), (820, 610, 90, 40)])
svg('onsen', W, H,
    lg('sky', [(0, '#C9CFD6'), (1, '#EDEAE4')]) + lg('pool', [(0, '#7FB2B0'), (1, '#4F8686')]),
    f'<rect width="{W}" height="{H}" fill="url(#sky)"/>' + pines(0, W, 520, 260, '#3B4A44', 21, 18) +
    '<path d="M0 500 Q800 460 1600 500 L1600 1000 L0 1000 Z" fill="#F4F4F1"/>'
    '<ellipse cx="800" cy="790" rx="640" ry="190" fill="url(#pool)"/>' + rocks + steam +
    '<path d="M0 0 H1600 V110 Q800 170 0 110 Z" fill="#4B3626"/><path d="M0 104 Q800 164 1600 104" stroke="#F3F4F2" stroke-width="16" fill="none"/>')

# 8 湖与远山
svg('lake-volcano', W, H,
    lg('sky', [(0, '#C8D6E3'), (1, '#F1E8DC')]) + lg('lake', [(0, '#7E9DB6'), (1, '#4E6E8C')]),
    f'<rect width="{W}" height="{H}" fill="url(#sky)"/>'
    '<path d="M760 560 L1060 300 Q1100 270 1140 300 L1440 560 Z" fill="#8798AE"/><path d="M1020 335 L1060 300 Q1100 270 1140 300 L1180 335 Q1150 325 1130 345 Q1100 322 1075 346 Q1050 326 1020 335 Z" fill="#F7F7F4"/>'
    + hills(W, 560, 40, 8, '#6E7F75', 31) + f'<rect y="580" width="{W}" height="420" fill="url(#lake)"/>'
    '<ellipse cx="520" cy="640" rx="110" ry="26" fill="#6E7F75"/>'
    '<path d="M0 880 Q500 820 900 900 T1600 870 L1600 1000 L0 1000 Z" fill="#F5F5F1"/>'
    '<g stroke="#EDF2F6" stroke-width="3" opacity=".5"><path d="M300 700h200M900 740h260M600 800h180"/></g>')

# 9 海鲜市场
stripes = ''.join(f'<path d="M{x} 260 L{x + 80} 260 L{x + 70} 380 L{x - 10} 380 Z" fill="{"#B4372A" if i % 2 else "#F3E6D0"}"/>' for i, x in enumerate(range(0, 1700, 80)))
crates = ''
for c in range(5):
    x = 120 + c * 290
    crates += f'<rect x="{x}" y="640" width="250" height="150" rx="10" fill="#8C6A47"/><rect x="{x + 12}" y="652" width="226" height="80" rx="6" fill="#E9EEF1"/>'
    for k in range(4):
        col = ["#E26B4A", "#C8D3DA", "#F0A35A", "#B7413A", "#8EA3B0"][(c + k) % 5]
        crates += f'<ellipse cx="{x + 48 + k * 52}" cy="{690 + (k % 2) * 12}" rx="30" ry="16" fill="{col}" transform="rotate({-15 + k * 10} {x + 48 + k * 52} 690)"/>'
svg('market', W, H,
    lg('bg', [(0, '#E9D3B2'), (1, '#B88E66')]) + rg('warm', [(0, '#FFE7B8', .7), (1, '#FFE7B8', 0)], .5, .55, .55),
    f'<rect width="{W}" height="{H}" fill="url(#bg)"/><rect width="{W}" height="{H}" fill="url(#warm)"/>'
    '<rect y="380" width="1600" height="260" fill="#5A4030"/>' + stripes + crates +
    '<rect y="790" width="1600" height="210" fill="#6B5240"/>'
    + ''.join(f'<g><rect x="{x - 2}" y="180" width="4" height="40" fill="#3B2A1C"/><ellipse cx="{x}" cy="240" rx="26" ry="36" fill="#E8B04E"/></g>' for x in [260, 640, 1000, 1380]))

# 10 机窗
svg('runway', W, H,
    lg('sky', [(0, '#7FA3C6'), (.6, '#C9D9E6'), (1, '#F4E6D2')]) + rg('cl', [(0, '#FFFFFF', .95), (1, '#FFFFFF', 0)]),
    f'<rect width="{W}" height="{H}" fill="#CFC4B4"/>'
    '<rect x="420" y="120" width="760" height="760" rx="300" fill="url(#sky)"/>'
    + ''.join(f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{rx * .35:.0f}" fill="url(#cl)"/>' for x, y, rx in [(560, 640, 260), (900, 700, 320), (1100, 620, 200), (700, 760, 280)]) +
    '<path d="M560 520 L1180 610 L1180 660 L700 600 Z" fill="#E6E8EB"/><path d="M700 600 L1180 660 L1180 676 L720 612 Z" fill="#9AA3AD"/>'
    '<rect x="420" y="120" width="760" height="760" rx="300" fill="none" stroke="#EDE6DA" stroke-width="60"/>'
    '<rect x="380" y="80" width="840" height="840" rx="330" fill="none" stroke="#B9AE9C" stroke-width="20"/>')

# 美食：俯拍桌面
F = 1200


def table(extra=''):
    return (lg('wood', [(0, '#8A6446'), (1, '#5E4130')], 1, 1) +
            '<pattern id="grain" width="1200" height="40" patternUnits="userSpaceOnUse"><path d="M0 20 Q300 10 600 22 T1200 18" stroke="#4A3324" stroke-width="2" fill="none" opacity=".35"/></pattern>' + extra)


def base():
    return f'<rect width="{F}" height="{F}" fill="url(#wood)"/><rect width="{F}" height="{F}" fill="url(#grain)"/>'


def bowl(cx, cy, r, rim='#2C2622', inner='#F2E9DA'):
    return f'<circle cx="{cx + 14}" cy="{cy + 18}" r="{r}" fill="#000" opacity=".25" filter="url(#soft2)"/><circle cx="{cx}" cy="{cy}" r="{r}" fill="{rim}"/><circle cx="{cx}" cy="{cy}" r="{r * .86:.0f}" fill="{inner}"/>'


def chop(x, y, a):
    return f'<g transform="rotate({a} {x} {y})"><rect x="{x}" y="{y}" width="620" height="14" rx="7" fill="#C9A270"/><rect x="{x}" y="{y + 26}" width="620" height="14" rx="7" fill="#C9A270"/></g>'


random.seed(41)
nigiri = ''
for i in range(6):
    x, y = 300 + (i % 3) * 230, 470 + (i // 3) * 230
    fish = ["#F08A5D", "#E04848", "#F4C3A6", "#F6D27A", "#E86F55", "#F2B9A0"][i]
    nigiri += f'<ellipse cx="{x + 8}" cy="{y + 12}" rx="95" ry="52" fill="#000" opacity=".2"/><ellipse cx="{x}" cy="{y}" rx="92" ry="50" fill="#F8F5EE"/><path d="M{x - 100} {y - 6} Q{x} {y - 70} {x + 100} {y - 6} Q{x} {y + 26} {x - 100} {y - 6} Z" fill="{fish}"/>'
    nigiri += ''.join(f'<path d="M{x - 60 + k * 30} {y - 34} q12 18 24 30" stroke="#FFFFFF" stroke-width="5" opacity=".45" fill="none"/>' for k in range(4))
svg('sushi', F, F, table(), base() + '<rect x="150" y="320" width="900" height="560" rx="18" fill="#C7A07A"/><rect x="150" y="320" width="900" height="560" rx="18" fill="none" stroke="#9C7756" stroke-width="10"/>' + nigiri + chop(240, 960, -8))

parts = [("#F28C28", 0), ("#F5C04A", 72), ("#C9343A", 144), ("#F6A1A1", 216), ("#E4572E", 288)]
bowl_parts = ''.join(f'<path d="M600 600 L{600 + 300 * math.cos(math.radians(a)):.0f} {600 + 300 * math.sin(math.radians(a)):.0f} A300 300 0 0 1 {600 + 300 * math.cos(math.radians(a + 72)):.0f} {600 + 300 * math.sin(math.radians(a + 72)):.0f} Z" fill="{c}"/>' for c, a in parts)
roe = ''.join(f'<circle cx="{600 + 200 * math.cos(math.radians(150 + random.random() * 60)) + random.random() * 40:.0f}" cy="{600 + 200 * math.sin(math.radians(150 + random.random() * 60)) + random.random() * 40:.0f}" r="9" fill="#F25C2A" stroke="#FFC08A" stroke-width="3"/>' for _ in range(50))
svg('seafood-bowl', F, F, table(), base() + bowl(600, 600, 400, '#2E2A27', '#F5EEDF') + bowl_parts + roe + '<circle cx="600" cy="600" r="70" fill="#7DAF6B"/>' + chop(150, 1040, -4))

legs = ''.join(f'<g transform="rotate({a} 600 620)"><rect x="620" y="600" width="380" height="54" rx="27" fill="#D2422E"/><rect x="620" y="600" width="380" height="20" rx="10" fill="#F0A07A" opacity=".6"/><circle cx="800" cy="627" r="22" fill="#B8331F"/></g>' for a in range(-70, 260, 40))
svg('crab', F, F, table(), base() + '<ellipse cx="616" cy="636" rx="480" ry="440" fill="#000" opacity=".22" filter="url(#soft2)"/><ellipse cx="600" cy="620" rx="470" ry="430" fill="#EDEAE3"/>' + legs + '<ellipse cx="600" cy="620" rx="150" ry="120" fill="#C9381F"/><circle cx="560" cy="600" r="20" fill="#F7E2CF"/><circle cx="650" cy="600" r="20" fill="#F7E2CF"/>')

veg = '<ellipse cx="480" cy="520" rx="110" ry="60" fill="#E9A03B" transform="rotate(-20 480 520)"/><ellipse cx="720" cy="540" rx="90" ry="70" fill="#3E6B39"/><circle cx="560" cy="720" r="80" fill="#F3D27A"/><ellipse cx="760" cy="740" rx="120" ry="50" fill="#6A2E4E" transform="rotate(25 760 740)"/><circle cx="600" cy="600" r="40" fill="#F7F2E6"/>'
svg('soup-curry', F, F, table(), base() + bowl(600, 620, 420, '#E9E4DA', '#C9711F') + '<circle cx="600" cy="620" r="360" fill="#D98A2B" opacity=".7"/>' + veg + ''.join(f'<circle cx="{random.randint(300, 900)}" cy="{random.randint(320, 920)}" r="{random.randint(5, 14)}" fill="#F6C36A" opacity=".8"/>' for _ in range(40)))

meat = ''.join(f'<g transform="rotate({-10 + i * 7} {420 + (i % 3) * 180} {440 + (i // 3) * 220})"><path d="M{350 + (i % 3) * 180} {400 + (i // 3) * 220} q70 -40 150 0 q20 50 -10 90 q-70 30 -140 0 q-30 -40 0 -90 Z" fill="#9B3B2E"/><path d="M{370 + (i % 3) * 180} {430 + (i // 3) * 220} q60 -20 110 10" stroke="#E7B9A2" stroke-width="10" fill="none"/></g>' for i in range(6))
svg('grill', F, F, table(), base() + '<circle cx="616" cy="636" r="470" fill="#000" opacity=".3" filter="url(#soft2)"/><circle cx="600" cy="620" r="460" fill="#2B2724"/>' + ''.join(f'<path d="M{200 + k * 70} 300 L{200 + k * 70} 940" stroke="#4A4440" stroke-width="12"/>' for k in range(12)) + meat + '<rect x="240" y="860" width="60" height="40" rx="10" fill="#7DA35C"/><circle cx="900" cy="880" r="40" fill="#E7A63B"/>')

strands = ''.join(f'<path d="M{330 + k * 18} 420 Q{600 + (k % 5) * 20} {560 + k * 6} {420 + k * 22} 820" stroke="#8C7B63" stroke-width="10" fill="none" opacity=".9"/>' for k in range(20))
svg('noodles', F, F, table(), base() + bowl(600, 620, 400, '#3A2E2A', '#6E5038') + '<circle cx="600" cy="620" r="330" fill="#7B5A3C"/>' + strands + '<g fill="#5E8B4A"><circle cx="720" cy="470" r="18"/><circle cx="760" cy="500" r="14"/><circle cx="700" cy="520" r="12"/></g><ellipse cx="480" cy="760" rx="70" ry="40" fill="#F2E6CC"/>' + chop(120, 160, 18))

svg('sweets', F, F, table(), base() +
    '<circle cx="470" cy="640" r="320" fill="#000" opacity=".2" filter="url(#soft2)"/><circle cx="460" cy="620" r="310" fill="#F4EFE6"/>'
    '<path d="M300 640 L640 520 L640 640 L300 760 Z" fill="#F6DFA5"/><path d="M300 640 L640 520 L700 560 L360 680 Z" fill="#F9E9B8"/><path d="M300 760 L640 640 L700 680 L360 800 Z" fill="#E7C27A"/><path d="M300 640 L360 680 L360 800 L300 760 Z" fill="#E8C886"/>'
    '<circle cx="900" cy="380" r="170" fill="#EDE6DA"/><circle cx="900" cy="380" r="130" fill="#6B4430"/><circle cx="880" cy="360" r="40" fill="#C99B74" opacity=".6"/>'
    '<rect x="760" y="760" width="200" height="20" rx="10" fill="#C9C2B6" transform="rotate(-30 860 770)"/>')

dishes = ''
for i, (x, y, r, col) in enumerate([(380, 400, 130, '#E8DCC6'), (760, 380, 110, '#2F4A3E'), (420, 780, 120, '#B5432C'), (800, 760, 140, '#E8DCC6'), (600, 590, 90, '#D9B25A')]):
    dishes += f'<circle cx="{x + 8}" cy="{y + 10}" r="{r}" fill="#000" opacity=".25"/><circle cx="{x}" cy="{y}" r="{r}" fill="{col}"/><circle cx="{x}" cy="{y}" r="{r * .7:.0f}" fill="{["#F4D9C8", "#E8A86B", "#F7EFE2", "#E9785A", "#F3E9C9"][i]}"/>'
svg('kaiseki', F, F, table(), base() + '<rect x="130" y="160" width="940" height="880" rx="40" fill="#3B1E18"/><rect x="160" y="190" width="880" height="820" rx="30" fill="#5A2A20"/>' + dishes)

print('ok', len(os.listdir(OUT)))

import re, json, sys, collections
# Build data/rackets.js from scripts/sources/* plus data/spec-overrides.json.
# Run from anywhere: python3 scripts/build_rackets.py
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'scripts', 'sources')
out = os.path.join(ROOT, 'data', 'rackets.js')
cb = json.load(open(os.path.join(SRC, 'chobbad-rackets.json'), encoding='utf-8'))
yx = json.load(open(os.path.join(SRC, 'yonex-official.json'), encoding='utf-8'))
OVR_PATH = os.path.join(ROOT, 'data', 'spec-overrides.json')
overrides = json.load(open(OVR_PATH, encoding='utf-8')) if os.path.exists(OVR_PATH) else {}

def key(s): return re.sub(r'[^a-z0-9]', '', s.lower())
def slug(s): return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')

STYLE = {'บุก': 'attack', 'สปีด': 'speed', 'คอนโทรล': 'control', 'ออลราวด์': 'allround'}
LEVEL = {'มือใหม่': 'beginner', 'ระดับกลาง': 'intermediate', 'ระดับกลางถึงสูง': 'advanced', 'ระดับสูง': 'advanced', 'โปร': 'pro'}
DBAL = {'หนักด้านหัวไม้': 'head-heavy', 'หนักหัว': 'head-heavy', 'สมดุล': 'even', 'สมดุลกลาง': 'even',
        'เบาด้านหัวไม้': 'head-light', 'สมดุลค่อนข้างเบาหัว': 'head-light', 'หนักด้านหัวด้าม': 'head-light', 'หนักด้าม': 'head-light'}

def boxpos(s):
    m = re.search(r'[□■]{5}', s)
    return m.group(0).index('■') if m and '■' in m.group(0) else None

def balance(raw, d):
    if d in DBAL: return DBAL[d]
    s = raw.lower()
    p = boxpos(raw)
    if p is not None:
        before = s[:re.search(r'[□■]{5}', s).start()]
        p = p if re.search(r'heavy|nặng', before) else 4 - p
        return 'head-heavy' if p <= 1 else 'even' if p == 2 else 'head-light'
    if re.search(r'head[ -]?heavy|nặng đầu|หัวหนัก', s): return 'head-heavy'
    if re.search(r'head[ -]?light|nhẹ đầu|หัวเบา', s): return 'head-light'
    if re.search(r'even|cân bằng|สมดุล', s): return 'even'
    m = re.search(r'(\d{3})\s*(\+|mm|\[)', s) or re.search(r'(\d{3})', s)
    if m and 270 <= int(m.group(1)) <= 330:
        v = int(m.group(1)); return 'head-heavy' if v >= 300 else 'head-light' if v <= 290 else 'even'
    return ''

def flex(raw):
    s = raw.lower()
    if not s or s == 'none': return ''
    p = boxpos(raw)
    if p is not None:
        before = s[:re.search(r'[□■]{5}', s).start()]
        p = p if re.search(r'stiff|cứng|แข็ง', before) else 4 - p
        return ['extra-stiff', 'stiff', 'medium', 'flexible', 'flexible'][p]
    m = re.search(r'stiffness\s*([\d.]+)', s)
    if m:
        v = float(m.group(1)); return 'extra-stiff' if v >= 9.5 else 'stiff' if v >= 8.5 else 'medium'
    if re.search(r'extra|super stiff|very stiff|แข็งมาก', s): return 'extra-stiff'
    if re.search(r'medium stiff|mid.?stiff', s): return 'stiff'
    if re.search(r'hard flex', s): return 'medium'
    if re.search(r'stiff|แข็ง|cứng', s): return 'stiff'
    if re.search(r'medium|กลาง|trung bình|regular|mid', s): return 'medium'
    if re.search(r'flex|soft|อ่อน|linh hoạt|dẻo|mềm', s): return 'flexible'
    return ''

UW = {'2U': 93, '3U': 88, '4U': 83, '5U': 78, '6U': 73, '7U': 68}
def weights(*txt):
    t = ' '.join(txt)
    us = sorted(set(re.findall(r'\b([2-7]U)\b', t)), key=lambda u: -int(u[0]))
    g = None
    m = re.search(r'4U[^)]*?(\d{2})(?:\.\d)?\s*g', t) or re.search(r'(\d{2})(?:\.\d)?\s*g\b', t)
    if m and 60 <= int(m.group(1)) <= 100: g = int(m.group(1))
    elif us: g = UW['4U'] if '4U' in us else UW[us[0]]
    return ', '.join(us[::-1]) if us else '', g or ''

def grips(t):
    gs = set()
    for m in re.finditer(r'G\s?(\d)((?:\s*[,/]\s*\d)*)', t):
        gs.add(m.group(1)); gs.update(re.findall(r'\d', m.group(2)))
    return ', '.join('G' + g for g in sorted(gs))

def tension(t):
    rs = [(int(a), int(b)) for a, b in re.findall(r'(\d{2})\s*(?:[-–~]|to)\s*(\d{2})', t) if 10 <= int(a) <= int(b) <= 40]
    if rs: return [min(a for a, _ in rs), max(b for _, b in rs)]
    ns = [int(n) for n in re.findall(r'(\d{2})\s*(?:lbs?|ปอนด์|lb)', t, re.I) if 15 <= int(n) <= 40]
    if ns: return [None, max(ns)]  # only a ceiling is known
    return None

def price(t):
    m = re.search(r'ประมาณ\s*([\d,]+)\s*บาท', t) or re.search(r'([\d,]{3,})\s*บาท', t) or re.search(r'฿\s*([\d,]{3,})', t)
    return int(m.group(1).replace(',', '')) if m else ''

rackets = {}
for i in cb:
    name = i['name'].strip()
    brand = i['brand']
    short = name[len(brand):].strip() if name.lower().startswith(brand.lower()) else name
    ws, g = weights(i['weight_g'], i['weight_grip'])
    r = {
        'id': slug(name), 'brand': brand, 'name': short, 'year': int(i['year']) if i['year'].isdigit() else '',
        'style': STYLE.get(i['d_style'], ''), 'balance': balance(i['balance'], i['d_balance']), 'flex': flex(i['flex']),
        'level': LEVEL.get(i['d_level'], ''), 'weights': ws, 'weight': g, 'grips': grips(i['weight_grip']),
        'tension': tension(i['tension_max']), 'price': price(i['price_official']),
        'frame': i['frame_mat'], 'shaft': i['shaft_mat'], 'joint': i['joint'], 'length': i['length'],
        'pattern': i['string_pattern'], 'tech': i['tech'], 'players': i['players'], 'madeIn': i['made_in'],
        'img': i['img'], 'source': i['url'], 'note': '',
    }
    k = key(name)
    if k in rackets:
        old = rackets[k]
        for f, v in r.items():
            if old.get(f) in ('', None) and v not in ('', None): old[f] = v
    else:
        rackets[k] = r

KEEP_UP = {'ZZ', 'VA', 'DG', 'RX', 'HF', 'ST', 'TR', 'LT', 'MDM', 'D', 'S', 'E', 'Z', 'B'}
def title(n): return ' '.join(w if w in KEEP_UP or not w.isalpha() else '-'.join(p.capitalize() for p in w.split('-')) for w in n.split())
def ylevel(n):
    n = n.upper()
    if re.search(r'\bZZ\b|PRO\b|1000 Z|Z-STRIKE', n): return 'pro'
    if 'TOUR' in n: return 'advanced'
    if re.search(r'GAME|DG|NEXTAGE|\b555\b|22 RX', n): return 'intermediate'
    return 'beginner'

added, updated = [], 0
for y in yx:
    nm = title(y['name'].replace('Z-STRIKE', 'Z-STRIKE'))
    k = key('Yonex ' + y['name'])
    series = y['name'].split()[0].upper()
    ws, g = weights(y.get('Weight / Grip', ''))
    fl = {'hi-flex': 'flexible', 'medium': 'medium', 'stiff': 'stiff', 'extra stiff': 'extra-stiff'}.get(y.get('Flex', '').lower(), '')
    off = {
        'flex': fl, 'weights': ws, 'weight': g, 'grips': grips(y.get('Weight / Grip', '')),
        'tension': tension(y.get('Stringing Advice', '')), 'frame': y.get('Frame', ''), 'shaft': y.get('Shaft', ''),
        'joint': y.get('Joint', ''), 'length': y.get('Length', ''), 'madeIn': y.get('Made In', ''),
        'officialUrl': y['url'], 'recString': y.get('Recommended String', ''),
    }
    if k in rackets:
        r = rackets[k]
        for f, v in off.items():
            if v not in ('', None): r[f] = v
        updated += 1
    else:
        r = {'id': slug('yonex ' + nm), 'brand': 'Yonex', 'name': nm, 'year': '',
             'style': {'ASTROX': 'attack', 'NANOFLARE': 'speed', 'ARCSABER': 'control', 'DUORA': 'attack'}.get(series, ''),
             'balance': {'ASTROX': 'head-heavy', 'NANOFLARE': 'head-light', 'ARCSABER': 'even', 'DUORA': 'head-heavy'}.get(series, ''),
             'level': ylevel(y['name']), 'price': '', 'pattern': '', 'tech': '', 'players': '', 'img': '', 'source': '',
             'note': 'ข้อมูลจากเว็บ Yonex ทางการ (ระดับ/แนวการเล่นประเมินจากซีรีส์)', **off}
        rackets[k] = r
        added.append(nm)


# ---- manual spec lookups (data/spec-overrides.json): "Brand Model" -> fields + src ----
unmatched = []
for full_name, o in overrides.items():
    if full_name.startswith('_'): continue
    r = rackets.get(key(full_name))
    if r is None:
        if not o.get('new'): unmatched.append(full_name); continue
        brand = o.get('brand') or full_name.split()[0]
        r = {'id': slug(full_name), 'brand': brand, 'name': full_name[len(brand):].strip(), 'year': '', 'style': '', 'balance': '',
             'flex': '', 'level': '', 'weights': '', 'weight': '', 'grips': '', 'tension': None, 'price': '', 'frame': '', 'shaft': '',
             'joint': '', 'length': '', 'pattern': '', 'tech': '', 'players': '', 'madeIn': '', 'img': '', 'source': '', 'note': ''}
        rackets[key(full_name)] = r
    for f, v in o.items():
        if f in ('src', 'new', 'brand') or v in ('', None): continue
        if f == 'tmax':
            lo = (r.get('tension') or [None])[0]
            r['tension'] = [lo, v]
        else:
            r[f] = v
    r['specSrc'] = o.get('src', '')
if unmatched: print('override names not found:', unmatched)

# ---- series-based estimates for missing style/balance (flagged in r['est']) ----
SERIES = [
    ('Victor', r'thruster|\bTK\b', 'attack', 'head-heavy'),
    ('Victor', r'auraspeed|\bARS\b|jetspeed|\bJS\b', 'speed', 'head-light'),
    ('Victor', r'drivex|\bDX\b|brave ?sword|\bBRS\b', 'allround', 'even'),
    ('Li-Ning', r'axforce|aeronaut|turbo charging|calibar', 'attack', 'head-heavy'),
    ('Li-Ning', r'blade ?x|windstorm', 'speed', 'head-light'),
    ('Li-Ning', r'halbertec', 'control', 'even'),
    ('Li-Ning', r'tectonic|g-?force', 'allround', 'even'),
    ('Mizuno', r'fortius|acroforce|jpx', 'attack', 'head-heavy'),
    ('Mizuno', r'acrospeed|altrax', 'speed', 'head-light'),
    ('Mizuno', r'altius', 'control', 'even'),
    ('*', r'\bpower\b|\boffensive\b|smash|attack', 'attack', 'head-heavy'),
    ('*', r'\bspeed\b', 'speed', 'head-light'),
    ('*', r'\bcontrol\b', 'control', 'even'),
]
FROM_BAL = {'head-heavy': 'attack', 'head-light': 'speed', 'even': 'allround'}
FROM_STYLE = {'attack': 'head-heavy', 'speed': 'head-light', 'control': 'even', 'allround': 'even'}
for r in rackets.values():
    est = []
    hit = next(((st, bl) for b, rx, st, bl in SERIES if (b == '*' or b == r['brand']) and re.search(rx, r['name'], re.I)), None)
    if not r['balance']:
        bl = hit[1] if hit else FROM_STYLE.get(r['style'], '')
        if bl: r['balance'] = bl; est.append('balance')
    if not r['style']:
        st = hit[0] if hit else FROM_BAL.get(r['balance'], '')
        if st: r['style'] = st; est.append('style')
    r['est'] = est
order = ['id', 'brand', 'name', 'year', 'style', 'balance', 'flex', 'level', 'weights', 'weight', 'grips', 'tension', 'price',
         'frame', 'shaft', 'joint', 'length', 'pattern', 'tech', 'players', 'madeIn', 'recString', 'img', 'source', 'officialUrl', 'specSrc', 'note', 'est']
final, seen = [], set()
for r in sorted(rackets.values(), key=lambda r: (r['brand'], r['name'])):
    while r['id'] in seen: r['id'] += '-2'
    seen.add(r['id'])
    final.append({k: r.get(k, '') for k in order})

head = """// ข้อมูลไม้แบด — แก้ไฟล์นี้ตรง ๆ ได้ หรือแก้ผ่านหน้า "จัดการข้อมูล" แล้วกด Export มาทับไฟล์นี้
// แหล่งข้อมูล: chobbad.com (สเปกรวม) + yonex.com (สเปกทางการ ทับค่า Yonex)
// style: attack | speed | control | allround, balance: head-light | even | head-heavy
// flex: flexible | medium | stiff | extra-stiff, level: beginner | intermediate | advanced | pro
// weight: น้ำหนักเฉลี่ย (กรัม), tension: [ต่ำสุด, สูงสุด] ปอนด์, price: ราคาทางการแปลงเป็นบาท (ประมาณ)
"""
open(out, 'w').write(head + 'window.RACKETS = ' + json.dumps(final, ensure_ascii=False, indent=1) + ';\n')
print('total', len(final), 'yonex updated', updated, 'added', len(added))
print(added)
c = collections.Counter
print('balance', c(r['balance'] for r in final)); print('flex', c(r['flex'] for r in final))
print('style', c(r['style'] for r in final)); print('est', c(len(r['est']) for r in final)); print('tension none', sum(1 for r in final if not r['tension'])); print('price none', sum(1 for r in final if not r['price']))

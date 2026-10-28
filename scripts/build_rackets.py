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
        if not r.get('img'): r['img'] = y.get('img', '')
        updated += 1
    else:
        r = {'id': slug('yonex ' + nm), 'brand': 'Yonex', 'name': nm, 'year': '',
             'style': {'ASTROX': 'attack', 'NANOFLARE': 'speed', 'ARCSABER': 'control', 'DUORA': 'attack'}.get(series, ''),
             'balance': {'ASTROX': 'head-heavy', 'NANOFLARE': 'head-light', 'ARCSABER': 'even', 'DUORA': 'head-heavy'}.get(series, ''),
             'level': ylevel(y['name']), 'price': '', 'pattern': '', 'tech': '', 'players': '', 'img': y.get('img', ''), 'source': '',
             'note': 'ข้อมูลจากเว็บ Yonex ทางการ (ระดับ/แนวการเล่นประเมินจากซีรีส์)', **off}
        rackets[k] = r
        added.append(nm)



# ---- manual spec lookups (data/spec-overrides.json): "Brand Model" -> fields + src ----
def apply_override(r, o):
    for f, v in o.items():
        if f in ('src', 'new', 'brand', 'currency') or v in ('', None): continue
        if f == 'priceForeign':
            r['priceForeign'] = {'amount': v, 'currency': o.get('currency', 'USD'), 'src': o.get('src', '')}
        elif f == 'tmax':
            r['tension'] = [(r.get('tension') or [None])[0], v]
        else:
            r[f] = v
            if f in r.get('est', []): r['est'].remove(f)
    r['specSrc'] = o.get('src', '')

# first pass; names the Thai-shop layer creates later get a second pass after it
deferred = []
for full_name, o in overrides.items():
    if full_name.startswith('_'): continue
    r = rackets.get(key(full_name))
    if r is None:
        if not o.get('new'): deferred.append(full_name); continue
        brand = o.get('brand') or full_name.split()[0]
        r = {'id': slug(full_name), 'brand': brand, 'name': full_name[len(brand):].strip(), 'year': '', 'style': '', 'balance': '',
             'flex': '', 'level': '', 'weights': '', 'weight': '', 'grips': '', 'tension': None, 'price': '', 'frame': '', 'shaft': '',
             'joint': '', 'length': '', 'pattern': '', 'tech': '', 'players': '', 'madeIn': '', 'img': '', 'source': '', 'note': ''}
        rackets[key(full_name)] = r
    apply_override(r, o)

# ---- Badminton Plaza (Thai shop): fills empty image, THB price and specs; adds models we lack ----
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plaza_match import match as pmatch, clean as pclean, skip as pskip, NEW_NAMES
PLAZA = os.path.join(SRC, 'plaza.json')
plaza = json.load(open(PLAZA, encoding='utf-8')) if os.path.exists(PLAZA) else []
plaza_hits = plaza_new = 0
for pz in plaza:
    pool = {r['name']: r for r in rackets.values() if r['brand'] == pz['brand']}
    m, _ = pmatch(pz['name'], pool)
    if m:
        r = pool[m]; plaza_hits += 1
    elif not pskip(pz['name']) and pclean(pz['name']) in NEW_NAMES:
        nm = NEW_NAMES[pclean(pz['name'])]
        k = key(pz['brand'] + ' ' + nm)
        r = rackets.get(k)
        if r is None:
            r = rackets[k] = {'id': slug(pz['brand'] + ' ' + nm), 'brand': pz['brand'], 'name': nm, 'year': '', 'style': '', 'balance': '',
                              'flex': '', 'level': '', 'weights': '', 'weight': '', 'grips': '', 'tension': None, 'price': '', 'frame': '',
                              'shaft': '', 'joint': '', 'length': '', 'pattern': '', 'tech': '', 'players': '', 'madeIn': '', 'img': '',
                              'source': '', 'note': ''}
            plaza_new += 1
    else:
        continue
    bal_raw = (pz.get('balance') or '').replace('Headvy', 'Heavy').replace('headvy', 'heavy')
    ws, g = weights(pz.get('weight', ''))
    fill = {'img': pz.get('img', ''), 'price': int(pz['price']) if pz.get('price') else '', 'balance': balance(bal_raw, ''),
            'flex': flex(pz.get('flex', '')), 'weights': ws, 'weight': g, 'grips': grips(pz.get('weight', '') + ' ' + pz.get('grip', '')),
            'tension': tension(pz.get('tension', '')), 'frame': pz.get('frame') or pz.get('material', ''), 'shaft': pz.get('shaft', ''),
            'length': pz.get('length', '')}
    for f, v in fill.items():
        if v not in ('', None) and r.get(f) in ('', None): r[f] = v
    if not r.get('shopUrl'): r['shopUrl'] = 'https://www.badmintonplaza.com/product_info.php?products_id=' + str(pz['id'])
print('plaza matched', plaza_hits, 'added', plaza_new)
unmatched = []
for full_name in deferred:
    r = rackets.get(key(full_name))
    if r is None: unmatched.append(full_name)
    else: apply_override(r, overrides[full_name])
if unmatched: print('override names not found:', unmatched)


# ---- Badminton Bay (Malaysia, USD): fills empty specs and images; its price is only a foreign-price candidate ----
BAY = os.path.join(SRC, 'bay.json')
bay = json.load(open(BAY, encoding='utf-8')) if os.path.exists(BAY) else []
def bay_balance(t):
    t = (t or '').lower()
    if 'heavy' in t: return 'head-heavy'
    if 'light' in t: return 'head-light'
    if 'even' in t: return 'even'
    m = re.search(r'(\d{3})\s*mm', t)
    if m: v = int(m.group(1)); return 'head-heavy' if v >= 300 else 'head-light' if v <= 290 else 'even'
    return ''
def bay_flex(t):
    t = (t or '').lower()
    if re.search('[ก-๙]', t):
        # "กลางค่อนแข็ง" sits between two classes, so it stays empty
        if 'กลาง' in t and ('แข็ง' in t or 'อ่อน' in t): return ''
        return 'extra-stiff' if 'แข็งมาก' in t else 'stiff' if 'แข็ง' in t else 'medium' if 'กลาง' in t else 'flexible' if 'อ่อน' in t else ''
    if 'extra' in t: return 'extra-stiff'
    if 'stiff' in t: return 'stiff'
    if 'medium' in t: return 'medium'
    if 'flex' in t or 'soft' in t: return 'flexible'
    return ''
# Badminton Click (Australia, AUD) has the same text spec block plus a recommended level; it runs through the same layer
CLICK = os.path.join(SRC, 'click.json')
click = json.load(open(CLICK, encoding='utf-8')) if os.path.exists(CLICK) else []
for c in click: c['src'] = 'click'
LEVEL_WORD = {'beginner': 'beginner', 'beginners': 'beginner', 'intermediate': 'intermediate', 'advanced': 'advanced', 'professional': 'pro', 'pro': 'pro'}
def one_level(t):
    # "Intermediate - Advanced" is a range, not a level; only a single word counts
    w = (t or '').strip().lower()
    return LEVEL_WORD.get(w, '')
# Other shops with a public product feed (scripts/fetch_shops.py): raw {label: value} spec blocks, mapped here
SHOPS = os.path.join(SRC, 'shops.json')
BRAND_OF = {'victor': 'Victor', 'yonex': 'Yonex', 'li-ning': 'Li-Ning', 'li ning': 'Li-Ning', 'lining': 'Li-Ning', 'vs': 'VS',
            'apacs': 'Apacs', 'mizuno': 'Mizuno', 'kawasaki': 'Kawasaki'}
from spec_text import parse as parse_spec
PAGES = json.load(open(os.path.join(SRC, 'pages.json'), encoding='utf-8')) if os.path.exists(os.path.join(SRC, 'pages.json')) else {}
def from_shop(p):
    brand = BRAND_OF.get(p['brand'].strip().lower(), '')
    if not brand: return None
    # drop colourways, sizes and the shop's framing; digits for generations become numerals as in this data
    nm = re.sub(r'\([^)]*\)|\[[^\]]*\]|\b(new|20\d\d|badminton|racket|racquet|unstrung|strung|pre-strung)\b|ไม้แบด|\s[-–]\s.*$|\d+\s*grams?', ' ', p['name'], flags=re.I)
    nm = re.sub(r'(?<=[A-Za-z]) ([2-4])\b(?! ?[\d.])', lambda m: ' ' + {'2': 'II', '3': 'III', '4': 'IV'}[m.group(1)], nm)
    # older shops.json files carry only the labelled spec; rebuild lines from it
    lines = p.get('lines') or [f'{k}: {v}' for k, v in p.get('spec', {}).items()]
    # the spec table from the product page itself (scripts/fetch_pages.py) goes first: it is the labelled source
    lines = PAGES.get(p['url'], []) + lines
    sp = parse_spec(lines, p.get('options', []))
    return {'src': 'shop', 'shop': p['shop'], 'brand': brand, 'name': nm, 'url': p['url'], 'img': p.get('img', ''),
            'price': p.get('price'), 'currency': p.get('currency'), 'parsed': sp}
# Victor's official Thai pages (scripts/fetch_victor.py) come first, so the maker's figures win over shops'
VOFF = os.path.join(SRC, 'victor-official.json')
shop_pages = (json.load(open(VOFF, encoding='utf-8')) if os.path.exists(VOFF) else []) + (json.load(open(SHOPS, encoding='utf-8')) if os.path.exists(SHOPS) else [])
shops = [x for x in (from_shop(p) for p in shop_pages) if x]
bay_hits = {'bay': 0, 'click': 0, 'shop': 0}
for bz in bay + click + shops:
    if bz.get('src') == 'click':
        # "NEW 2027 Victor Thruster Ryuga 3 (78 grams) Badminton Racquet": drop the shop's framing before matching
        bz = {**bz, 'name': re.sub(r'\b(new|20\d\d)\b|\(\d+ g\w*\)|\d+ g\w*|\[[^\]]*\]|\([^)]*edition\)', ' ', bz['name'], flags=re.I)}
        # the shop writes generations as digits ("Ryuga Muse 2"), this data as numerals ("Ryuga Muse II")
        bz['name'] = re.sub(r'(?<=[A-Za-z]) ([2-4])\b(?! ?[\d.])', lambda m: ' ' + {'2': 'II', '3': 'III', '4': 'IV'}[m.group(1)], bz['name'])
    pool = {r['name']: r for r in rackets.values() if r['brand'] == bz['brand']}
    m, _ = pmatch(bz['name'], pool)
    if not m: continue
    r = pool[m]; bay_hits[bz.get('src', 'bay')] += 1
    ws, g = weights(bz.get('weight', ''))
    if bz.get('src') == 'shop':
        ps = bz['parsed']
        fill = {'balance': ps['balance'], 'flex': ps['flex'], 'weights': ps['weights'], 'weight': ps['weight'],
                'tension': [None, ps['tmax']] if ps['tmax'] else None, 'grips': ps['grips'], 'img': bz.get('img', ''),
                # Li-Ning's own stores tag even entry rackets "Professional", so their level is not used
                'level': '' if 'lining.studio' in bz['shop'] else one_level(ps['level']), 'recString': ps['recText'],
                **{f: ps[f] for f in ('frame', 'shaft', 'length', 'joint', 'madeIn', 'tech', 'players', 'pattern')}}
    else:
        fill = {'balance': bay_balance(bz.get('balance')), 'flex': bay_flex(bz.get('flex')), 'weights': ws, 'weight': g,
            'tension': tension(bz.get('tension', '')), 'frame': bz.get('frame', ''), 'shaft': bz.get('shaft', ''),
            'length': bz.get('length', ''), 'img': bz.get('img', ''), 'level': one_level(bz.get('level')),
            'grips': re.sub(r'\s*\(.*?\)', '', bz.get('grips', '')),
            'recString': bz.get('recText') or ', '.join(f'{v} ({k})' for k, v in (('คุม', bz.get('strControl')), ('พลัง', bz.get('strPower'))) if v),
            'joint': bz.get('joint', ''), 'madeIn': bz.get('madeIn', ''), 'tech': bz.get('tech', ''), 'players': bz.get('players', ''),
            'pattern': bz.get('pattern', '')}
    for f, v in fill.items():
        if v not in ('', None) and (r.get(f) in ('', None) or f in r.get('est', []) or f in r.get('proseEst', [])):
            r[f] = v
            if f in r.get('est', []): r['est'].remove(f)
            if f in r.get('proseEst', []): r['proseEst'].remove(f)
            # flex read from a shop's prose agreed with other sources only about 3 times in 4, so it stays an estimate
            # prose max tension agreed 61% (often another weight class), so it stays an estimate too
            if bz.get('src') == 'shop' and {'flex': 'flex', 'tension': 'tmax'}.get(f) in bz['parsed']['fromProse']:
                r.setdefault('proseEst', []).append(f)
    if bz.get('price') and bz.get('currency') == 'THB' and not r.get('price'):
        r['price'] = int(bz['price'])  # a Thai shop's price is a real baht price
    elif bz.get('price') and not r.get('priceForeign'):
        r['priceForeign'] = {'amount': bz['price'], 'currency': bz.get('currency', 'USD'), 'src': bz['url']}
    if bz.get('src') == 'shop':
        links = r.setdefault('shopLinks', [])
        if bz['shop'] not in [l['shop'] for l in links]: links.append({'shop': bz['shop'], 'url': bz['url']})
    else:
        r.setdefault('clickUrl' if bz.get('src') == 'click' else 'bayUrl', bz['url'])
print('shop spec layers matched', bay_hits)

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
    est = r.pop('proseEst', [])
    hit = next(((st, bl) for b, rx, st, bl in SERIES if (b == '*' or b == r['brand']) and re.search(rx, r['name'], re.I)), None)
    if not r['balance']:
        bl = hit[1] if hit else FROM_STYLE.get(r['style'], '')
        if bl: r['balance'] = bl; est.append('balance')
    if not r['style']:
        st = hit[0] if hit else FROM_BAL.get(r['balance'], '')
        if st: r['style'] = st; est.append('style')
    r['est'] = est
# ---- foreign price -> THB, only where no Thai price exists; flagged as an estimate with its note ----
FX = json.load(open(os.path.join(SRC, 'fx.json'))) if os.path.exists(os.path.join(SRC, 'fx.json')) else {'toTHB': {}, 'date': ''}
SYM = {'VND': '₫', 'USD': 'US$', 'GBP': '£', 'EUR': '€', 'MYR': 'RM', 'SGD': 'S$', 'AUD': 'A$', 'INR': '₹', 'JPY': '¥', 'CNY': 'CN¥', 'BDT': '৳'}
converted = 0
for r in rackets.values():
    pf = r.get('priceForeign')
    if r.get('price') or not pf: continue
    rate = FX['toTHB'].get(pf['currency'])
    src_name, src_date = 'ECB', FX['date']
    if not rate:
        rate = FX.get('extraToTHB', {}).get(pf['currency']); src_name, src_date = 'open.er-api.com', FX.get('extraDate', '')
    if not rate: continue
    r['price'] = int(round(pf['amount'] * rate / 10) * 10)
    r.setdefault('est', []).append('price')
    r['priceNote'] = f"แปลงจาก {SYM.get(pf['currency'], pf['currency'] + ' ')}{pf['amount']:,.2f} ที่ 1 {pf['currency']} = {rate:g} บาท ({src_name} {src_date}) ไม่รวมภาษีนำเข้าและค่าส่ง"
    r['priceSrc'] = pf.get('src', '')
    converted += 1
print('prices converted', converted)
# ---- player level, where no source states one: from price tier, nudged by shaft flex (flagged in r['est']) ----
# price tiers follow the stated levels in this data: under 2,000 baht mostly beginner, 6,500 and up mostly pro
LV = ['beginner', 'intermediate', 'advanced', 'pro']
FLEX_STEP = {'flexible': -1, 'extra-stiff': 1}
FLEX_ONLY = {'flexible': 0, 'medium': 1, 'stiff': 2, 'extra-stiff': 3}
leveled = 0
for r in rackets.values():
    if r.get('level'): continue
    p = r.get('price')
    if p:
        i = 0 if p < 2000 else 1 if p < 3500 else 2 if p < 6500 else 3
        i += FLEX_STEP.get(r.get('flex'), 0)
    elif r.get('flex') in FLEX_ONLY:
        i = FLEX_ONLY[r['flex']]
    else:
        continue
    r['level'] = LV[max(0, min(3, i))]
    r.setdefault('est', []).append('level')
    leveled += 1
print('levels estimated', leveled)

order = ['id', 'brand', 'name', 'year', 'style', 'balance', 'flex', 'level', 'weights', 'weight', 'grips', 'tension', 'price',
         'frame', 'shaft', 'joint', 'length', 'pattern', 'tech', 'players', 'madeIn', 'recString', 'img', 'source', 'officialUrl', 'specSrc', 'shopUrl', 'bayUrl', 'clickUrl', 'shopLinks', 'priceNote', 'priceSrc', 'note', 'est']
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

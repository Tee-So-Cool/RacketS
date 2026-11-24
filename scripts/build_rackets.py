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
    # "4U (82±2 g)": the tolerance sits between the figure and the unit
    m = re.search(r'4U[^)]*?(\d{2})(?:\.\d)?\s*(?:(?:±|\+-|\+/-)\s*\d\s*)?g', t) or re.search(r'(\d{2})(?:\.\d)?\s*(?:(?:±|\+-|\+/-)\s*\d\s*)?g\b', t)
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
    item_code = y.get('Item Code', '').strip()
    if re.fullmatch(r'[A-Z0-9]+(?:[-/ ][A-Z0-9]+)*', item_code):
        off['modelCode'] = item_code
        generation = re.match(r'^(2NF700|3AX88|3AX99)', item_code.replace('-', ''))
        if generation:
            off['generation'] = int(generation[0][0])
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
        r['proseEst'] = [field for field in ('style', 'balance', 'level') if r.get(field)]
        rackets[k] = r
        added.append(nm)



# ---- manual spec lookups (data/spec-overrides.json): "Brand Model" -> fields + src ----
def apply_override(r, o):
    if 'level' in o: r['_lvset'] = True   # a level set by hand is not replaced by a shop's range
    for f, v in o.items():
        if f == 'year' and v is None:
            r['year'] = ''
            r.pop('yearSrc', None)
            continue
        if f in ('src', 'new', 'brand', 'currency', 'estFields') or v in ('', None): continue
        if f == 'priceForeign':
            r['priceForeign'] = {'amount': v, 'currency': o.get('currency', 'USD'), 'src': o.get('src', '')}
        elif f == 'tmax':
            r.setdefault('_hand', set()).add('tension')
            r['tension'] = [o.get('tmin') or (r.get('tension') or [None])[0], v]
            if 'tension' in r.get('est', []): r['est'].remove('tension')
            if 'tension' in r.get('proseEst', []) and 'tension' not in o.get('estFields', []): r['proseEst'].remove('tension')
        elif f == 'tmin':
            continue
        else:
            r[f] = v
            r.setdefault('_hand', set()).add(f)
            if f in r.get('est', []): r['est'].remove(f)
            # a value set by hand settles a shop vote that had no majority
            if f in r.get('proseEst', []) and f not in o.get('estFields', []): r['proseEst'].remove(f)
    # a value read off an old post or a variant's listing stays marked as an estimate
    for f in o.get('estFields', []):
        if f not in r.setdefault('proseEst', []): r['proseEst'].append(f)  # becomes est at the series step
    if o.get('src'): r['specSrc'] = o['src']

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
from merge_research import LEDGER_PATH, decode, project
from plaza_match import match as pmatch, clean as pclean, skip as pskip, match_generation, NEW_NAMES
PLAZA = os.path.join(SRC, 'plaza.json')
BASE_PLAZA = 'https://www.badmintonplaza.com/product_info.php?products_id='
plaza = json.load(open(PLAZA, encoding='utf-8')) if os.path.exists(PLAZA) else []


def accepts_listing(racket, url):
    # Some product names cover multiple SKUs. Use the reviewed pages when one SKU is selected.
    verified = racket.get('listingUrls')
    return not verified or url in verified


plaza_hits = plaza_new = 0
for pz in plaza:
    pool = {r['name']: r for r in rackets.values() if r['brand'] == pz['brand']}
    m, _ = pmatch(pz['name'], pool)
    if m:
        m = match_generation(pz['name'], '', m, pool)
        if not m: continue
        r = pool[m]
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
    url = BASE_PLAZA + str(pz['id'])
    if not accepts_listing(r, url):
        continue
    if m:
        plaza_hits += 1
    bal_raw = (pz.get('balance') or '').replace('Headvy', 'Heavy').replace('headvy', 'heavy')
    ws, g = weights(pz.get('weight', ''))
    fill = {'img': pz.get('img', ''), 'price': int(pz['price']) if pz.get('price') else ''}
    # a page without the full spec table (older plaza.json) still gives its listed specs here; otherwise the
    # product page's table goes through the shop layer below, with the same parser and vote as other shops
    if not pz.get('specs'):
        fill.update({'balance': balance(bal_raw, ''), 'flex': flex(pz.get('flex', '')), 'weights': ws, 'weight': g,
                     'grips': grips(pz.get('weight', '') + ' ' + pz.get('grip', '')), 'tension': tension(pz.get('tension', '')),
                     'frame': pz.get('frame') or pz.get('material', ''), 'shaft': pz.get('shaft', ''), 'length': pz.get('length', '')})
    for f, v in fill.items():
        if v not in ('', None) and r.get(f) in ('', None): r[f] = v
    if not r.get('shopUrl'): r['shopUrl'] = url
print('plaza matched', plaza_hits, 'added', plaza_new)
unmatched = []
for full_name in deferred:
    r = rackets.get(key(full_name))
    if r is None: unmatched.append(full_name)
    else: apply_override(r, overrides[full_name])


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
    # "Intermediate - Advanced" is a range, not one level; only a single word counts here (the range goes to level_range)
    w = (t or '').strip().lower()
    return LEVEL_WORD.get(w, '')
LEVELS = ['beginner', 'intermediate', 'advanced', 'pro']
def level_range(t):
    # "Intermediate - Advanced", "beginner to intermediate", "advanced / professional": the lowest and the highest level
    # word of a short label, as 'low|high', when they differ. A label with one level word is not a range.
    t = (t or '').strip().lower()
    if not t or len(t) > 40: return ''
    ws = {LEVEL_WORD.get(w[:-1] if w.endswith('s') else w) for w in re.findall(r'beginners?|intermediate|advanced|professionals?|\bpro\b', t)} - {None}
    if len(ws) < 2: return ''
    ix = sorted(LEVELS.index(w) for w in ws)
    return LEVELS[ix[0]] + '|' + LEVELS[ix[-1]]
# Other shops with a public product feed (scripts/fetch_shops.py): raw {label: value} spec blocks, mapped here
SHOPS = os.path.join(SRC, 'shops.json')
BRAND_OF = {'victor': 'Victor', 'yonex': 'Yonex', 'li-ning': 'Li-Ning', 'li ning': 'Li-Ning', 'lining': 'Li-Ning', 'vs': 'VS',
            'apacs': 'Apacs', 'mizuno': 'Mizuno', 'kawasaki': 'Kawasaki', 'felet': 'Felet',
            'hundred': 'Hundred', 'hndrd': 'Hundred', 'forza': 'Forza', 'fz forza': 'Forza'}
from spec_text import parse as parse_spec, country_of, is_material, bp_of
PLAYER_TYPE = {'attacking': 'attack', 'balanced': 'allround', 'defensive': 'speed', 'speed': 'speed', 'control': 'control'}
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
    # Victor's slider image (response-<series><1-10>, 10 = stiffest). Against 39 models whose flex is stated elsewhere:
    # 7-10 were all stiff (21 of 21), 6 medium (6 of 7), 5 and below mixed; so 6 and below stay estimates
    ind = p.get('indicator')
    if ind and not sp['flex']:
        lv = ind['level']
        sp['flex'] = 'stiff' if lv >= 7 else 'medium' if lv >= 5 else 'flexible'
        if lv <= 6: sp['fromProse'].append('flex')
    return {'src': 'shop', 'shop': p['shop'], 'brand': brand, 'name': nm, 'title': p['name'], 'url': p['url'], 'img': p.get('img', ''),
            'price': p.get('price'), 'currency': p.get('currency'), 'parsed': sp}
# Victor's official Thai pages (scripts/fetch_victor.py) come first, so the maker's figures win over shops'
VOFF = os.path.join(SRC, 'victor-official.json')
victor_pages = json.load(open(VOFF, encoding='utf-8')) if os.path.exists(VOFF) else []
# Felet's own list (scripts/fetch_felet.py): names, RM prices and pictures only, since its pages print no spec text
FOFF = os.path.join(SRC, 'felet-official.json')
# Mizuno's own Altius and Fortius pages (scripts/fetch_mizuno.py): weight class, flex, balance and recommended tension as text,
# no level, no price; models of those two lines that this data lacks are added from it
MOFF = os.path.join(SRC, 'mizuno-official.json')
# Apacs's own UK store (scripts/fetch_apacs.py): weight with its U class, BCP in mm, flex, grip, length, max tension, holes; no price
AOFF = os.path.join(SRC, 'apacs-official.json')
shop_pages = victor_pages + (json.load(open(FOFF, encoding='utf-8')) if os.path.exists(FOFF) else []) + \
             (json.load(open(MOFF, encoding='utf-8')) if os.path.exists(MOFF) else []) + \
             (json.load(open(AOFF, encoding='utf-8')) if os.path.exists(AOFF) else []) + \
             (json.load(open(SHOPS, encoding='utf-8')) if os.path.exists(SHOPS) else []) + \
             (json.load(open(os.path.join(SRC, 'honly.json'), encoding='utf-8')) if os.path.exists(os.path.join(SRC, 'honly.json')) else []) + \
             (json.load(open(os.path.join(SRC, 'corkandfeathers.json'), encoding='utf-8')) if os.path.exists(os.path.join(SRC, 'corkandfeathers.json')) else [])  # fetch_honly.py: Felet specs; fetch_corkfeathers.py: Victor NA's spec block
# Badminton Plaza's product-page tables ("Weight : 82±2g (4U)", "String Tension : 26-38 lbs", "Features : ..."),
# right after Victor's own pages, so the Thai shop keeps first say on free text as before; its THB price was set above
shop_pages[len(victor_pages):0] = [{'shop': 'badmintonplaza.com', 'brand': pz['brand'], 'name': pz['name'] or pz.get('listed', ''), 'url': BASE_PLAZA + str(pz['id']),
                'price': '', 'currency': 'THB', 'img': '', 'lines': [f'{k}: {v}' for k, v in pz['specs'].items()], 'options': []}
               for pz in plaza if pz.get('specs')]
shops = [x for x in (from_shop(p) for p in shop_pages) if x]

# ---- models the shops sell that this data lacks ----
# A listing that matches no model becomes one when the maker's own site lists it (Victor TH, Li-Ning SG/IN,
# VS Thailand), a Thai shop sells it, or two shops do. Gift sets, packs and character tie-ins are not models;
# a bare series name ("Thruster") is not one either.
from plaza_match import tokens as ptokens
OFFICIAL = {'th.victorsport.com', 'sg.lining.studio', 'in.lining.studio', 'vssportsthailand.com', 'badmintonplaza.com', 'feletsports.com', 'mizunobadminton-asia.com'}
NOT_RACKET_MODEL = re.compile(r'\b(shoes?|socks?|set|combo|pack|duo|kit|bundle|gift|box|vip|merchandise|poster|frame only|training|trainer|kids?)\b|diwali|boxset|hwqkl|chinese\s+(?:new\s+)?year|'
                              r'^yonex (?:astrox|nanoflare) (?:clear|feel|ability)\b|^yonex astrox 88 (?:tour|play|pro|game)\b|'
                              r'\bseries\s*$|'
                              r'doraemon|dragon ball|ultraman|one piece|pokemon|butterbear|baby milo|care bears|hello kitty|crayon|marvel|'
                              r'avenger|peanuts|demon slayer|street fighter|(?:^|\s)(?:victor|li[- ]?ning|yonex|thruster|auraspeed|jetspeed)\s+x\s+[a-z]|^tk-4\d{4}\b', re.I)
# TK-4xxxx is Victor's clothing code (TK-41031 is a skirt); a collab reads "Victor x Baby Milo", while "3D Calibar X", "Turbo X III", "Hypernano X" are models
def display_name(t, brand):
    import unicodedata
    t = ''.join(c for c in unicodedata.normalize('NFKD', t) if not unicodedata.combining(c))
    t = re.sub(r'[\u3000-\u9fff]+', ' ', t)
    t = re.sub(r'\([^)]*\)|\[[^\]]*\]|free!.*$|\b(badminton|racket|racquet|unstrung|strung|pre-?strung|new|20\d\d)\b|'
               r'\b[2-8]u\d?\b|\bg[4-6]\b|\d+\s*grams?|ไม้แบด\S*', ' ', t, flags=re.I)
    t = re.sub(re.escape(brand) + r'|li[- ]?ning|venson|\bhndrd\b|\bfz forza\b|\bfz\b', ' ', t, flags=re.I)  # Hundred is also written HNDRD, Forza FZ Forza
    t = re.sub(r'\s*/.*$', '', t)  # "Ex-light / Pink": a colour after the slash
    from plaza_match import COLOURS
    if brand == 'Li-Ning':  # "AxForce 80 Gen 2" (badmintonclick) is "Axforce 80 II" (yumo, shopnings): one model, not the first one
        t = re.sub(r'(?<=\d)\s+gen\s*(?:2|ii)\b', ' II', t, flags=re.I)
    t = re.sub(r'\b(?:' + COLOURS + r')\b|\bgen ?\d\b|\bbravesword\b', lambda m: 'Brave Sword' if m.group(0).lower() == 'bravesword' else ' ', t, flags=re.I)
    t = re.sub(r'^js-(?=\d)', 'Jetspeed S ', t.strip(), flags=re.I)
    if brand == 'Forza':  # Forza ends a title with a colour code: "Aero Power 372 CA", "Aero Power 472 B", "Precision X7 DC", "HT Power 36-S BS"
        t = re.sub(r'\s+[A-Z]{2}$', '', re.sub(r'\s+', ' ', t).strip(' -|/'))
        t = re.sub(r'(?<=\d)\s+[A-Z]$', '', t)
    t = re.sub(r'\s+[A-Za-z]$', '', re.sub(r'\s+', ' ', t).strip(' -|/'))  # Victor's colour letter: "AURASPEED 130CL U"
    if brand == 'Victor':  # "Drive X 12 Metallic" (some shops) is Victor's "DriveX 12 Metallic"
        t = re.sub(r'\bdrive x\b', 'DriveX', t, flags=re.I)
    if brand == 'Victor':  # shops spell out what Victor prints as "LF": "Thruster TK-LF Light Fighter 30", "Thruster K Light Fighter 30"
        t = re.sub(r'\b(?:tk-?lf|k)?\s*light fighter\b', 'LF', t, flags=re.I)
    if brand == 'Li-Ning':  # Li-Ning SG writes its variants as letters: "Tectonic 7C" = Tectonic 7 Combat
        t = re.sub(r'(\d)([CDIB])$', lambda m: m.group(1) + ' ' + {'C': 'Combat', 'D': 'Drive', 'I': 'Instinct', 'B': 'Boost'}[m.group(2)], t)
    if brand == 'Felet':  # Felet names colourways with words of their own: "Aero Carbon Snow White", "Jade Bloom", "Gen-X Sky Blue"
        t = re.sub(r'\b(?:snow|sky|cherry|jade|lavender|crystal)\b', ' ', t, flags=re.I)
        t = re.sub(r'\beighty8\b', 'Eighty8', re.sub(r'\s+', ' ', t).strip(), flags=re.I)
    t = re.sub(r'(?<=[A-Za-z]) ([2-4])\b(?! ?[\d.])', lambda m: ' ' + {'2': 'II', '3': 'III', '4': 'IV'}[m.group(1)], t)
    if brand == 'Felet':  # "TAI-G", "F-FORCE": each part of a hyphenated word keeps its capital
        return ' '.join(w if re.search(r'\d', w) or w.upper() in ('TJ', 'TI', 'P1', '3K') else '-'.join(x.capitalize() for x in w.split('-')) for w in t.split())
    return ' '.join(w if re.search(r'\d', w) or w in ('II', 'III', 'IV') or len(w) <= 2 else w.capitalize() for w in t.split())
def match_title(title, brand, pool):
    # the raw title first, then its cleaned display name ("Li-Ning 3D Calibar 900I" is "3D Calibar 900 Instinct")
    return pmatch(title, pool)[0] or pmatch(display_name(title, brand), pool)[0]
def k_skip(brand, nm): return (brand, key(nm)) in {('Yonex', 'astroxiiidg')}
groups = collections.defaultdict(list)
for bz in shops:
    if bz['brand'] not in ('Victor', 'Li-Ning', 'VS', 'Yonex', 'Felet', 'Mizuno', 'Hundred', 'Forza') or NOT_RACKET_MODEL.search(re.sub(r'gen-x', 'GenX', bz['name'], flags=re.I)): continue
    # Mizuno: only models its own site lists (Altius and Fortius); the shops' JPX variants and odd titles ("Altius N-feel 3.") stay out
    if bz['brand'] == 'Mizuno' and bz['shop'] != 'mizunobadminton-asia.com': continue
    pool = {r['name']: r for r in rackets.values() if r['brand'] == bz['brand']}
    if match_title(bz['name'], bz['brand'], pool): continue
    nm = display_name(bz['name'], bz['brand'])
    tk = ptokens(nm)
    if not tk: continue
    groups[(bz['brand'], ' '.join(sorted(dict.fromkeys(tk))))].append((nm, bz))
shop_new = []
for (brand, _), its in groups.items():
    shopset = {b['shop'] for _, b in its}
    if not (shopset & OFFICIAL or len(shopset) >= 2): continue
    names = collections.Counter(n for n, b in its if b['shop'] in OFFICIAL) or collections.Counter(n for n, _ in its)
    nm = names.most_common(1)[0][0]
    tk = ptokens(nm)
    # a bare series name, or a name the listed models start with, is a series, not a model
    # (a model page on the maker's own store is one model, so Felet's one-word names, "Arcana", "Hypermax", stand)
    num = re.search(r'\d', ' '.join(tk))   # tokens turn "III" into 3, so "Tectonic III" is a numbered model, not a series
    if len(tk) < 2 and not num and 'feletsports.com' not in shopset: continue
    if not num and any(r['brand'] == brand and ptokens(r['name'])[:len(tk)] == tk and len(ptokens(r['name'])) > len(tk) for r in rackets.values()): continue
    # a colour letter glued to a listed model's number ("Auraspeed 9000G Free Core Green") is that model
    base = re.match(r'(.*\d)[A-Za-z]\b', nm)
    if base and any(r['brand'] == brand and ptokens(r['name']) == ptokens(base.group(1)) for r in rackets.values()) and \
            re.search(r'\b(green|blue|red|black|white|gold|silver|pink|purple|yellow|orange)\b', ' '.join(b['name'] for _, b in its), re.I): continue
    if len(nm) > 32: continue
    # Yonex's own list carries Astrox 3 DG as its HF and ST versions; a shop's "Astrox III DG" is that racket, not a third
    if k_skip(brand, nm): continue
    k = key(brand + ' ' + nm)
    if k in rackets: continue
    rackets[k] = {'id': slug(brand + ' ' + nm), 'brand': brand, 'name': nm, 'year': '', 'style': '', 'balance': '', 'flex': '', 'level': '',
                  'weights': '', 'weight': '', 'grips': '', 'tension': None, 'price': '', 'frame': '', 'shaft': '', 'joint': '', 'length': '',
                  'pattern': '', 'tech': '', 'players': '', 'madeIn': '', 'img': '', 'source': '', 'note': ''}
    shop_new.append(brand + ' ' + nm)
print('models added from shops', len(shop_new))
if os.environ.get('AUDIT'): print('  ' + ' | '.join(sorted(shop_new)))
bay_hits = {'bay': 0, 'click': 0, 'shop': 0}
AUDIT = {'matched': collections.defaultdict(list), 'unmatched': []}  # AUDIT=<path> writes every shop value per model
cands = collections.defaultdict(lambda: collections.defaultdict(list))  # model -> field -> [(value, from prose, shop, rank)] in source order
victor_by_url = {page['url']: page['lines'] for page in victor_pages}
victor_specs = collections.defaultdict(list)
pools = collections.defaultdict(dict)
for r in rackets.values():
    pools[r['brand']][r['name']] = r
for bz in bay + click + shops:
    original_title = bz.get('title', bz['name'])
    if bz.get('src') == 'click':
        # "NEW 2027 Victor Thruster Ryuga 3 (78 grams) Badminton Racquet": drop the shop's framing before matching
        bz = {**bz, 'name': re.sub(r'\b(new|20\d\d)\b|\(\d+ g\w*\)|\d+ g\w*|\[[^\]]*\]|\([^)]*edition\)', ' ', bz['name'], flags=re.I)}
        # the shop writes generations as digits ("Ryuga Muse 2"), this data as numerals ("Ryuga Muse II")
        bz['name'] = re.sub(r'(?<=[A-Za-z]) ([2-4])\b(?! ?[\d.])', lambda m: ' ' + {'2': 'II', '3': 'III', '4': 'IV'}[m.group(1)], bz['name'])
    if bz['brand'] == 'Felet':  # Badminton Bay writes "TJ 1000 Control", Felet itself "TJ Control 1000"
        bz = {**bz, 'name': re.sub(r'\bTJ 1000 (Control|Power|Speed)\b', r'TJ \1 1000', bz['name'], flags=re.I)}
    pool = pools[bz['brand']]
    m = match_title(bz['name'], bz['brand'], pool)
    if m:
        m = match_generation(original_title, bz['url'], m, pool)
    if not m or not accepts_listing(pool[m], bz['url']):
        AUDIT['unmatched'].append({'brand': bz['brand'], 'name': bz['name'], 'url': bz['url'], 'src': bz.get('src', 'bay')}); continue
    r = pool[m]; bay_hits[bz.get('src', 'bay')] += 1
    if bz['url'] in victor_by_url:
        victor_specs[id(r)].append(victor_by_url[bz['url']])
    ws, g = weights(bz.get('weight', ''))
    if bz.get('src') == 'shop':
        ps = bz['parsed']
        fill = {'balance': ps['balance'], 'bp': ps['bp'], 'flex': ps['flex'], 'weights': ps['weights'], 'weight': ps['weight'],
                'tension': [ps.get('tmin') or None, ps['tmax']] if ps['tmax'] else None, 'grips': ps['grips'], 'img': bz.get('img', ''),
                # Li-Ning's own stores tag even entry rackets "Professional", so their level is not used; nor is Cork and
                # Feathers' (all nine Victor pages it has read Advanced or Professional, which looks like its price tier)
                'level': '' if 'lining.studio' in bz['shop'] or 'corkandfeathers' in bz['shop'] else one_level(ps['level']),
                'levelRange': '' if 'lining.studio' in bz['shop'] or 'corkandfeathers' in bz['shop'] else level_range(ps['level']), 'recString': ps['recText'],
                **{f: ps[f] for f in ('frame', 'shaft', 'length', 'joint', 'madeIn', 'tech', 'players', 'pattern')}}
        # Li-Ning's own stores label each racket's player type; "Defensive" ones are 44 of 51 head-light, so they are speed rackets here
        if 'lining.studio' in bz['shop']:
            L = [x.strip() for x in PAGES.get(bz['url'], [])]
            i = next((k for k, x in enumerate(L) if x.lower() == 'player type'), None)
            fill['style'] = PLAYER_TYPE.get(L[i + 1].lower(), '') if i is not None and i + 1 < len(L) else ''
    else:
        fill = {'balance': bay_balance(bz.get('balance')), 'bp': bp_of(bz.get('balance')), 'flex': bay_flex(bz.get('flex')), 'weights': ws, 'weight': g,
            'tension': tension(bz.get('tension', '')), 'frame': bz.get('frame', ''), 'shaft': bz.get('shaft', ''),
            'length': bz.get('length', ''), 'img': bz.get('img', ''), 'level': one_level(bz.get('level')), 'levelRange': level_range(bz.get('level')),
            'grips': re.sub(r'\s*\(.*?\)', '', bz.get('grips', '')),
            'recString': bz.get('recText') or ', '.join(f'{v} ({k})' for k, v in (('คุม', bz.get('strControl')), ('พลัง', bz.get('strPower'))) if v),
            'joint': bz.get('joint', ''), 'madeIn': bz.get('madeIn', ''), 'tech': bz.get('tech', ''), 'players': bz.get('players', ''),
            'pattern': bz.get('pattern', '')}
    AUDIT['matched'][r['brand'] + ' ' + r['name']].append({'src': bz.get('shop') or bz.get('src', 'bay'), 'title': bz['name'], 'url': bz['url'],
        'fill': {f: v for f, v in fill.items() if v not in ('', None) and f != 'img'}})
    prose = bz['parsed']['fromProse'] if bz.get('src') == 'shop' else []
    for f, v in fill.items():
        if v in ('', None): continue
        # flex read from a shop's prose agreed with other sources only about 3 times in 4, so it stays an estimate
        # prose max tension agreed 61% (often another weight class), so it stays an estimate too; a level a shop's prose states
        # ("suitable for advanced players") is advertising copy, so it is an estimate as well
        src = {'click': 'badmintonclick.com.au'}.get(bz.get('src'), bz.get('shop') or bz.get('src', 'bay'))
        # one vote per shop, however many colourway pages it lists
        if src not in [c[2] for c in cands[id(r)][f]]:
            # free-text rank: 0 a value under its own label, 1 from a whole-racket "Material" line,
            # 2 not a material at all (a Thai sentence, a frame shape, "Unstrung")
            rank = 0
            if f in ('frame', 'shaft'):
                if f in bz['parsed'].get('generic', []) if bz.get('src') == 'shop' else False: rank = 1
                if not is_material(str(v)): rank = 2
            cands[id(r)][f].append((v, {'balance': 'balance', 'flex': 'flex', 'tension': 'tmax', 'level': 'level'}.get(f) in prose, src, rank))
    # a placeholder price (S$999 on Li-Ning's store) is not a price
    if bz.get('price') in (999, 999.0, 9999, 9999.0): bz = {**bz, 'price': ''}
    if bz.get('price') and bz.get('currency') == 'THB' and not r.get('price'):
        r['price'] = int(bz['price'])  # a Thai shop's price is a real baht price
    elif bz.get('price'):
        # every shop's foreign price is kept; the conversion below takes the lowest believable one
        r.setdefault('_pfs', []).append({'amount': bz['price'], 'currency': bz.get('currency', 'USD'), 'src': bz['url']})
    if bz.get('src') == 'shop':
        links = r.setdefault('shopLinks', [])
        if bz['shop'] not in [l['shop'] for l in links]: links.append({'shop': bz['shop'], 'url': bz['url']})
    else:
        r.setdefault('clickUrl' if bz.get('src') == 'click' else 'bayUrl', bz['url'])
# when shops disagree, the value most of them give wins; a tie goes to the earlier source (the maker's own pages come first).
# A labelled value outvotes prose. For grams, the 4U figure counts over a 3U one when the model comes in 4U.
by_id = {id(r): r for r in rackets.values()}
voted = 0
for rid, fields in cands.items():
    r = by_id[rid]
    for f, vs in fields.items():
        pool = [x for x in vs if not x[1]] or vs
        if f == 'balance' and r['brand'] != 'Yonex' and f not in r.get('_hand', ()):
            maker_labels = {v for v, inferred, shop, _ in pool
                            if not inferred and shop in OFFICIAL and shop != 'badmintonplaza.com'}
            if len(maker_labels) == 1:
                r[f] = maker_labels.pop()
                if f in r.get('proseEst', []): r['proseEst'].remove(f)
                continue
        if not (r.get(f) in ('', None) or f in r.get('est', []) or f in r.get('proseEst', [])):
            # three or more shops' labelled specs agreeing (3 in 4 at least) outweigh one aggregator's balance or flex;
            # Yonex's own site is the source for Yonex, so it stays
            lab = [json.dumps(v) for v, p, _, _ in vs if not p]
            top = collections.Counter(lab).most_common(1)
            # a lower tension bound ([22, 30]) does not contradict a bare ceiling ([None, 30]): keep the bound
            if f == 'tension' and r.get(f) and r[f][0] is None:
                # (from the maker's own store, or the same bound from two shops; one retailer's generic range is not enough)
                lows = [(v[0], s) for v, p, s, _ in vs if not p and v and v[0] and v[1] == r[f][1]]
                if lows and len({l for l, _ in lows}) == 1 and (len(lows) >= 2 or lows[0][1] in OFFICIAL): r[f] = [lows[0][0], r[f][1]]
            # the maker's own store is a labelled source: it and one other shop agreeing is enough, where three were needed
            maker = top and any(s in OFFICIAL for v, p, s, _ in vs if not p and json.dumps(v) == top[0][0])
            # three shops still outvote a value set by hand (written when fewer sources existed); two do not
            enough = top and ((top[0][1] >= 3 and top[0][1] >= 0.75 * len(lab)) or (maker and f not in r.get('_hand', ()) and top[0][1] >= 2 and top[0][1] == len(lab)))
            if f in ('balance', 'flex') and r['brand'] != 'Yonex' and enough \
                    and json.loads(top[0][0]) != r[f]:
                print('shops outvote', r['brand'], r['name'], f, r[f], '->', json.loads(top[0][0]), dict(collections.Counter(lab)))
                r[f] = json.loads(top[0][0]); voted += 1
            continue
        if f == 'weight' and '4U' in str(fields.get('weights', [('',)])[0][0]):
            pool = [x for x in pool if 80 <= x[0] <= 84] or pool
        # free text (materials, tech) is rarely written the same way twice: the best-ranked value, earliest source first
        if f in ('frame', 'shaft', 'joint', 'tech', 'players', 'pattern', 'recString', 'img'):
            pool = [x for x in pool if x[3] < 2]
            if not pool: continue
            # tech: the fullest list wins (Plaza often lists only the first feature)
            pool = [max(pool, key=lambda x: len(re.split(r'[,/]', str(x[0]))))] if f == 'tech' else [min(pool, key=lambda x: x[3])]
        n = collections.Counter(json.dumps(v) for v, _, _, _ in pool)
        top = max(n.values())
        v, from_prose, _, _ = next(x for x in pool if n[json.dumps(x[0])] == top)
        if len(n) > 1: voted += 1
        r[f] = v
        if f in r.get('est', []): r['est'].remove(f)
        if f in r.get('proseEst', []): r['proseEst'].remove(f)
        # no majority (1 against 1, or 2 against 2): the pick is a guess, so it shows as an estimate
        if from_prose or (f in ('balance', 'flex', 'weight', 'tension') and top * 2 <= len(pool)): r.setdefault('proseEst', []).append(f)
print('shop spec layers matched', bay_hits, 'fields settled by vote', voted)
if os.environ.get('AUDIT'): json.dump(AUDIT, open(os.environ['AUDIT'], 'w'), ensure_ascii=False, indent=1)

# overrides for models the shop layer creates (keyed by id) are tried again once it has run
late = []
for full_name in unmatched:
    r = rackets.get(key(full_name)) or next((x for x in rackets.values() if key(x['brand'] + ' ' + x['name']) == key(full_name)), None)
    if r is None: late.append(full_name)
    else: apply_override(r, overrides[full_name])
if late: print('override names not found:', late)
# ---- level ranges: where no single level is stated (none, or only an estimate), the range shops print is kept as
# level..levelTo; a level set by hand, or a single level from a source, stays ----
ranged = 0
for r in rackets.values():
    rg = r.pop('levelRange', ''); fixed = r.pop('_lvset', False)
    if not rg or fixed or (r.get('level') and 'level' not in r.get('est', []) and 'level' not in r.get('proseEst', [])): continue
    r['level'], r['levelTo'] = rg.split('|')
    for k in ('est', 'proseEst'):
        if 'level' in r.get(k, []): r[k].remove('level')
    ranged += 1
print('level ranges from shops', ranged)
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
    # Felet's "TJ Power-Control" is the control variant of the TJ Power line: the word after the hyphen names it
    ('Felet', r'-control\b', 'control', 'even'),
    ('Felet', r'-speed\b', 'speed', 'head-light'),
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
    if r.get('year') and not r.get('yearSrc') and 'year' not in est:
        est.append('year')
    r['est'] = est
# ---- foreign price -> THB, only where no Thai price exists; flagged as an estimate with its note ----
FX = json.load(open(os.path.join(SRC, 'fx.json'))) if os.path.exists(os.path.join(SRC, 'fx.json')) else {'toTHB': {}, 'date': ''}
SYM = {'VND': '₫', 'USD': 'US$', 'GBP': '£', 'EUR': '€', 'MYR': 'RM', 'SGD': 'S$', 'AUD': 'A$', 'INR': '₹', 'JPY': '¥', 'CNY': 'CN¥', 'BDT': '৳'}
converted = 0
def to_thb(pf):
    rate = FX['toTHB'].get(pf['currency'])
    src_name, src_date = 'ECB', FX['date']
    if not rate:
        rate = FX.get('extraToTHB', {}).get(pf['currency']); src_name, src_date = 'open.er-api.com', FX.get('extraDate', '')
    return (int(round(pf['amount'] * rate / 10) * 10), rate, src_name, src_date) if rate else None
for r in rackets.values():
    # a price set by hand (override) wins; otherwise the lowest shop price at or above 500 baht, since some stores
    # park old models at round placeholder prices (Li-Ning SG: S$499 for an Aeronaut 7000)
    # (Felet's own store lists its steel and aluminium frames at RM39-49, real prices, so its prices stand)
    cands = ([r['priceForeign']] if r.get('priceForeign') else []) or r.get('_pfs', [])
    r.pop('_pfs', None)
    if r.get('price') or not cands: continue
    # Felet's own store price is the list price; shops' sale prices sit under it
    cands = [pf for pf in cands if 'feletsports.com' in pf.get('src', '')] or cands
    conv = sorted((c for c in ((to_thb(pf), pf) for pf in cands) if c[0] and (c[0][0] >= 500 or 'feletsports.com' in c[1].get('src', ''))), key=lambda c: c[0][0])
    if not conv: continue
    (thb_price, rate, src_name, src_date), pf = conv[0]
    r['priceForeign'] = pf
    r['price'] = thb_price
    r.setdefault('est', []).append('price')
    r['priceNote'] = f"แปลงจาก {SYM.get(pf['currency'], pf['currency'] + ' ')}{pf['amount']:,.2f} ที่ 1 {pf['currency']} = {rate:g} บาท ({src_name} {src_date}) ไม่รวมภาษีนำเข้าและค่าส่ง"
    r['priceSrc'] = pf.get('src', '')
    converted += 1
print('prices converted', converted)
# ---- player level: only what a source states (see the note after the Li-Ning flex rule) ----
# Yonex names its tiers itself (Pro > Tour > Game > Play, yonex.com); an aluminium or steel frame is an entry racket
TIER = {'pro': 'pro', 'tour': 'advanced', 'game': 'intermediate', 'play': 'beginner'}
tiered = 0
for r in rackets.values():
    if r.get('level'): continue
    m = re.search(r'\b(pro|tour|game|play)\b(?!.*\b(pro|tour|game|play)\b)', r['name'], re.I) if r['brand'] == 'Yonex' else None
    if m:
        r['level'] = TIER[m.group(1).lower()]
        r.setdefault('est', []).append('level')
        tiered += 1
        continue
    if re.search(r'alumin|steel', (r.get('frame') or '') + ' ' + (r.get('shaft') or ''), re.I):
        r['level'] = 'beginner'; r.setdefault('est', []).append('level'); tiered += 1
print('levels from tier name or frame metal', tiered)
# an aluminium frame sold as advanced or pro (a shop's tag on the Astrox E13) is an entry racket all the same
metal_fix = 0
for r in rackets.values():
    if r.get('level') in ('advanced', 'pro') and re.search(r'alumin', r.get('frame') or '', re.I):
        r['level'] = 'beginner'; r.setdefault('est', []).append('level'); metal_fix += 1
print('metal frames moved to beginner', metal_fix)
# Li-Ning's own scale runs soft: it calls the Axforce 90 "Flexible" where reviewers (God of Sports) measure a medium
# shaft, so on its advanced and pro frames that word reads as medium next to Yonex and Victor
ln_flex = 0
for r in rackets.values():
    if r['brand'] == 'Li-Ning' and r.get('flex') == 'flexible' and r.get('level') in ('advanced', 'pro'):
        r['flex'] = 'medium'; r.setdefault('est', []).append('flex'); ln_flex += 1
        r['note'] = ((r.get('note') or '') + ' ').lstrip() + 'Li-Ning ระบุก้านว่า Flexible ตามสเกลของ Li-Ning ซึ่งอ่อนกว่ายี่ห้ออื่น เทียบกับ Yonex/Victor ราวก้านกลาง'
print('Li-Ning flexible read as medium', ln_flex)
# A current model (2025 on) whose sources state no flex takes the majority of its own series: the same brand and first word of the
# name (Victor's Auraspeed and Thruster lines are mostly stiff), counting only models of 2022 on whose flex a source states. It needs
# 8 such models and a 55% majority, is flagged ≈ and says how many; a series too small or too mixed (Apacs Assailant, Li-Ning
# Axforce) stays empty. This is a guess with a reason, not a spec, and the next source that states a flex replaces it.
FLEX_TH = {'stiff': 'ก้านแข็ง', 'medium': 'ก้านกลาง', 'flexible': 'ก้านอ่อน', 'extra-stiff': 'ก้านแข็งมาก'}
isyr = lambda r: isinstance(r.get('year'), int)
series_flex = collections.defaultdict(list)
for r in rackets.values():
    if r.get('flex') and 'flex' not in r.get('est', []) and isyr(r) and r['year'] >= 2022:
        series_flex[(r['brand'], r['name'].split()[0].lower())].append(r['flex'])
sflex = 0
for r in rackets.values():
    if r.get('flex') or not (isyr(r) and r['year'] >= 2025): continue
    c = collections.Counter(series_flex.get((r['brand'], r['name'].split()[0].lower()), []))
    n = sum(c.values())
    if n >= 8 and c.most_common(1)[0][1] >= 0.55 * n:
        v, k = c.most_common(1)[0]
        r['flex'] = v; r.setdefault('est', []).append('flex'); sflex += 1
        r['note'] = ((r.get('note') or '') + ' ').lstrip() + f"ความแข็งก้านประเมินจากซีรีส์ {r['name'].split()[0]} รุ่นปี 2022 ขึ้นไป: {k} จาก {n} รุ่นเป็น{FLEX_TH[v]} (ยังไม่พบสเปกของรุ่นนี้)"
print('flex from series majority', sflex)
# Victor Thailand sorts its rackets into four tiers of its own, "shop by level": ENTRY, CLASS, PRO, SUPER (scripts/sources/victor-levels.json,
# read from th.victorsport.com/category/rackets-entry|class|pro|super). Victor does not say what a tier means, and against the 34 Victor
# rackets whose level a shop or Victor India states, its tiers run one step higher than the shops' words: CLASS held 13 of 14 as
# beginner to intermediate, PRO 10 of 10 as beginner to advanced (7 intermediate or above), SUPER 13 of 19 as advanced to pro. So each
# tier is read as a range of two levels (ENTRY alone as beginner); a stated level wins, and the result is flagged ≈.
LV_ORD = ['beginner', 'intermediate', 'advanced', 'pro']
VLV = os.path.join(SRC, 'victor-levels.json')
VTIER = {'entry': ('beginner', ''), 'class': ('beginner', 'intermediate'), 'pro': ('intermediate', 'advanced'), 'super': ('advanced', 'pro')}
if os.path.exists(VLV):
    vmap = json.load(open(VLV, encoding='utf-8'))['levels']
    def vtier(r):
        ts = {vmap[l['url'].rsplit('/', 1)[-1]] for l in (r.get('shopLinks') or []) if 'victorsport.com' in (l.get('url') or '') and l['url'].rsplit('/', 1)[-1] in vmap}
        return VTIER[next(iter(ts))] if len(ts) == 1 else None
    inside = both = 0
    for r in rackets.values():
        v = vtier(r) if r['brand'] == 'Victor' else None
        if v and r.get('level') and 'level' not in r.get('est', []):
            lo, hi = r['level'], r.get('levelTo') or r['level']
            both += 1; inside += LV_ORD.index(v[0]) <= LV_ORD.index(lo) and LV_ORD.index(hi) <= LV_ORD.index(v[1] or v[0]) or (lo == v[0] or hi == (v[1] or v[0]))
    vset = 0
    for r in rackets.values():
        v = vtier(r) if r['brand'] == 'Victor' and not r.get('level') else None
        if v:
            r['level'], r['levelTo'] = v; r.setdefault('est', []).append('level'); vset += 1
    print(f'Victor tier: stated level touches its range on {inside}/{both}; set on {vset} rackets with none')
# A racket with no level in any source keeps no level (the site shows "ไม่ระบุ"). Makers do not publish one and shops disagree
# (Aeronaut 4000: intermediate on Li-Ning's store, advanced and professional on two others), so a level guessed from price, flex
# or the nearest rackets of the brand would be a number that looks like data. Measured, those guesses were right 51-75% of the
# time (docs/research/matching-logic.md). Filled without a source sentence: Yonex's own tier name in the model name (the
# maker's), and an aluminium or steel frame (beginner, flagged ≈).

# ---- a weight in grams with no class (Li-Ning's own pages: "Weight 83 grams"): the usual class bands, 2U 90-94 ... 6U 70-74 ----
classed = 0
for r in rackets.values():
    g = r.get('weight')
    if r.get('weights') or not isinstance(g, (int, float)) or not 70 <= g <= 94: continue
    r['weights'] = f'{6 - (int(g) - 70) // 5}U'
    r.setdefault('est', []).append('weights')
    classed += 1
print('weight class from grams', classed)
# ---- tidy-up: an origin is one country name; a weight class with no gram figure gets the class midpoint (flagged) ----
from_class = 0
for r in rackets.values():
    r['madeIn'] = country_of(r.get('madeIn', ''))
    # a degree sign lost in the shop's encoding: "205? Precision Curve Frame"
    if r.get('tech'): r['tech'] = re.sub(r'(\d)\?(?=\s)', r'\1°', r['tech'])
    # Mizuno Vietnam's spec text, where it filled a material: "Than chì Nhật Bản HM" = "Japan HM Graphite"
    for f in ('frame', 'shaft'):
        v = r.get(f) or ''
        if re.search(r'Than chì|mô[- ]đun', v):
            v = re.sub(r'(?:Graphite|Grafit) mô[- ]đun cao', 'High Modulus Graphite', v)
            v = re.sub(r'Than chì mô[- ]đun cao', 'High Modulus Graphite', v).replace('Than chì Nhật Bản', 'Japan Graphite').replace('Than chì', 'Graphite')
            r[f] = v.replace('polyme', 'polymer')
    us = re.findall(r'[2-7]U', r.get('weights', ''))
    if not r.get('weight') and us:
        r['weight'] = UW['4U'] if '4U' in us else UW[us[0]]
        r.setdefault('est', []).append('weight'); from_class += 1
print('weight from class', from_class)
# grams that fall outside every listed class: one of the two is wrong, so the grams show as an estimate
UR = {'2U': (89, 95), '3U': (84, 90), '4U': (79, 85), '5U': (74, 80), '6U': (69, 75), '7U': (64, 70)}
clash = 0
for r in rackets.values():
    us = re.findall(r'[2-7]U', r.get('weights', ''))
    w = r.get('weight')
    if w and us and 'weight' not in r.get('est', []) and not any(UR[u][0] <= w <= UR[u][1] for u in us):
        if r['brand'] == 'Apacs':  # Apacs counts U its own way (5U about 81 g, 4U about 86 g), so its grams stand
            r['note'] = ((r.get('note') or '') + ' ').lstrip() + 'Apacs นับ U ต่างจากยี่ห้ออื่น (5U ราว 81 g, 4U ราว 86 g, 6U ราว 78 g) น้ำหนักกรัมคือค่าที่ Apacs ระบุ'
            continue
        r.setdefault('est', []).append('weight'); clash += 1
print('weight outside its classes', clash)

# Use the lowest official ceiling when the buyer has not selected a weight class.
# Keep a weight label only when the manufacturer's tension text actually pairs it with a value.
VICTOR_CAP = re.compile(r'(?:\b([2-8]U)\s*[:：]?\s*)?(?:≦|≤|<=)\s*(\d{2})\s*lbs?\b', re.I)
YONEX_RANGE = re.compile(r'\b([2-8][UF])\s*[:：]\s*(\d{2})\s*[-–~]\s*(\d{2})\s*lbs?\b', re.I)
yonex_advice = {page['url']: page.get('Stringing Advice', '') for page in yx}

def victor_tension(lines):
    start = next((i for i, line in enumerate(lines) if re.fullmatch(r'string tension(?:\s+lbs)?\s*:?', line, re.I)), None)
    if start is None:
        return
    for line in lines[start + 1:]:
        values = VICTOR_CAP.findall(line)
        if not values:
            break
        yield from ((weight.upper(), int(cap)) for weight, cap in values if 15 <= int(cap) <= 40)

for r in rackets.values():
    by_weight = {}
    caps = set()
    low = (r.get('tension') or [None, None])[0]
    tension_label = 'ผู้ผลิตระบุ: '
    if r['brand'] == 'Yonex' and r.get('officialUrl') in yonex_advice:
        for weight, minimum, maximum in YONEX_RANGE.findall(yonex_advice.get(r.get('officialUrl'), '')):
            by_weight[weight.upper()] = [int(minimum), int(maximum)]
        if len(by_weight) < 2:
            continue
        low = max(v[0] for v in by_weight.values())
        caps = {v[1] for v in by_weight.values()}
    elif r.get('tensionSrc') and r.get('tensionByWeight'):
        # A spec override may contain a table verified against the exact product code,
        # including when the cached manufacturer page has only unlabelled numbers.
        by_weight = r['tensionByWeight']
        caps = {maximum for _, maximum in by_weight.values()}
        low = max((minimum for minimum, _ in by_weight.values() if minimum is not None), default=None)
        tension_label = 'ตามแหล่งสเปก: '
    elif r['brand'] == 'Victor':
        limits = [pair for lines in victor_specs[id(r)] for pair in victor_tension(lines)]
        caps = {cap for _, cap in limits}
        if len(caps) < 2:
            continue
        labelled = {cap for weight, cap in limits if weight}
        # A ceiling with no corresponding label stays unassigned.
        if caps <= labelled:
            for weight, cap in limits:
                if weight:
                    by_weight[weight] = [None, min(cap, by_weight.get(weight, [None, cap])[1])]
    else:
        continue
    cap = min(caps)
    if 'tension' in r.get('_hand', ()) and r.get('tension') and r['tension'][1] < cap:
        cap = r['tension'][1]
        by_weight = {w: [lo if lo and lo <= cap else None, cap] for w, (lo, _) in by_weight.items()}
    r['tension'] = [low if low and low <= cap else None, cap]
    r['tensionByWeight'] = dict(sorted(by_weight.items()))
    labels = [f'{w}: {lo}–{hi}' if lo else f'{w} ≤ {hi}' for w, (lo, hi) in r['tensionByWeight'].items()]
    r['tensionNote'] = tension_label + ', '.join(labels or [f'≤ {n}' for n in sorted(caps)]) + ' lbs'
    r['est'] = [field for field in r.get('est', []) if field != 'tension']
print('official tension variants', sum('tensionByWeight' in r for r in rackets.values()))

# Shop listings can describe different weights or regional variants. A ceiling with conflicting
# values stays provisional until we can tie it to a manufacturer table or an exact source.
for r in rackets.values():
    if (not r.get('tension') or r.get('tensionSrc') or 'tensionByWeight' in r or
            yonex_advice.get(r.get('officialUrl'))):
        continue
    matched = AUDIT['matched'].get(r['brand'] + ' ' + r['name'], [])
    ceilings = {entry['fill']['tension'][1] for entry in matched if entry['fill'].get('tension')}
    if len(ceilings) > 1 and 'tension' not in r['est']:
        r['est'].append('tension')

research_path = os.path.join(ROOT, LEDGER_PATH)
research = {}
if os.path.exists(research_path):
    with open(research_path, encoding='utf-8') as evidence_file:
        research = decode(evidence_file.read())

order = ['id', 'brand', 'name', 'year', 'yearSrc', 'style', 'balance', 'bp', 'flex', 'level', 'levelTo', 'weights', 'weight', 'grips', 'tension', 'tensionNote', 'price',
         'frame', 'shaft', 'joint', 'length', 'head', 'pattern', 'tech', 'players', 'madeIn', 'recString', 'img', 'source', 'officialUrl', 'specSrc', 'shopUrl', 'bayUrl', 'clickUrl', 'shopLinks', 'priceNote', 'priceSrc', 'note', 'est']
final, seen = [], set()
for r in sorted(rackets.values(), key=lambda r: (r['brand'], r['name'])):
    while r['id'] in seen: r['id'] += '-2'
    seen.add(r['id'])
    if r['id'] in research:
        patch, _ = project(r, research[r['id']])
        r.update(patch)
    final.append({k: r.get(k, '') for k in order})
    for field in ('aliases', 'modelCode', 'generation', 'researchEvidence'):
        if r.get(field):
            final[-1][field] = r[field]
    if 'tensionByWeight' in r:
        final[-1]['tensionByWeight'] = r['tensionByWeight']
    if r.get('tensionSrc'):
        final[-1]['tensionSrc'] = r['tensionSrc']
if research.keys() - seen:
    raise ValueError('Unknown racket IDs in research evidence: ' + ', '.join(sorted(research.keys() - seen)))

head = """// ข้อมูลไม้แบด — สร้างจาก scripts/build_rackets.py และ data/spec-overrides.json
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

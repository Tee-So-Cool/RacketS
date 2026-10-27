# Build data/shoes.js and data/socks.js from scripts/sources/chobbad-{shoes,socks}.json,
# Badminton Plaza (scripts/sources/plaza-{shoes,socks}.json, THB prices and images where empty)
# and data/{shoe,sock}-overrides.json.
# Run from anywhere: python3 scripts/build_gear.py
import json, os, re, sys, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'scripts', 'sources')
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
from plaza_match import match as pmatch

def load(p, default):
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else default
def key(s): return re.sub(r'[^a-z0-9]', '', s.lower())
def slug(s): return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')

def thb(t):
    # only Thai prices count; foreign prices stay in the note
    t = t or ''
    if re.search(r'บาท|฿|thb', t, re.I):
        m = re.search(r'([\d,]{3,})', t)
        if m: return int(m.group(1).replace(',', ''))
    return ''

def width(t):
    t = (t or '').lower()
    if re.search(r'กว้าง|wide|\b[2-4]e\b|3\.0', t): return 'wide'
    if re.search(r'แคบ|narrow|slim', t): return 'narrow'
    if re.search(r'ปกติ|standard|\bd\b|2\.5', t): return 'normal'
    return ''

def grams(t):
    m = re.search(r'(\d{3})\s*g', t or '')
    return int(m.group(1)) if m else ''

def height(t):
    t = (t or '').lower()
    if re.search(r'สั้น|ankle|low|no.?show', t): return 'low'
    if re.search(r'กลาง|crew|mid', t): return 'mid'
    if re.search(r'ยาว|high|knee', t): return 'high'
    return ''

def pairs(t):
    m = re.search(r'(\d+)\s*คู่', t or '')
    return int(m.group(1)) if m else ''

KINDS = {
    'shoes': dict(var='SHOES', fields=lambda i: {
        'code': i.get('code', ''), 'width': width(i.get('width')), 'widthText': i.get('width', ''), 'sole': i.get('sole', ''),
        'cushion': i.get('cushion', ''), 'upper': i.get('upper', ''), 'weight': grams(i.get('weight')), 'sizes': i.get('sizes', ''),
        'colors': i.get('colors', ''), 'price': thb(i.get('price')), 'priceText': i.get('price', '')}),
    'socks': dict(var='SOCKS', fields=lambda i: {
        'code': i.get('code', ''), 'height': height(i.get('height')), 'heightText': i.get('height', ''), 'thickness': i.get('thickness', ''),
        'material': i.get('material', ''), 'cushion': i.get('cushion', ''), 'sizes': i.get('sizes', ''), 'pack': pairs(i.get('pack')),
        'colors': i.get('colors', ''), 'price': thb(i.get('price')), 'priceText': i.get('price', '')}),
}

for kind, cfg in KINDS.items():
    cb = load(os.path.join(SRC, f'chobbad-{kind}.json'), [])
    plaza = load(os.path.join(SRC, f'plaza-{kind}.json'), [])
    ovr = load(os.path.join(ROOT, 'data', f'{kind[:-1]}-overrides.json'), {})
    items = {}
    for i in cb:
        brand, name = i['brand'], i['name'].strip()
        short = name[len(brand):].strip() if name.lower().startswith(brand.lower()) else name
        items[key(name)] = {'id': slug(name), 'brand': brand, 'name': short, **cfg['fields'](i),
                            'year': int(i['year']) if str(i.get('year', '')).isdigit() else '', 'note': i.get('tech', ''),
                            'img': i.get('img', ''), 'source': i.get('url', ''), 'officialUrl': i.get('source', ''), 'est': []}
    hits = 0
    for pz in plaza:
        pool = {v['name']: v for v in items.values() if v['brand'].lower() == pz['brand'].lower()}
        m, _ = pmatch(pz['name'], pool)
        if not m: continue
        s = pool[m]; hits += 1
        if not s.get('price') and pz.get('price'): s['price'] = int(pz['price'])
        if not s.get('img') and pz.get('img'): s['img'] = pz['img']
        s.setdefault('shopUrl', 'https://www.badmintonplaza.com/product_info.php?products_id=' + str(pz['id']))
    unmatched = []
    for full, o in ovr.items():
        if full.startswith('_'): continue
        s = items.get(key(full))
        if s is None:
            if not o.get('new'): unmatched.append(full); continue
            brand = o.get('brand') or full.split()[0]
            s = items[key(full)] = {'id': slug(full), 'brand': brand, 'name': full[len(brand):].strip(), 'est': [], 'note': ''}
        for f, v in o.items():
            if f not in ('src', 'new', 'brand') and v not in ('', None): s[f] = v
        s['specSrc'] = o.get('src', '')
    if unmatched: print(kind, 'override names not found:', unmatched)
    final, seen = [], set()
    for s in sorted(items.values(), key=lambda s: (s['brand'], s['name'])):
        while s['id'] in seen: s['id'] += '-2'
        seen.add(s['id'])
        final.append(s)
    head = f"// ข้อมูล{'รองเท้า' if kind == 'shoes' else 'ถุงเท้า'}แบด — สร้างจาก scripts/build_gear.py (อย่าแก้มือ ให้แก้ data/{kind[:-1]}-overrides.json แล้วรันใหม่)\n"
    open(os.path.join(ROOT, 'data', f'{kind}.js'), 'w', encoding='utf-8').write(head + f"window.{cfg['var']} = " + json.dumps(final, ensure_ascii=False, indent=1) + ';\n')
    c = collections.Counter
    print(kind, len(final), 'plaza matched', hits, 'no price', sum(1 for s in final if not s.get('price')), 'no img', sum(1 for s in final if not s.get('img')), c(s['brand'] for s in final).most_common(8))

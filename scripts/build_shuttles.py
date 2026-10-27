# Build data/shuttles.js from scripts/sources/* plus data/shuttle-overrides.json.
# Order: chobbad -> Yonex official (names, images, count per tube; adds models chobbad lacks)
#        -> Badminton Plaza (THB price, image, specs where empty) -> overrides.
# Run from anywhere: python3 scripts/build_shuttles.py
import json, os, re, sys, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'scripts', 'sources')
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
from plaza_match import match as pmatch

def load(f, default=None):
    p = os.path.join(SRC, f)
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else (default if default is not None else [])
cb, yx, plaza = load('chobbad-shuttles.json'), load('yonex-shuttles.json'), load('plaza-shuttles.json')
OVR = os.path.join(ROOT, 'data', 'shuttle-overrides.json')
overrides = json.load(open(OVR, encoding='utf-8')) if os.path.exists(OVR) else {}

def key(s): return re.sub(r'[^a-z0-9]', '', s.lower())
def slug(s): return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')

def feather(t):
    t = (t or '').lower()
    if re.search(r'ผสม|hybrid', t): return 'hybrid'
    if re.search(r'ไนลอน|nylon', t): return 'nylon'
    if re.search(r'สังเคราะห์|synthetic|carbon', t): return 'synthetic'
    if re.search(r'ห่าน|goose', t): return 'goose'
    if re.search(r'เป็ด|duck', t): return 'duck'
    if re.search(r'ธรรมชาติ|natural|feather|ขน', t): return 'natural'
    return ''

def grade(t):
    t = (t or '').lower()
    if re.search(r'นานาชาติ|international|a\+\+|5 ดาว|tournament|แข่งขัน(?!.*ชมรม)|advance', t): return 'tournament'
    if re.search(r'ชมรม|club|intermediate|แข่งขัน', t): return 'club'
    if re.search(r'ซ้อม|training|เล่นทั่วไป|nylon|เริ่มต้น', t): return 'training'
    return ''

def speed(t):
    nums = [int(n) for n in re.findall(r'\b(7[4-9])\b', t or '')]
    return nums[0] if nums else ''

def per_tube(t):
    m = re.search(r'(\d+)\s*(?:ลูก|shuttle|pcs|PCS)', t or '', re.I)
    if m: return int(m.group(1))
    return 12 if re.search(r'โหล|dozen', t or '', re.I) else ''

def price(t):
    m = re.search(r'([\d,]{2,})', t or '')
    return int(m.group(1).replace(',', '')) if m else ''

shuttles = {}
for i in cb:
    brand, name = i['brand'], i['name'].strip()
    short = name[len(brand):].strip() if name.lower().startswith(brand.lower()) else name
    shuttles[key(name)] = {
        'id': slug(name), 'brand': brand, 'name': short, 'type': feather(i['feather']), 'grade': grade(i['grade']),
        'speed': speed(i['speed']), 'speedText': i['speed'], 'cork': i['cork'], 'perTube': per_tube(i['per_tube']),
        'price': price(i['price']), 'year': int(i['year']) if str(i['year']).isdigit() else '',
        'note': ' · '.join(x for x in (i['feather'], i['grade'], i['tech']) if x), 'img': i['img'], 'source': i['url'], 'est': [],
    }

def ytitle(n): return ' '.join(w if re.search(r'\d', w) else w.capitalize() for w in n.split())
for y in yx:
    nm = ytitle(y['name'])
    k = key('Yonex ' + y['name'])
    s = shuttles.get(k)
    if s is None:
        # a Yonex model chobbad lacks: take type and grade from its series sibling, flagged as estimates
        series = nm.split()[0].lower()
        sib = next((v for v in shuttles.values() if v['brand'] == 'Yonex' and v['name'].lower().startswith(series)), None)
        s = shuttles[k] = {'id': slug('yonex ' + nm), 'brand': 'Yonex', 'name': nm, 'type': sib['type'] if sib else '',
                           'grade': sib['grade'] if sib else '', 'speed': '', 'speedText': '', 'cork': '', 'perTube': '', 'price': '',
                           'year': '', 'note': 'ข้อมูลจาก Yonex ทางการ', 'img': '', 'source': '', 'est': [f for f in ('type', 'grade') if sib]}
    s['name'] = nm
    s['officialUrl'] = y['url']
    if y.get('img'): s['img'] = s.get('img') or y['img']
    if not s.get('perTube'): s['perTube'] = per_tube(y.get('Quantity', ''))
    if y.get('Item Code') and len(y['Item Code']) < 20: s['code'] = y['Item Code']

hits = 0
for pz in plaza:
    if re.search(r'gift|butterbear', pz['name'], re.I): continue
    pool = {v['name']: v for v in shuttles.values() if v['brand'] == pz['brand'] or pz['brand'] == 'Other'}
    m, _ = pmatch(pz['name'], pool)
    if not m: continue
    s = pool[m]; hits += 1
    sp = pz.get('specs', {})
    fill = {'price': int(pz['price']) if pz.get('price') else '', 'img': pz.get('img', ''),
            'speed': speed(' '.join(sp.values()) + ' ' + pz['name']), 'perTube': per_tube(pz['name'] + ' ' + ' '.join(sp.values()))}
    for f, v in fill.items():
        if v not in ('', None) and s.get(f) in ('', None): s[f] = v
    s.setdefault('shopUrl', 'https://www.badmintonplaza.com/product_info.php?products_id=' + str(pz['id']))

unmatched = []
for full, o in overrides.items():
    if full.startswith('_'): continue
    k = key(full); s = shuttles.get(k)
    if s is None:
        if not o.get('new'): unmatched.append(full); continue
        brand = o.get('brand') or full.split()[0]
        s = shuttles[k] = {'id': slug(full), 'brand': brand, 'name': full[len(brand):].strip(), 'est': [], 'note': ''}
    for f, v in o.items():
        if f in ('src', 'new', 'brand') or v in ('', None): continue
        s[f] = v
        if f in s.get('est', []): s['est'].remove(f)
    s['specSrc'] = o.get('src', '')
if unmatched: print('override names not found:', unmatched)

ORDER = ['id', 'brand', 'name', 'code', 'type', 'grade', 'speed', 'speedText', 'cork', 'perTube', 'price', 'year', 'note',
         'img', 'source', 'officialUrl', 'shopUrl', 'specSrc', 'est']
final, seen = [], set()
for s in sorted(shuttles.values(), key=lambda s: (s['brand'], s['name'])):
    while s['id'] in seen: s['id'] += '-2'
    seen.add(s['id'])
    final.append({k: s.get(k, [] if k == 'est' else '') for k in ORDER})
head = """// ข้อมูลลูกแบด — สร้างจาก scripts/build_shuttles.py (อย่าแก้มือ ให้แก้ data/shuttle-overrides.json แล้วรันใหม่)
// type: goose | duck | natural | hybrid | synthetic | nylon, grade: tournament | club | training, price: บาทต่อหลอด
"""
open(os.path.join(ROOT, 'data', 'shuttles.js'), 'w', encoding='utf-8').write(head + 'window.SHUTTLES = ' + json.dumps(final, ensure_ascii=False, indent=1) + ';\n')
c = collections.Counter
print('total', len(final), c(s['brand'] for s in final), 'plaza matched', hits)
print('type', c(s['type'] for s in final)); print('grade', c(s['grade'] for s in final))
print('no img', sum(1 for s in final if not s['img']), 'no price', sum(1 for s in final if not s['price']), 'no speed', sum(1 for s in final if not s['speed'] and not s['speedText']))

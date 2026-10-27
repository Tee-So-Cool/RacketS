# Build data/strings.js from scripts/sources/* plus data/string-overrides.json.
# Order: chobbad -> Yonex official -> manual-strings (fills gaps, ratings flagged as estimates) -> overrides.
# Run from anywhere: python3 scripts/build_strings.py
import json, os, re, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'scripts', 'sources')
load = lambda f: json.load(open(os.path.join(SRC, f), encoding='utf-8'))
cb, yx, manual = load('chobbad-strings.json'), load('yonex-strings.json'), load('manual-strings.json')
OVR = os.path.join(ROOT, 'data', 'string-overrides.json')
overrides = json.load(open(OVR, encoding='utf-8')) if os.path.exists(OVR) else {}

RATINGS = ['repulsion', 'control', 'durability', 'sound', 'shock']
def key(s): return re.sub(r'[^a-z0-9]', '', s.lower())
def slug(s): return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
def num(s):
    m = re.search(r'\d+(\.\d+)?', str(s or '').replace(',', ''))
    return float(m.group(0)) if m else ''

def material(t):
    t = (t or '').lower()
    if re.search(r'ไฮบริด|hybrid|vectran', t): return 'hybrid'
    if re.search(r'ถัก|braid', t): return 'braided'
    if re.search(r'โมโน|mono', t): return 'mono'
    if re.search(r'เคลือบ|coat|titanium|ไทเทเนียม', t): return 'coated'
    if re.search(r'มัลติ|multi|ฟิลาเมนต์|filament|ใย|nylon|ไนลอน', t): return 'multi'
    return ''

def gauge(t):
    t = str(t or '')
    nums = [float(x) for x in re.findall(r'0\.\d{2}', t)]
    if len(nums) >= 2: return nums[0], f'แนวตั้ง {nums[0]:.2f} / แนวขวาง {nums[1]:.2f}'
    return (nums[0] if nums else ''), ''

def score10(v):
    return round(v / 10) if isinstance(v, (int, float)) else ''

strings = {}
for i in cb:
    brand, name = i['brand'], i['name'].strip()
    short = name[len(brand):].strip() if name.lower().startswith(brand.lower()) else name
    g, gt = gauge(i['gauge'])
    s = {
        'id': slug(name), 'brand': brand, 'name': short, 'gauge': g, 'gaugeText': gt, 'material': material(i['material']),
        'repulsion': score10(i.get('rp')), 'control': score10(i.get('rc')), 'durability': score10(i.get('rd')),
        'sound': score10(i.get('rs')), 'shock': score10(i.get('rk')),
        'tensionMax': int(max(re.findall(r'\d{2}', i['tension']), key=int)) if re.findall(r'\d{2}', i['tension'] or '') else '',
        'price': int(num(i['price'])) if num(i['price']) else '', 'colors': i['colors'], 'year': int(i['year']) if str(i['year']).isdigit() else '',
        'note': ' · '.join(x for x in (i['material'], i['feel'], i['tech']) if x), 'img': i['img'], 'source': i['url'],
    }
    strings[key(name)] = s

def ytitle(n):
    return ' '.join(w if re.search(r'\d', w) else w.capitalize() for w in n.split())

for y in yx:
    nm = ytitle(y['name'])
    g, gt = gauge(y.get('Gauge'))
    k = key('Yonex ' + y['name'])
    s = strings.get(k) or {'id': slug('yonex ' + nm), 'brand': 'Yonex', 'note': '', 'img': '', 'source': ''}
    s.update({'name': nm, 'gauge': g, 'gaugeText': gt, 'officialUrl': y['url'], 'madeIn': y.get('Made In', '')})
    if y.get('Color(s)'): s['colors'] = y['Color(s)']
    mat = material(' '.join((y.get('Core', ''), y.get('Coating', ''))))
    if not s.get('material') or mat in ('hybrid', 'braided'): s['material'] = mat or s.get('material', '')
    strings[k] = s

for m in manual:
    k = key(m['brand'] + ' ' + m['name'])
    s = strings.get(k)
    if s is None:
        s = dict(m, est=[f for f in RATINGS if m.get(f) not in ('', None)], note=m.get('note', ''))
        strings[k] = s
        continue
    est = s.setdefault('est', [])
    for f, v in m.items():
        if f in ('id', 'name', 'brand', 'note') or v in ('', None): continue
        if s.get(f) in ('', None):
            s[f] = v
            if f in RATINGS: est.append(f)

unmatched = []
for full, o in overrides.items():
    if full.startswith('_'): continue
    k = key(full)
    s = strings.get(k)
    if s is None:
        if not o.get('new'): unmatched.append(full); continue
        brand = o.get('brand') or full.split()[0]
        s = strings[k] = {'id': slug(full), 'brand': brand, 'name': full[len(brand):].strip(), 'note': ''}
    for f, v in o.items():
        if f in ('src', 'new', 'brand') or v in ('', None): continue
        s[f] = v
        if f in s.get('est', []): s['est'].remove(f)
    s['specSrc'] = o.get('src', '')
if unmatched: print('override names not found:', unmatched)

ORDER = ['id', 'brand', 'name', 'year', 'gauge', 'gaugeText', 'material'] + RATINGS + [
    'tensionMax', 'price', 'colors', 'madeIn', 'note', 'img', 'source', 'officialUrl', 'specSrc', 'est']
final, seen = [], set()
for s in sorted(strings.values(), key=lambda s: (s['brand'], s['name'])):
    s['id'] = s.get('id') or slug(s['brand'] + ' ' + s['name'])
    while s['id'] in seen: s['id'] += '-2'
    seen.add(s['id'])
    final.append({k: s.get(k, [] if k == 'est' else '') for k in ORDER})

head = """// ข้อมูลเอ็น — สร้างจาก scripts/build_strings.py (อย่าแก้มือ ให้แก้ data/string-overrides.json แล้วรันใหม่)
// แหล่งข้อมูล: chobbad.com + yonex.com + ค่าประเมินเดิม (ช่องที่เป็นค่าประเมินอยู่ใน est)
// material: multi | mono | braided | hybrid | coated, คะแนน 1–10
"""
open(os.path.join(ROOT, 'data', 'strings.js'), 'w', encoding='utf-8').write(
    head + 'window.STRINGS = ' + json.dumps(final, ensure_ascii=False, indent=1) + ';\n')
c = collections.Counter
print('total', len(final), c(s['brand'] for s in final))
print('no rating', sum(1 for s in final if all(s[f] in ('', None) for f in RATINGS)), 'est', sum(1 for s in final if s['est']))
print('material', c(s['material'] for s in final))

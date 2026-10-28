# Build data/shuttles.js from scripts/sources/* plus data/shuttle-overrides.json.
# Order: chobbad -> Yonex official (names, images, count per tube; adds models chobbad lacks)
#        -> Badminton Plaza (THB price, image, specs where empty) -> overrides.
#        -> shops (gear_shop.py: Thai price, speed, count per tube, links; models several shops sell; foreign prices converted).
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

# ---- shops: Badminton Plaza and the Shopify feeds (gear_shop.py) ----
import gear_shop

def clean_title(t, strip_brand=''):
    # "VICTOR NEW CARBONSONIC MAX (12 PCS) Shuttlecock (NCS-MAX-12)" -> "New Carbonsonic Max"
    t = re.sub(r'\(.*?\)|\[.*?\]|—.*$', ' ', t)
    t = re.sub(r'\d+\s*(?=(?:หลอด|ลูก))|มี\s*\d+', ' ', t)  # counts: "25 หลอด", "1 หลอด มี 12 ลูก"
    t = re.sub(r'[ก-๙]+', ' ', t)  # Thai framing: "ลูกแบดมินตัน Forehand รุ่น Spirit"
    t = re.sub(r'(?i)\b(tournament) no\.?\s?1\b', r'\1', t) if re.search(r'(?i)bullets', t + strip_brand) else t  # Bullets "Tournament No.1" = "Tournament"
    if strip_brand: t = re.sub(re.escape(strip_brand) + r'|li[- ]?ning|ling ?mei', ' ', t, flags=re.I)
    # shop framing: prices ("From £37.62"), approvals, speed words, pack counts ("Mavis 350-5", "1/2 dozen")
    t = re.sub(r'\b(?:pack|box|set|tube|carton)s?\s+of\s+\d+\b|[-–\s]*from\s*[£$€]?[\d.,]+|\bbwf approved\b|\b(?:medium|fast|slow)(?: speed)?\b|\b1/2\b|'
               r'\b(?:practice|training|plastic|official)\b|(?<=\w )\b7[5-9]\b|\s*[,/]\s*7[5-9]\b|\bnew\b(?! carbon)|[-\s]speed\b', ' ', t, flags=re.I)
    t = re.sub(r'(\d)\s*[-–]\s*\d{1,2}\b(?!\.)', r'\1', t)  # "Mavis 350-5", "Champion 5-5": a pack count
    # a code that repeats the model number ("Flight 10 FL10", "Aerosensa 2 AS2") goes
    ws = t.split()
    t = ' '.join(w for w in ws if not ((m := re.fullmatch(r'[A-Za-z]{1,3}-?(\d{1,3})', w)) and m.group(1) in ws))
    t = re.sub(r'\b(badminton|shuttlecocks?|shuttles?|feather|tube|dozen|pack|box|carton|of|\d+\s?(?:pcs|pieces|tubes?)|pcs|'
               r'speed\s?\d+|\d{2}\s?speed|20\d\d|white|yellow|green|blue|small|single|goose|duck|nylon|synthetic)\b|\b\d+\s?(?:pcs|pieces|tubes?)\b', ' ', t, flags=re.I)
    t = re.sub(r'\s*-\s*', '-', re.sub(r'\s+', ' ', t))
    t = re.sub(r'\b[Nn][Oo]\.\s?(\d)', r'No.\1', t)  # "NO. 1" -> "No.1"
    t = re.sub(r'^[\s\-–|,/.]+|[\s\-–|,/.]+$', '', t)
    # model codes keep their case ("No.1", "VSN-3000", "D.TL."); words get title case, short codes stay upper ("SG")
    return ' '.join(w if re.search(r'[\d.]', w) else w.upper() if len(w) <= 2 else w.capitalize() for w in t.split())

def extract(it):
    text = ' '.join([it['title']] + it['lines'])
    # a speed only when the listing names one (Aerosensa is sold in 76, 77 and 78)
    sps = {a or b for a, b in re.findall(r'speed\s*[:：]?\s*(7[5-9])\b|\b(7[5-9])\s*speed', text, re.I)}
    sp = sps.pop() if len(sps) == 1 else ''
    # count per tube only from "12 pcs" / "6 shuttles" (not "No.1 Shuttlecock")
    n = re.search(r'\b(3|6|10|12)\s*(?:pcs|pieces|shuttles\b|ลูก)', text, re.I)
    return {'speed': int(sp) if sp else '', 'perTube': int(n.group(1)) if n else '',
            'type': feather(' '.join(l for l in it['lines'] if re.search(r'feather|skirt|material|ขน', l, re.I)) or it['title'])}

def new_model(brand, name, shops=1):
    # a name that is only the brand or a code fragment ("Lingmei", "Vns") is not a model
    if not name or len(name) > 30 or len(name) < 2 or re.fullmatch(r'(?i)lingmei|vns|vsn|ns|nylon|basic', name): return None
    return {'id': slug(brand + ' ' + name), 'brand': brand, 'name': name, 'note': '', 'source': '', 'est': []}

had_speed = {id(s) for s in shuttles.values() if s.get('speed')}
gear_shop.apply(shuttles, 'shuttles', r'shuttle|ลูกแบด|ลูกขนไก่', clean_title, extract, new_model)
# a model sold in a range of grades ("Temp Grade 1-5") has no one speed, whatever a single listing says
for s in shuttles.values():
    if id(s) not in had_speed and re.search(r'grade|\d\s*[-–]\s*\d', s.get('speedText') or '', re.I): s['speed'] = ''

def spd(s):
    # one filter value per shuttle: the first number 75-79, else slow/medium/fast from the text
    if s.get('speed'): return str(s['speed'])
    tx = (s.get('speedText') or '').lower()
    for w, v in (('slow', 'slow'), ('ช้า', 'slow'), ('medium', 'medium'), ('กลาง', 'medium'), ('fast', 'fast'), ('เร็ว', 'fast')):
        if w in tx: return v
    return ''
for s in shuttles.values(): s['spd'] = spd(s)

ORDER = ['id', 'brand', 'name', 'code', 'type', 'grade', 'speed', 'speedText', 'spd', 'cork', 'perTube', 'price', 'year', 'note',
         'img', 'source', 'officialUrl', 'shopUrl', 'specSrc', 'shopLinks', 'priceNote', 'priceSrc', 'est']
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

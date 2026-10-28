# Shared by build_strings.py and build_shuttles.py: the shop layer for strings and shuttles.
# Sources: Badminton Plaza (THB, scripts/sources/plaza-<kind>.json) and the public Shopify feeds
# (scripts/sources/shop-<kind>.json, from fetch_shops.py --kind=<kind>).
# Each listing is matched to a model already in the data; a listing that matches none becomes a new model
# (new_model in each builder decides what counts as a model name), so every model a shop sells is listed.
import json, os, re, collections
from plaza_match import match as pmatch, tokens

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'scripts', 'sources')
THAI = {'badmintonplaza.com', 'vssportsthailand.com', 'luxebadminton.com'}
BRANDS = {'asics': 'Asics', 'hundred': 'Hundred', 'fz forza': 'FZ Forza', 'forza': 'FZ Forza', 'yonex': 'Yonex', 'victor': 'Victor', 'li-ning': 'Li-Ning', 'li ning': 'Li-Ning', 'lining': 'Li-Ning', 'vs': 'VS',
          'venson': 'VS', 'bullets': 'Bullets', 'rsl': 'RSL', 'forehand': 'Forehand', 'parrot': 'Parrot', 'นกแก้ว': 'Parrot',
          'kawasaki': 'Kawasaki', 'fighter': 'Fighter', 'excella': 'Excella', 'smasher': 'Smasher', 'apacs': 'Apacs', 'kizuna': 'Kizuna', 'mizuno': 'Mizuno', 'ling mei': 'Ling Mei', 'lingmei': 'Ling Mei'}
# character tie-ins, gift sets and tennis lines are not models to list
NOT_MODEL = re.compile(r'doraemon|dragon ball|crayon|shin ?chan|hello kitty|care bears|one piece|pokemon|butterbear|stencil|avenger|'
                       r'gift|combo|\bkit\b|polytour|tennis|squash|sample|bundle|\bx\b|\bmini\b|ornament|\bcase\b|\bbulk\b|box ?set|'
                       r'wristband|keychain|key chain|\bholder\b|\b\d+th\b|anniversary', re.I)
FX = json.load(open(os.path.join(SRC, 'fx.json'))) if os.path.exists(os.path.join(SRC, 'fx.json')) else {'toTHB': {}, 'date': ''}
SYM = {'USD': 'US$', 'GBP': '£', 'EUR': '€', 'SGD': 'S$', 'AUD': 'A$', 'INR': '₹', 'CAD': 'C$', 'MYR': 'RM'}

def brand_of(vendor, title):
    # the brand the title opens with wins ("BULLETS DIAMOND" sold by VS Thailand is a Bullets shuttle), then the vendor;
    # Thai titles put the kind first ("ลูกแบดมินตัน Forehand รุ่น Spirit"), so that framing goes first
    t = re.sub(r'^(?:new|vs x)\s+|^(?:ลูกแบดมินตัน(?:พลาสติก)?|ลูกแบด(?:พลาสติก)?|เอ็นแบด(?:มินตัน)?|รองเท้าแบดมินตัน|ถุงเท้า)\s*', '', title.lower())
    b = next((b for k, b in BRANDS.items() if re.match(re.escape(k) + r'(?![a-z])', t)), '')
    return b or BRANDS.get((vendor or '').strip().lower(), '')

def items(kind, wanted):
    """Every shop listing of this kind as {brand, title, url, shop, price, currency, lines, img}."""
    out = []
    pz = os.path.join(SRC, f'plaza-{kind}.json')
    for p in json.load(open(pz, encoding='utf-8')) if os.path.exists(pz) else []:
        # a Plaza category page also links its sidebar products: keep only listings of this kind
        if not re.search(wanted, p['name'], re.I): continue
        out.append({'brand': brand_of(p['brand'], p['name']), 'title': p['name'], 'shop': 'badmintonplaza.com',
                    'url': 'https://www.badmintonplaza.com/product_info.php?products_id=' + str(p['id']), 'price': p.get('price'),
                    'currency': 'THB', 'lines': [f'{k}: {v}' for k, v in p.get('specs', {}).items()], 'img': p.get('img', '')})
    # Shopify feeds (fetch_shops.py) and Thai WooCommerce shops (fetch_woo.py)
    feeds = [os.path.join(SRC, f'{pre}-{kind}.json') for pre in ('shop', 'woo')]
    for p in [p for f in feeds if os.path.exists(f) for p in json.load(open(f, encoding='utf-8'))]:
        out.append({'brand': brand_of(p['brand'], p['name']), 'title': p['name'], 'shop': p['shop'], 'url': p['url'],
                    'price': p.get('price'), 'currency': p.get('currency'), 'lines': p.get('lines', []) + p.get('options', []),
                    'img': p.get('img', '')})
    return [i for i in out if i['brand']]

def thb(amount, cur):
    rate = FX['toTHB'].get(cur) or FX.get('extraToTHB', {}).get(cur)
    if not rate: return None, ''
    src = 'ECB ' + FX['date'] if FX['toTHB'].get(cur) else 'open.er-api.com ' + FX.get('extraDate', '')
    return int(round(amount * rate / 10) * 10), f"แปลงจาก {SYM.get(cur, cur + ' ')}{amount:,.2f} ที่ 1 {cur} = {rate:g} บาท ({src}) ไม่รวมภาษีนำเข้าและค่าส่ง"

def apply(db, kind, wanted, clean_title, extract, new_model):
    """db: {key: model}. Fills empty fields from matched listings, adds models several shops sell,
    sets a Thai price or else a converted foreign one (flagged), and records each shop link."""
    found = collections.defaultdict(list)   # (brand, cleaned name) -> listings with no model
    hits = 0
    for it in items(kind, wanted):
        if NOT_MODEL.search(it['title']): continue
        pool = {m['name']: m for m in db.values() if m['brand'] == it['brand']}
        name, _ = pmatch(clean_title(it['title']), pool)
        if not name:
            nm = clean_title(it['title'], strip_brand=it['brand'])
            # one model however the shops space or spell it: "AP - 7" = "AP7", "VBS-70 Power" = "VBS-70P"
            # repeated words fold too: "NCS New Carbonsonic Max" = "New Carbonsonic Max"
            # and word order does not split one model: "300 Youlong" = "Youlong 300"
            tk = [w for i, w in enumerate(tokens(nm)) if i == 0 or w != tokens(nm)[i - 1]]
            # a name made only of colour words ("RSL Red") has no tokens left: its plain spelling keys it
            if nm: found[(it['brand'], ' '.join(sorted(tk)) or nm.lower())].append(it)
            continue
        hits += 1
        fill(pool[name], it, extract, kind)
    added = 0
    for (brand, _), its in found.items():
        shops = {i['shop'] for i in its}
        if os.environ.get('GEAR_DEBUG'): print('candidate', brand, '|', clean_title(its[0]['title'], strip_brand=brand), '|', len(shops), sorted(shops)[:3])
        # the name as a Thai shop writes it, else as most shops do
        names = collections.Counter(clean_title(i['title'], strip_brand=brand) for i in its if i['shop'] in THAI) or \
                collections.Counter(clean_title(i['title'], strip_brand=brand) for i in its)
        m = new_model(brand, names.most_common(1)[0][0], len(shops) + (1 if shops & THAI else 0))
        if not m: continue
        # a listing that only now finds a model added a moment ago (another spelling of it) joins that model
        twin, _ = pmatch(m['name'], {o['name']: o for o in db.values() if o['brand'] == brand})
        # or a listed model whose name ends with this one: shops drop "Power Cushion" from "Power Cushion Aerus Z2"
        nt = tokens(m['name'])
        twin = twin or next((o['name'] for o in db.values() if o['brand'] == brand and len(tokens(o['name'])) > len(nt)
                             and tokens(o['name'])[-len(nt):] == nt and len(nt) >= 2), None)
        if twin:
            for it in its: fill(next(o for o in db.values() if o['brand'] == brand and o['name'] == twin), it, extract, kind)
            continue
        # a bare series name ("Mavis", "Gold") when numbered models of that series are listed: not one model
        if any(o['brand'] == brand and o['name'].lower().startswith(m['name'].lower() + ' ') for o in db.values()): continue
        db[m['id']] = m; added += 1
        for it in its: fill(m, it, extract, kind)
    settle(db)
    converted = 0
    for m in db.values():
        pf = m.pop('_foreign', None)
        if m.get('price') or not pf: continue
        p, note = thb(pf['amount'], pf['currency'])
        if not p: continue
        m['price'], m['priceNote'], m['priceSrc'] = p, note, pf['src']
        m.setdefault('est', []).append('price'); converted += 1
    print(kind, 'shop listings matched', hits, 'models added', added, 'prices converted', converted)

MIN_BAHT = {'strings': 80, 'shuttles': 100, 'shoes': 500, 'socks': 40}
MAX_BAHT = {'strings': 1500, 'shuttles': 3000, 'shoes': 15000, 'socks': 1500}  # above it the price is for a box or a reel

UNANIMOUS = {'speed'}  # a model sold in several speeds gets none

def settle(db):
    # values every listing gave: the most common wins; for speed the listings must all agree
    for m in db.values():
        for f, vs in m.pop('_vals', {}).items():
            if m.get(f) not in ('', None): continue
            n = collections.Counter(vs)
            if f in UNANIMOUS and len(n) > 1: continue
            m[f] = n.most_common(1)[0][0]

def fill(m, it, extract, kind):
    for f, v in extract(it).items():
        if v not in ('', None): m.setdefault('_vals', {}).setdefault(f, []).append(v)
    if not m.get('img') and it.get('img'): m['img'] = it['img']
    price = float(it['price']) if it.get('price') else 0
    if price in (999, 9999): price = 0  # Li-Ning's stores use S$999 as a placeholder
    # below the floor it is a single shuttle, a sample or an accessory, not a set or a tube
    baht = price if it['currency'] == 'THB' else (thb(price, it['currency'])[0] if price else None)
    if baht is not None and not MIN_BAHT[kind] <= baht <= MAX_BAHT[kind]: price = 0
    if price and it['currency'] == 'THB':
        # a Thai shop's baht price; a converted one it replaces is no longer an estimate
        if not m.get('price') or 'price' in m.get('est', []):
            m['price'] = int(price); m.pop('priceNote', None); m.pop('priceSrc', None)
            if 'price' in m.get('est', []): m['est'].remove('price')
    elif price and not m.get('_foreign'):
        m['_foreign'] = {'amount': price, 'currency': it['currency'], 'src': it['url']}
    links = m.setdefault('shopLinks', [])
    if it['shop'] not in [l['shop'] for l in links]: links.append({'shop': it['shop'], 'url': it['url']})

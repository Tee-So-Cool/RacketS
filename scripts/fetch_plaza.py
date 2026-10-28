# Fetch racket listings and product pages from badmintonplaza.com (Thai shop, THB prices)
# into scripts/sources/plaza.json. Polite: one request per second.
# Run: python3 scripts/fetch_plaza.py            (rackets  -> scripts/sources/plaza.json)
#      python3 scripts/fetch_plaza.py shuttles|strings|shoes|socks  (-> scripts/sources/plaza-<mode>.json)
import html, json, os, re, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://www.badmintonplaza.com/'
MODE = sys.argv[1] if len(sys.argv) > 1 else 'rackets'
BRANDS = {
    'rackets': {'Li-Ning': '53_54', 'Victor': '53_168', 'Yonex': '53_192', 'Mizuno': '53_238', 'Apacs': '53_266', 'VS': '53_296'},
    'shuttles': {'Victor': '71_191', 'Yonex': '71_277', 'Li-Ning': '71_72', 'RSL': '71_73', 'Other': '71_106'},
    'strings': {'Yonex': '76_77_285', 'Li-Ning': '76_77_286', 'Victor': '76_77_287', 'VS': '76_77_289', 'Other': '76_77_288'},
    'shoes': {'Victor': '61_160', 'Yonex': '61_246', 'Mizuno': '61_253', 'VS': '61_295', 'Hundred': '61_339', 'Asics': '61_371', 'Li-Ning': '61_97', 'Other': '61_203'},
    'socks': {'Yonex': '79_103', 'Victor': '79_126', 'VS': '79_299', 'Li-Ning': '79_87', 'Other': '79_133'},
}[MODE]
OUT = 'plaza.json' if MODE == 'rackets' else f'plaza-{MODE}.json'
SPEC_KEYS = {'Weight/Grip Size': 'weight', 'Weight': 'weight', 'Balance': 'balance', 'Flexibility': 'flex', 'Flex': 'flex',
             'String Tension': 'tension', 'Tension': 'tension', 'Length': 'length', 'Material': 'material',
             'Frame': 'frame', 'Shaft': 'shaft', 'Player Type': 'player', 'Grip': 'grip', 'Grip Size': 'grip'}

def get(url):
    time.sleep(1)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh)'})
    return urllib.request.urlopen(req, timeout=40).read().decode('utf-8', 'ignore')

def lines(t):
    t = re.sub(r'<script.*?</script>|<style.*?</style>', '', t, flags=re.S)
    return [l.strip() for l in html.unescape(re.sub(r'<[^>]+>', '\n', t)).split('\n') if l.strip()]

def listing(cat):
    ids = {}
    for page in range(1, 20):
        t = get(f'{BASE}index.php?cPath={cat}&sort=4d&page={page}')
        found = re.findall(r'product_info\.php\?(?:[^"]*&amp;|[^"]*&)?products_id=(\d+)"[^>]*>([^<]{4,})</a>', t)
        # some category pages link products through images only: take every product id, the name comes from its page
        found += [(i, '') for i in dict.fromkeys(re.findall(r'products_id=(\d+)', t)) if i not in dict(found)]
        new = [(i, n) for i, n in found if i not in ids]
        for i, n in new: ids[i] = html.unescape(n).strip()
        if not new: break
    return ids

def product(pid):
    t = get(f'{BASE}product_info.php?products_id={pid}')
    L = lines(t)
    # the title sits right above the review prompt; the list price and the online price follow it
    k0 = next((k for k, l in enumerate(L) if l.startswith('Be the first') or l.startswith('Reviews') or l == 'Quantity wish:'), None)
    name = L[k0 - 1] if k0 else ''
    after = ' '.join(L[k0:k0 + 6]) if k0 else ''
    prices = [float(p.replace(',', '')) for p in re.findall(r'฿([\d,]+\.\d\d)', after.split('You save')[0])]
    spec, allspec = {}, {}
    for k, l in enumerate(L[:-1]):
        if L[k + 1].startswith(':') and len(l) <= 40 and l not in allspec:
            allspec[l] = L[k + 1].lstrip(': ').strip()
        if l in SPEC_KEYS and L[k + 1].startswith(':') and SPEC_KEYS[l] not in spec:
            spec[SPEC_KEYS[l]] = L[k + 1].lstrip(': ').strip()
    imgs = re.findall(r'(?:src|href)="(images/[A-Za-z0-9_.()-]+\.(?:jpg|jpeg|png|webp))"', t)
    imgs = [i for i in imgs if not re.search(r'icons|logo|buttons|/z\d|more/', i)]
    a = next((i for i in imgs if re.search(r'-A\.(jpg|jpeg|png|webp)$', i, re.I)), imgs[0] if imgs else '')
    return {'id': pid, 'name': name, 'price': prices[-1] if prices else '', 'img': BASE + a if a else '', 'specs': allspec, **spec}

out = []
for brand, cat in BRANDS.items():
    ids = listing(cat)
    print(brand, len(ids), flush=True)
    for pid, listed in ids.items():
        try:
            p = product(pid)
        except Exception as e:
            print('  skip', pid, e); continue
        p['brand'] = brand
        p['listed'] = listed
        out.append(p)
json.dump(out, open(os.path.join(ROOT, 'scripts', 'sources', OUT), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('products', len(out), 'with img', sum(1 for p in out if p['img']), 'with balance', sum(1 for p in out if p.get('balance')))

# Fetch racket spec blocks from shops whose Shopify product feed is public and allowed by robots.txt,
# into scripts/sources/shops.json. One feed page of 250 products every 3 s per shop.
# Each product keeps its description lines, variant options and tags; build_rackets.py reads specs from them
# (labelled lines first, then the prose), so a page without a spec table still counts.
# Run: python3 scripts/fetch_shops.py [--kind=strings|shuttles] [domain ...]
#   (with domains, only those shops are refetched; the rest are kept). Strings go to shop-strings.json and
#   shuttles to shop-shuttles.json; string reels (100/200 m) are left out, since their price is not a set's.
import html, json, os, re, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# domain, currency, brand when the shop sells one brand (else the product vendor)
SHOPS = [
    ('vssportsthailand.com', 'THB', 'VS'),
    ('joybadminton.com', 'USD', ''),
    ('badmintonwarehouse.com', 'USD', ''),
    ('nydhi.com', 'INR', ''),
    ('sportsshop.asia', 'SGD', ''),
    ('badmintonclick.com.au', 'AUD', ''),
    ('sg.lining.studio', 'SGD', 'Li-Ning'),
    ('in.lining.studio', 'INR', 'Li-Ning'),
    ('racquetguys.com', 'USD', ''),
    ('yumo.ca', 'CAD', ''),
    ('tenniszon.com', 'CAD', ''),
    ('centralsports.co.uk', 'GBP', ''),
    ('thegodofsports.com', 'INR', ''),
    ('shop.kibisports.com', 'INR', ''),
]
# the labels shops use for a spec; a line that equals one of these takes the next line as its value
LABELS = ['balance', 'balance point', 'flex', 'flexibility', 'shaft flexibility', 'shaft stiffness', 'stiffness',
          'weight', 'weight / grip', 'weight/grip', 'weight / grip size', 'weight & grip', 'grip size', 'grip',
          'max tension', 'maximum tension', 'max. tension', 'string tension', 'stringing tension', 'tension',
          'frame', 'frame material', 'frame composition', 'shaft', 'shaft material', 'joint', 'length', 'total length',
          'string pattern', 'grommet', 'made in', 'country of origin', 'origin', 'technology', 'technologies',
          'player', 'players', 'grade', 'level', 'player level', 'playing level', 'recommended string', 'recommended strings',
          'วัสดุ', 'วัสดุเฟรม', 'วัสดุก้าน', 'จุดสมดุล', 'ความสมดุล', 'บาลานซ์', 'ก้าน', 'ความแข็งก้าน', 'ความยาว',
          'ขึ้นเอ็น', 'ความตึง', 'ความตึงสูงสุด', 'น้ำหนัก', 'ด้าม', 'ผลิตที่', 'ผลิตใน']
LSET = set(LABELS)
KIND = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--kind=')), 'rackets')
# what counts as one product of this kind, and what does not
WANT, SKIP = {
    'rackets': (r'racket|racquet|ไม้แบด', r'\b(bag|string|grip|cover|shoe|shirt|sock|shuttle|tennis|squash|pickleball|padel|table)\b|bundle|ไม้เทนนิส'),
    'strings': (r'\bstrings?\b|เอ็น', r'\b(tennis|squash|pickleball|padel|racket|racquet|machine|stringer|clamp|grip|bag|shoe)\b|\b(?:100|200|500)\s?m\b|\breel\b|\bcoil\b'),
    'shuttles': (r'shuttle|ลูกแบด|ลูกขนไก่', r'\b(holder|tube bag|machine|launcher|keychain|key chain|toy|sticker|towel|shirt|bag)\b'),
}[KIND]
RACKET, NOT_RACKET = re.compile(WANT, re.I), re.compile(SKIP, re.I)

def get(url):
    time.sleep(3)
    return json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=40).read())

def lines_of(body):
    body = re.sub(r'<style.*?</style>|<script.*?</script>', '', body or '', flags=re.S)
    return [l.strip() for l in html.unescape(re.sub(r'<[^>]+>', '\n', body)).replace('\xa0', ' ').split('\n') if l.strip()]

def spec_of(L):
    spec = {}
    for i, l in enumerate(L):
        m = re.match(r'^-?\s*([^:：]{2,30}?)\s*[:：]\s*(.+)$', l)
        if m and m.group(1).strip().lower() in LSET:
            spec.setdefault(m.group(1).strip().lower(), m.group(2).strip())
        elif l.rstrip(':：').strip().lower() in LSET and i + 1 < len(L) and L[i + 1].rstrip(':：').strip().lower() not in LSET:
            spec.setdefault(l.rstrip(':：').strip().lower(), L[i + 1])
    return spec

OUT = os.path.join(ROOT, 'scripts', 'sources', {'rackets': 'shops.json'}.get(KIND, f'shop-{KIND}.json'))
only = {a for a in sys.argv[1:] if not a.startswith('--')}
out = [p for p in json.load(open(OUT, encoding='utf-8')) if p['shop'] not in only] if only and os.path.exists(OUT) else []
for dom, cur, brand in SHOPS:
    if only and dom not in only: continue
    n = 0
    for page in range(1, 40):
        try:
            ps = get(f'https://{dom}/products.json?limit=250&page={page}')['products']
        except Exception as e:
            print(dom, 'stop', e, flush=True); break
        if not ps: break
        for p in ps:
            if not RACKET.search(p['title'] + ' ' + (p.get('product_type') or '')) or NOT_RACKET.search(p['title'] + ' ' + (p.get('product_type') or '')):
                continue
            L = lines_of(p.get('body_html'))
            if not L: continue
            price = min((float(v['price']) for v in p['variants'] if v.get('price') and float(v['price']) > 0), default='')
            out.append({'shop': dom, 'brand': brand or p.get('vendor', ''), 'name': p['title'], 'url': f'https://{dom}/products/{p["handle"]}',
                        'price': price, 'currency': cur, 'img': (p.get('images') or [{}])[0].get('src', ''), 'spec': spec_of(L), 'lines': L,
                        'options': sorted({v['title'] for v in p['variants'] if v.get('title') and v['title'] != 'Default Title'}),
                        'tags': p.get('tags', [])})
            n += 1
    print(dom, KIND, n, flush=True)
    json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('total', len(out))

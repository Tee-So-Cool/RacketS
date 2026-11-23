# Fetch racket spec blocks from shops whose Shopify product feed is public and allowed by robots.txt,
# into scripts/sources/shops.json. One feed page of 250 products every 3 s per shop, the shops side by side.
# Each product keeps its description lines, variant options and tags; build_rackets.py reads specs from them
# (labelled lines first, then the prose), so a page without a spec table still counts.
# Run: python3 scripts/fetch_shops.py [--kind=strings|shuttles|shoes|socks] [domain ...]
#   (with domains, only those shops are refetched; the rest are kept). Strings go to shop-strings.json and
#   shuttles to shop-shuttles.json; string reels (100/200 m) are left out, since their price is not a set's.
import concurrent.futures, fcntl, hashlib, html, json, os, re, sys, tempfile, time, urllib.request

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
    'shoes': (r'\bshoes?\b|footwear|รองเท้า', r'\b(socks?|insoles?|laces?|shoelaces?|bag|spray|cleaner|deodori[sz]er|tennis|padel|pickleball|squash|running|sandals?|slides?|slippers?)\b'),
    'socks': (r'\bsocks?\b|ถุงเท้า', r'\b(shoes?|wristband|grip|towel|bag)\b'),
}[KIND]
RACKET, NOT_RACKET = re.compile(WANT, re.I), re.compile(SKIP, re.I)

def get(url):
    time.sleep(3)
    request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(request, timeout=40) as response:
        return json.load(response)

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

OUT = os.environ.get('SHOPS_OUT') or os.path.join(ROOT, 'scripts', 'sources', {'rackets': 'shops.json'}.get(KIND, f'shop-{KIND}.json'))

def grab(dom, cur, brand):
    """One shop's whole feed. Each shop gets its own worker, so a shop still sees one request every 3 s (get() sleeps) while
    the shops run side by side: the refresh takes as long as the biggest shop, not as long as all of them added together."""
    items = {}
    seen = set()
    for page in range(1, 40):
        ps = get(f'https://{dom}/products.json?limit=250&page={page}')['products']
        if not isinstance(ps, list):
            raise ValueError(f'invalid product list on page {page}')
        if not ps:
            return list(items.values())
        handles = {p['handle'] for p in ps}
        if not handles - seen:
            raise ValueError(f'products repeated on page {page}')
        seen.update(handles)
        for p in ps:
            if not RACKET.search(p['title'] + ' ' + (p.get('product_type') or '')) or NOT_RACKET.search(p['title'] + ' ' + (p.get('product_type') or '')):
                continue
            L = lines_of(p.get('body_html'))
            if not L: continue
            price = min((float(v['price']) for v in p['variants'] if v.get('price') and float(v['price']) > 0), default='')
            items[p['handle']] = {'shop': dom, 'brand': brand or p.get('vendor', ''), 'name': p['title'], 'url': f'https://{dom}/products/{p["handle"]}',
                          'price': price, 'currency': cur, 'img': (p.get('images') or [{}])[0].get('src', ''), 'spec': spec_of(L), 'lines': L,
                          'options': sorted({v['title'] for v in p['variants'] if v.get('title') and v['title'] != 'Default Title'}),
                          'tags': p.get('tags', []),
                          # when the shop listed the product and last changed it: a new model shows up here first, and a page whose
                          # "updated" has not moved since it was read does not need reading again (scripts/fetch_pages.py)
                          'created': (p.get('created_at') or '')[:10], 'updated': p.get('updated_at') or ''}
    raise ValueError('feed reached the page limit before its end')

def read_snapshots():
    snapshots = {}
    if os.path.exists(OUT):
        with open(OUT, encoding='utf-8') as f:
            for item in json.load(f):
                snapshots.setdefault(item['shop'], []).append(item)
    return snapshots

def save_updates(updates, order):
    output = os.path.realpath(OUT)
    lock_name = 'rackets-shops-' + hashlib.sha256(os.fsencode(output)).hexdigest() + '.lock'
    lock_path = os.path.join(tempfile.gettempdir(), lock_name)
    with open(lock_path, 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        snapshots = read_snapshots()
        snapshots.update(updates)
        out = [item for domain in sorted(snapshots, key=lambda d: order.get(d, len(order))) for item in snapshots[domain]]
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=os.path.dirname(output), delete=False) as tmp:
            path = tmp.name
            try:
                json.dump(out, tmp, ensure_ascii=False, indent=1)
                tmp.close()
                os.replace(path, output)
            finally:
                if os.path.exists(path):
                    os.unlink(path)
        return len(out)

def main():
    only = {a for a in sys.argv[1:] if not a.startswith('--')}
    order = {shop: i for i, (shop, _, _) in enumerate(SHOPS)}
    if only - order.keys():
        raise SystemExit('Unknown shop(s): ' + ', '.join(sorted(only - order.keys())))
    jobs = [shop for shop in SHOPS if not only or shop[0] in only]
    snapshots = read_snapshots()

    failed = 0
    updates = {}
    t0 = time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(jobs)) as ex:
        futures = {ex.submit(grab, *shop): shop[0] for shop in jobs}
        for future in concurrent.futures.as_completed(futures):
            domain = futures[future]
            try:
                items = future.result()
                if not items and snapshots.get(domain):
                    raise ValueError('no products matched; previous snapshot retained')
            except Exception as e:
                failed += 1
                print(domain, 'failed:', e, '| kept', len(snapshots.get(domain, [])), 'previous products', flush=True)
                continue
            if items:
                updates[domain] = items
            print(domain, KIND, len(items), f'({time.monotonic() - t0:.0f}s)', flush=True)

    total = save_updates(updates, order) if updates else sum(map(len, snapshots.values()))
    print('total', total, f'in {time.monotonic() - t0:.0f}s')
    return int(failed > 0)

if __name__ == '__main__':
    sys.exit(main())

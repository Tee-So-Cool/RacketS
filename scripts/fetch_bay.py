# Fetch racket specs and prices from badmintonbay.com into scripts/sources/bay.json.
# Follows the site's robots.txt: Crawl-delay 10, and no ?limit= / ?sort= URLs (plain ?page= only).
# Run: python3 scripts/fetch_bay.py   (about 10 s per page, so expect 30-40 minutes)
import html, json, os, re, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://www.badmintonbay.com/'
BRANDS = {'Apacs': 'Apacs-Badminton-Racket', 'Li-Ning': 'Li-Ning-Badminton-Racket', 'Yonex': 'Yonex-Badminton-Racket'}
KEYS = {'Frame Material': 'frame', 'Shaft Material': 'shaft', 'Flex': 'flex', 'Weight': 'weight', 'Length': 'length',
        'Max Tension': 'tension', 'Maximum Tension': 'tension', 'String Tension': 'tension', 'Balance': 'balance', 'Grommets': 'grommets'}
DELAY = 10

def get(url):
    time.sleep(DELAY)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh)'})
    return urllib.request.urlopen(req, timeout=40).read().decode('utf-8', 'ignore')

def listing(cat):
    urls = []
    for page in range(1, 30):
        t = get(f'{BASE}Badminton-Racket/{cat}' + (f'?page={page}' if page > 1 else ''))
        found = [u for u in re.findall(r'href="(https://www\.badmintonbay\.com/[^"?#]+\.html)"', t)
                 if re.search(r'badminton-racket|racket', u, re.I) and '/3x' not in u.lower() and '2x-' not in u.lower()]
        new = [u for u in dict.fromkeys(found) if u not in urls]
        if not new: break
        urls += new
    return urls

def product(url):
    t = get(url)
    name = html.unescape(re.sub(r'<[^>]+>', '', (re.findall(r'<h1[^>]*>(.*?)</h1>', t, re.S) or [''])[0])).strip()
    price = re.search(r'product:price:amount" content="([\d.]+)"', t)
    cur = re.search(r'product:price:currency" content="([A-Z]{3})"', t)
    img = re.search(r'og:image" content="([^"]+)"', t)
    body = re.sub(r'<script.*?</script>|<style.*?</style>', '', t, flags=re.S)
    L = [l.strip() for l in html.unescape(re.sub(r'<[^>]+>', '\n', body)).replace('\xa0', ' ').split('\n') if l.strip()]
    spec = {}
    for k, l in enumerate(L[:-1]):
        lab = l.rstrip(':').strip()
        if l.endswith(':') and lab in KEYS and KEYS[lab] not in spec:
            spec[KEYS[lab]] = L[k + 1]
    return {'url': url, 'name': name, 'price': float(price.group(1)) if price else '', 'currency': cur.group(1) if cur else 'USD',
            'img': img.group(1) if img else '', **spec}

out = []
for brand, cat in BRANDS.items():
    urls = listing(cat)
    print(brand, len(urls), flush=True)
    for u in urls:
        try:
            p = product(u)
        except Exception as e:
            print('  skip', u, e, flush=True); continue
        p['brand'] = brand
        out.append(p)
    json.dump(out, open(os.path.join(ROOT, 'scripts', 'sources', 'bay.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('products', len(out), 'with price', sum(1 for p in out if p['price']), 'with balance', sum(1 for p in out if p.get('balance')))

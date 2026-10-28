# Fetch racket specs from Badminton Click (Australia, AUD) into scripts/sources/click.json.
# Reads the store's public Shopify product feed, which robots.txt allows; one page of 250 every 3 s.
# Each product page carries a text spec block (Shaft Flexibility, Balance Point, Weight, Max Tension, Level).
# Run: python3 scripts/fetch_click.py
import html, json, os, re, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FEED = 'https://badmintonclick.com.au/products.json?limit=250&page={}'  # the racket collection misses some models
KEYS = {'Shaft Flexibility': 'flex', 'Flex': 'flex', 'Balance Point': 'balance', 'Balance': 'balance', 'Weight': 'weight',
        'Max Tension': 'tension', 'Maximum Tension': 'tension', 'Max tension': 'tension', 'Maximum Stringing Tension': 'tension',
        'Frame Material': 'frame', 'Frame Composition': 'frame', 'Shaft Material': 'shaft', 'Length': 'length',
        'Shaft Stiffness': 'flex', 'Flexibility': 'flex', 'Grip Size': 'grips',
        # the "Recommended String" block lists one control and one power string
        'Control': 'strControl', 'Power': 'strPower'}

def get(url):
    time.sleep(3)
    return json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=40).read())

def lines(body):
    t = html.unescape(re.sub(r'<[^>]+>', '\n', body or '')).replace('\xa0', ' ')
    return [l.strip() for l in t.split('\n') if l.strip()]

out = []
for page in range(1, 20):
    ps = get(FEED.format(page))['products']
    if not ps: break
    for p in ps:
        if not re.search(r'racquet|racket', p['title'], re.I) or re.search(r'bag|string|grip|cover', p['title'], re.I): continue
        L = lines(p['body_html'])
        spec = {}
        for i, l in enumerate(L[:-1]):
            lab = l.rstrip(':').strip()
            if l.endswith(':') and lab in KEYS and KEYS[lab] not in spec: spec[KEYS[lab]] = L[i + 1]
        # "Recommended / Level / Beginners - Advanced": keep the text, the build decides whether it is one level
        lv = next((L[i + 1] for i, l in enumerate(L[:-1]) if l == 'Level'), '')
        price = min((float(v['price']) for v in p['variants'] if v.get('price')), default='')
        out.append({'name': p['title'], 'brand': {'Li Ning': 'Li-Ning'}.get(p.get('vendor', ''), p.get('vendor', '')), 'url': 'https://badmintonclick.com.au/products/' + p['handle'],
                    'price': price, 'currency': 'AUD', 'img': (p.get('images') or [{}])[0].get('src', ''), 'level': lv, **spec})
    print('page', page, len(ps), flush=True)
json.dump(out, open(os.path.join(ROOT, 'scripts', 'sources', 'click.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('products', len(out), 'with flex', sum(1 for p in out if p.get('flex')), 'with balance', sum(1 for p in out if p.get('balance')))

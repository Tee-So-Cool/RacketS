# Fetch the public WooCommerce Store API catalogue of Thai shops (THB) into scripts/sources/woo-<kind>.json,
# split by kind from the product name, for gear_shop.py. One page of 100 every 3 s.
# Run: python3 scripts/fetch_woo.py
import html, json, os, re, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOPS = ['luxebadminton.com']
KINDS = {
    'shuttles': r'ลูกแบด|ลูกขนไก่|shuttle',
    'strings': r'เอ็นแบด|เอ็นไม้|badminton string|\bstring\b',
    'shoes': r'รองเท้า|\bshoes?\b',
    'socks': r'ถุงเท้า|\bsocks?\b',
}

def get(url):
    time.sleep(3)
    return json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=40).read())

def lines_of(body):
    body = re.sub(r'<style.*?</style>|<script.*?</script>', '', body or '', flags=re.S)
    return [l.strip() for l in html.unescape(re.sub(r'<[^>]+>', '\n', body)).replace('\xa0', ' ').split('\n') if l.strip()]

out = {k: [] for k in KINDS}
for dom in SHOPS:
    for page in range(1, 30):
        ps = get(f'https://{dom}/wp-json/wc/store/v1/products?per_page=100&page={page}')
        if not ps: break
        for p in ps:
            name = html.unescape(p['name'])
            kind = next((k for k, rx in KINDS.items() if re.search(rx, name, re.I)), None)
            if not kind: continue
            pr = p.get('prices', {})
            price = int(pr.get('price') or 0) / 10 ** int(pr.get('currency_minor_unit') or 0)
            brands = [c['name'] for c in p.get('categories', []) if not re.search('[ก-๙]', c['name'])]
            out[kind].append({'shop': dom, 'brand': brands[0] if brands else '', 'name': name, 'url': p['permalink'],
                              'price': price or '', 'currency': 'THB', 'img': (p.get('images') or [{}])[0].get('src', ''),
                              'lines': lines_of(p.get('short_description')) + lines_of(p.get('description')), 'options': []})
        if len(ps) < 100: break
for k, v in out.items():
    json.dump(v, open(os.path.join(ROOT, 'scripts', 'sources', f'woo-{k}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(k, len(v))

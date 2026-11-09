# Fetch Felet's own racket list (name, RM price, picture) from feletsports.com into scripts/sources/felet-official.json.
# The maker's pages carry no spec text: each model's spec table is a picture in its description (texteditor image),
# read by eye into data/spec-overrides.json (src = that picture). This script gives the model list and price;
# shops (Badminton Bay: python3 scripts/fetch_bay.py Felet; honly: scripts/fetch_honly.py) fill the rest. Polite: one request every 2 s.
# Run: python3 scripts/fetch_felet.py
import html, json, os, re, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://feletsports.com'

def get(url):
    time.sleep(2)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh)'})
    return urllib.request.urlopen(req, timeout=40).read().decode('utf-8', 'ignore')

handles = []
for page in range(1, 20):
    t = get(f'{BASE}/collection/racquet' + (f'?page={page}' if page > 1 else ''))
    new = [h for h in dict.fromkeys(re.findall(r'href="/product/([^"]+)"', t)) if h not in handles]
    if not new: break
    handles += new

out = []
for h in handles:
    try:
        t = get(f'{BASE}/product/{h}')
    except Exception as e:
        print('  skip', h, e); continue
    title = html.unescape((re.findall(r'<title>(.*?)</title>', t, re.S) or [''])[0]).split('|')[0].strip()
    body = re.sub(r'<script.*?</script>|<style.*?</style>', '', t, flags=re.S)
    L = [l.strip() for l in html.unescape(re.sub(r'<[^>]+>', '\n', body)).split('\n') if l.strip()]
    k = next((i for i, l in enumerate(L) if l == 'RM'), None)
    price = float(L[k + 1].replace(',', '')) if k is not None and re.match(r'^[\d,]+\.\d\d$', L[k + 1]) else ''
    img = re.search(r'og:image" content="([^"]+)"', t)
    out.append({'shop': 'feletsports.com', 'brand': 'Felet', 'name': title, 'url': f'{BASE}/product/{h}',
                'price': price, 'currency': 'MYR', 'img': img.group(1) if img else '', 'lines': [], 'options': []})
    print(title, price, flush=True)
json.dump(out, open(os.path.join(ROOT, 'scripts', 'sources', 'felet-official.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('products', len(out), 'with price', sum(1 for p in out if p['price']))

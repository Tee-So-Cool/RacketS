# Fetch Apacs's own racket pages from apacs-badminton.co.uk (Apacs Sports UK, the brand's official UK store; the site has no
# robots.txt) into scripts/sources/apacs-official.json, in the shops.json shape so build_rackets.py reads them like a shop's page.
# Each page prints a clean spec block: frame and shaft material, frame type, grommet system (holes), shaft diameter, weight with
# its U class, BCP (balance point in mm and a word), Flex (a number and a word), grip, length and max tension. Weight, flex,
# balance point, tension and the hole count are kept. The price is left out: it is a UK price including VAT, not a Thai one.
# One request every 3 s; stops at the first 429 or 403. Run: python3 scripts/fetch_apacs.py
import html, json, os, re, sys, time, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://apacs-badminton.co.uk/index.php?route='
CATEGORY = 25   # BADMINTON RACKETS

def get(url):
    time.sleep(3)
    try:
        return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh)'}), timeout=40).read().decode('utf-8', 'ignore')
    except urllib.error.HTTPError as e:
        if e.code in (429, 403): print('stop', url, e.code, flush=True); sys.exit(1)
        raise

ids, page = [], 1
while True:
    t = get(f'{BASE}product/category&path={CATEGORY}&limit=100&page={page}')
    new = [i for i in dict.fromkeys(re.findall(r'route=product/product&(?:amp;)?(?:path=[0-9_]+&(?:amp;)?)?product_id=(\d+)', t)) if i not in ids]
    if not new: break
    ids += new
    if 'Showing' in t and re.search(r'Showing \d+ to (\d+) of (\d+)', t):
        a, b = re.search(r'Showing \d+ to (\d+) of (\d+)', t).groups()
        if int(a) >= int(b): break
    page += 1
print('products', len(ids), flush=True)

out = []
for i in ids:
    url = f'{BASE}product/product&product_id={i}'
    try:
        t = get(url)
    except Exception as e:
        print('  skip', i, e, flush=True); continue
    title = html.unescape((re.findall(r'<title>(.*?)</title>', t, re.S) or [''])[0]).strip()
    body = re.sub(r'<script.*?</script>|<style.*?</style>', '', t, flags=re.S)
    L = [l.strip() for l in html.unescape(re.sub(r'<[^>]+>', '\n', body)).replace('\xa0', ' ').split('\n') if l.strip()]
    # the block starts at the first spec label and runs until the first line that is not "Label: value"
    k = next((n for n, l in enumerate(L) if re.match(r'(Frame Material|Shaft Material|Frame Type|Weight|BCP|Flex|Max Tension)\s*:', l)), None)
    spec = []
    for l in (L[k:k + 40] if k is not None else []):
        m = re.match(r'^([A-Za-z][A-Za-z ./-]{1,30}):\s*(.+)$', l)
        if not m:
            if spec: break
            continue
        lab, val = m.group(1).strip(), m.group(2).strip()
        if lab.lower() == 'bcp': lab = 'Balance Point'
        elif lab.lower() == 'grommet system': lab = 'Grommet'
        spec.append(f'{lab}: {val}')
    if not any(s.startswith(('Weight', 'Flex', 'Max Tension')) for s in spec): print('  no spec', title, flush=True); continue
    img = re.search(r'og:image" content="([^"]+)"', t) or re.search(r'<img[^>]+id="image"[^>]+src="([^"]+)"', t)
    out.append({'shop': 'apacs-badminton.co.uk', 'brand': 'Apacs', 'name': title, 'url': url, 'price': '', 'currency': '',
                'img': html.unescape(img.group(1)) if img else '', 'lines': spec, 'options': []})
    print(title, '|', ' ; '.join(s for s in spec if s.startswith(('Weight', 'Balance', 'Flex', 'Max'))), flush=True)
json.dump(out, open(os.path.join(ROOT, 'scripts', 'sources', 'apacs-official.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('pages', len(out))

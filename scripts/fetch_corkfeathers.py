# Fetch Victor (and other) racket pages from corkandfeathers.com's public WooCommerce Store API into
# scripts/sources/corkandfeathers.json, in the shops.json shape so build_rackets.py reads them like a shop's page.
# Its descriptions copy Victor North America's spec block, which prints what Victor's Thai pages do not: balance point in mm
# ("BALANCE POINT (MM) 290mm"), player level, flex, head shape, overall length. Lines come as "LABEL value" and are rewritten
# to "Label: value". Weight is left out (it is the heaviest class, 87 g for a 4U/3U frame) and so is the price.
# robots.txt does not disallow /wp-json. One request every 3 s.
# Run: python3 scripts/fetch_corkfeathers.py
import html, json, os, re, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOM = 'corkandfeathers.com'
CATS = [26, 25]   # victor, rackets (junior rackets, bags and shuttles are not wanted)
LABELS = ['SHAFT CONSTRUCTION', 'FRAME CONSTRUCTION', 'ORIGINAL RACKET STRINGS & TENSION', 'STRING TENSION RANGE', 'PLAYER LEVEL', 'PLAYER STYLE',
          'RACKET BALANCE', 'BALANCE POINT (MM)', 'FLEX', 'WEIGHT', 'GRIP SIZE', 'HEAD SHAPE', 'OVERALL LENGTH']
SKIP = {'WEIGHT', 'ORIGINAL RACKET STRINGS & TENSION'}
NOT_RACKET = re.compile(r'bag|shuttle|string|grip|backpack|racket cover|towel|sock|shoe|pack\b|set\b', re.I)

def get(url):
    time.sleep(3)
    return json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=40).read())

def lines_of(body):
    body = re.sub(r'<style.*?</style>|<script.*?</script>', '', body or '', flags=re.S)
    L = [l.strip() for l in html.unescape(re.sub(r'<[^>]+>', '\n', body)).replace('\xa0', ' ').split('\n') if l.strip()]
    out = []
    for l in L:
        lab = next((x for x in sorted(LABELS, key=len, reverse=True) if l.upper().startswith(x)), None)
        if lab and lab not in SKIP and len(l) > len(lab): out.append(lab.title().replace('(Mm)', '(mm)') + ': ' + l[len(lab):].strip(' :'))
    return out

out, seen = [], set()
for cat in CATS:
    for page in range(1, 10):
        ps = get(f'https://{DOM}/wp-json/wc/store/v1/products?category={cat}&per_page=100&page={page}')
        if not ps: break
        for p in ps:
            name = html.unescape(p['name'])
            if p['id'] in seen or NOT_RACKET.search(name): continue
            seen.add(p['id'])
            L = lines_of((p.get('description') or '') + '\n' + (p.get('short_description') or ''))
            if not any(l.startswith(('Balance Point', 'Racket Balance', 'Flex')) for l in L): continue   # not a racket page
            img = (p.get('images') or [{}])[0].get('src', '')
            out.append({'shop': DOM, 'brand': name.split()[0], 'name': name, 'url': p['permalink'], 'price': '', 'currency': '',
                        'img': img, 'lines': L, 'options': []})
            print(name, '|', '; '.join(l for l in L if l.startswith(('Balance', 'Racket Balance', 'Player Level', 'Flex'))), flush=True)
        if len(ps) < 100: break
json.dump(out, open(os.path.join(ROOT, 'scripts', 'sources', 'corkandfeathers.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('products', len(out))

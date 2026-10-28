# Fetch Victor's official Thai product pages (th.victorsport.com, robots.txt allows /product/) for the
# Victor rackets in data/rackets.js, into scripts/sources/victor-official.json. The "SPEC & TECH" block
# gives weight/grip, frame and shaft material and max tension per weight class as text.
# Where the stiffness is drawn as a stiff-to-flexible slider ("Response Indicator"), the image name carries
# its level (response-speed1 = most flexible ... response-speed10 = stiffest); it is saved as "indicator".
# One page every 3 s. Run: python3 scripts/fetch_victor.py [--refetch]
import html, json, os, re, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'scripts', 'sources', 'victor-official.json')

def get(url):
    time.sleep(3)
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=40).read().decode('utf-8', 'ignore')

slug = lambda s: re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
txt = open(os.path.join(ROOT, 'data', 'rackets.js'), encoding='utf-8').read()
names = re.findall(r'"brand": "Victor",\s*"name": "([^"]+)"', txt)
urls = re.findall(r'<loc>([^<]+/product/[^<]+)</loc>', get('https://th.victorsport.com/sitemap_products.xml'))
# a page counts when its slug is a model slug, optionally followed by one colour or edition word ("-b", "-metallic")
want = []
for u in urls:
    s = u.rsplit('/', 1)[1]
    if any(s == slug(n) or re.fullmatch(re.escape(slug(n)) + r'-[a-z0-9]{1,10}', s) for n in names): want.append(u)
print('pages to fetch', len(want), flush=True)

import sys
out = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) and '--refetch' not in sys.argv else []
done = {o['url'] for o in out}
for u in want:
    if u in done: continue
    try:
        t = get(u)
    except Exception as e:
        print('skip', u, e, flush=True); continue
    title = html.unescape(re.sub(r'<[^>]+>', '', (re.findall(r'<h1[^>]*>(.*?)</h1>', t, re.S) or [''])[0])).strip()
    body = re.sub(r'<script.*?</script>|<style.*?</style>', '', t, flags=re.S)
    L = [l.strip() for l in html.unescape(re.sub(r'<[^>]+>', '\n', body)).replace('\xa0', ' ').split('\n') if l.strip()]
    i = next((k for k, l in enumerate(L) if l.upper() == 'SPEC & TECH'), None)
    j = next((k for k in range(i or 0, len(L)) if L[k].upper() == 'YOU MAY ALSO LIKE'), len(L))
    img = re.search(r'og:image" content="([^"]+)"', t)
    ind = re.search(r'Response Indicator.{0,4000}?response-([a-z]+)(\d+)\.(?:webp|png|jpg)', t, re.S)
    out.append({'shop': 'th.victorsport.com', 'brand': 'Victor', 'name': title or u.rsplit('/', 1)[1].replace('-', ' '), 'url': u,
                'price': '', 'currency': '', 'img': img.group(1) if img else '', 'lines': L[i:j] if i is not None else [], 'options': [],
                'indicator': {'kind': ind.group(1), 'level': int(ind.group(2))} if ind else None})
    if len(out) % 20 == 0: json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('saved', len(out), 'with specs', sum(1 for o in out if o['lines']))

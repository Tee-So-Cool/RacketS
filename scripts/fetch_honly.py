# Fetch Felet racket pages from honly.com.my (Malaysian shop, RM prices) into scripts/sources/honly.json, in the
# shops.json shape, so build_rackets.py reads their spec lines ("Balance Point : 4U 300-305mm", "Tension : 35 lbs")
# the same way. Only the description block is kept: the page's stringing options ("30 LBS") are not a spec.
# robots.txt allows these paths. Polite: one request every 2 s.
# Run: python3 scripts/fetch_honly.py
import html, json, os, re, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://honly.com.my'
CAT = '/all-products/badminton-racket/felet-racket'

def get(url):
    time.sleep(2)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh)'})
    return urllib.request.urlopen(req, timeout=40).read().decode('utf-8', 'ignore')

paths = []
for start in range(0, 400, 21):
    t = get(BASE + CAT + (f'?limitstart={start}' if start else ''))
    new = [p for p in dict.fromkeys(re.findall(r'href="(/all-products/badminton-racket/product/[^"]+)"', t)) if p not in paths]
    if not new: break
    paths += new

out = []
for p in paths:
    try:
        t = get(BASE + p)
    except Exception as e:
        print('  skip', p, e); continue
    name = html.unescape((re.findall(r'<title>(.*?)</title>', t, re.S) or [''])[0]).split(' - ')[0].split(' | ')[0].strip()
    if not name or name.startswith('Brand'):  # one page puts its spec in the title; the address names the racket
        name = re.sub(r'^\d+-', '', p.rsplit('/', 1)[1]).replace('-', ' ').upper()
    body = re.sub(r'<script.*?</script>|<style.*?</style>|<!--.*?-->', '', t, flags=re.S)
    L = [l.strip() for l in html.unescape(re.sub(r'<[^>]+>|<br\s*/?>', '\n', body)).replace('\xa0', ' ').split('\n') if l.strip()]
    # labels split from their values ("Balance Point" / ": 4U 300-305mm") join into one line
    J = []
    for l in L:
        if l.startswith(':') and J and len(J[-1]) <= 40 and ':' not in J[-1]: J[-1] = J[-1] + ' ' + l
        elif J and J[-1].endswith(':') and len(J[-1]) <= 40 and ':' not in J[-1][:-1]: J[-1] = J[-1] + ' ' + l
        else: J.append(l)
    L = J
    # the spec block runs from "Brand : Felet" to the first line of the order box (the title again, or "Read more");
    # the page prints a cut short copy first ("Sha ..."), so the last block is the whole one
    i = next((k for k in range(len(L) - 1, -1, -1) if re.match(r'^Brand\s*:', L[k])), None)
    lines = []
    if i is not None:
        for l in L[i:]:
            if l in ('Read more', '...') or l.endswith(' ...') or l.upper() == name.upper() or re.match(r'^RM\s*[\d,]', l) or len(lines) >= 30: break
            lines.append(l)
    # the shop's flex slider, "Stiff ○○●○○ Flexible": the filled dot's place names the flex
    def slider(l):
        m = re.search(r'([○●]{5})', l)
        if not m or '●' not in m.group(1): return l
        return l[:l.index(':') + 1] + ' ' + ['Stiff', 'Stiff', 'Medium', 'Flexible', 'Flexible'][m.group(1).index('●')]
    lines = [slider(l) if re.match(r'^flex', l, re.I) else l for l in lines]
    # a sale price is the shop's own; the common price is the one to compare
    rest = ' '.join(L[i:] if i is not None else L)
    price = re.search(r'Common price:\s*RM\s*([\d,]+\.\d\d)', rest) or re.search(r'RM\s*([\d,]+\.\d\d)', rest)
    img = re.search(r'og:image" content="([^"]+)"', t)
    out.append({'shop': 'honly.com.my', 'brand': 'Felet', 'name': name, 'url': BASE + p,
                'price': float(price.group(1).replace(',', '')) if price else '', 'currency': 'MYR',
                'img': img.group(1) if img else '', 'lines': lines, 'options': []})
    print(name, '|', len(lines), 'lines', flush=True)
json.dump(out, open(os.path.join(ROOT, 'scripts', 'sources', 'honly.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('products', len(out), 'with spec lines', sum(1 for p in out if len(p['lines']) > 4))

# Fetch Yonex official string specs into scripts/sources/yonex-strings.json
import re, html, json, os, time, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh)'}
get = lambda u: urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30).read().decode('utf-8', 'ignore')
lst = get('https://www.yonex.com/badminton/strings')
urls = sorted(set(re.findall(r'https://www\.yonex\.com/badminton/strings/[a-z0-9-]+', lst)) - {
    'https://www.yonex.com/badminton/strings/' + c for c in ('control', 'durability', 'quick-repulsion')})
KEYS = ['Color(s)', 'Gauge', 'Length', 'Core', 'Coating', 'Made In', 'Item Code']
out = []
for u in urls:
    t = re.sub(r'<script.*?</script>|<style.*?</style>', '', get(u), flags=re.S)
    L = [l.strip() for l in html.unescape(re.sub(r'<[^>]+>', '\n', t)).split('\n') if l.strip()]
    if 'Specs' not in L: continue
    i = L.index('Specs')
    spec, k = {}, None
    for l in L[i + 1:i + 40]:
        if l in KEYS: k = l; spec[k] = []; continue
        if l.startswith('Skip to') or l == 'Description': break
        if k: spec[k].append(l)
    spec = {k: ' '.join(v) for k, v in spec.items()}
    m = re.search(r'Skip to the beginning of the images gallery\s*\n?', '\n'.join(L))
    name = L[L.index('Skip to the beginning of the images gallery') + 1] if 'Skip to the beginning of the images gallery' in L else spec.get('Item Code', u)
    out.append({'url': u, 'name': name, **spec})
    print(name, '|', spec.get('Gauge'))
    time.sleep(0.4)
json.dump(out, open(os.path.join(ROOT, 'scripts', 'sources', 'yonex-strings.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

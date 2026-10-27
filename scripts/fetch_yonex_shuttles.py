# Fetch Yonex official shuttlecock pages (name, item code, quantity, image)
# into scripts/sources/yonex-shuttles.json. Run: python3 scripts/fetch_yonex_shuttles.py
import html, json, os, re, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh)'}
get = lambda u: urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30).read().decode('utf-8', 'ignore')
lst = get('https://www.yonex.com/badminton/shuttlecocks')
urls = sorted(set(re.findall(r'https://www\.yonex\.com/badminton/shuttlecocks/[a-z0-9-]+', lst)) - {
    'https://www.yonex.com/badminton/shuttlecocks/' + c for c in ('feather', 'nylon')})
# Yonex's own category pages say which shuttles are feather and which are nylon
cat = {}
for c in ('feather', 'nylon'):
    for u in set(re.findall(r'https://www\.yonex\.com/badminton/shuttlecocks/[a-z0-9-]+', get('https://www.yonex.com/badminton/shuttlecocks/' + c))):
        cat.setdefault(u, c)
out = []
for u in urls:
    time.sleep(0.5)
    raw = get(u)
    im = re.search(r'https://[^"\' ]*media/catalog/product[^"\' ]*\.(?:jpg|png|webp)', raw)
    t = re.sub(r'<script.*?</script>|<style.*?</style>', '', raw, flags=re.S)
    L = [l.strip() for l in html.unescape(re.sub(r'<[^>]+>', '\n', t)).split('\n') if l.strip()]
    if 'Specs' not in L: continue
    i = L.index('Specs')
    spec, k = {}, None
    for l in L[i + 1:i + 30]:
        if l.startswith('Skip to') or l == 'Description': break
        if l == 'More Information': continue
        if k is None: k = l
        else: spec[k] = l; k = None
    name = L[L.index('Skip to the beginning of the images gallery') + 1] if 'Skip to the beginning of the images gallery' in L else spec.get('Item Code', u)
    out.append({'url': u, 'name': name, 'img': im.group(0) if im else '', 'category': cat.get(u, ''), **spec})
    print(name, '|', spec.get('Item Code'), '|', spec.get('Quantity'))
json.dump(out, open(os.path.join(ROOT, 'scripts', 'sources', 'yonex-shuttles.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(out))

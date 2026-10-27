import re, html, json, sys, time, urllib.request
src = sys.argv[1]
urls = [u.strip() for u in open(f'{src}/yx_urls.txt') if u.strip()]
KEYS = ['Flex','Frame','Shaft','Joint','Length','Weight / Grip','Stringing Advice','Recommended String','Color(s)','Item Code','Made In','Balance']
out = []
for u in urls:
    try:
        req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0 (Macintosh)'})
        t = urllib.request.urlopen(req, timeout=30).read().decode('utf-8', 'ignore')
    except Exception as e:
        print('ERR', u, e); continue
    t = re.sub(r'<script.*?</script>|<style.*?</style>', '', t, flags=re.S)
    lines = [l.strip() for l in html.unescape(re.sub(r'<[^>]+>', '\n', t)).split('\n') if l.strip()]
    if 'Specs' not in lines: print('nospec', u); continue
    i = lines.index('Specs')
    name = lines[i-3] if lines[i-1].startswith('%1') else lines[i-1]
    m = re.search(r'<h1[^>]*>.*?<span[^>]*>(.*?)</span>', t, re.S)
    if m: name = html.unescape(m.group(1)).strip()
    spec, k = {}, None
    for l in lines[i+1:i+60]:
        if l in KEYS: k = l; spec[k] = []; continue
        if l.startswith('MAIN START') or l == 'Description': break
        if k: spec[k].append(l)
    spec = {k: ' '.join(v) for k, v in spec.items()}
    out.append({'url': u, 'name': name, **spec})
    print(name, '|', spec.get('Flex'), '|', spec.get('Stringing Advice'))
    time.sleep(0.4)
json.dump(out, open(f'{src}/yonex.json', 'w'), ensure_ascii=False, indent=1)
print(len(out))

# Fetch product pages whose spec table is in the page HTML but not in the shop's product feed
# (Li-Ning's own stores), into scripts/sources/pages.json as {url: [spec lines]}.
# Takes the URLs from scripts/sources/shops.json; one page every 3 s; pages already saved are skipped.
# Run: python3 scripts/fetch_pages.py sg.lining.studio [in.lining.studio ...]
# REFETCH_LT=1 python3 scripts/fetch_pages.py sg.lining.studio  re-reads the pages whose "<=" ceiling was lost before the fix
import html, json, os, re, sys, time, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
from spec_text import label_field

OUT = os.path.join(ROOT, 'scripts', 'sources', 'pages.json')
pages = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {}
shops = json.load(open(os.path.join(ROOT, 'scripts', 'sources', 'shops.json'), encoding='utf-8'))

def spec_lines(t):
    t = re.sub(r'<script.*?</script>|<style.*?</style>|<nav.*?</nav>|<header.*?</header>', '', t, flags=re.S)
    # Li-Ning SG prints a ceiling as "<=32 Pounds (Lbs)" with the "<" unescaped, which the tag strip below would eat up to the next ">"
    t = re.sub(r'<(?=[=\s\d])', '&lt;', t)
    L = [l.strip() for l in html.unescape(re.sub(r'<[^>]+>', '\n', t)).replace('\xa0', ' ').split('\n') if l.strip()]
    # the spec table is the run of short label lines; start a little before the first strong label
    i = next((k for k, l in enumerate(L) if re.fullmatch(r'(shaft flexibility|balance|player level|maximum racket tension|weight)', l, re.I)), None)
    if i is None: return []
    j = next((k for k in range(i, len(L)) if re.match(r'shipping|you may also|related', L[k], re.I)), min(len(L), i + 60))
    return L[max(0, i - 12):j]

n = 0
stop = False
for dom in sys.argv[1:]:
    if stop: break
    for p in [p for p in shops if p['shop'] == dom]:
        # REFETCH_LT=1: pages saved before the "<=" fix whose tension label has no value after it
        L0 = pages.get(p['url'])
        redo = os.environ.get('REFETCH_LT') and L0 and any(re.fullmatch('maximum racket tension', l, re.I) and (k + 1 >= len(L0) or re.fullmatch(r'player level|racket grip size|shaft flexibility|weight|balance|product range|player type', L0[k + 1], re.I)) for k, l in enumerate(L0))
        if p['url'] in pages and not redo: continue
        time.sleep(3)
        try:
            t = urllib.request.urlopen(urllib.request.Request(p['url'], headers={'User-Agent': 'Mozilla/5.0'}), timeout=40).read().decode('utf-8', 'ignore')
        except urllib.error.HTTPError as e:
            if e.code in (429, 403):   # a rate limit or a block: stop, keep what is saved, and try again another day
                print('stop', p['url'], e.code, flush=True); stop = True; break
            print('skip', p['url'], e, flush=True); continue
        except Exception as e:
            print('skip', p['url'], e, flush=True); continue
        pages[p['url']] = spec_lines(t)
        n += 1
        if n % 20 == 0:
            json.dump(pages, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=0); print(dom, n, flush=True)
json.dump(pages, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print('pages', len(pages), 'with specs', sum(1 for v in pages.values() if v))

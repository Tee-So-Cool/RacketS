# Fetch product pages whose spec table is in the page HTML but not in the shop's product feed
# (Li-Ning's own stores), into scripts/sources/pages.json as {url: [spec lines]}.
# Takes the URLs from scripts/sources/shops.json; one page every 3 s per shop, the shops side by side; a saved page is skipped
# unless its product changed on the shop since it was read.
# Run: python3 scripts/fetch_pages.py sg.lining.studio [in.lining.studio ...]
# REFETCH_LT=1 python3 scripts/fetch_pages.py sg.lining.studio  re-reads the pages whose "<=" ceiling was lost before the fix
import concurrent.futures, html, json, os, re, sys, threading, time, urllib.error, urllib.request

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

# when each saved page's product was last changed on the shop (shops.json "updated"): a page is read again only when that moved,
# so a second run costs the new and changed pages, not all of them. A page saved before this file existed is taken as current.
META = os.path.join(ROOT, 'scripts', 'sources', 'pages-meta.json')
meta = json.load(open(META, encoding='utf-8')) if os.path.exists(META) else {}
lock = threading.Lock()
n = 0

def save():
    with lock:
        json.dump(pages, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
        json.dump(meta, open(META, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)

def run(dom):
    """One shop's pages, one request every 3 s. Shops run side by side, each in its own worker."""
    global n
    for p in [p for p in shops if p['shop'] == dom]:
        # REFETCH_LT=1: pages saved before the "<=" fix whose tension label has no value after it
        L0 = pages.get(p['url'])
        redo = os.environ.get('REFETCH_LT') and L0 and any(re.fullmatch('maximum racket tension', l, re.I) and (k + 1 >= len(L0) or re.fullmatch(r'player level|racket grip size|shaft flexibility|weight|balance|product range|player type', L0[k + 1], re.I)) for k, l in enumerate(L0))
        upd = p.get('updated', '')
        changed = bool(upd) and p['url'] in meta and meta[p['url']] != upd
        if p['url'] in pages and not redo and not changed:
            if upd: meta.setdefault(p['url'], upd)
            continue
        time.sleep(3)
        try:
            t = urllib.request.urlopen(urllib.request.Request(p['url'], headers={'User-Agent': 'Mozilla/5.0'}), timeout=40).read().decode('utf-8', 'ignore')
        except urllib.error.HTTPError as e:
            if e.code in (429, 403):   # a rate limit or a block: stop this shop, keep what is saved, and try again another day
                print('stop', p['url'], e.code, flush=True); return
            print('skip', p['url'], e, flush=True); continue
        except Exception as e:
            print('skip', p['url'], e, flush=True); continue
        pages[p['url']] = spec_lines(t)
        if upd: meta[p['url']] = upd
        with lock: n += 1; k = n
        if k % 20 == 0: save(); print(dom, k, flush=True)

doms = sys.argv[1:]
with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, len(doms))) as ex:
    list(ex.map(run, doms))
save()
print('pages', len(pages), 'with specs', sum(1 for v in pages.values() if v), 'read this run', n)

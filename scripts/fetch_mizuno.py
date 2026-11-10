# Fetch Mizuno's own racket pages from mizunobadminton-asia.com (robots.txt: Allow /) into
# scripts/sources/mizuno-official.json, in the shops.json shape so build_rackets.py reads them like a shop's page.
# Each page has a "Racquet Information" block: WEIGHT (U class), FLEX (a word), BALANCE (a six-mark slider, "Head Heavy
# -[]-|-|-|-|- Head Light": the place of [] is the balance) and RECOMMENDED TENSION (a range). No player level and no price.
# One page every 3 s. Run: python3 scripts/fetch_mizuno.py
import html, json, os, re, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://www.mizunobadminton-asia.com'
# the two main lines; the site also has ~50 older or regional models (JPX, Prototype, Speedflex ...) that are left out
SERIES = ['altius-series', 'fortius-series']

def get(url):
    time.sleep(3)
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh)'}), timeout=40).read().decode('utf-8', 'ignore')

def balance_word(raw):
    # five slots between two labels: [] is the balance. Most pages print "Head Heavy -[]-|-|-|-|- Head Light" (slot 0 = head
    # heavy), a few print the labels the other way round, and a few print only marks (no way to tell the side: left empty).
    # A page may also print one word ("Even") or millimetres, which the shop parser reads.
    t = raw.strip()
    marks = re.findall(r'\[\]|[|Il]', re.sub(r'head\s*(?:heavy|light)', '', t, flags=re.I))
    if '[]' in marks:
        m = re.match(r'head\s*(heavy|light)', t, re.I)
        if not m: return ''
        i = marks.index('[]')
        if m.group(1).lower() == 'light': i = len(marks) - 1 - i
        return 'Head Heavy' if i <= 1 else 'Even Balance' if i == 2 else 'Head Light'
    if re.fullmatch(r'even(?: balance)?', t, re.I): return 'Even Balance'
    if re.fullmatch(r'head\s*(?:heavy|light)', t, re.I): return t.title()
    return ''

pages = []
for s in SERIES:
    t = get(f'{BASE}/{s}')
    for u in dict.fromkeys(re.findall(r'https://www\.mizunobadminton-asia\.com/product-page/[a-z0-9_-]+', t)):
        if u not in pages: pages.append(u)
print('pages', len(pages), flush=True)

out = []
for u in pages:
    try:
        t = get(u)
    except Exception as e:
        print('  skip', u, e); continue
    title = html.unescape((re.findall(r'<title>(.*?)</title>', t, re.S) or [''])[0]).split('|')[0].strip()
    body = re.sub(r'<script.*?</script>|<style.*?</style>', '', t, flags=re.S)
    L = [l.strip() for l in html.unescape(re.sub(r'<[^>]+>', '\n', body)).split('\n') if l.strip()]
    if 'Racquet Information' not in L: print('  no info block', title); continue
    i = L.index('Racquet Information')
    block = {}
    for k in range(i + 1, min(i + 20, len(L) - 1)):
        if L[k].endswith(':') and L[k + 1] and not L[k + 1].endswith(':'): block[L[k][:-1].strip().upper()] = L[k + 1]
    feats = ''
    m = re.search(r'FEATURES:(.*?)Racquet Information', ' '.join(L[:i + 1]), re.S)
    if m: feats = re.sub(r'\s*-\s*', ', ', m.group(1)).strip(', ')
    img = re.search(r'og:image" content="([^"]+)"', t)
    lines = []
    if 'WEIGHT' in block: lines.append('Weight: ' + block['WEIGHT'])
    if 'FLEX' in block: lines.append('Flex: ' + block['FLEX'])
    bw = balance_word(block.get('BALANCE', ''))
    if bw: lines.append('Balance: ' + bw)
    elif re.fullmatch(r'\d{3}\s*mm', block.get('BALANCE', '').strip(), re.I): lines.append('Balance Point: ' + block['BALANCE'].strip())
    if 'RECOMMENDED TENSION' in block: lines.append('String Tension: ' + block['RECOMMENDED TENSION'])
    if 'LENGTH' in block: lines.append('Length: ' + block['LENGTH'])
    # the site's technology text is a paragraph of marketing per feature ("aerodynamics" in the hot-melt one), which would
    # trip the match logic's technology tags on every racket, so it is not kept
    out.append({'shop': 'mizunobadminton-asia.com', 'brand': 'Mizuno', 'name': title, 'url': u, 'price': '', 'currency': '',
                'img': img.group(1) if img else '', 'lines': lines, 'options': [], 'rawBalance': block.get('BALANCE', '')})
    print(title, '|', ' ; '.join(lines[:4]), flush=True)
json.dump(out, open(os.path.join(ROOT, 'scripts', 'sources', 'mizuno-official.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('products', len(out))

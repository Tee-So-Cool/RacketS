# Merge a research table (docs/research/<brand>-specs.md) into data/spec-overrides.json.
# Usage: python3 scripts/merge_research.py <brand> <file.md>
# Skips CONFLICT cells, and whole rows whose notes say the data is from a sibling model; only fills what the row states.
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
brand, path = sys.argv[1], sys.argv[2]
lines = open(path, encoding='utf-8').read().splitlines()
hdr = next(i for i, l in enumerate(lines) if re.match(r'\|?\s*model\s*\|', l))
# optional legend "Slugs: V = https://... , M = https://..." turns short source codes into URLs
SLUG = dict(re.findall(r'\b([A-Z])\s*=\s*(https?://\S+?)\s*(?:,|$)', next((l for l in lines if l.strip().startswith('- Slugs:')), '')))
cols = [c.strip().lower() for c in lines[hdr].strip().strip('|').split('|')]
def col(cells, name):
    return cells[cols.index(name)].strip() if name in cols and cols.index(name) < len(cells) else ''
p = os.path.join(ROOT, 'data', 'spec-overrides.json'); d = json.load(open(p, encoding='utf-8'))
# names the site already has (built data plus the models the shop layer adds), so others are created as new
key = lambda s: re.sub(r'[^a-z0-9]', '', s.lower())
txt = open(os.path.join(ROOT, 'data', 'rackets.js'), encoding='utf-8').read()
known = {key(b + ' ' + n) for b, n in re.findall(r'"brand": "([^"]+)",\s*"name": "([^"]+)"', txt)}
sys.path.insert(0, os.path.join(ROOT, 'scripts'))
added, skipped = [], []
for l in lines[hdr + 2:]:
    if '|' not in l: 
        if l.strip(): break
        continue
    c = [x.strip() for x in l.strip().strip('|').split('|')]
    model = c[0]; notes = col(c, 'notes').lower()
    if 'sibling' in notes:
        skipped.append(model); continue
    # a conflicting cell is left out; the row's other cells still count
    c = [('' if 'conflict' in x.lower() else x) for x in c[:-1]] + [c[-1]]
    src = next((m.group(0) for x in c for m in [re.search(r'https?://[^\s)\]|]+', x)] if m), '')
    if not src and SLUG:
        m = re.search(r'\b([A-Z])\s+([\w.-]+)', col(c, 'source url'))
        if m and m.group(1) in SLUG: src = SLUG[m.group(1)] + m.group(2)
    if not src: continue
    name = re.sub(r'\s*\(\d{4}\)\s*$', '', model).strip()
    # tables covering several brands put the brand in the model cell: keep only this brand's rows
    if re.match(r'(kawasaki|protech|reach|victor|mizuno|apacs|li-ning|yonex|vs)\b', name, re.I):
        if not name.lower().startswith(brand.lower()): continue
        name = name[len(brand):].strip()
    e = {}
    b = col(c, 'balance').lower()
    if 'heavy' in b: e['balance'] = 'head-heavy'
    elif 'light' in b: e['balance'] = 'head-light'
    elif 'even' in b: e['balance'] = 'even'
    f = col(c, 'flex').lower()
    if 'extra' in f: e['flex'] = 'extra-stiff'
    elif 'stiff' in f: e['flex'] = 'stiff'
    elif 'medium' in f: e['flex'] = 'medium'
    elif 'flex' in f: e['flex'] = 'flexible'
    ws = re.findall(r'(?<![\d.])([2-9]|10)U(?=\d|\b)', col(c, 'weights'))
    if ws: e['weights'] = ', '.join(sorted({w + 'U' for w in ws}, key=lambda u: -int(u[:-1])))
    g = re.fullmatch(r'(\d{2})(?:\.\d)?(?:\s*\(4U\))?', col(c, 'avg g'))
    if g: e['weight'] = int(g.group(1))
    mx = col(c, 'max lbs')
    if 'n/s' in mx.lower(): mx = ''  # unit not stated: do not assume lbs
    m = re.search(r'(\d{2})\s*\(4U\)', mx) or re.match(r'(\d{2})\b', mx)
    if m: e['tmax'] = int(m.group(1))
    lv = col(c, 'level').lower()
    if ' to ' not in lv and 'partial' not in lv:
        for k in ('pro', 'advanced', 'intermediate', 'beginner'):
            if re.match(r'\s*' + k, lv): e['level'] = k; break
    # prices may list several currencies "a / b / c" against "VND / THB / MYR": prefer THB, then the others ECB covers
    prs = [x.strip() for x in col(c, 'price').split(' / ')]
    curs = [x.strip().upper() for x in col(c, 'currency').split('/')]
    opts = {}
    for pr, cur in zip(prs, curs):
        if not re.fullmatch(r'[A-Z]{3}', cur): continue
        pv = re.search(r'\d[\d,.]*', pr)
        if not pv: continue
        s = pv.group(0)
        # VND writes thousands with dots (2.750.000)
        s = s.replace('.', '') if cur == 'VND' or re.fullmatch(r'\d{1,3}(\.\d{3})+', s) else s.replace(',', '')
        opts[cur] = float(s)
    if 'THB' in opts: e['price'] = int(opts['THB'])
    else:
        for cur in ('MYR', 'USD', 'GBP', 'EUR', 'SGD', 'AUD', 'INR', 'JPY', 'VND'):
            if cur in opts: e['priceForeign'] = opts[cur]; e['currency'] = cur; break
    if not e: continue
    e['src'] = src
    k = f'{brand} {name}'
    if k not in d and key(k) not in known: e.update({'new': True, 'brand': brand})
    d[k] = {**d.get(k, {}), **e}
    added.append(name)
json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('merged', len(added), 'skipped', len(skipped)); print('skipped:', skipped)

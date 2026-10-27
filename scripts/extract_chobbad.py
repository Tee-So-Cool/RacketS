import sys, re, json, html
for name, idv in [('rk','cb-rk-cmp'),('st','cb-st-cmp')]:
    t = open(f'{sys.argv[1]}/{name}.html', encoding='utf-8').read()
    m = re.search(r'id="%s"[^>]*?data-items="([^"]*)"' % idv, t)
    items = json.loads(html.unescape(m.group(1)))
    json.dump(items, open(f'{sys.argv[1]}/{name}.json','w'), ensure_ascii=False, indent=1)
    print(name, len(items))
    from collections import Counter
    for k in (['balance','flex','d_style','d_level','d_balance','year'] if name=='rk' else list(items[0].keys())):
        if name=='rk': print(k, Counter(i.get(k,'') for i in items).most_common(25))
    if name=='st': print(json.dumps(items[:2], ensure_ascii=False, indent=1))

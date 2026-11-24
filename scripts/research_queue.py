"""List recent rackets with specs that still need research, using local snapshots."""
import argparse
import json
import re
from urllib.parse import urlsplit

if __package__:
    from .merge_research import LEDGER_PATH, ROOT, decode, load_catalog, project, resolve_observations
else:
    from merge_research import LEDGER_PATH, ROOT, decode, load_catalog, project, resolve_observations


BRANDS = ('Yonex', 'Victor', 'Li-Ning')
SINCE = 2025
STATED_WEIGHT = re.compile(r'\b(?:[2-8][UF]|F)\b')
THAI_SHOPS = {'badmintonplaza.com', 'shopee.co.th'}


def source_host(url):
    if not isinstance(url, str):
        return ''
    parsed = urlsplit(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or not parsed.path.strip('/'):
        return ''
    return parsed.hostname.removeprefix('www.')


def thai_product_url(url):
    host = source_host(url)
    return host in THAI_SHOPS or host.endswith('.co.th')


def thai_listings(racket, evidence):
    urls = [racket.get('shopUrl'), *(row['url'] for row in racket.get('shopLinks') or [])]
    listings = {url: None for url in urls if thai_product_url(url)}
    for row in evidence:
        url = row.get('source')
        host = source_host(url)
        if row['market'] != 'TH' or not host:
            continue
        if row['field'] == 'availableOn' and row['status'] == 'confirmed':
            date = row['value']
        elif host in THAI_SHOPS or (host.endswith('.co.th') and row.get('sourceType') in ('retailer', 'distributor')):
            date = row['checkedOn']
        else:
            continue
        listings[url] = max(listings.get(url) or '', date)
    return listings


def tension_gaps(racket, observations, weights, market):
    estimates = racket.get('est') or []
    rated = racket.get('tensionByWeight') or {}
    tension = racket.get('tension')
    source = racket.get('tensionSrc')
    scoped = [row for row in observations if row['market'] == market]
    published = [row for row in racket.get('researchEvidence', []) if row['field'] == 'tension']
    classes = sorted(weights | rated.keys() | {row['weight'] for row in scoped if row.get('weight')})
    for weight in classes or [None]:
        rows = [row for row in scoped if row.get('weight') == weight]
        status, confirmed = resolve_observations(rows)
        # The projected catalog may retain one verified weight as a model-wide range.
        if 'tension' not in estimates and any(row in published for row in confirmed):
            continue

        bounds = rated.get(weight) if rated else tension
        usable_in_match = bool(bounds and bounds[1] and 'tension' not in estimates)
        if not rows:
            if usable_in_match and not observations and source_host(source) and (rated or len(classes) <= 1):
                continue
            if usable_in_match:
                status = 'needs-source'
            elif bounds and bounds[1] and 'tension' in estimates:
                status = 'estimated'
        elif confirmed:
            status = 'held'
        yield {'field': 'tension', 'market': market, 'weight': weight,
               'status': status, 'blocksMatch': not usable_in_match}


def queue_item(racket, record, since):
    evidence = record['evidence'] if record else []
    if record:
        patch, _ = project(racket, record)
        racket = {**racket, **patch}
    estimates = racket.get('est') or []
    listings = thai_listings(racket, evidence)
    year = racket.get('year') or None
    global_year = [row for row in evidence if row['field'] == 'year' and row['market'] == 'GLOBAL']
    year_status, _ = resolve_observations(global_year)
    if year_status != 'conflicting':
        if year and 'year' not in estimates and source_host(racket.get('yearSrc')):
            year_status = 'confirmed'
        else:
            year_status = 'estimated' if year else 'missing'
    recent_thai = any(date and int(date[:4]) >= since for date in listings.values())
    if (year or 0) < since and (year_status == 'confirmed' or not recent_thai):
        return None

    market = record['market'] if record else None
    weights = set(STATED_WEIGHT.findall((racket.get('weights') or '').upper())) if 'weights' not in estimates else set()
    tension_rows = [row for row in evidence if row['field'] == 'tension']
    gaps = list(tension_gaps(racket, tension_rows, weights, market))
    weight_status, _ = resolve_observations([row for row in evidence
                                             if row['field'] == 'weights' and row['market'] == market])
    if not weights or weight_status == 'conflicting':
        if weight_status == 'missing' and racket.get('weights') and 'weights' in estimates:
            weight_status = 'estimated'
        gaps.append({'field': 'weights', 'market': market,
                     'status': 'held' if weight_status == 'confirmed' else weight_status})
    code = racket.get('modelCode') or None
    code_disputed = any(row['field'] == 'modelCode' and row['status'] == 'conflicting' for row in evidence)
    if not code or code_disputed:
        gaps.append({'field': 'modelCode', 'status': 'conflicting' if code_disputed else 'missing'})
    if year_status != 'confirmed':
        gaps.append({'field': 'year', 'market': 'GLOBAL', 'status': year_status})
    if not gaps:
        return None

    urls = [racket.get(key) for key in ('officialUrl', 'specSrc', 'tensionSrc', 'yearSrc')]
    urls.extend(row.get('source') for row in evidence if row['market'] == market)
    sources = list(dict.fromkeys(url for url in urls if source_host(url) not in ('', 'google.com') and url not in listings))
    return {'id': racket['id'], 'brand': racket['brand'], 'name': racket['name'], 'modelCode': code,
            'year': year, 'yearStatus': year_status, 'market': market, 'thaiListings': list(listings),
            'blocksMatch': any(gap.get('blocksMatch') for gap in gaps), 'gaps': gaps, 'sources': sources}


def build_queue(catalog, ledger, since=SINCE, brands=BRANDS):
    items = []
    for model_id, racket in catalog.items():
        if racket['brand'] in brands:
            item = queue_item(racket, ledger.get(model_id), since)
            if item:
                items.append(item)
    return sorted(items, key=lambda row: (
        not row['blocksMatch'], not row['thaiListings'], row['yearStatus'] != 'confirmed', -(row['year'] or 0),
        row['brand'], row['name'], row['id'],
    ))


def print_queue(items, total):
    print(f'คิวตรวจสเปก {len(items)}/{total} รุ่น')
    for item in items:
        code = f' [{item["modelCode"]}]' if item['modelCode'] else ''
        labels = (['Match ยังแนะนำปอนด์ไม่ได้บางเวตหรือทั้งรุ่น'] if item['blocksMatch'] else [])
        if item['thaiListings']:
            labels.append('พบรายการสินค้าในไทย')
        detail = f' · {" · ".join(labels)}' if labels else ''
        print(f'\n{item["brand"]} {item["name"]}{code}{detail}')
        if item['year']:
            suffix = '' if item['yearStatus'] == 'confirmed' else f' ({item["yearStatus"]})'
            print(f'  ปีในแคตตาล็อก {item["year"]}{suffix}')
        for gap in item['gaps']:
            scope = ' '.join(filter(None, (gap.get('market'), gap.get('weight'))))
            print(f'  {gap["field"]}{" " + scope if scope else ""} · {gap["status"]}')
        for url in item['thaiListings']:
            print(f'  ร้านไทย · {url}')
        for url in item['sources']:
            print(f'  แหล่งสำหรับตรวจต่อ · {url}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--since', type=int, default=SINCE, help=f'first launch year to include (default {SINCE})')
    parser.add_argument('--brand', choices=BRANDS, action='append', help='brand to include (repeatable)')
    parser.add_argument('--limit', type=int, help='maximum number of models to display')
    parser.add_argument('--json', action='store_true', help='emit a JSON report')
    args = parser.parse_args()
    if not 1900 <= args.since <= 2100 or args.limit is not None and args.limit < 1:
        parser.error('--since must be 1900–2100 and --limit must be positive')
    try:
        catalog = load_catalog(ROOT / 'data/rackets.js')
        path = ROOT / LEDGER_PATH
        ledger = decode(path.read_text(encoding='utf-8')) if path.exists() else {}
        if ledger.keys() - catalog.keys():
            raise ValueError('Unknown racket IDs in research evidence: ' + ', '.join(sorted(ledger.keys() - catalog.keys())))
        brands = args.brand or BRANDS
        queue = build_queue(catalog, ledger, args.since, brands)
    except (OSError, ValueError) as error:
        parser.exit(2, f'{error}\n')
    items = queue[:args.limit]
    if args.json:
        print(json.dumps({'since': args.since, 'brands': brands, 'total': len(queue), 'items': items},
                         ensure_ascii=False, indent=2))
    else:
        print_queue(items, len(queue))


if __name__ == '__main__':
    main()

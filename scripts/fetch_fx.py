# Fetch ECB reference exchange rates to THB (via frankfurter.app) into scripts/sources/fx.json.
# Used only to convert a foreign retail price when no Thai price exists; every converted price
# keeps the original amount, currency, rate and date. Run: python3 scripts/fetch_fx.py
import json, os, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CUR = ['USD', 'GBP', 'EUR', 'MYR', 'SGD', 'AUD', 'INR', 'JPY', 'CNY', 'CAD', 'HKD', 'IDR', 'PHP']
rates, date = {}, ''
for c in CUR:
    req = urllib.request.Request(f'https://api.frankfurter.app/latest?from={c}&to=THB', headers={'User-Agent': 'Mozilla/5.0'})
    try:
        d = json.loads(urllib.request.urlopen(req, timeout=30).read())
    except Exception as e:
        print('skip', c, e); continue
    rates[c] = d['rates']['THB']; date = d['date']
# currencies ECB does not publish (e.g. VND) come from open.er-api.com, recorded separately
extra, extra_date = {}, ''
try:
    d = json.loads(urllib.request.urlopen(urllib.request.Request('https://open.er-api.com/v6/latest/THB', headers={'User-Agent': 'Mozilla/5.0'}), timeout=30).read())
    for c in ('VND', 'TWD', 'KRW', 'BDT'):
        if c in d.get('rates', {}) and c not in rates: extra[c] = round(1 / d['rates'][c], 6)
    extra_date = d.get('time_last_update_utc', '')[:16]
except Exception as e:
    print('skip extra', e)
json.dump({'source': 'European Central Bank reference rates via frankfurter.app', 'date': date, 'toTHB': rates,
           'extraSource': 'open.er-api.com (currencies ECB does not publish)', 'extraDate': extra_date, 'extraToTHB': extra},
          open(os.path.join(ROOT, 'scripts', 'sources', 'fx.json'), 'w'), indent=1)
print(date, rates)

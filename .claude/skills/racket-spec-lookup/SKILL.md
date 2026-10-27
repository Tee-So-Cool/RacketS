---
name: racket-spec-lookup
description: Fill missing badminton racket specs (balance, flex, weight, max tension, level) or add new models for this project, one model at a time from product pages, then rebuild data/rackets.js. Use when the user asks to complete racket data, add new rackets, or update specs for a brand.
---

# Racket spec lookup

Data flow:
- `scripts/sources/chobbad-rackets.json`: raw chobbad.com compare data (refresh: download https://chobbad.com/compare-rackets/ and run `scripts/extract_chobbad.py`).
- `scripts/sources/yonex-official.json`: yonex.com specs (refresh: `scripts/fetch_yonex.py`).
- `data/spec-overrides.json`: specs found by hand, one entry per model, always with `src`.
- `python3 scripts/build_rackets.py` merges all three into `data/rackets.js`.
  Order: chobbad, then Yonex official, then overrides, then series estimates for anything still empty (flagged in `est`, shown as "(ประเมิน)").

## 1. Pick targets

List models with gaps, newest first:

```bash
node -e 'global.window={};require("./data/rackets.js");for(const r of window.RACKETS.filter(r=>r.brand==="Victor").sort((a,b)=>(b.year||0)-(a.year||0))){const m=["balance","flex","level","weight","tension"].filter(f=>r[f]===""||r[f]==null||(r.est||[]).includes(f));if(m.length)console.log(r.year,r.name,"|",m.join(","))}'
```

Change the brand as needed. Skip entries already in `data/spec-overrides.json`.

## 2. Look up each model

- Use `WebSearch` (standard mode), one query per model: `"<Brand> <Model> badminton racket specifications balance flex weight max tension"`.
  Send several searches in parallel per message.
- Good sources: centralsports.co.uk, badmintonbay.com (Apacs), badmintonwarehouse.com, nydhi.com, joybadminton.com, khelmart.com, official brand pages.
- Do not script bulk downloads from retailers. They rate-limit (HTTP 429) or show Cloudflare challenges. Never try to bypass those.

## 3. Record only what the source states

- Use the exact model, not a sibling. "100X" is not "100X TD"; a colour or collab variant is fine.
- When sources conflict on a field, leave that field out.
- Balance: use the source's label. If only mm: ≥300 head-heavy, ≤290 head-light, else even.
- Flex: extra-stiff | stiff | medium | flexible. "Medium stiff" maps to stiff.
- `tmax` = maximum tension in lbs. Prefer the 4U figure.
- `level` only when the source states a grade (beginner | intermediate | advanced | pro).

Entry format, keyed by "Brand Model" exactly as shown on the site:

```json
"Victor Auraspeed LYC": { "balance": "head-heavy", "flex": "stiff", "weights": "4U", "weight": 83, "tmax": 28, "src": "https://..." }
```

For a model that is not on the site yet, add `"new": true`, plus `year` and `style` when known.

## Finding models the site lacks

- `python3 scripts/fetch_plaza.py` crawls every Badminton Plaza racket (6 brands, one request per second) into `scripts/sources/plaza.json`.
  The build matches each listing to our models by name tokens (`scripts/plaza_match.py`) and fills only empty image, THB price and specs.
- Listings that match nothing print as unmatched. Add a real model to `NEW_NAMES` in `plaza_match.py`; collabs, gift sets and other brands go in `SKIP`.

- badmintonplaza.com (Thai shop, THB prices) lists rackets per brand, newest first: `index.php?cPath=53_<brand>&sort=4d`.
  Brand ids: Li-Ning 54, Victor 168, Yonex 192, Mizuno 238, Apacs 266, VS 296.
- Each product page (`product_info.php?products_id=<id>`) shows weight, balance (mm), flex, tension and price in THB.
- Fetch pages one by one with `WebFetch`, asking for one line of JSON. Skip anime/collab editions of a model we already have.

## Strings

Same flow with `data/string-overrides.json` and `python3 scripts/build_strings.py`.
Sources: `scripts/sources/chobbad-strings.json`, `yonex-strings.json` (refresh: `scripts/fetch_yonex_strings.py`), and `manual-strings.json` (old hand estimates, used only to fill gaps and flagged in `est`).
Rating fields (repulsion, control, durability, sound, shock) go in only when the source gives a score.

## 4. Rebuild and check

```bash
python3 scripts/build_rackets.py
```

- The script prints `override names not found` for keys that match no model. Fix the key spelling.
- Tell the user which models were filled, which were skipped (and why), and list the source links.

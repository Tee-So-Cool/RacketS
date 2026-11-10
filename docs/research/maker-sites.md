# What each maker's own site publishes (checked 2026-11-10)

Looked for spec tables, in text or in pictures, on the makers' own pages, after Felet turned out to keep its tables in
pictures (see below). Result: Felet is the only maker of the six that hides specs in images.

| Maker | Where | What the page gives | Used |
|---|---|---|---|
| Felet | feletsports.com | no spec text; each model has a spec-table picture in its description (`texteditor` image on cdn1.sgliteasset.com): frame type, shaft, material, weight, balance point, grommets, max tension, stiffness slider | yes, read by eye into `data/spec-overrides.json` |
| Victor | th.victorsport.com | text block "SPEC & TECH" (weight/grip, materials, max tension per class) and a flex slider image; the long marketing pictures repeat the same block; no balance point anywhere | yes (`scripts/fetch_victor.py`); balance for 63 models stays an estimate |
| VS | vssportsthailand.com | text: balance in mm, length, tension range, weight, shaft flex, style; gallery pictures are product photos; no player level. Individual `/products/<handle>.json` answers 403 | yes (shop feed) |
| Mizuno | mizunobadminton-asia.com (robots: Allow /) | text block "Racquet Information": weight class, flex word, balance as a five-slot slider (`Head Heavy -[]-\|-\|-\|-\|- Head Light`, a few pages with the labels reversed or none), recommended tension range, length; no level, no price | checked, not merged: for the 17 models that match, balance and flex agree with ours. Its long technology paragraphs would trip the "aero" tag (the word "aerodynamics" appears in the hot-melt text), so they are not used. 48 Mizuno models on the site are not in our data (JPX 8.x, Fortius 11 Power/Quick, Altius 01 Feel/Speed, ...) |
| Kawasaki | no own site; Facebook and a Shopee store | nothing scrapeable | no |
| Li-Ning | sg/in.lining.studio | text (see `matching-logic.md`) | yes |

Felet sheets also print the maker's series on each model (Novice, Moderate, Advance, Master, Pro, Professional); the data
reads them in that order as beginner, beginner, intermediate, intermediate, advanced, advanced, as estimates.

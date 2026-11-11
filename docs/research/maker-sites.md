# What each maker's own site publishes (checked 2026-11-10)

Looked for spec tables, in text or in pictures, on the makers' own pages, after Felet turned out to keep its tables in
pictures (see below). Result: Felet is the only maker of the six that hides specs in images.

| Maker | Where | What the page gives | Used |
|---|---|---|---|
| Felet | feletsports.com | no spec text; each model has a spec-table picture in its description (`texteditor` image on cdn1.sgliteasset.com): frame type, shaft, material, weight, balance point, grommets, max tension, stiffness slider | yes, read by eye into `data/spec-overrides.json` |
| Victor | th.victorsport.com | text block "SPEC & TECH" (weight/grip, materials, max tension per class) and a flex slider image; the long marketing pictures repeat the same block; no balance point anywhere | yes (`scripts/fetch_victor.py`); balance for 63 models stays an estimate |
| VS | vssportsthailand.com | text: balance in mm, length, tension range, weight, shaft flex, style; gallery pictures are product photos; no player level. Individual `/products/<handle>.json` answers 403 | yes (shop feed) |
| Mizuno | mizunobadminton-asia.com (robots: Allow /) | text block "Racquet Information": weight class, flex word, balance as a five-slot slider (`Head Heavy -[]-\|-\|-\|-\|- Head Light`, a few pages with the labels reversed or none), recommended tension range (a few pages print "WEIGHT/SIZE" and "MAX TENSION" instead of "WEIGHT" and "RECOMMENDED TENSION"; Fortius 73 VT has no flex row), length; no level, no price | yes, Altius and Fortius only (`scripts/fetch_mizuno.py`): the maker's weight class, flex, balance and tension range join the shop vote, and the nine models of those lines that our data lacked were added (Altius 01 Feel, 01 Speed, VX7; Fortius 11 Power, 11 Quick, 70, 73 VT, 77, 90). In a full check of all lines, balance and flex agreed with ours for the 17 models that match. The long technology paragraphs are not kept (the word "aerodynamics" in the hot-melt text would trip the "aero" tag), and the site's ~40 older models (JPX, Prototype, Speedflex ...) are left out |
| Kawasaki | no own site; Facebook and a Shopee store | nothing scrapeable | no |
| Li-Ning | sg/in.lining.studio | text (see `matching-logic.md`) | yes |

Felet sheets also print the maker's series on each model (Novice, Moderate, Advance, Master, Pro, Professional); the data
reads them in that order as beginner, beginner, intermediate, intermediate, advanced, advanced, as estimates.

## Victor balance point in mm (searched 2026-11-10)

Victor's own pages print no balance point, so the 154 Victor models without one were searched on Google, starting with the
most listed (DriveX 12, Ryuga II Pro, Auraspeed 99, Jetspeed S12 II, Thruster F Ultra, Brave Sword 12, Auraspeed 90K II,
Thruster K R, Ryuga). What turned up is not a spec: reviewers' measured figures (strung, gripped) that disagree widely
(Thruster F Ultra: 292, 300, 303, 320 mm; Auraspeed 90K II: 290, 295, 300, 301) and a Facebook spec post (DriveX 12, 297-299).
Retailer copies of Victor North America's block ("BALANCE POINT (MM) 290mm") exist but are sporadic: corkandfeathers.com
(WooCommerce Store API, `scripts/fetch_corkfeathers.py`) has nine Victor pages and one with mm (Auraspeed 90K II, 290).
None of this was written into the data except that one figure and a flex and length from the same page. The retailer's
"Player Level" is not used (all nine read Advanced or Professional, which looks like a price tier), as with Li-Ning's.
btracketsports.com answered 429 (rate limited) and was left alone.
| Apacs | apacs-badminton.co.uk (Apacs Sports UK, the brand's own UK store; no robots.txt) | a clean list per page: frame and shaft material, frame type, grommet system (holes), shaft diameter, weight with its U class, BCP in mm with a word, flex as a number with a word, grip, length, max tension | yes, 43 racket pages (`scripts/fetch_apacs.py`), one page per 3 s; it joins the vote as an official layer; no price (a UK price with VAT). Only 43 of our 106 Apacs models are sold there, and most of those already had data, so 5 gaps closed |

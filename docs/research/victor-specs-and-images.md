# Victor specs and missing images: research results (partial)

Date: 2026-10-27

## Summary

- Part A (53 Victor models): **1 found** (retailer source only), **0 CONFLICT**, **52 NOT FOUND**.
- Part B (10 images): **0 found**, **10 NOT FOUND**.
- I couldn't reach Victor's official site. www.victorsport.com redirects to th.victorsport.com, and its `/products/racket/` path returns 404. The RACKETS menu item on that site isn't a link. Searches limited to victorsport.com returned no product spec pages. That's why the one row below comes from a retailer.
- This pass was short and covers only a few models. The remaining models still need research.

## Part A: Victor specs

| model | balance | flex | weights | avg g | max lbs | level | source URL | official? | notes |
|---|---|---|---|---|---|---|---|---|---|
| Auraspeed 100X (fills weight, tension) | not stated | not stated | 4U (G5) | ~82 (page states 80–84 g) | 28 (4U) | not stated | https://www.badmintonwarehouse.com/products/victor-auraspeed-100x-b-badminton-racket-deep-sea-blue | N (retailer) | Colour variant 100X B (Deep Sea Blue). The avg g is the midpoint of the stated range. |

All other models listed in victor-targets.txt are NOT FOUND (see below).

## Part B: Images

| model | image URL | source page | HTTP check |
|---|---|---|---|
| Kawasaki Passion P29 | NOT FOUND | - | - |
| Li-Ning Axforce Warrior | NOT FOUND | https://www.eliteshuttler.com/products/li-ning-axforce-warrior (only lazy-load placeholders in HTML) | - |
| Reach Attack Speed 100 | NOT FOUND | https://chobbad.com/racket/reach-attack-speed-100/ returned 403 | - |
| Reach Attack Speed 88 | NOT FOUND | - | - |
| Reach Attack Speed 99 | NOT FOUND | - | - |
| Reach K-Force | NOT FOUND | - | - |
| Reach Kim Duo 55 2 Tone | NOT FOUND | - | - |
| Reach Kim Duo 55 Pro (Two Tone) | NOT FOUND | - | - |
| Reach New T-Rex Pro 3939 | NOT FOUND | - | - |
| Reach T-REX Pro 4949 | NOT FOUND | - | - |

## Not found / what was tried

- **Official Victor site**: I tried www.victorsport.com (redirects to th.victorsport.com, where `/products/racket/` returns 404) and site:victorsport.com searches for Auraspeed and TK-Ryuga. Neither turned up a product spec page.
- **Thruster Ryuga II**: Badminton Warehouse only lists the *TK-Ryuga II Pro* (head-heavy, stiff, 3U ≤32 / 4U ≤31 lbs, advanced). That's a sibling model, so I didn't record it for "Thruster Ryuga II". Source: https://www.badmintonwarehouse.com/products/thruster-tk-ryuga-ii-pro-g-badminton-racket
- **Auraspeed 100X Ultra**: Retail figures exist (Decathlon UK 4U 86 g / 30 lbs; Badminton Warehouse 3U 31 / 4U 30 lbs). It's a sibling model, so I didn't use them.
- **All other Victor models**: not attempted in this pass.
- **Li-Ning Axforce Warrior**: Eliteshuttler's page has no image src that can be extracted, and its JSON endpoint didn't return JSON. Shopnings (https://www.shopnings.com/li-ning-axforce-warrior-badminton-racket/) wasn't checked.
- **Reach models**: chobbad.com returned 403, so I moved on. A web search for "Reach Attack Speed 100" returned only Hundred-brand results. I haven't found the Reach brand site.
- **Kawasaki Passion P29**: not attempted.

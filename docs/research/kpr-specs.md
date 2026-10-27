# Kawasaki / ProTech / Reach spec research

Researched 2026-10-27. Targets: 40 models in kpr-targets.txt (Kawasaki 23, ProTech 9, Reach 8).
Search coverage was poor for these brands: WebSearch returned almost nothing for most exact model names. chrissports.com returned HTTP 429 (Retry-After 60) on two fetches and I stopped using it (no retry loop). decathlon.pl and kaina24.lt returned 403 and were not worked around. No Reach pages or images were found, so no image URLs were verified.

## Found

| model | balance | balance mm | flex | weights | avg g | max lbs | level | style | price | currency | image | source URL | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Kawasaki Dream Galaxy |  | 305 |  | 5U | 78 | 30 | beginner | allround | 1,799.00 | PHP |  | https://chrissports.com/products/kawasaki-dream-galaxy-badminton-racket |  Weight 78 +/-2 g; balance 305 +/-2 mm; tension range 18-30 lbs; flex not listed; page stated "All-around" and "Beginner". Price in PHP (Philippine shop; a search snippet also showed 1,619.10 PHP sale). Eliteshuttler lists the same model at Rs 10,550.00 (https://www.eliteshuttler.com/products/kawasaki-dream-galaxy), not fetched. |
| Kawasaki High Tension G30 | head heavy | 297 | CONFLICT-unclear: "Hi-Flex" (eliteshuttler); kibisports says only "moderate racket hardness" | 4U | 84 | 35 | CONFLICT: "professional, intermediate, and senior players" (kibisports) vs "Club" suitable type (eliteshuttler) | attack | 3,699 | INR |  | https://shop.kibisports.com/collections/brand-kawasaki/products/high-tension-g30-unstrung-badminton-racketgreen-4ug1 | Kibisports: head heavy, dynamic weight 83 g, 67.5 cm, tension 18-35 lbs, "Offensive Type", regular price INR 5,999, backordered/orders paused. Eliteshuttler (https://www.eliteshuttler.com/products/high-tension-g30): 297 +/-3 mm, 84 +/-1 g 4UG1, flex "Hi-Flex", 18-35 lbs, Attack, price Rs 13,000.00 (out of stock). 83 g vs 84 g is dynamic vs listed weight, not necessarily a conflict. |
| Kawasaki High Tension G7 |  | 303 | medium | 5U | 78 | 32 | beginner | attack | 12,000.00 | Rs (rupee, as shown) |  | https://www.eliteshuttler.com/products/kawasaki-high-tension-g7 | 78 +/-2 g (5UG6), 303 +/-3 mm, 18-32 lbs stringing advice, "Suitable Type: Beginner", length 675 mm, 24T graphite. Page had no usable product image. |
| Kawasaki King K9 |  | 295 | medium | 4U | 84 | 32 | professional | allround | 39,350.00 | Rs (rupee, as shown) |  | https://www.eliteshuttler.com/products/kawasaki-king-k9 | 84 +/-1 g 4UG1, 295 +/-1 mm, "Medium Flex", 18-32 lbs, out of stock. A search snippet quoted Rs 39,100.00 for another retailer listing; same model name, price differs. |
| Kawasaki Porcelain Q5 |  |  |  |  |  | 28 |  |  | 2,032 | THB |  | https://www.thairath.co.th/shopping/sport/1000440 | Thairath shopping list (price per Shopee) states 2,032 baht and max 28 lbs, "designed for women". Search snippet from chrissports (page returned 429, not fetched) said 79 +/-2 g, balance 302 +/-3 mm, 24T+30T graphite, price 2899.0 PHP in oEmbed; unverified. |
| Kawasaki NEZHA 35 |  |  |  | lightweight (no grams stated) |  | 35 | beginner | allround | 2,567 | THB |  | https://www.thairath.co.th/shopping/sport/1000440 | Thairath: "suitable for beginners", suited to both attack and defense, 35 lbs, price 2,567 baht. A search-result summary of Shopee data said 2,400 baht; page fetched says 2,567 (CONFLICT, 2,567 vs 2,400). No weight in grams stated, so the missing weight remains missing. |
| Kawasaki Passion P25 |  |  |  |  |  |  |  |  | 48.00 | EUR |  | https://www.kaina24.lt/s/kawasaki-rakete/ | Price from a WebSearch result for Bigbox.lt via kaina24.lt (violet/blue/green variants). The page itself returned 403 so the value is search-snippet only, not verified on the page. |
| Kawasaki Passion P38 |  |  |  |  |  |  |  |  | 63.00 | EUR |  | https://www.kaina24.lt/s/kawasaki-rakete/ | Search-snippet only (Bigbox.lt, black). Page 403. A Qatar Living classified quoted QAR 260 in a bundle (not a retail price, ignored). Decathlon FR lists a "Passion P39" at EUR 63.00, possibly a different model. |
| ProTech Aston Pro Ver 2 | 4U 295 mm / 3U 305 mm (+/-5) | 295 | stiff | 4U (3U also) | 83 | 38 | not stated | attack | 210.00 | USD | https://www.badmintonavenue.com/cdn/shop/files/protech-aston-pro-v2-badminton-racket-dark-blue-teal-frame.jpg?v=1791192674&width=1200 | https://www.badmintonavenue.com/products/protech-aston-pro-v2-badminton-racket-max-38lbs | Page: "attacking and controlling", recommended tension 26-30 lbs, max 38 lbs, 6.7 mm shaft, sold out. Image not curl-checked (ProTech image not required). |

## Not found (no page for the exact model)

Kawasaki: Aurora 7, Honor Galaxy, Honor Speed Ultra 7, Ice Cream, King K8 II, Master Cross Space, Master Mao 19, Passion P26, Passion P29, Porcelain QingGuo, Spider, Super Light Alpha, Super Light K5, Traverse Galaxy, Yujian Galaxy.
- Spider: kibisports sells "Spider 9900 II" (INR 8,080, https://shop.kibisports.com/collections/brand-kawasaki/products/spider-9900-ii-unstrung-badminton-racket) which is not the exact model "Spider", so not used.
- Master Mao 19: a search result mentioned a Decathlon Poland price but the snippets disagreed (929 zl vs 29 zl) and the page returned 403; not used.
- Traverse Galaxy: only an AliExpress wiki page marked as AI/third-party generated; not used.

ProTech: Aston Tour, MAGIC TOUR, MAGIC XP BLACK, MAGIC XP MINT, MAGIC XP WHITE, Maxilite Champ, Maxilite Pro, PREDATOR XP (badmintonavenue sells "Predator White 8", a different model).

Reach: Attack Speed 100, Attack Speed 88, Attack Speed 99, K-Force, Kim Duo 55 2 Tone, Kim Duo 55 Pro (Two Tone), New T-Rex Pro 3939, T-REX Pro 4949. Searches returned no Reach listings at all (only Hundred, Yonex, Victor). No image URLs.

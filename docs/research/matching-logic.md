# Racket / string / tension matching: research notes

Purpose: check the logic in `app.js` (`score()`, `LVL_TENSION`, `STYLE_W`) against how experts pair strings, tensions and rackets. Researched 2026-10-27.

## Source quality: read this first

- No manufacturer publishes a level-by-level tension chart that I could reach. Yonex.com has a string list page with no tension guidance (https://www.yonex.com/badminton/strings) and a racket-selector PDF whose text could not be extracted (https://www.yonex.com/media/wysiwyg/download/badminton-racquet-selector.pdf). Yonex publishes a per-racket maximum tension, which retailers repeat.
- Victor: the one relevant primary article is "Choosing the Perfect String and Tension for Your Badminton Racket" (https://www.victorsport.com/blog/article/choosing-the-perfect-string-and-tension-for-your-badminton-racket). The server redirects to the Thai site (th.victorsport.com), which returns "Content not found". I did NOT read the full text. The Victor claims below come from search-result summaries of that page and Victor product pages, so treat them as medium reliability. The Victor LAB string-types article (https://ca.victorsport.com/blog/article/victorlabintroductiontovictorsdifferenttypesofstrings-3) also redirected to a Thai 404. Victor AU/IN string-knowledge pages redirected to the home page.
- Li-Ning: the guide pages found (sg./in.lining.studio) returned 404. No Li-Ning stringing advice was obtained.
- BWF and national federations: nothing found. I found no federation or coaching-body tension table.
- Peer-reviewed or conference evidence exists only for "tension vs shuttle speed" (two machine-driven studies).
- Everything else is retail blogs or one stringer's blog. These are labelled "RETAIL" or "STRINGER BLOG".
- Several web-search summaries were thin. I only cite numbers I either fetched directly or that the summary clearly attributed.

## Current app logic (for reference)

From `/Users/tee/MyPro/RacketS/app.js` lines 429-474:

- `LVL_TENSION = { beginner: 21, intermediate: 24, advanced: 26, pro: 28 }`, then +1 for control style, -1 if gauge <= 0.63, capped at min(racket max, string `tensionMax`), floored at racket min.
- `STYLE_W` weights repulsion, control, durability, sound and shock per style (pure weighted average of string scores).
- Beginner with gauge <= 0.63: -8 points. Beginner with durability >= 8: +4.
- Stiff flex with shock >= 7: +3. Stiff flex with shock <= 4 for beginner or intermediate: -4.
- Balance, frame weight and head shape are not used at all. Climate is not used.

## Q1. Tension ranges by level

Nobody official publishes this. Every table is a retailer or stringer opinion, and they disagree by 3-5 lbs.

| Source (type) | Beginner | Intermediate | Advanced | Pro/elite |
|---|---|---|---|---|
| Badminton Avenue (RETAIL) https://www.badmintonavenue.com/Articles.asp?ID=247 | 20-22 | 23-25 | 26-28 | 29+ |
| Badminton Avenue 2nd article (RETAIL) https://www.badmintonavenue.com/blogs/news/how-should-you-string-your-racket | 20-22 | 22-24 | 25+ | n/a |
| Badminton Bay (RETAIL) https://blog.badmintonbay.com/?p=16 | 19-21 | 22-24 | 25-27 | 28-32 |
| Badminton Insight (STRINGER BLOG, no credentials) https://badminton-insight.com/badminton-string-tension/ | <=24 | 24-28 | 28-34 | (in advanced) |
| Paul Stewart, badminton-coach.co.uk (STRINGER BLOG, 20+ yrs stringing, no data cited) https://badminton-coach.co.uk/272/why-egos-and-incorrect-information-about-string-tensions-in-badminton-could-be-doing-more-harm-than-good/ | 16-18 plastic, 17-19 feather | 18-23 | 23-28 | 26-32 |
| Central Sports (RETAIL, via search summary) https://centralsports.co.uk/pages/badminton-string-tension-guide | ~18-23 | ~22-26 | ~26-30 | 28-32+ |

- The consensus: beginner roughly 19-23, intermediate roughly 22-26, advanced roughly 25-29, pro roughly 28-32.
- The current app values (21/24/26/28) sit inside that consensus. They are not "wrong" as midpoints, but a single number hides a 4-5 lb spread.
- Victor (primary, from search summary, not fully read): suggests starting at 24 lbs (10.5 kg) and adjusting by strength and preference. It says rackets strung above 26 lbs (11.5 kg) suit players who can generate power effectively, and top players often use 30 lbs or more. Source: https://www.victorsport.com/blog/article/choosing-the-perfect-string-and-tension-for-your-badminton-racket. Another Victor-attributed snippet appeared at https://in.victorsport.com/badmintonaz/20665/ (redirects to home, not verified).
- Plastic (nylon) shuttle users should string 2-3 lbs lower than feather users (Badminton Bay https://blog.badmintonbay.com/?p=16; Stewart, link above). The app does not ask which shuttle is used.
- Advice on increments: change by 1 lb at a time (Badminton Insight and Stewart, links above).
- Tension is tied to strength and technique rather than "level" labels. Stewart: "I know county players who are happy playing with 22lbs and I also know some who play with 27lbs or more" (his link above).

## Q2. Tension vs power / control / sweet spot; is lower = more power true?

- Measured, machine-driven (no human swing): shuttle speed falls as tension rises.
  - Vanasant, Mingkhumlert, Limroongreungrat, ISBS 2013, 5 racquets at 22/24/26/28/30 lb: velocity ordered 22 > 24 > 26 > 28 > 30. Small sample, abstract only. https://ojs.ub.uni-konstanz.de/cpa/article/view/5682
  - Suwannachote et al., Sensors 2023;23(13):5957, tension 20-34 lb: shuttle speed fell from 91.4 m/s at 20 lb to 79.2 m/s at 34 lb. Clamped racket on a shooting machine. The paper's own power figures contradict each other. https://pmc.ncbi.nlm.nih.gov/articles/PMC10346262
  - Both show a static "trampoline" effect only. Neither used human players or compared skill levels.
- Sweet spot: lower tension gives a larger forgiving sweet spot and fewer miss-hits; higher tension gives touch and control with a smaller sweet spot (Badminton Insight, Stewart, Badminton Bay, Central Sports; all RETAIL/BLOG, no data). Central Sports gives about 10 cm2 at 22 lbs vs about 4 cm2 above 28 lbs; this is an unsourced retail figure, treat as folk.
- Is "lower = more power" true? Yes in the physical sense of string-bed rebound, for the same player and same swing. It is NOT the whole story for real players:
  - Stewart argues the "tighter = more power" claim and the opposite oversimplification are both wrong. Real power rises with tension only up to a point; an accomplished player may peak near 24 lbs, a weaker player near 20-21 lbs. As consistency improves, players need less sweet-spot area and more response. (STRINGER BLOG, experience only.)
  - Badminton Avenue states the opposite, "Higher Tension - More Control & Repulsion", which conflicts with the lab data on repulsion. Retail blogs are inconsistent on this term. Do not encode "high tension = more repulsion".
  - Practical reading: low tension helps weak or developing players (more rebound, bigger sweet spot); advanced players accept lower rebound for control and because their swing speed supplies the power.
- Vibration/comfort: higher tension increases vibration and arm-injury risk (Stewart; Badminton Bay table: high tension = durability down, vibration up).
- Pros string high largely for control and feel; this is stated by the stringer and retail sources, not by any measured study.

## Q3. String gauge (0.61-0.70 mm)

- Thinner gauge: more repulsion and "bite"/feel, crisper sound, lower durability, smaller sweet spot. Thicker (0.68-0.70): lasts longer, less feel and less repulsion. Sources (RETAIL / search summaries): https://badmintonbites.com/the-complete-guide-to-victor-and-ashaway-badminton-strings/ ; https://thegodofsports.com/products/victor-vbs-61-badminton-string ; https://www.badmintonwarehouse.com/products/strbg65ti ; Victor-attributed "repulsion has an inverse correlation with durability".
- Badminton Insight (STRINGER BLOG): thinner strings give more repulsion at the same tension; thinner strings break more often above 24 lbs; reduce tension for thin strings. https://badminton-insight.com/badminton-string-tension/
- Tension loss: Badminton Insight says 1-3 lbs can be lost within a week of restringing, then it drops slowly. Victor: poundage drops even in an unused racket, faster with play (search summary of the Victor guide).
- I found no independent measurement of how much more tension a thin string loses vs a thick one. "Thin strings lose tension faster" is common claim but unsourced. Manufacturer marketing (Victor VBS-68 Vectran "handles high tension"; VBS-58 Nano "tension stability") is marketing, not data.
- Hybrid: Yonex Aerobite uses thin cross (0.61) + thicker main (0.67) to balance control and durability (retailer summary).
- Hitting sound: retailers tie sound to thin, hard, high-repulsion strings (e.g. BG80 "metallic", Exbolt); no scientific source. Keep as flavour, not as a hard rule.
- Yonex's own string list ordering: EXBOLT 68/65/63, AEROSONIC, BG66 FORCE, BG66 ULTIMAX, BG80 POWER, BG80, AEROBITE, AEROBITE BOOST, SKYARC, BG65 TITANIUM, BG65, with filters "Quick Repulsion / Control / Durability" (https://www.yonex.com/badminton/strings). No numeric ratings available on the page.

## Q4. Racket interactions (flex, balance, head shape, weight)

This is the weakest-sourced area. I found no manufacturer or federation statement of the form "stiff head-heavy racket pairs with string X".

- Facts about rackets (general, retailer text): head-heavy = power and momentum; head-light = maneuverability; stiff shaft = more of the swing energy goes to the shuttle and needs a fast swing; flexible shaft = more power with less effort and more control/finesse (various retail listings, e.g. https://www.badmintonavenue.com/products/yonex-arcsaber-7-pro-badminton-racket and the Yonex news text on ASTROX 77 https://www.yonex.com/news/new-astrox-77-this-power-is-ours/, which says the head-heavy build means strength is needed to unlock the power).
- Search for pairing advice returned only this: no source directly recommends a gauge or tension for a flexible shaft (search summary). Any pairing is inference.
- Reasoned (LOW confidence, inference) pairings:
  - Stiff + head-heavy racket for a player who is not strong: the racket already demands strength; avoid pushing tension up, prefer a forgiving/shock-absorbing string. Thin high-tension strings make it harsher on the arm (vibration rises with tension: Stewart; Badminton Bay).
  - Stiff + head-heavy racket for a strong advanced player: tension can go high; a thin repulsive string is a taste choice, not a necessity.
  - Head-light / flexible racket: the racket supplies feel, and a repulsive, thin string compensates for less raw power; this is a stringer folk rule.
  - Whether level changes this: beginner = durability and low vibration regardless of racket; this part is consistent across retail sources.
- Head shape and frame weight: no source found. Racket weight (U rating) matters indirectly through max tension (Yonex ArcSaber 7 Pro: 4U 19-27 lbs, 3U 20-28 lbs; Victor AuraSpeed 9 T 3U <=26 lbs vs HX-20H <=35 lbs, from product pages and search summaries). The app already has per-racket `tension` ranges; use those.
- The app's current rule "stiff flex + shock >= 7 → +3; stiff + shock <= 4 and level <= intermediate → -4" is consistent with the inference above but is not backed by a cited source.

## Q5. Climate, tension loss, pre-stretch, knots

- Humidity and heat: one manufacturer guide (via search summary, unnamed; not verified) suggests adding about 1-1.5 kg (2-3 lbs) in humid heat. A general source says humidity loosens nylon strings and dry air tightens them; tropical climates degrade strings and need more frequent restringing. Treat the +2-3 lb figure as unverified folk wisdom. Sources: https://luxilon.be/news/how-to-play-your-best-in-windy-humid-or-hot-conditions (tennis-oriented) and the search summary only. I did not find a Thailand-specific source (Thai-language search returned no tension content).
- Victor storage advice (primary, via search summary): keep strung rackets in a bag, away from heat, sun and damp (e.g. not in a car); weight on a strung racket reduces tension. https://au.victorsport.com/badmintonaz/3303/Racket-string-knowledge (redirects now, so not re-verified).
- Pre-stretch: electronic machines offer 5/10/15/20%; keeps tension longer but makes the string harder and more likely to snap; Badminton Insight recommends against manual pre-stretch for 99% of players. https://badminton-insight.com/badminton-string-tension/
- Cross vs main: Badminton Insight says crosses can be 10% higher than mains (e.g. 30 mains / 33 cross). This is an unusual claim; common stringer practice is +1-2 lbs. Not well sourced; do not encode.
- 2-knot vs 4-knot: no badminton source gives an "add lbs" rule. Tennis tests (Racketpedia https://www.racketpedia.com/en-GB/editorials/tennis-stringing-patterns-2-knot-vs-4-knot, https://www.racketpedia.com/en-GB/editorials/uniform-four-knot-stringing) show friction makes crosses end up below nominal tension with 4-knot uniform stringing, and the gap grows with tension. A forum user (anecdote, https://forum.lowyat.net/topic/4738187/+780) says the pattern matters little when mains and crosses are equal. No rule to encode.
- Restring frequency: about once a year per weekly session, monthly for advanced players (Badminton Insight). Tension loss: 1-3 lbs in the first week (same source).

## Q6. Staying under max tension

- No source gives a numeric margin. Unanimous: never exceed the frame's printed maximum; doing so can crack the frame, voids the warranty and raises vibration/injury risk. Sources: https://badminton-coach.co.uk/272/... (Stewart), https://blog.badmintonbay.com/?p=16 (frames tested up to a high load, most strings fail first), retailer warning on Yonex listings https://www.badmintonavenue.com/products/yonex-arcsaber-7-pro-badminton-racket and https://www.badmintonavenue.com/products/yonex-nanoflare-1000-z-badminton-racket.
- Badminton Bay: only highly accomplished county players should go above 28 lbs.
- Frame max varies widely: Yonex ArcSaber 7 Pro 3U 20-28, 4U 19-27; Victor AuraSpeed 9 T 3U <=26, DriveX 12 <=33, HX-20H <=35 (Victor product pages).
- Folk practice (unsourced): stay 1-2 lbs below the maximum, because strings lose tension and some stringers pre-stretch or run slight over-tension on cross. Treat "-1 lb margin" as a reasonable safety convention, not a sourced rule.
- Many stringers also add a 1 lb safety buffer for the machine's accuracy; I found no source stating this.

## Q7. Rules: well-sourced vs folk

Well-sourced (multi-source, or measured):

1. Never string above the frame's published maximum.
2. Lower tension gives more shuttle rebound at equal swing (two measured studies, links in Q2).
3. Lower tension gives a bigger, more forgiving sweet spot; higher tension gives control but a smaller sweet spot and more vibration (retail consensus, no data).
4. Beginners belong in the low band (about 19-23), advanced and pro in the high band (about 25-32) (all level tables agree on direction, differ on numbers).
5. Plastic shuttle: 2-3 lbs lower (two sources).
6. Thinner gauge = more repulsion and bite, less durability (all sources agree).

Folk wisdom (flag as such, or keep low weight):

- Humid heat: add 2-3 lbs (one unverified snippet).
- Thin strings lose tension faster.
- Cross 10% above mains.
- Stiff head-heavy racket + durable string or thick gauge; flexible racket + thin repulsive string.
- Hitting sound as a quantitative criterion.
- "Top pros use X lbs" claims as targets for amateurs.

## Proposed scoring rules

Inputs: `level`, `style`, racket (`balance`, `flex`, `weight`, `tension [min,max]`), string (`gauge`, `repulsion`, `control`, `durability`, `shock`, `sound`, `tensionMax`), optional `shuttle` (feather / plastic) and `climate` (hot-humid / normal).

### Tension recommendation

| # | Rule | Confidence |
|---|---|---|
| T1 | Hard cap: `tension <= min(racket.max, string.tensionMax)`. Never exceed. | high |
| T2 | Replace the single level value with a band: beginner 19-23 (default 21), intermediate 22-26 (default 24), advanced 25-29 (default 27), pro 28-32 (default 29). Show the band, pre-select the default. This stays close to the existing 21/24/26/28 defaults but widens the top to match Badminton Bay and Central Sports. | medium |
| T3 | Style nudge inside the band: control +1 (up to +2 for pro), attack/speed 0 to -1, allround 0. (Direction supported by "lower tension = repulsion, higher = control"; magnitude is judgement.) | medium |
| T4 | Gauge nudge: gauge <= 0.63 → -1 (thin strings break more above 24 lbs per one blog); gauge >= 0.68 → +0 to +1. | medium |
| T5 | Margin: stay at least 1 lb below the racket max when the level default would reach the max; display a warning when the final value is within 1 lb of the max. | low (convention, unsourced) |
| T6 | If `shuttle == plastic`, subtract 2-3 lbs. Add the input. | medium (two sources) |
| T7 | Hot-humid climate (Thailand): optionally +1 lb, shown as an optional toggle, with the note "unverified, from stringer folklore". Do not apply by default; the +2-3 lb figure is unverified. | low |
| T8 | Do not change tension for 2-knot vs 4-knot. | medium (no source supports a rule) |
| T9 | Beginners: lower band for a stiff or head-heavy racket (-1), because the racket already demands strength. | low (inference) |
| T10 | Clamp to racket min last (existing behaviour). | high |

### String-to-player scoring

| # | Rule | Confidence |
|---|---|---|
| S1 | Beginner: reward durability (>= 8: +4, already present) and gauge >= 0.66; penalise gauge <= 0.63 (existing -8 is reasonable, maybe -5). | high for direction, medium for size |
| S2 | Beginner/intermediate on high-tension or high-vibration choices: warn when `shock` is low and tension would be above the band top. | medium |
| S3 | Advanced/pro: do not reward durability much (reduce `durability` weight in `STYLE_W` for advanced/pro); reward control and feel. | medium |
| S4 | Style weights: keep attack/speed leaning on repulsion and control on control and shock; this matches the published characterisation of thin = repulsive. Add `durability` to speed only if level <= intermediate. | medium |
| S5 | Do NOT treat tension as a repulsion booster in text. The current UI strings should say lower tension = more rebound; make sure no copy says the opposite (Badminton Avenue's retail copy does). | high |
| S6 | Hitting sound: keep as a soft preference weight (low), since no objective source exists. | low |

### Racket interactions

| # | Rule | Confidence |
|---|---|---|
| R1 | Stiff flex + low `shock`: penalty for beginner/intermediate (existing -4); stiff + `shock >= 7`: bonus (existing +3). Keep, but label as "judgement". | low |
| R2 | Head-heavy racket (e.g. Astrox): for beginner/intermediate prefer strings with higher shock absorption and gauge >= 0.66; no thin 0.61-0.63 strings. | low |
| R3 | Head-light or flexible racket: a high-repulsion thin string is a mild bonus for attack/speed players because it compensates for less raw power. | low |
| R4 | Frame weight (U rating): lighter frames (4U, 5U) tend to have lower max tension; rely on the racket's own `tension` range rather than a separate rule. | medium (from product specs) |
| R5 | Head shape: no rule; no sourced guidance. | n/a |
| R6 | Level mismatch between racket and player (the existing +10/-10 bands): unrelated to strings, keep as is. | n/a |

### Why the site "feels wrong" (hypotheses, from the code)

- A single tension per level, even though references give ranges, and no input for shuttle type or climate.
- `STYLE_W` is a plain weighted mean with equal weight regardless of level, so a pro is rewarded for durability the same as a beginner.
- Racket balance, frame weight and head shape are ignored, though they are the main racket-side inputs experts cite (even though the sources for specific pairings are weak).
- Tension is only reduced for thin gauge; it never goes up for thick strings, and it is floored at the racket minimum even when that exceeds the cap.

## Implemented in app.js (2026-10-28)

- The score is three weighted parts, each 0-100 and shown on the page: string for the player (45%), racket for the player (30%), racket with string (25%).
- Racket with string adds two rules on top of R1-R3: +25 when the racket's `recString` (maker or shop advice) names the string, and +10 for a flexible shaft with a high-control string in control play. The pair part loses 15 when the racket or string ceiling sits below the level's band (T1, T2).
- Beginners lose 10 on the racket part for a stiff, head-heavy racket (Q4 retail and Yonex ASTROX 77 text). Advanced and pro players lose 6 on the string part for a gauge of 0.68 or more (S3).
- The recommended tension is built step by step and every step is shown. The optional hot-humid court toggle adds 1 lb and is labelled as unverified (T7, low).
- Confidence: the page counts the heavily weighted inputs that are estimates or missing: string ratings with weight 0.1 or more, and racket style, level, balance, flex and max tension. 0-1 such inputs reads "high", 2-3 "medium", more "low".
- String suggestions by goal come from strings within 10 points of the best match: best overall, most repulsion, most control, most durable, and best value (score per baht, priced strings only). When scores tie, the item with fewer estimated inputs ranks first.
- Makers do not publish a recommended tension per string. Yonex's Japan string page returned 404, and Victor's product pages give no figure; only retailers quote ranges. So no per-string tension band is used beyond `tensionMax`.

## Revised racket-to-player scoring (2026-10-29)

- The racket part reads the racket's specs first:
  - balance against style: attack likes head-heavy, speed likes head-light, control likes even or head-light
  - shaft flex against level: the ideal moves from flexible (beginner) to stiff and extra-stiff (pro); a gap of 2.5 grades costs 25
  - weight: 87 g and up is a warning for beginner and intermediate players
- The maker's style and level labels still count, at half weight where this data estimated them. 399 of 731 levels are estimated from price.
- A racket three levels below the player, or one whose tension ceiling sits more than 3 lb under the level's band, caps the whole score at 50. A good string can no longer rescue a 20 lb aluminium frame for a pro.
- Strings without ratings get them from gauge instead of a flat 5:
  - thin: repulsion 8, durability 4
  - mid: repulsion 7, durability 6
  - thick: repulsion 5, durability 9
- These weights are judgement, not sourced tables; the direction of each rule follows Q4 and S1-S3 above.

## Maker ratings, new options and the test page (2026-10-29)

- **Yonex string ratings.** These now come from Yonex's own 2026 badminton catalogue (https://www.yonex.co.jp/assets/pdf/catalog/badminton/2026_badminton_catalog.pdf, pp. 58-63), which rates each string on a 1-11 scale. Examples (repulsion / durability / sound / shock / control):
  - Exbolt 63: 11 / 7 / 10 / 7 / 10
  - BG66 Ultimax: 10 / 6 / 10 / 8 / 10
  - BG65: 7 / 10 / 6 / 6 / 6
  - Skyarc: 8 / 7 / 6 / 11 / 10

  All 13 current Yonex strings are covered, scaled to 1-10 and stored in `data/string-overrides.json`.
- **The same catalogue (p. 52-53)** has a spec chart of balance and hitting feel (stiffness) for every Yonex racket. It is not yet used.
- **Victor strings.** Victor's Thai pages give only a category ("Feature: High Resilience / Control / Durability") and a feel (Soft / Medium), and only for 6 of 14 strings. Victor ratings stay estimates.
- **New option: singles/doubles.** Doubles adds 4 for a head-light racket; singles adds 4 for a head-heavy one, plus 3 for a string with control 8 or more.
- **New option: wrist/shoulder care.**
  - Racket: stiff shaft -12, head-heavy -6.
  - String: shock 8 or more +8; shock 5 or less -10.
  - Tension: -1 lb.
  - Direction from Q2 (vibration rises with stiffness and tension); the sizes are judgement.
- **`tests/match.html`** checks 12 known pairings (beginner vs pro rackets, durable vs thin strings, wrist care, nylon shuttles, tension within the racket ceiling for every racket). Open it on the dev server after any scoring change; all 12 must pass.
- **Yonex racket chart (catalogue pp. 52-53).** The chart gives balance (ヘッドヘビー to ヘッドライト) and hitting feel (打球感, hard to soft) for 41 rackets. It was read from the PDF:
  - Model codes and their positions come from the text layer.
  - Marker heights were measured at 300 dpi, ignoring gridlines.
  - Checked against our existing Yonex data: balance agrees 30/33, stiffness 28/33.
  - Existing models needed no change. Eight catalogue models we lacked were added from it: Astrox 55A/33/11, Arcsaber 3/1, Nanoflare 400/300/111.
  - Their flex comes from the feel scale, so it is marked as an estimate. The cutoffs are: up to 670 px extra stiff, 735 stiff, 800 medium, beyond that flexible.

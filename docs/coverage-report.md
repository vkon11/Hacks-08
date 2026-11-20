# 61-factor coverage report

> Scope note: the 567-property export below is the broad ingestion dataset and includes houses, condos, co-ops, rooms, and address-only listings. For the apartment-community-only product scope, use `data/research/umich_apartment_communities.json`. Do not present 567 as the number of eligible apartment communities.

Generated 2026-11-20T08:54:23.307Z from the housing database. Counts are properties per resolved state
(`property_factor_status` view). **Resolved** = TRUE, FALSE, or a known value (numeric/category) from evidence at a scope allowed to confirm the factor.
**Building claim only** = a building-level TRUE exists, but the factor needs unit-level evidence, so it stays UNKNOWN.

## Totals

| Metric | Value |
|---|---|
| Properties | 567 |
| Properties scraped with Firecrawl | 14 |
| Official pages scraped | 100 |
| Floor plans | 1914 |
| Price observations | 1930 |
| Evidence rows kept | 9582 |
| Extractor items rejected by validation | 365 |
| Open verification-queue items | 276 |

## How each factor is acquired

| Acquisition | Count | Factors |
|---|---|---|
| calculated | 6 | 1, 54, 55, 56, 57, 58 |
| extractable | 44 | 2, 3, 5, 6, 7, 8, 9, 10, 16, 17, 19, 20, 21, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53 |
| floor_plan | 8 | 4, 11, 12, 13, 14, 15, 18, 22 |
| manual_verification | 3 | 59, 60, 61 |

## Firecrawl-scraped properties (14)

| # | Factor | Acquisition | TRUE | FALSE | Known value | UNKNOWN | Conflict | Building claim only | Resolved |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Commute to my pin | calculated | 0 | 0 | 0 | 14 | 0 | 0 | 0% |
| 2 | Private bedroom | extractable | 2 | 0 | 0 | 12 | 0 | 6 | 14% |
| 3 | Apartment size | extractable | 8 | 0 | 6 | 0 | 0 | 0 | 100% |
| 4 | Private bathroom | floor_plan | 3 | 0 | 0 | 11 | 0 | 3 | 21% |
| 5 | Laundry | extractable | 13 | 0 | 1 | 0 | 0 | 0 | 100% |
| 6 | Furnished | extractable | 10 | 0 | 0 | 4 | 0 | 3 | 71% |
| 7 | Air conditioning | extractable | 9 | 0 | 0 | 5 | 0 | 0 | 64% |
| 8 | Heat included | extractable | 4 | 0 | 0 | 10 | 0 | 0 | 29% |
| 9 | Whole place to myself | extractable | 2 | 0 | 0 | 12 | 0 | 1 | 14% |
| 10 | Bedroom count | extractable | 8 | 0 | 5 | 0 | 1 | 0 | 93% |
| 11 | Separate living room | floor_plan | 0 | 0 | 0 | 14 | 0 | 0 | 0% |
| 12 | Separate dining room | floor_plan | 0 | 0 | 0 | 14 | 0 | 0 | 0% |
| 13 | Bonus room or den | floor_plan | 0 | 0 | 0 | 14 | 0 | 0 | 0% |
| 14 | Bedroom size | floor_plan | 0 | 0 | 0 | 14 | 0 | 0 | 0% |
| 15 | Walk-in closet | floor_plan | 0 | 0 | 0 | 14 | 0 | 0 | 0% |
| 16 | Extra storage locker | extractable | 0 | 0 | 0 | 14 | 0 | 0 | 0% |
| 17 | Desk included | extractable | 0 | 0 | 0 | 14 | 0 | 0 | 0% |
| 18 | Bedroom has an exterior window | floor_plan | 0 | 0 | 0 | 14 | 0 | 0 | 0% |
| 19 | Floor level | extractable | 0 | 0 | 0 | 14 | 0 | 0 | 0% |
| 20 | Private outdoor space | extractable | 1 | 0 | 0 | 13 | 0 | 2 | 7% |
| 21 | Type of home | extractable | 4 | 0 | 10 | 0 | 0 | 0 | 100% |
| 22 | Bedroom floor surface | floor_plan | 0 | 0 | 0 | 14 | 0 | 0 | 0% |
| 23 | Private entrance | extractable | 0 | 0 | 0 | 14 | 0 | 0 | 0% |
| 24 | Dishwasher | extractable | 7 | 0 | 0 | 7 | 0 | 1 | 50% |
| 25 | Full oven | extractable | 8 | 0 | 0 | 6 | 0 | 0 | 57% |
| 26 | Internet included | extractable | 12 | 0 | 0 | 2 | 0 | 0 | 86% |
| 27 | Bedroom Ethernet | extractable | 0 | 0 | 0 | 14 | 0 | 0 | 0% |
| 28 | Free laundry | extractable | 1 | 1 | 0 | 12 | 0 | 0 | 14% |
| 29 | Smoke-free building | extractable | 4 | 0 | 0 | 10 | 0 | 0 | 29% |
| 30 | Lock on bedroom door | extractable | 7 | 0 | 0 | 7 | 0 | 0 | 50% |
| 31 | Gym in building | extractable | 13 | 0 | 0 | 1 | 0 | 0 | 93% |
| 32 | Study room in building | extractable | 12 | 0 | 0 | 2 | 0 | 0 | 86% |
| 33 | Free printing | extractable | 4 | 0 | 0 | 10 | 0 | 0 | 29% |
| 34 | Package locker | extractable | 5 | 0 | 0 | 9 | 0 | 0 | 36% |
| 35 | Indoor bike storage | extractable | 2 | 0 | 0 | 12 | 0 | 0 | 14% |
| 36 | Elevator | extractable | 5 | 0 | 0 | 9 | 0 | 0 | 36% |
| 37 | Controlled building entry | extractable | 9 | 0 | 0 | 5 | 0 | 0 | 64% |
| 38 | Pool | extractable | 5 | 0 | 0 | 9 | 0 | 0 | 36% |
| 39 | Hot tub | extractable | 2 | 0 | 0 | 12 | 0 | 0 | 14% |
| 40 | Yoga or fitness studio | extractable | 4 | 0 | 0 | 10 | 0 | 0 | 29% |
| 41 | Resident lounge | extractable | 9 | 0 | 0 | 5 | 0 | 0 | 64% |
| 42 | Outdoor hangout | extractable | 5 | 0 | 1 | 8 | 0 | 0 | 43% |
| 43 | Trash chute | extractable | 0 | 0 | 0 | 14 | 0 | 0 | 0% |
| 44 | 24-hour maintenance contact | extractable | 9 | 0 | 0 | 5 | 0 | 0 | 64% |
| 45 | Parking space | extractable | 4 | 0 | 0 | 10 | 0 | 3 | 29% |
| 46 | EV charging | extractable | 2 | 0 | 0 | 12 | 0 | 0 | 14% |
| 47 | Pet allowed | extractable | 6 | 4 | 0 | 2 | 2 | 0 | 71% |
| 48 | Individual lease | extractable | 10 | 0 | 0 | 2 | 2 | 0 | 71% |
| 49 | Roommate matching offered | extractable | 7 | 0 | 0 | 7 | 0 | 0 | 50% |
| 50 | Academic-term lease | extractable | 4 | 1 | 0 | 9 | 0 | 0 | 36% |
| 51 | Subletting permitted | extractable | 1 | 0 | 0 | 13 | 0 | 0 | 7% |
| 52 | Personal guarantor optional | extractable | 1 | 1 | 0 | 12 | 0 | 0 | 14% |
| 53 | Shared co-op meals | extractable | 0 | 0 | 0 | 14 | 0 | 0 | 0% |
| 54 | Grocery store nearby | calculated | 10 | 4 | 0 | 0 | 0 | 0 | 100% |
| 55 | One-seat ride to my pin | calculated | 0 | 0 | 0 | 14 | 0 | 0 | 0% |
| 56 | Short walk to my bus stop | calculated | 14 | 0 | 0 | 0 | 0 | 0 | 100% |
| 57 | Campus library nearby | calculated | 14 | 0 | 0 | 0 | 0 | 0 | 100% |
| 58 | Campus gym nearby | calculated | 12 | 2 | 0 | 0 | 0 | 0 | 100% |
| 59 | Step-free route to my unit | manual_verification | 0 | 0 | 0 | 14 | 0 | 3 | 0% |
| 60 | Step-free laundry access | manual_verification | 0 | 0 | 0 | 14 | 0 | 0 | 0% |
| 61 | Roll-in shower | manual_verification | 0 | 0 | 0 | 14 | 0 | 0 | 0% |

## All properties (567)

| # | Factor | Acquisition | TRUE | FALSE | Known value | UNKNOWN | Conflict | Building claim only | Resolved |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Commute to my pin | calculated | 0 | 0 | 0 | 567 | 0 | 0 | 0% |
| 2 | Private bedroom | extractable | 2 | 0 | 0 | 565 | 0 | 6 | 0% |
| 3 | Apartment size | extractable | 8 | 0 | 156 | 403 | 0 | 0 | 29% |
| 4 | Private bathroom | floor_plan | 3 | 0 | 0 | 564 | 0 | 4 | 1% |
| 5 | Laundry | extractable | 13 | 0 | 262 | 292 | 0 | 0 | 49% |
| 6 | Furnished | extractable | 113 | 0 | 0 | 454 | 0 | 3 | 20% |
| 7 | Air conditioning | extractable | 188 | 0 | 0 | 379 | 0 | 0 | 33% |
| 8 | Heat included | extractable | 97 | 0 | 0 | 470 | 0 | 0 | 17% |
| 9 | Whole place to myself | extractable | 149 | 0 | 0 | 418 | 0 | 1 | 26% |
| 10 | Bedroom count | extractable | 8 | 0 | 448 | 110 | 1 | 0 | 80% |
| 11 | Separate living room | floor_plan | 0 | 0 | 0 | 567 | 0 | 0 | 0% |
| 12 | Separate dining room | floor_plan | 33 | 0 | 0 | 534 | 0 | 0 | 6% |
| 13 | Bonus room or den | floor_plan | 0 | 0 | 0 | 567 | 0 | 0 | 0% |
| 14 | Bedroom size | floor_plan | 0 | 0 | 0 | 567 | 0 | 0 | 0% |
| 15 | Walk-in closet | floor_plan | 22 | 0 | 0 | 545 | 0 | 0 | 4% |
| 16 | Extra storage locker | extractable | 17 | 0 | 0 | 550 | 0 | 16 | 3% |
| 17 | Desk included | extractable | 0 | 0 | 0 | 567 | 0 | 0 | 0% |
| 18 | Bedroom has an exterior window | floor_plan | 0 | 0 | 0 | 567 | 0 | 0 | 0% |
| 19 | Floor level | extractable | 0 | 0 | 0 | 567 | 0 | 0 | 0% |
| 20 | Private outdoor space | extractable | 124 | 0 | 0 | 443 | 0 | 2 | 22% |
| 21 | Type of home | extractable | 4 | 0 | 457 | 106 | 0 | 0 | 81% |
| 22 | Bedroom floor surface | floor_plan | 0 | 0 | 0 | 567 | 0 | 0 | 0% |
| 23 | Private entrance | extractable | 26 | 0 | 0 | 541 | 0 | 0 | 5% |
| 24 | Dishwasher | extractable | 213 | 0 | 0 | 354 | 0 | 1 | 38% |
| 25 | Full oven | extractable | 251 | 0 | 0 | 316 | 0 | 0 | 44% |
| 26 | Internet included | extractable | 12 | 0 | 0 | 555 | 0 | 0 | 2% |
| 27 | Bedroom Ethernet | extractable | 0 | 0 | 0 | 567 | 0 | 0 | 0% |
| 28 | Free laundry | extractable | 5 | 1 | 0 | 561 | 0 | 0 | 1% |
| 29 | Smoke-free building | extractable | 47 | 0 | 0 | 520 | 0 | 0 | 8% |
| 30 | Lock on bedroom door | extractable | 53 | 0 | 0 | 514 | 0 | 0 | 9% |
| 31 | Gym in building | extractable | 31 | 0 | 0 | 536 | 0 | 0 | 5% |
| 32 | Study room in building | extractable | 35 | 0 | 0 | 532 | 0 | 0 | 6% |
| 33 | Free printing | extractable | 9 | 0 | 0 | 558 | 0 | 0 | 2% |
| 34 | Package locker | extractable | 6 | 0 | 0 | 561 | 0 | 0 | 1% |
| 35 | Indoor bike storage | extractable | 2 | 0 | 0 | 565 | 0 | 0 | 0% |
| 36 | Elevator | extractable | 13 | 0 | 0 | 554 | 0 | 0 | 2% |
| 37 | Controlled building entry | extractable | 55 | 0 | 0 | 512 | 0 | 0 | 10% |
| 38 | Pool | extractable | 7 | 0 | 0 | 560 | 0 | 0 | 1% |
| 39 | Hot tub | extractable | 2 | 0 | 0 | 565 | 0 | 0 | 0% |
| 40 | Yoga or fitness studio | extractable | 8 | 0 | 0 | 559 | 0 | 0 | 1% |
| 41 | Resident lounge | extractable | 33 | 0 | 0 | 534 | 0 | 0 | 6% |
| 42 | Outdoor hangout | extractable | 5 | 0 | 3 | 559 | 0 | 0 | 1% |
| 43 | Trash chute | extractable | 0 | 0 | 0 | 567 | 0 | 0 | 0% |
| 44 | 24-hour maintenance contact | extractable | 195 | 0 | 0 | 372 | 0 | 0 | 34% |
| 45 | Parking space | extractable | 183 | 0 | 0 | 384 | 0 | 4 | 32% |
| 46 | EV charging | extractable | 9 | 0 | 0 | 558 | 0 | 0 | 2% |
| 47 | Pet allowed | extractable | 132 | 83 | 0 | 348 | 4 | 0 | 38% |
| 48 | Individual lease | extractable | 29 | 0 | 0 | 536 | 2 | 0 | 5% |
| 49 | Roommate matching offered | extractable | 23 | 0 | 0 | 544 | 0 | 0 | 4% |
| 50 | Academic-term lease | extractable | 58 | 1 | 0 | 508 | 0 | 0 | 10% |
| 51 | Subletting permitted | extractable | 1 | 0 | 0 | 566 | 0 | 0 | 0% |
| 52 | Personal guarantor optional | extractable | 1 | 1 | 0 | 565 | 0 | 0 | 0% |
| 53 | Shared co-op meals | extractable | 16 | 0 | 0 | 551 | 0 | 0 | 3% |
| 54 | Grocery store nearby | calculated | 304 | 157 | 0 | 106 | 0 | 0 | 81% |
| 55 | One-seat ride to my pin | calculated | 0 | 0 | 0 | 567 | 0 | 0 | 0% |
| 56 | Short walk to my bus stop | calculated | 429 | 32 | 0 | 106 | 0 | 0 | 81% |
| 57 | Campus library nearby | calculated | 348 | 113 | 0 | 106 | 0 | 0 | 81% |
| 58 | Campus gym nearby | calculated | 291 | 170 | 0 | 106 | 0 | 0 | 81% |
| 59 | Step-free route to my unit | manual_verification | 0 | 0 | 0 | 567 | 0 | 34 | 0% |
| 60 | Step-free laundry access | manual_verification | 0 | 0 | 0 | 567 | 0 | 0 | 0% |
| 61 | Roll-in shower | manual_verification | 0 | 0 | 0 | 567 | 0 | 0 | 0% |

## Extractor rejections (why AI output was discarded)

| Reason | Count |
|---|---|
| quote_does_not_mention_factor | 206 |
| quote_not_on_page | 116 |
| empty_quote | 43 |

## Verification queue

| Reason | Open |
|---|---|
| low_confidence | 196 |
| accessibility_claim | 67 |
| conflict | 7 |
| ambiguous_text | 6 |

## Scrape jobs

| Property | Status | Pages | Credits | Accepted | Review | Rejected | Floor plans | Prices | Fees |
|---|---|---|---|---|---|---|---|---|---|
| Foundry Lofts | completed | 8 | 0 | 19 | 0 | 29 | 10 | 5 | 1 |
| Haven On Geddes | completed | 4 | 0 | 9 | 1 | 12 | 2 | 2 | 0 |
| Varsity | completed | 7 | 0 | 18 | 0 | 30 | 8 | 9 | 0 |
| Sterling Arbor Blu | completed | 8 | 0 | 15 | 0 | 31 | 16 | 12 | 7 |
| Vic Village | failed | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Six11 | completed | 8 | 0 | 20 | 1 | 41 | 20 | 26 | 0 |
| Verve | completed | 7 | 0 | 12 | 0 | 27 | 16 | 9 | 10 |
| Landmark | completed | 8 | 0 | 17 | 1 | 31 | 9 | 2 | 4 |
| The Yard | completed | 8 | 0 | 21 | 0 | 22 | 15 | 16 | 1 |
| Hub William | completed | 6 | 0 | 14 | 0 | 32 | 10 | 7 | 2 |
| Hub State Street | completed | 6 | 0 | 17 | 0 | 40 | 12 | 4 | 0 |
| Chapter | completed | 8 | 0 | 30 | 2 | 34 | 34 | 26 | 0 |
| U Towers | completed | 6 | 0 | 14 | 0 | 27 | 13 | 15 | 3 |
| Rambler | completed | 8 | 0 | 23 | 1 | 35 | 21 | 19 | 12 |
| Courtyards | completed | 8 | 0 | 31 | 0 | 21 | 7 | 7 | 2 |

Factors 1 (commute) and 55 (one-seat ride) depend on each user's pin, so they are computed per request (commute_estimates, one_seat_routes) and show UNKNOWN here. Factors 54 and 56–58 are precomputed for properties with coordinates. None are scraped.

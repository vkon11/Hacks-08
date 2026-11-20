# Ann Arbor Housing Board

A housing decision studio for U-M students built for Hack the Lease. Set a per-person monthly ceiling and household size, pin your real destination, choose how you travel, and describe what makes an apartment work for your life. The app ranks up to five sourced floor plans, exposes uncertainty, compares finalists head to head, and lets you test tradeoffs without rewriting your brief.

## Run locally

Use Node 22.12 or later, or Node 20.19.x.

```sh
npm ci
npm run inventory:build
npm run dev
```

For a production build, run `npm run build` followed by `npm start`. The Node server serves the built site, SPA routes and the three authenticated housing API endpoints on `PORT` (default 3000). `npm run preview` also includes the API. Supply the server environment to the production process. Local runs also load `.env.local`.

| Setting | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Server-only key for interpreting free text, assessing qualitative criteria and targeted evidence research. The setup-only path works without it. |
| `INVENTORY_PATH` | Optional path to another validated feed. The default is the generated `data/runtime/inventory.json`. |
| `OTP_GRAPHQL_URL` | Full OpenTripPlanner GTFS GraphQL endpoint for the Ann Arbor graph. Estimate from residential entrance to the student’s pin using their primary mode. A missing route leaves commute unknown. |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Public Supabase project settings. The client and server must use the same project. Configure the site’s `/auth/callback` in Google OAuth redirect settings in Supabase. |

The homepage is public. The dashboard and every questionnaire route require U-M sign-in through the existing Supabase setup. Housing API requests verify the bearer token with the project's Auth service. The built service worker caches the application shell and assets. Private API responses use `no-store`.

## Deploy

The repository includes a production `Dockerfile`, a `/healthz` readiness endpoint and graceful shutdown handling. It can run on any container host that supplies a persistent Node process, including Render, Railway, Fly.io, Google Cloud Run or AWS App Runner.

1. Configure the variables in `.env.example`. `VITE_*` values must be present during the image build because Vite embeds them in the browser bundle; also provide the Supabase values at runtime for server-side token verification.
2. Build with `docker build --build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=... -t housing-board .`.
3. Run with `docker run --env-file .env -p 3000:3000 housing-board` and configure the platform health check to use `/healthz`.
4. Add the deployed `/auth/callback` URL to the Supabase Google OAuth redirect allowlist before launch.

Do not expose `OPENAI_API_KEY` through a `VITE_*` variable. The generated inventory is included in the runtime image; set `INVENTORY_PATH` only when mounting a replacement feed.

## Questionnaire and saved brief

| Route | Purpose |
| --- | --- |
| `/` | Landing page and product walkthrough |
| `/dashboard` | Signed-in profile, questionnaire and shortlist |
| `/preferences/budget` | Monthly per-person ceiling including required recurring fees |
| `/preferences/location` | Search or drop a pin and rank all four travel modes |
| `/preferences/essentials` | Set flexible or required commute, total floor area, AC, heating, bedroom, bathroom, pets, parking, laundry, furniture and access features |
| `/preferences/builder` | Add, revise or drop ideas through chat and review the connected brief |
| `/preferences/saved` | Read the saved brief, edit individual sections and refresh the shortlist |

A new value on a requirement card starts flexible. Selecting the active value again clears it. Changing the most-used mode clears the old commute threshold for reconfirmation. The builder offers rotating suggestions and a checkpoint after four distinct new or changed ideas. Students can review sooner or choose their concrete setup alone. Chat uses a server-side GPT-5.4 mini Responses API integration. A failed interpretation stays pending for retry. Show my matches saves the current brief and opens results.

The v2 record holds an editable draft and the last saved revision, including setup, original messages, source-linked criteria and shortlist, in this browser under the signed-in account. On opening the updated site, the old v1 guest and account questionnaire records are removed on that browser. The historical board URL resumes the first incomplete step.

## Collecting the new inventory

The validated contract is in [server/inventory.ts](server/inventory.ts). A [fictional test feed](tests/fixtures/fictional-inventory.json) shows the exact format. The feed has `schemaVersion: 1`, a publisher-supplied `inventoryVersion` and five arrays. Use stable IDs so a room and its offer can be traced from a recommendation to the source.

| Array | Collect first |
| --- | --- |
| `buildings` | Name, address, residential entrance coordinates, first-party pages, building-level evidence |
| `layouts` | Building ID, layout name, bed and bath counts, total apartment square footage, floor plan URL |
| `options` | Layout ID, room or unit name, occupants per bedroom, assigned bathroom, AC type, installed heating, laundry, furnishing and access facts |
| `offers` | Option ID, per-person monthly total including mandatory recurring fees, or verified base plus mandatory fees. Include the listing URL, date checked, published dates, and offer-specific heat or parking terms. |
| `evidence` | Source URL, checked date, evidence ID, label and actual excerpt for each fact used. Link relevant floor-plan descriptions or measured living-room dimensions here so the builder can evaluate unusual preferences. |

A known numeric fact looks like `{"state":"known","value":750,"evidenceIds":["layout-area"]}`. Omit an unreported fact or record its state as `unknown`. Record unresolved disagreement as `conflicting`. Keep bedroom square footage separate from total floor-plan area. Monthly cost fields are integer US cents **per person**, including for whole-unit listings converted upstream with a verified occupant count. Published date ranges describe the offer as checked. Household size is decision context; availability remains a sourced fact and is never inferred.

Run `npm run inventory:build` whenever the research exports change. It joins the curated U-M apartment-community list to exported property and evidence records. Communities without a safely matchable priced record are reported and excluded rather than fabricated.

Hard failures exclude an offer. Missing hard facts put it under **Needs confirmation**. Ranking keeps one specific qualifying offer per layout. Explicit flexible choices and interpreted criteria with supported structured conditions use the feed directly. Other ideas use evidence-backed assessments. Ordinary preferences have weight 1 and high-priority preferences have weight 3. A missing fact contributes zero and reduces the reported evidence coverage. Layout selection for qualitative assessment is bounded at 30, with up to three targeted first-party lookups. The decision studio shows price, floor-plan facts, tradeoffs, evidence coverage, checked dates, source excerpts, comparison, and sensitivity scenarios.

## Checks

```sh
npm test
npm run build
npm run test:e2e
```

Tests use fictional inventory and controlled provider responses. Browser tests use installed Google Chrome when available. Otherwise install Chromium with `npx playwright install chromium`.

## Map sources

The homepage map is a locally rendered crop of OpenStreetMap street, path and building geometry. Map data © OpenStreetMap contributors, available under the ODbL. [OpenStreetMap attribution and license](https://www.openstreetmap.org/copyright)

Campus search includes U-M building footprints and named outdoor spaces, with a tour marker for the transit center. Directory search works offline. The “Search all of Ann Arbor” button sends the entered query to OpenStreetMap Nominatim for additional places and addresses. Set `VITE_PLACE_SEARCH_URL` to use another Nominatim-compatible endpoint. [U-M buildings](https://gisapi.fo.umich.edu/arcgis/rest/services/SearchBuildingsParking_BuildingswithAltText/MapServer/2) · [U-M common locations](https://gisapi.fo.umich.edu/arcgis/rest/services/CommonLocations/MapServer/0) · [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/)


Leaflet uses standard OpenStreetMap tiles for the local demo. A deployment can set `VITE_MAP_TILE_URL` and `VITE_MAP_ATTRIBUTION` at build time for its tile provider. A student can complete the location step with a bundled landmark or coordinates even if tiles are unavailable. [Tile usage policy](https://operations.osmfoundation.org/policies/tiles/)

## Timeline, photo and estimate sources

Sources behind the leasing timeline, listing photos and trip estimates. Each was checked on 2026-11-20.

| Used for | Source | What it supplies |
| --- | --- | --- |
| Timeline: renewal offers and tours opening | [City of Ann Arbor · Right to Renew guide (City Code Chapter 105, §8:530)](https://www.a2gov.org/media/toeestqe/rtr-4-10-2024.pdf) | Renewal offer due 180 days into a lease; tenant has at least 30 days to answer; no showing or re-leasing an occupied unit until day 210. Applies to leases of 8+ months in city limits entered after March 17, 2024. |
| Timeline: deposit | [Michigan Legislature · MCL 554.602](https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-554-602) | Security deposit capped at 1.5 months’ rent. |
| Timeline: deposit notice | [Michigan Legislature · MCL 554.603](https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-554-603) | Landlord’s written deposit notice due within 14 days of possession. |
| Timeline: inventory checklist | [Michigan Legislature · MCL 554.608](https://www.legislature.mi.gov/Laws/MCL?objectName=MCL-554-608) | Two blank checklists at move-in; tenant returns one within 7 days. |
| Listing photos | [U-M Off-Campus Housing](https://offcampushousing.umich.edu/) listing pages, one per building in `data/runtime/inventory.json` | Up to 8 photo URLs per building, taken from each page’s schema.org data and kept only when tied to that listing’s ID. Images are linked from the listing’s image host, not downloaded or re-hosted. Regenerate with `node scripts/fetch-listing-photos.mjs` (output: `src/ideal/listing-photos.json`). |
| Trip estimates when no routing service is set | [Haversine formula](https://en.wikipedia.org/wiki/Haversine_formula) | Straight-line distance, multiplied by a street detour factor and divided by a typical speed per mode (plus 8 minutes for bus walking and waiting). Always labeled as an estimate. |

Background research: [Rackham Graduate School · Michigan Doctoral Experience Study, *Housing Report: Fall 2021*](https://rackham.umich.edu/wp-content/uploads/2022/06/Housing-Report-2021-Finalized.pdf). It surveys first-year U-M Ph.D. students on finding housing in and around Ann Arbor: affordability, location, quality, search timing and lease problems. It informed the problem framing; the app does not use figures from it.

An older Ann Arbor Early Leasing Ordinance notice ([a2gov.org](https://www.a2gov.org/media/lpijxcs2/elo-rtr.pdf)) gives 150 days. The 2024 Right to Renew guide above supersedes it, so the timeline uses 210.

## Hack the Lease requirements

The application must help university students identify, compare, or make a
better-informed housing decision based on self-described needs, circumstances,
and way of life. Demographic profiling is outside the challenge.

The U-M and Ann Arbor pilot should connect housing facts to schedules,
transportation, total cost, roommate preferences, and meaningful trade-offs.
It must not become a general campus-life, maintenance, or social-media app.

The five-minute demo must show:

1. A clearly defined apartment-choice problem and the student needs it serves.
2. A functioning technical artifact that produces a meaningful comparison,
   insight, or recommendation.
3. Decision sensitivity: changing an input, constraint, or assumption changes
   the result, or the application explains why it does not.
4. The implementation, including external data, tools, APIs, and models.
5. Defensible outputs with sources, dates, assumptions, uncertainty, and
   consequential limitations.

Data may be independent or synthetic. Synthetic scenarios must be labeled.
Personal data collection must be minimized and consent-based, with no
unnecessary sensitive information or demographic inference.

Judging weights:

- Technical execution: 35%
- Student value and product strategy: 30%
- Decision quality and evidence: 20%
- Product experience and creativity: 15%

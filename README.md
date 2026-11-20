# Ann Arbor Housing Board

A housing recommender for U-M students built for Hack the Lease. Choose a per-person monthly ceiling, pin a destination, rank Walk, Car, Bus and Bike, then mark requirements and describe your ideal apartment in your own words. Review the resulting brief and see up to **six distinct floor plans** when verified inventory is available. Head-to-head comparisons and the final three are a later milestone.

## Run locally

Use Node 22.12 or later, or Node 20.19.x.

```sh
npm ci
npm run dev
```

For a production build, run `npm run build` followed by `npm start`. The Node server serves the built site, SPA routes and the three authenticated housing API endpoints on `PORT` (default 3000). `npm run preview` also includes the API. Supply the server environment to the production process. Local runs also load `.env.local`.

| Setting | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Server-only key for interpreting free text, assessing qualitative criteria and targeted evidence research. The setup-only path works without it. |
| `INVENTORY_PATH` | Server-side path to the new housing JSON feed. Leave unset until real data arrives. |
| `OTP_GRAPHQL_URL` | Full OpenTripPlanner GTFS GraphQL endpoint for the Ann Arbor graph. Estimate from residential entrance to the student’s pin using their primary mode. A missing route leaves commute unknown. |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Public Supabase project settings. The client and server must use the same project. Configure the site’s `/auth/callback` in Google OAuth redirect settings in Supabase. |

The homepage is public. The dashboard and every questionnaire route require U-M sign-in through the existing Supabase setup. Housing API requests verify the bearer token with the project's Auth service. The built service worker caches the application shell and assets. Private API responses use `no-store`.

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

A known numeric fact looks like `{"state":"known","value":750,"evidenceIds":["layout-area"]}`. Omit an unreported fact or record its state as `unknown`. Record unresolved disagreement as `conflicting`. Keep bedroom square footage separate from total floor-plan area. Monthly cost fields are integer US cents **per person**, including for whole-unit listings converted upstream with a verified occupant count. Published date ranges describe the offer as checked. Students do not enter a move-in date.

Hard failures exclude an offer. Missing hard facts put it under **Needs confirmation**. Ranking keeps one specific qualifying offer per layout. Explicit flexible choices and interpreted criteria with supported structured conditions use the feed directly. Other ideas use evidence-backed assessments. Ordinary preferences have weight 1 and high-priority preferences have weight 3. A missing fact contributes zero and reduces the reported evidence coverage. Layout selection for qualitative assessment is bounded at 30, with up to three targeted first-party lookups. The shortlist shows price, room, material unknowns and sources.

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

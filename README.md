# Ann Arbor Housing Board

A three-step guest questionnaire for Ann Arbor apartment preferences. Students set a monthly ceiling, choose a location and rank their travel modes, then sort housing factors on a priority board. Drafts and saved profiles live in the current browser. The guest flow runs without credentials.

## Run locally

Use Node 22.12 or later, or Node 20.19.x.

```sh
npm ci
npm run dev
```

The development server prints its local URL. To try offline reload, run `npm run build` followed by `npm run preview`. Open the questionnaire once while online so the production service worker can cache the application. It leaves external map tiles to the browser’s normal cache.

## Routes and profile handoff

| Route | Purpose |
| --- | --- |
| `/` | Start or resume a questionnaire, or reopen a saved profile |
| `/preferences/budget` | Confirm the maximum monthly cost per person |
| `/preferences/location` | Pick a location and rank Walk, Car, Bus and Bike |
| `/preferences/board` | Place, order and save housing priorities |
| `/preferences/saved` | Review the saved snapshot and edit a section |

The matcher handoff is `PreferenceProfileV1` in [src/model/types.ts](src/model/types.ts). `loadRecord().completed` returns the last successfully saved profile. It includes integer cents, a geographic point, all four modes in frequency order, and ordered factors with typed values, hard rules or signed soft weights. Guest storage uses the key `ann-arbor-housing-board:v1:guest`. An optional account ID on the app boundary selects a separate local namespace.

## Checks

```sh
npm test
npm run build
npm run test:e2e
```

Browser tests use installed Google Chrome when available. Otherwise install Chromium with `npx playwright install chromium`. The production app can be served by a static host that routes `/preferences/*` to `index.html`.

## Map sources

The homepage map is a locally rendered crop of OpenStreetMap street, path and building geometry. Map data © OpenStreetMap contributors, available under the ODbL. [OpenStreetMap attribution and license](https://www.openstreetmap.org/copyright)

Campus pins use the University of Michigan tour markers and the Facilities & Operations record for The Diag Proper. Application landmark IDs and coordinates are bundled in [src/location/landmarks.ts](src/location/landmarks.ts). [Campus tour data](https://tour.umich.edu/locations.json) · [The Diag Proper](https://gisapi.fo.umich.edu/arcgis/rest/services/CommonLocations/MapServer/0/524)

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

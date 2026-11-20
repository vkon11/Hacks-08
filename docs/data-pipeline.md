# Housing data pipeline

Turns public sources into per-factor evidence for the 61-factor recommendation engine. Every value carries its source,
quote, scope, confidence, and verification status. Missing information stays UNKNOWN; it is never converted to FALSE.

## Architecture

```
data/*.json (existing research) ──import-existing.ts──┐
official property sites ──Firecrawl map → choosePages → scrape(JSON schema) → validate → store──┤──> Supabase
TheRide GTFS + OpenStreetMap ──import-transit.ts → compute-routes.ts──┘        │
                                                                                 └─> property_factor_status (view) → /api/properties
```

| Piece | File | Role |
|---|---|---|
| Schema | `web/supabase/migrations/20261120_housing_data.sql` | Properties, floor plans, append-only listings, sources, evidence, jobs, queue, transit |
| Route functions | `web/supabase/migrations/20261120b_route_functions.sql` | `commute_estimates`, `one_seat_routes` (per-user pin) |
| Factor catalog | `web/src/lib/housing/factors.ts` | The 61 factors, acquisition type, and which evidence scopes may confirm each |
| Normalization | `web/src/lib/housing/normalize.ts` | Addresses, money, U-M tag text → factor evidence |
| Extraction schema | `web/src/lib/housing/extraction-schema.ts` | Firecrawl JSON schema and extraction rules |
| Validation | `web/src/lib/housing/validate.ts` | Rejects quotes not on the page or not about the factor; page selection |
| Import | `web/scripts/import-existing.ts` | Loads U-M marketplace, HAWC, seed, co-op, university, AAHC data (0 credits) |
| Scraper | `web/scripts/scrape.ts` | Firecrawl worker with retries, cache, resumable jobs, bot-protection stop |
| Transit | `web/scripts/import-transit.ts`, `compute-routes.ts` | GTFS stops/routes; nearest stop, grocery, library, rec estimates |
| Report | `web/scripts/coverage-report.ts` | Writes `docs/coverage-report.md` |
| API | `web/src/app/api/properties/...` | Read-only endpoints over RLS with the publishable key |

### Why one evidence table instead of amenities/unit_features/policies tables
Every attribute needs the same provenance columns (source, quote, scope, confidence, status). One `extracted_attributes`
table keyed by `attribute_key` + `scope` holds them all; a bedroom-level walk-in closet is a row with `scope = 'bedroom'`.
`property_factor_status` resolves each property × factor, counting only evidence at a scope the factor allows:
a building advertising A/C stays UNKNOWN for "unit has A/C" (flagged `building_claim`). TRUE and FALSE together = `conflict`.

### Extractor safeguards (measured on real pages)
The LLM extractor invented quotes ("Pets not allowed." on a page that never says it) and misread amenities ("24/7 Fitness
Center" as a yoga studio). Every item must therefore (1) quote text present on the page and (2) mention its factor.
Failures are stored as `rejected` with a reason, so model error rates are auditable. "Options"/"select units" language
goes to review instead of confirming. Accessibility factors 59–61 always go to review.

## Environment variables (`web/.env.local`, never committed)

| Variable | Used by | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | app, API | Public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | app, API | Public; reads go through RLS |
| `DATABASE_URL` | scripts only | Supabase → Connect → Session pooler. Full DB access: server-side only. `pglite:../work/localdb` for local dev |
| `FIRECRAWL_API_KEY` | `scrape.ts` only | Server-side only |

## Running (from `web/`)

```sh
node --env-file=.env.local scripts/migrate.ts            # apply migrations once each
node --env-file=.env.local scripts/import-existing.ts    # existing datasets, idempotent
node --env-file=.env.local scripts/scrape.ts             # all targets in data/scrape_targets.json (~40 credits each)
node --env-file=.env.local scripts/scrape.ts --only foundry-lofts
node --env-file=.env.local scripts/import-transit.ts     # needs work/gtfs-theride/ and work/osm.json
node --env-file=.env.local scripts/compute-routes.ts
node --env-file=.env.local scripts/coverage-report.ts
```

Refresh = re-run `scrape.ts`. Firecrawl responses are cached in `work/firecrawl-cache/`; delete a file to force a live fetch.
Listings are append-only, so a re-scrape with new prices adds observations and keeps history.

Tests (in-process Postgres, no network): `node scripts/test/migration.test.ts`, `import.test.ts`, `validate.test.ts`.

## Inputs not in git
- TheRide GTFS: `https://www.theride.org/sites/default/files/google/google_transit.zip` → unzip to `work/gtfs-theride/`.
  Transit data provided by permission of AAATA/TheRide.
- OpenStreetMap places via Overpass (supermarkets, libraries, sports/fitness centres in Ann Arbor) → `work/osm.json`.
  © OpenStreetMap contributors (ODbL).

## Known limits
- Location factors (54, 56–58) are straight-line × 1.3 detour walking estimates, not routed times. Factor 1 uses the same
  method per user pin; transit minutes need a routing API (not integrated).
- Co-ops and U-M graduate housing have no street address in the source data, so they have no coordinates or route factors.
- Floor-plan drawings are images; room dimensions and window/closet locations are only recorded when stated in text.
- Sites behind bot protection (e.g. Vic Village) are skipped, not bypassed.
- Scraping runs as a CLI worker, not on Vercel (function time limits). Jobs persist status for resume.

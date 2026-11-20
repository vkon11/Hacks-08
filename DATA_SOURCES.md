# Ann Arbor housing data

The prototype keeps verified listing facts separate from community reports.
Prices are observations, not guarantees, and every recommendation should show
its source and observation date.

## Files

- `data/housing_seed.json`: normalized, reviewable records for the prototype.
- `data/community_signals.json`: Reddit-derived questions and risk signals.
- `scripts/scrape-housing.mjs`: low-rate collector for candidate prices,
  layouts, square footage, and amenities.
- `scripts/build-inventory.mjs`: creates a citywide address baseline from the
  public rental registry export and structured records from the HAWC list.
- `scripts/extract-umich-listings.mjs`: extracts normalized live listings from
  the public data embedded in U-M's marketplace page.
- `scripts/firecrawl-discover.mjs`: uses Firecrawl search and map endpoints to
  discover properties across listing sites, management companies, co-ops, and
  community discussions.
- `data/raw/latest.json`: generated collector output. Do not feed raw values
  directly into a model without verifying price basis.
- `data/inventory/ann-arbor-registered-rentals.json`: historical city registry
  baseline covering houses, attached units, co-ops, and multifamily rentals.
- `data/inventory/hawc-properties.json`: affordable/accessibility-focused
  property records with published prices, transit, pets, and Section 504 data.
- `data/inventory/umich-offcampus-listings.json`: current U-M marketplace
  listings, including apartments, houses, floor plans, rents, amenities, and
  campus travel times.
- `data/inventory/special_housing.json`: U-M graduate apartments, ICC co-ops,
  and Ann Arbor Housing Commission properties that ordinary marketplace
  searches often omit.
- `data/ml_feature_schema.json`: model-ready feature dictionary covering
  student constraints, true cost, timelines, room fit, travel, accessibility,
  compliance, connectivity, operations, provenance, and prohibited uses.
- `data/source_catalog.json`: primary and secondary sources, coverage,
  refresh expectations, and limitations.
- `ML_APPROACH.md`: explainable ranking, learning, privacy, fairness, and
  evaluation plan.

Run the collector from the project root:

```sh
node scripts/scrape-housing.mjs
node scripts/build-inventory.mjs
node scripts/extract-umich-listings.mjs
FIRECRAWL_API_KEY=your_key_here node scripts/firecrawl-discover.mjs
```

No public source can guarantee every currently offered unit. The registry
baseline is broad but historical; marketplace inventory is current but
incomplete and changes daily. Coverage should therefore be reported as a
measured union of sources, with timestamps and deduplication by normalized
address, never as an unsupported claim of 100 percent completeness.

## Source hierarchy

1. Official property or university page
2. Government or local institutional data
3. Established listing aggregator
4. Local journalism
5. Student posts and Reddit

Lower-tier sources can fill gaps, but they receive lower confidence and must
not overwrite a conflicting official value automatically.

## Critical normalization rules

- Preserve whether a price is per person, per bed, or for the whole unit.
- Preserve whether the number is base rent, mandatory-fee-inclusive, or an
  estimated total.
- Store observation date, lease term, availability date, and source URL.
- Treat `null` as unknown. Never replace it with zero.
- Do not compare shared-bedroom prices directly with private studios.
- Keep anecdotes out of eligibility decisions and protected-class inference.

## ML direction

The first model should be an explainable learning-to-rank system rather than a
black-box rent predictor. Begin with weighted scoring over normalized features:
affordability, commute, lease compatibility, accessibility, privacy, roommate
fit, and evidence confidence. Record student choices and preference edits as
training feedback. Once enough consented interactions exist, train a pairwise
ranking model to predict which of two viable options a student prefers.

Do not train on synthetic recommendation outcomes as if they were real student
choices. A separate rent-range model may be added later, but its outputs must be
labeled estimates with uncertainty intervals and must never replace an
available published price.

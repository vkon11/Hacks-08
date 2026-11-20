# Hacks-08: explainable student housing decisions

This repository is the new home of the University of Michigan / Ann Arbor
housing project. The product will help students compare viable homes using the
needs they describe themselves: total cost, dates, room and roommate fit,
travel to their real destinations, accessibility, lease constraints, and the
quality of the available evidence.

The first model is an explainable learning-to-rank system. It filters hard
constraints before scoring preferences, shows why each result ranked where it
did, and never infers demographic identity. See [ML_APPROACH.md](ML_APPROACH.md)
and [PROJECT_REQUIREMENTS.md](PROJECT_REQUIREMENTS.md).

## Current data coverage

- 12,067 deduplicated addresses in a historical Ann Arbor registered-rental
  baseline.
- 463 current listings extracted from the U-M Off-Campus Housing marketplace.
- 62 HAWC housing-resource properties, including affordability,
  accessibility, transit, utility, fee, and pet fields.
- 16 ICC cooperative houses, U-M graduate housing, and Ann Arbor Housing
  Commission options.
- Current official-property price observations plus clearly separated
  community signals.

These sets overlap. They are broad discovery coverage, not proof that every
address has a currently available unit. Every production result must show a
source, observation date, price basis, and consequential unknowns.

## Repository map

- `data/ml_feature_schema.json` — complete decision-feature dictionary and
  prohibited uses.
- `data/source_catalog.json` — source authority, coverage, refresh policy, and
  limitations.
- `data/inventory/` — normalized discovery inventory.
- `data/housing_seed.json` — reviewed prototype properties and prices.
- `data/community_signals.json` — low-confidence questions and anecdotal risk
  signals, never verified facts.
- `scripts/` — collectors and normalizers, including Firecrawl discovery.
- `DATA_SOURCES.md` — data rules and commands.

## Run data checks

Node.js 20 or newer is sufficient; the current scripts use no npm packages.

```sh
node --check scripts/*.mjs
jq empty data/*.json data/inventory/*.json
```

The raw source documents used by the inventory builders live in the local,
ignored `work/source-docs/` directory. The checked-in normalized outputs make
the research reviewable without committing a 20 MB marketplace page.

For a Firecrawl REST discovery pass, configure the key locally and run:

```sh
FIRECRAWL_API_KEY=your_key node scripts/firecrawl-discover.mjs
```

Never commit credentials or treat discovered marketing text as a verified
listing fact without source-tier validation.

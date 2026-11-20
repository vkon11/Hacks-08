# Hacks-08

Read `PROJECT_REQUIREMENTS.md`, `DATA_SOURCES.md`, and `ML_APPROACH.md` before
changing product behavior or the recommendation model.

Use Graphify to narrow unfamiliar-code questions. From the repository root,
run `work/graphify-bin/graphify query "<specific question>" --depth 1`, then
read the relevant source lines. Avoid loading the full graph for a narrow
question. After code changes, run `work/graphify-bin/graphify update .`.

Keep verified facts, model estimates, and community anecdotes separate. Every
consequential housing field needs provenance, an observation date, confidence,
and honest missingness. Never infer protected traits or use demographic
composition, neighborhood reputation, or a demographic proxy for ranking.

Do not claim complete live inventory. Report measurable source coverage and
deduplicate by normalized address/property/unit identifiers.

# Explainable housing recommendation model

The first working model should recommend homes, not predict a student's
identity and not pretend to know a single objectively "best" apartment. It
uses only needs and circumstances the student chooses to provide.

## Decision pipeline

1. Normalize and deduplicate properties, units, prices, lease terms, and source
   evidence. Preserve unknown and conflicting facts.
2. Apply hard constraints: dates, all-in budget, eligibility, household size,
   required accessibility, guarantor limitations, pets, and required room or
   lease type. A listing with an unknown consequential field is marked
   "confirm," not silently accepted or rejected.
3. Compute interpretable features for each viable option: annualized true cost,
   travel-time distributions to actual destinations, room and privacy fit,
   lease flexibility, accessibility, nearby essentials, and evidence quality.
4. Rank with a transparent weighted utility score. Show component scores,
   assumptions, sources, dates, conflicts, missing facts, and the top trade-off
   for every result.
5. Let the student change a constraint or weight and immediately recompute the
   ranking. This sensitivity view is a core product feature and demo moment.

An initial score can be expressed as:

`score(home, student) = sum(weight_i * normalized_feature_i) - uncertainty_penalty`

The interface must show the contribution of each term. It should also show a
Pareto set—for example, the cheapest, shortest commute, best accessibility
match, and most flexible lease—so one blended number does not hide meaningful
trade-offs.

## Learning phase

Once enough students explicitly consent to sharing feedback, record pairwise
choices such as "A fits me better than B" plus the feature values visible at
the time. Train a pairwise learning-to-rank model, validate it by student and
time split, and compare it with the transparent weighted baseline. Useful
metrics include pairwise accuracy, NDCG@5, hard-constraint violation rate,
coverage of consequential fields, calibration of uncertainty, and ranking
stability when a low-confidence field changes.

Do not treat clicks, synthetic personas, generated recommendations, or scraped
reviews as ground-truth preference labels. A later rent-range model can help
fill hidden prices, but must return a dated interval and confidence, remain
visibly labeled as an estimate, and yield to a current published price.

## Fairness, privacy, and safety

- Do not collect or infer protected characteristics to rank housing. An
  accessibility requirement is a functional constraint supplied by the
  student, not evidence from which to infer a diagnosis.
- Test outcome quality across needs-based scenarios such as budget level,
  mobility requirements, campus destination, household size, and guarantor
  availability. These are product-coverage tests, not demographic profiling.
- Never convert crime reports, neighborhood reputation, income, or demographic
  composition into a "safety score." If official incident context is shown,
  present bounded counts, source dates, denominator limits, and uncertainty.
- Keep detailed schedules, finances, accessibility needs, and roommate answers
  in the browser/session by default. Save only with explicit consent, minimize
  precision, provide deletion, and separate analytics from identity.
- Log source provenance and extraction date for each consequential field. A
  recommendation must remain reproducible even after live listings change.

## Evaluation before demo

- Create labeled test scenarios covering Central, North, Medical, and commuter
  destinations; low and flexible budgets; semester and 12-month dates; private
  and shared rooms; accessibility needs; pets; no guarantor; and sublet needs.
- Assert zero hard-constraint violations and verify that changing one important
  input changes the ranking or produces a clear explanation for stability.
- Manually audit the top five results for current price basis, mandatory fees,
  availability, lease dates, travel time, and source links.
- Report inventory coverage as a measured union. The current local baseline is
  12,067 registered-rental addresses, 463 current U-M marketplace listings, 62
  HAWC properties, 16 ICC co-ops, plus university and Housing Commission
  options. These sets overlap and do not prove complete current availability.

# Apartment and factor research audit — 2026-11-20

This audit separates the broad generated housing export from the narrower apartment-community product scope.

## Files

- `data/export/properties.json` remains the reproducible broad export. It includes houses, individual units, condos, co-ops, and address-only records and must not be presented as the apartment-community count.
- `data/research/umich_apartment_communities.json` is the curated apartment-only set. Each included community has a direct U-M Off-Campus Housing portal URL.
- `data/research/factor_evidence_policy.json` defines how the 61 factors may be established and how missing data must behave.

## Property findings

Firecrawl searched and mapped the official U-M portal. The curated set contains 46 named apartment communities whose portal URLs returned HTTP 200 on 2026-11-20. Houses, duplexes, condominium units, co-ops, rooms, sublets, and address-only listings are excluded.

Portal inclusion is an evidence boundary, not an endorsement claim. U-M describes off-campus housing as privately owned and not operated by the University. A portal listing therefore means “listed on the official U-M off-campus portal,” not “U-M owned,” “U-M approved for quality,” or “guaranteed by U-M.”

Ten named candidates remain unresolved because this audit did not confirm a direct current portal record. ReNew Ann Arbor is included in this unresolved list because its previously indexed portal URL returned HTTP 404. Candidates stay outside the curated set rather than being silently included.

## Factor findings

The existing 61-factor export was structurally complete, but the evidence boundary needed to be explicit. The added policy file records five acquisition classes and seven cross-factor safeguards. Most importantly, absent evidence remains `UNKNOWN`; it never becomes `FALSE`.

## Sources

- [Official U-M Off-Campus Housing search](https://offcampushousing.umich.edu/listing)
- [Rackham housing guidance](https://rackham.umich.edu/student-experience/housing/)
- [U-M Parents & Families housing definitions](https://parents.umich.edu/page/campus-housing)
- [Beyond the Diag: finding housing and roommates](https://deanofstudents.umich.edu/student-programs/beyond-the-diag/finding-housing-roommates/)
- [Beyond the Diag: living on your own](https://deanofstudents.umich.edu/student-programs/beyond-the-diag/off-campus-living-guide/living-on-your-own/)

## Firecrawl trace

- Conversation: `b84450fe-2974-863e-a147-7c2a77279796`
- Portal map: `01a1fa20-3c48-7619-ba04-f4660d592634`
- Portal searches: `01a1fa1b-0688-77f9-afe4-f0b8cba1ec8e`, `01a1fa1b-cbdf-7174-b84f-fa9e0d1eaa28`, `01a1fa1f-94f4-753a-b3d3-38a7b0aa3b72`
- U-M factor-policy search: `01a1fa1e-e700-7453-8916-51f1f58e1e22`

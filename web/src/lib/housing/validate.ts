// Guards between the LLM extractor and the database. The extractor fabricates quotes and misreads amenities
// (observed on real pages), so every item must (1) quote text that exists on the page and (2) mention its factor.

import { FACTOR_BY_KEY } from "./factors.ts";

export const normText = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// The quote must contain one of these for the item to count. Factors without an entry rely on the quote check alone.
export const FACTOR_KEYWORDS: Record<string, RegExp> = {
  private_bedroom: /private|single (room|occupancy)|own (bed)?room/,
  apartment_size: /sq|square|ft/,
  private_bathroom: /private bath|private bed ?rooms? (and|&) bath|own bath|en suite|ensuite|bathroom for (each|every)|each bedroom has (its own|a private) bath/,
  laundry: /laundry|washer|dryer|w d/,
  furnished: /furnish/,
  air_conditioning: /air condition|a c\b|\bac\b|central air|cooling/,
  heat_included: /heat/,
  whole_place: /studio|entire|whole|1 bed|one bed|private apartment/,
  bedroom_count: /bed|br\b|studio/,
  separate_living_room: /living (room|area)/,
  separate_dining_room: /dining/,
  bonus_room_den: /den|bonus|flex|office/,
  bedroom_size: /x|sq|square|ft/,
  walk_in_closet: /walk in|walk-in/,
  storage_locker: /storage/,
  desk_included: /desk/,
  bedroom_exterior_window: /window/,
  floor_level: /floor|level|story/,
  private_outdoor_space: /balcon|patio|porch|terrace|deck|yard/,
  home_type: /apartment|house|home|co op|coop|condo|townhouse|duplex|loft/,
  bedroom_floor_surface: /floor|carpet|hardwood|tile|vinyl|plank/,
  private_entrance: /private entr|own entr|separate entr|exterior entr/,
  dishwasher: /dishwasher/,
  full_oven: /oven|range|stove/,
  internet_included: /internet|wi fi|wifi|broadband/,
  bedroom_ethernet: /ethernet|wired|data port/,
  free_laundry: /laundry|washer|dryer/,
  smoke_free: /smok/,
  bedroom_door_lock: /lock|key/,
  gym: /fitness|gym|workout|weight/,
  study_room: /study/,
  free_printing: /print/,
  package_locker: /package/,
  indoor_bike_storage: /bike|bicycle/,
  elevator: /elevator/,
  controlled_entry: /access|secur|entry|fob|intercom|gated/,
  pool: /pool/,
  hot_tub: /hot tub|jacuzzi|spa\b|whirlpool/,
  fitness_studio: /yoga|studio|spin|cycling|pilates|group fitness/,
  resident_lounge: /lounge|clubhouse|club room|community room|game room/,
  outdoor_hangout: /courtyard|rooftop|roof|grill|bbq|patio|terrace|fire pit|outdoor/,
  trash_chute: /chute/,
  maintenance_24h: /24|emergency/,
  parking_space: /parking|garage|space/,
  ev_charging: /ev\b|electric vehicle|charg/,
  pets_allowed: /pet|dog|cat|animal/,
  individual_lease: /individual|by the bed|per bed|by bed/,
  roommate_matching: /roommate match|matching/,
  academic_term_lease: /academic|semester|term|9 month|10 month/,
  subletting_permitted: /sublet|sublease|assign|relet/,
  guarantor_optional: /guarantor|co sign|cosign/,
  coop_meals: /meal|food|kitchen|dinner/,
  step_free_to_unit: /step free|no step|accessible|wheelchair|ramp|elevator/,
  step_free_laundry: /laundry/,
  roll_in_shower: /roll in|roll-in/,
};

// "Options" / "select units" language describes some units, so it can never confirm a specific unit.
const PARTIAL = /\boptions?\b|select (units|apartments|floor ?plans)|some (units|apartments)|available in|upon request|for an additional/;

export interface RawEvidence {
  factor_key: string; value: string; scope: string; quote: string;
  category_value?: string | null; numeric_value?: number | null; floor_plan_name?: string | null; bedroom_label?: string | null;
}

export interface Checked extends RawEvidence {
  status: "unverified" | "needs_review" | "rejected";
  reason: string | null;
  confidence: number;
}

/** Validate one extracted item against the page's own text. */
export function checkEvidence(e: RawEvidence, pageText: string, baseConfidence: number): Checked {
  const reject = (reason: string): Checked => ({ ...e, status: "rejected", reason, confidence: 0 });
  if (!FACTOR_BY_KEY.has(e.factor_key)) return reject("unknown_factor");
  if (!["true", "false", "unknown"].includes(e.value)) return reject("bad_value");
  const q = normText(e.quote ?? "");
  if (q.length < 3) return reject("empty_quote");
  if (!normText(pageText).includes(q)) return reject("quote_not_on_page");
  const kw = FACTOR_KEYWORDS[e.factor_key];
  if (kw && !kw.test(q)) return reject("quote_does_not_mention_factor");
  if (e.value === "unknown") return reject("unknown_is_not_evidence");

  if (e.value === "true" && PARTIAL.test(q))
    return { ...e, status: "needs_review", reason: "partial_availability_language", confidence: 0.3, scope: "building" };
  const accessibility = ["step_free_to_unit", "step_free_laundry", "roll_in_shower"].includes(e.factor_key);
  if (accessibility) return { ...e, status: "needs_review", reason: "accessibility_claim", confidence: Math.min(baseConfidence, 0.5) };
  return { ...e, status: "unverified", reason: null, confidence: baseConfidence };
}

export type PageType = "floor_plans" | "floor_plan" | "availability" | "amenities" | "faq" | "policies" | "fees" | "contact" | "homepage";

const PAGE_RULES: [PageType, RegExp][] = [
  ["fees", /charge.?list|fee.?schedule|fees?\b.*\.pdf$|rate.?sheet/i],
  ["availability", /availab|pricing|rates|price/i],
  ["floor_plan", /floor-?plans?\/.+/i],   // individual plan pages, including nested paths
  ["floor_plans", /floor-?plans?\/?$|units\/?$/i],
  ["amenities", /amenit|features/i],
  ["faq", /faq|frequently-asked/i],
  ["policies", /pet|polic|lease|sublet|sublease|assign|guarantor|resident-?handbook/i],
  ["contact", /contact/i],
];
const SKIP = /sitemap|\/blog|\/(wp-json|feed|tag|category|author)\/|thank-you|refer|ambassador|marketing|gallery|virtual-tour|video|schedule-a-tour|move-out-form|intent-to/i;
const PRIORITY: PageType[] = ["floor_plans", "amenities", "fees", "availability", "faq", "policies", "homepage", "floor_plan", "contact"];

/** Pick the most useful pages from a site map, newest PDF first, capped to save credits. */
export function choosePages(links: string[], homepage: string, maxPages: number): { url: string; type: PageType }[] {
  const typed: { url: string; type: PageType; year: number }[] = [];
  for (const url of links) {
    if (SKIP.test(url)) continue;
    const path = url.replace(/^https?:\/\/[^/]+/, "") || "/";
    const rule = PAGE_RULES.find(([, re]) => re.test(path));
    if (rule) typed.push({ url, type: rule[0], year: Number(path.match(/20\d\d/g)?.pop() ?? 0) });
  }
  typed.push({ url: homepage, type: "homepage", year: 0 });
  const seen = new Set<string>(), out: { url: string; type: PageType }[] = [];
  const perType: Partial<Record<PageType, number>> = {};
  const cap: Partial<Record<PageType, number>> = { floor_plan: 3, fees: 1, policies: 2 };
  for (const t of PRIORITY)
    for (const p of typed.filter((x) => x.type === t).sort((a, b) => b.year - a.year)) {
      const key = p.url.replace(/\/$/, "");
      if (seen.has(key) || (perType[t] ?? 0) >= (cap[t] ?? 1) || out.length >= maxPages) continue;
      seen.add(key); perType[t] = (perType[t] ?? 0) + 1; out.push({ url: p.url, type: t });
    }
  return out;
}

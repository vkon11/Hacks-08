// Normalization: raw source text -> factor evidence. Pure functions; no I/O.
// Rule: only explicit statements produce TRUE/FALSE. An unchecked box or a missing tag produces nothing (UNKNOWN).

import { createHash } from "node:crypto";
import type { Scope } from "./factors.ts";

export const hash = (s: string) => createHash("sha256").update(s).digest("hex");

const ABBREV: Record<string, string> = {
  street: "st", avenue: "ave", road: "rd", drive: "dr", boulevard: "blvd", court: "ct", place: "pl",
  lane: "ln", circle: "cir", parkway: "pkwy", terrace: "ter", north: "n", south: "s", east: "e", west: "w",
};

/** Canonical address key for dedupe. Fixes the U-M export's missing space ("AveAnn Arbor"). ZIP is dropped: sources
 *  include it inconsistently, and within one city it adds nothing to matching. */
export function normalizeAddress(raw: string): string {
  return raw
    .replace(/([a-z])(Ann Arbor)/, "$1 $2")
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\b(apt|unit|suite|ste)\s*\S+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ABBREV[w] ?? w)
    .join(" ")
    .replace(/\b(mi|michigan)\b/, "mi")
    .replace(/\s*\b\d{5}(-\d{4})?$/, "")
    .trim();
}

export function parseAddress(raw: string): { street: string; zip: string | null } {
  const fixed = raw.replace(/([a-z])(Ann Arbor)/, "$1 $2");
  const street = fixed.split(/,?\s*Ann Arbor/i)[0].trim();
  const zip = fixed.match(/\b(\d{5})(?:-\d{4})?\s*$/)?.[1] ?? null;
  return { street, zip };
}

export function parseMoney(raw: string | null | undefined): number | null {
  const m = raw?.replace(/,/g, "").match(/\$?\s*(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

export const PROPERTY_TYPE: Record<string, string> = {
  "Apartment Building": "apartment", House: "house", Duplex: "duplex", Townhouse: "townhouse", Room: "other",
};
export const isHouseLike = (t: string | null | undefined) => t === "house" || t === "duplex" || t === "townhouse";

export interface Evidence {
  factor: string;
  state?: "true" | "false";
  text?: string;          // normalized category value
  numeric?: number;
  confidence: number;
  raw: string;
  scopeKind: "unit" | "building";   // resolved to listing/house/building by the caller
  review?: "low_confidence" | "ambiguous_text" | "accessibility_claim";
}

interface TagRule {
  re: RegExp;
  factor: string;
  state?: "true" | "false";
  text?: string;
  confidence?: number;
  kind: "unit" | "building";
  houseOnly?: boolean;
  review?: Evidence["review"];
}

// Tag text as it appears in the U-M marketplace export. Anything unmatched is ignored, not guessed.
const TAG_RULES: TagRule[] = [
  // In-unit
  { re: /^dishwasher$/i, factor: "dishwasher", state: "true", kind: "unit" },
  { re: /^oven$/i, factor: "full_oven", state: "true", kind: "unit", confidence: 0.6 },
  { re: /^washer (&|and) dryer$/i, factor: "laundry", text: "in_unit", kind: "unit" },
  { re: /^(central heat and )?air conditioning$/i, factor: "air_conditioning", state: "true", kind: "unit" },
  { re: /^furnished$/i, factor: "furnished", state: "true", kind: "unit" },
  { re: /^private (balcony|patio)$/i, factor: "private_outdoor_space", state: "true", kind: "unit" },
  { re: /^(patio|porch|balcony|deck)$/i, factor: "private_outdoor_space", state: "true", kind: "unit", houseOnly: true, confidence: 0.6 },
  { re: /^dining room$/i, factor: "separate_dining_room", state: "true", kind: "unit" },
  { re: /^private entrance$/i, factor: "private_entrance", state: "true", kind: "unit" },
  { re: /^walk-in closet$/i, factor: "walk_in_closet", state: "true", kind: "unit" },
  { re: /^bedrooms keyed separately$/i, factor: "bedroom_door_lock", state: "true", kind: "unit" },
  { re: /^(parking available|free parking|garage parking)$/i, factor: "parking_space", state: "true", kind: "unit", confidence: 0.6 },
  { re: /^hardwood floors$/i, factor: "bedroom_floor_surface", text: "hardwood", kind: "unit", confidence: 0.5 },
  { re: /^carpet$/i, factor: "bedroom_floor_surface", text: "carpet", kind: "unit", confidence: 0.5 },
  { re: /^tile$/i, factor: "bedroom_floor_surface", text: "tile", kind: "unit", confidence: 0.5 },
  { re: /^wood plank flooring$/i, factor: "bedroom_floor_surface", text: "wood_plank", kind: "unit", confidence: 0.5 },
  // Leasing
  { re: /^individual leases$/i, factor: "individual_lease", state: "true", kind: "unit" },
  { re: /^roommate matching available$/i, factor: "roommate_matching", state: "true", kind: "building" },
  { re: /^(academic year|academic term or 12-month|short or academic-term leases available|semester|9-month|10-month)$/i, factor: "academic_term_lease", state: "true", kind: "unit" },
  // Costs
  { re: /^heat included$/i, factor: "heat_included", state: "true", kind: "unit" },
  { re: /^internet included$/i, factor: "internet_included", state: "true", kind: "unit" },
  { re: /^laundry included$/i, factor: "free_laundry", state: "true", kind: "unit", confidence: 0.7 },
  // Policies
  { re: /^no pets allowed$/i, factor: "pets_allowed", state: "false", kind: "building" },
  { re: /^(pets allowed|all pets|cats|dogs)$/i, factor: "pets_allowed", state: "true", kind: "building" },
  { re: /^no smoking allowed$/i, factor: "smoke_free", state: "true", kind: "building" },
  // Building
  { re: /24 hour emergency maintenance/i, factor: "maintenance_24h", state: "true", kind: "building" },
  { re: /^(laundry on-site|laundry room)$/i, factor: "laundry", text: "in_building", kind: "building" },
  { re: /^(entrance secured|controlled building access|entry intercom systems)$/i, factor: "controlled_entry", state: "true", kind: "building" },
  { re: /^on-site storage$/i, factor: "storage_locker", state: "true", kind: "building" },
  { re: /fitness center/i, factor: "gym", state: "true", kind: "building" },
  { re: /^(study room|group study)$/i, factor: "study_room", state: "true", kind: "building" },
  { re: /^elevator$/i, factor: "elevator", state: "true", kind: "building" },
  { re: /^free printing$/i, factor: "free_printing", state: "true", kind: "building" },
  { re: /^(tv lounge|clubhouse|game room|entertainment room)$/i, factor: "resident_lounge", state: "true", kind: "building" },
  { re: /^bike storage$/i, factor: "indoor_bike_storage", state: "true", kind: "building", confidence: 0.5, review: "ambiguous_text" },
  { re: /package locker/i, factor: "package_locker", state: "true", kind: "building" },
  { re: /^vehicle charging station$/i, factor: "ev_charging", state: "true", kind: "building" },
  { re: /yoga/i, factor: "fitness_studio", state: "true", kind: "building" },
  { re: /^rooftop/i, factor: "outdoor_hangout", text: "rooftop", kind: "building", confidence: 0.6 },
  // Generic accessibility claims never confirm unit access; stored as a building claim and queued for review.
  { re: /^ada accessible$/i, factor: "step_free_to_unit", state: "true", kind: "building", confidence: 0.4, review: "accessibility_claim" },
];

export function evidenceFromTags(tags: string[], propertyType: string | null): Evidence[] {
  const out: Evidence[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    for (const r of TAG_RULES) {
      if (!r.re.test(tag) || (r.houseOnly && !isHouseLike(propertyType))) continue;
      out.push({
        factor: r.factor, state: r.state, text: r.text, confidence: r.confidence ?? 0.7,
        raw: tag, scopeKind: r.kind, review: r.review ?? ((r.confidence ?? 0.7) < 0.6 ? "low_confidence" : undefined),
      });
    }
  }
  return out;
}

/** Resolve a rule's scope kind to a concrete evidence scope for a given source record. */
export function resolveScope(kind: "unit" | "building", propertyType: string | null): Scope {
  if (isHouseLike(propertyType)) return "house";
  return kind === "unit" ? "listing" : "building";
}

/** HAWC "Stairs to Unit: 3" style fields from evidence text. */
export function parseHawcStairs(text: string) {
  const n = (label: string) => {
    const m = text.match(new RegExp(`${label}:\\s*(\\d+)`, "i"));
    return m ? Number(m[1]) : null;
  };
  return { toUnit: n("Stairs to Unit"), withinUnit: n("Stairs within Unit"), toLobby: n("Stairs to Lobby") };
}

export function hawcField(text: string, label: string): string | null {
  const m = text.match(new RegExp(`${label}:\\s*([^:]+?)(?=\\s+[A-Z][A-Za-z ]+:|$)`));
  return m ? m[1].trim() : null;
}

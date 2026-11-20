// Firecrawl structured-extraction schema and prompt. One schema for every page type so results merge cleanly.
import { FACTORS } from "./factors.ts";

// Calculated factors (commute, grocery, transit...) are never extracted from marketing pages.
export const EXTRACTABLE_KEYS = FACTORS.filter((f) => f.acquisition !== "calculated").map((f) => f.key);

const SCOPES = ["building", "unit", "floor_plan", "bedroom", "listing", "house"];
const nullable = (type: string) => ({ type: [type, "null"] });

export const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    property: {
      type: "object",
      properties: {
        name: nullable("string"), street_address: nullable("string"), zip: nullable("string"),
        phone: nullable("string"), email: nullable("string"), leasing_office_contact: nullable("string"),
        property_type: { type: ["string", "null"], enum: ["apartment", "house", "condominium", "co_op", "townhouse", "duplex", "other", null] },
        description: nullable("string"), building_count: nullable("number"), floor_count: nullable("number"),
      },
    },
    evidence: {
      type: "array",
      description: "One item per explicit statement on this page about a housing feature or policy.",
      items: {
        type: "object",
        properties: {
          factor_key: { type: "string", enum: EXTRACTABLE_KEYS },
          value: { type: "string", enum: ["true", "false", "unknown"] },
          category_value: { ...nullable("string"), description: "laundry: in_unit|in_building|none. outdoor_hangout: courtyard|rooftop|bbq|patio|other. bedroom_floor_surface: hardwood|carpet|tile|vinyl|other. home_type: apartment|house|co_op|..." },
          numeric_value: { ...nullable("number"), description: "For numeric factors: square feet, bedroom count, floor number." },
          scope: { type: "string", enum: SCOPES, description: "What the statement covers: building = property-wide amenity/claim; floor_plan = a named layout; unit = a specific unit; bedroom = a specific bedroom; listing = a specific offer." },
          floor_plan_name: nullable("string"),
          bedroom_label: nullable("string"),
          quote: { type: "string", description: "The exact sentence or phrase copied verbatim from the page that supports this item." },
        },
        required: ["factor_key", "value", "scope", "quote"],
      },
    },
    floor_plans: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" }, bedrooms: nullable("number"), bathrooms: nullable("number"), square_feet: nullable("number"),
          floor_plan_url: nullable("string"),
          prices: {
            type: "array",
            items: {
              type: "object",
              properties: {
                rent_min: nullable("number"), rent_max: nullable("number"),
                pricing_basis: { type: "string", enum: ["per_person", "per_unit", "per_bed", "unknown"] },
                pricing_frequency: { type: "string", enum: ["monthly", "installment", "semester", "annual", "unknown"] },
                price_type: { type: "string", enum: ["advertised_starting", "available_unit", "range", "unknown"] },
                unit_identifier: nullable("string"), available_date: nullable("string"), quote: { type: "string" },
              },
              required: ["pricing_basis", "pricing_frequency", "price_type", "quote"],
            },
          },
        },
        required: ["name"],
      },
    },
    fees: {
      type: "array",
      items: {
        type: "object",
        properties: {
          fee_type: { type: "string", enum: ["application", "security_deposit", "administrative", "amenity", "utility", "parking", "pet_deposit", "pet_rent", "pet_fee", "furniture", "sublet", "other"] },
          amount: nullable("number"), frequency: nullable("string"), required: nullable("boolean"), quote: { type: "string" },
        },
        required: ["fee_type", "quote"],
      },
    },
    lease_terms: {
      type: "array",
      items: {
        type: "object",
        properties: { term_text: { type: "string" }, months: nullable("number"), lease_start: nullable("string"), lease_end: nullable("string"), quote: { type: "string" } },
        required: ["term_text", "quote"],
      },
    },
  },
  required: ["evidence"],
};

export const EXTRACTION_PROMPT = `Extract student-housing facts from this Ann Arbor property page.
Rules:
- Only record what the page explicitly states. If the page does not say it, omit it. Never guess.
- value "false" only when the page explicitly says the feature is absent or not allowed (e.g. "no pets").
- quote must be copied verbatim from the page text.
- scope: a property-wide amenity list is "building". A statement about a named floor plan is "floor_plan". About one bedroom is "bedroom".
- Do not infer anything from images, floor-plan drawings, or photos. Only text.
- Per-person pricing does NOT mean individual leases. Record individual_lease only if leases are explicitly individual/by-the-bed.
- A bedroom count equal to the bathroom count does NOT mean private bathrooms unless the page says each bedroom has its own bathroom.
- "Furnished" does not mean furniture is included in the price unless stated.
- Generic "accessible" claims are scope "building"; never mark step_free_to_unit, step_free_laundry, or roll_in_shower true without unit-specific text.
- Distinguish "starting at" prices (advertised_starting) from prices for a specific available unit (available_unit).`;

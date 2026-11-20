// The 61-factor catalog. Single source of truth: seeded into Supabase factor_catalog by scripts/seed-factors.ts.
// confirmScopes = evidence scopes allowed to resolve the factor to TRUE/FALSE. Evidence at other scopes is kept
// but stays UNKNOWN (flagged as a building claim), e.g. a building advertising A/C does not confirm a unit has it.

export type Scope = "building" | "unit" | "floor_plan" | "bedroom" | "listing" | "house" | "route";
export type Acquisition = "extractable" | "calculated" | "floor_plan" | "manual_verification" | "unsupported";
export type ValueKind = "boolean" | "numeric" | "categorical";

export interface Factor {
  number: number;
  key: string;
  label: string;
  category: string;
  valueKind: ValueKind;
  acquisition: Acquisition;
  confirmScopes: Scope[];
  freshnessDays?: number;
  notes?: string;
}

const IN_UNIT: Scope[] = ["unit", "floor_plan", "listing", "house"];
const BUILDING: Scope[] = ["building", "house"];
const POLICY: Scope[] = ["building", "listing", "house"];
const ROUTE: Scope[] = ["route"];

const f = (
  number: number, key: string, label: string, category: string, valueKind: ValueKind,
  acquisition: Acquisition, confirmScopes: Scope[], notes?: string, freshnessDays?: number,
): Factor => ({ number, key, label, category, valueKind, acquisition, confirmScopes, notes, freshnessDays });

export const FACTORS: Factor[] = [
  f(1, "commute_to_pin", "Commute to my pin", "location", "numeric", "calculated", ROUTE, "Computed per user pin and mode; never scraped."),
  f(2, "private_bedroom", "Private bedroom", "unit", "boolean", "extractable", [...IN_UNIT, "bedroom"]),
  f(3, "apartment_size", "Apartment size", "unit", "numeric", "extractable", IN_UNIT, "Interior square feet."),
  f(4, "private_bathroom", "Private bathroom", "unit", "boolean", "floor_plan", [...IN_UNIT, "bedroom"], "4bd/4ba alone does not prove exclusive baths; needs explicit statement."),
  f(5, "laundry", "Laundry", "unit", "categorical", "extractable", [...IN_UNIT, "building"], "in_unit | in_building | none | unknown."),
  f(6, "furnished", "Furnished", "unit", "boolean", "extractable", IN_UNIT, "Furnished does not mean furniture is included in price."),
  f(7, "air_conditioning", "Air conditioning", "unit", "boolean", "extractable", IN_UNIT),
  f(8, "heat_included", "Heat included", "cost", "boolean", "extractable", POLICY, undefined, 30),
  f(9, "whole_place", "Whole place to myself", "unit", "boolean", "extractable", IN_UNIT),
  f(10, "bedroom_count", "Bedroom count", "unit", "numeric", "extractable", IN_UNIT),
  f(11, "separate_living_room", "Separate living room", "layout", "boolean", "floor_plan", ["unit", "floor_plan", "house"]),
  f(12, "separate_dining_room", "Separate dining room", "layout", "boolean", "floor_plan", ["unit", "floor_plan", "house"]),
  f(13, "bonus_room_den", "Bonus room or den", "layout", "boolean", "floor_plan", ["unit", "floor_plan", "house"]),
  f(14, "bedroom_size", "Bedroom size", "layout", "numeric", "floor_plan", ["bedroom"], "Only stated dimensions; never inferred from images."),
  f(15, "walk_in_closet", "Walk-in closet", "layout", "boolean", "floor_plan", ["bedroom", "unit", "floor_plan"]),
  f(16, "storage_locker", "Extra storage locker", "building", "boolean", "extractable", ["building", "unit", "listing"]),
  f(17, "desk_included", "Desk included", "unit", "boolean", "extractable", [...IN_UNIT, "bedroom"]),
  f(18, "bedroom_exterior_window", "Bedroom has an exterior window", "layout", "boolean", "floor_plan", ["bedroom"]),
  f(19, "floor_level", "Floor level", "unit", "numeric", "extractable", ["unit", "listing"]),
  f(20, "private_outdoor_space", "Private outdoor space", "unit", "boolean", "extractable", IN_UNIT),
  f(21, "home_type", "Type of home", "building", "categorical", "extractable", BUILDING),
  f(22, "bedroom_floor_surface", "Bedroom floor surface", "layout", "categorical", "floor_plan", ["bedroom", "unit", "floor_plan"]),
  f(23, "private_entrance", "Private entrance", "unit", "boolean", "extractable", IN_UNIT),
  f(24, "dishwasher", "Dishwasher", "unit", "boolean", "extractable", IN_UNIT),
  f(25, "full_oven", "Full oven", "unit", "boolean", "extractable", IN_UNIT),
  f(26, "internet_included", "Internet included", "cost", "boolean", "extractable", POLICY, undefined, 30),
  f(27, "bedroom_ethernet", "Bedroom Ethernet", "unit", "boolean", "extractable", ["bedroom", "unit", "floor_plan"]),
  f(28, "free_laundry", "Free laundry", "cost", "boolean", "extractable", [...POLICY, "unit"]),
  f(29, "smoke_free", "Smoke-free building", "policy", "boolean", "extractable", BUILDING),
  f(30, "bedroom_door_lock", "Lock on bedroom door", "unit", "boolean", "extractable", ["bedroom", "unit", "floor_plan"]),
  f(31, "gym", "Gym in building", "amenity", "boolean", "extractable", BUILDING),
  f(32, "study_room", "Study room in building", "amenity", "boolean", "extractable", BUILDING),
  f(33, "free_printing", "Free printing", "amenity", "boolean", "extractable", BUILDING),
  f(34, "package_locker", "Package locker", "amenity", "boolean", "extractable", BUILDING),
  f(35, "indoor_bike_storage", "Indoor bike storage", "amenity", "boolean", "extractable", BUILDING),
  f(36, "elevator", "Elevator", "amenity", "boolean", "extractable", BUILDING),
  f(37, "controlled_entry", "Controlled building entry", "amenity", "boolean", "extractable", BUILDING),
  f(38, "pool", "Pool", "amenity", "boolean", "extractable", BUILDING),
  f(39, "hot_tub", "Hot tub", "amenity", "boolean", "extractable", BUILDING),
  f(40, "fitness_studio", "Yoga or fitness studio", "amenity", "boolean", "extractable", BUILDING),
  f(41, "resident_lounge", "Resident lounge", "amenity", "boolean", "extractable", BUILDING),
  f(42, "outdoor_hangout", "Outdoor hangout", "amenity", "categorical", "extractable", BUILDING, "courtyard | rooftop | bbq | patio | other."),
  f(43, "trash_chute", "Trash chute", "amenity", "boolean", "extractable", BUILDING),
  f(44, "maintenance_24h", "24-hour maintenance contact", "amenity", "boolean", "extractable", BUILDING),
  f(45, "parking_space", "Parking space", "amenity", "boolean", "extractable", ["listing", "unit", "house"], "Building advertising parking does not prove a space is available."),
  f(46, "ev_charging", "EV charging", "amenity", "boolean", "extractable", BUILDING),
  f(47, "pets_allowed", "Pet allowed", "policy", "boolean", "extractable", POLICY),
  f(48, "individual_lease", "Individual lease", "policy", "boolean", "extractable", POLICY, "Per-person pricing is not proof of an individual lease."),
  f(49, "roommate_matching", "Roommate matching offered", "policy", "boolean", "extractable", BUILDING),
  f(50, "academic_term_lease", "Academic-term lease", "policy", "boolean", "extractable", POLICY),
  f(51, "subletting_permitted", "Subletting permitted", "policy", "boolean", "extractable", POLICY),
  f(52, "guarantor_optional", "Personal guarantor optional", "policy", "boolean", "extractable", POLICY),
  f(53, "coop_meals", "Shared co-op meals", "policy", "boolean", "extractable", BUILDING),
  f(54, "grocery_nearby", "Grocery store nearby", "location", "numeric", "calculated", ROUTE),
  f(55, "one_seat_ride", "One-seat ride to my pin", "location", "boolean", "calculated", ROUTE, "From GTFS: a route serves a stop near home and near the pin."),
  f(56, "short_walk_bus_stop", "Short walk to my bus stop", "location", "numeric", "calculated", ROUTE),
  f(57, "library_nearby", "Campus library nearby", "location", "numeric", "calculated", ROUTE),
  f(58, "campus_gym_nearby", "Campus gym nearby", "location", "numeric", "calculated", ROUTE),
  f(59, "step_free_to_unit", "Step-free route to my unit", "accessibility", "boolean", "manual_verification", ["unit", "route"], "Generic building claims are insufficient."),
  f(60, "step_free_laundry", "Step-free laundry access", "accessibility", "boolean", "manual_verification", ["unit", "route"]),
  f(61, "roll_in_shower", "Roll-in shower", "accessibility", "boolean", "manual_verification", ["unit"]),
];

export const FACTOR_BY_KEY = new Map(FACTORS.map((x) => [x.key, x]));

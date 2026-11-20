import type { Factor, Placement, TravelMode, Value } from './types.ts'
import { TRAVEL_LABELS } from './inputs.ts'

type Options = [value: Value, label: string][]
type Entry = [id: string, label: string, options?: Options]

function topic(name: string, entries: Entry[]): Factor[] {
  return entries.map(([id, label, options = []]) => ({
    id, label, topic: name, options: options.map(([value, label]) => ({ value, label })),
  }))
}

function minutes(...amounts: number[]): Options {
  return amounts.map(value => [value, `${value} min max`])
}

function squareFeet(...amounts: number[]): Options {
  return amounts.map(value => [value, `${value.toLocaleString('en-US')}+ sq ft`])
}

export const CATALOG: Factor[] = [
  ...topic("Campus trips", [
    ["commute_to_my_pin", "Commute to my pin", minutes(10, 15, 20)],
    ["grocery_store_nearby", "Grocery store nearby", minutes(10, 15, 20)],
    ["one_seat_ride_to_my_pin", "One-seat ride to my pin"],
    ["short_walk_to_my_bus_stop", "Short walk to my bus stop", minutes(5, 10)],
    ["campus_library_nearby", "Campus library nearby", minutes(10, 15, 20)],
    ["campus_gym_nearby", "Campus gym nearby", minutes(10, 15, 20)],
  ]),
  ...topic("Space & layout", [
    ["private_bedroom", "Private bedroom"],
    ["apartment_size", "Apartment size", squareFeet(500, 750, 1000)],
    ["private_bathroom", "Private bathroom"],
    ["whole_place_to_myself", "Whole place to myself", [["studio", "Studio"], ["one_bedroom", "1-bedroom"]]],
    ["bedroom_count", "Bedroom count", [["one", "1 bedroom"], ["two", "2 bedrooms"], ["three_or_more", "3+ bedrooms"]]],
    ["separate_living_room", "Separate living room"],
    ["separate_dining_room", "Separate dining room"],
    ["bonus_room_or_den", "Bonus room or den"],
    ["bedroom_size", "Bedroom size", squareFeet(100, 120, 140)],
    ["walk_in_closet", "Walk-in closet"],
    ["extra_storage_locker", "Extra storage locker"],
    ["desk_included", "Desk included"],
    ["bedroom_has_an_exterior_window", "Bedroom has an exterior window"],
    ["floor_level", "Floor level", [["lower_level", "Lower level"], ["ground_floor", "Ground floor"], ["upper_floor", "Upper floor"]]],
    ["private_outdoor_space", "Private outdoor space", [["balcony", "Balcony"], ["patio", "Patio"]]],
    ["type_of_home", "Type of home", [["house", "House"], ["small_multi_unit_house", "Small multi-unit house"], ["apartment_building", "Apartment building"]]],
    ["bedroom_floor_surface", "Bedroom floor surface", [["carpet", "Carpet"], ["hard_surface", "Hard surface"]]],
    ["private_entrance", "Private entrance"],
  ]),
  ...topic("Home basics", [
    ["laundry", "Laundry", [["in_unit", "In unit"], ["in_building", "In building"]]],
    ["furnished", "Furnished", [["bedroom_furnished", "Bedroom furnished"], ["whole_unit_furnished", "Whole unit furnished"]]],
    ["air_conditioning", "Air conditioning"],
    ["dishwasher", "Dishwasher"],
    ["full_oven", "Full oven"],
    ["internet_included", "Internet included"],
    ["bedroom_ethernet", "Bedroom Ethernet"],
    ["free_laundry", "Free laundry"],
    ["smoke_free_building", "Smoke-free building"],
    ["lock_on_bedroom_door", "Lock on bedroom door"],
  ]),
  ...topic("Bills & lease", [
    ["heat_included", "Heat included"],
  ]),
  ...topic("Building amenities", [
    ["gym_in_building", "Gym in building"],
    ["study_room_in_building", "Study room in building"],
    ["free_printing", "Free printing"],
    ["package_locker", "Package locker"],
    ["indoor_bike_storage", "Indoor bike storage"],
    ["elevator", "Elevator"],
    ["controlled_building_entry", "Controlled building entry"],
    ["pool", "Pool"],
    ["hot_tub", "Hot tub"],
    ["yoga_or_fitness_studio", "Yoga or fitness studio"],
    ["resident_lounge", "Resident lounge"],
    ["outdoor_hangout", "Outdoor hangout", [["courtyard", "Courtyard"], ["rooftop_terrace", "Rooftop terrace"], ["bbq_area", "BBQ area"]]],
    ["trash_chute", "Trash chute"],
    ["24_hour_maintenance_contact", "24-hour maintenance contact"],
  ]),
  ...topic("Cost, lease & household", [
    ["parking_space", "Parking space", [["any_off_street", "Any off-street"], ["covered", "Covered"]]],
    ["ev_charging", "EV charging"],
    ["pet_allowed", "Pet allowed", [["cat", "Cat"], ["dog", "Dog"]]],
    ["individual_lease", "Individual lease"],
    ["roommate_matching_offered", "Roommate matching offered"],
    ["academic_term_lease", "Academic-term lease"],
    ["subletting_permitted", "Subletting permitted"],
    ["personal_guarantor_optional", "Personal guarantor optional"],
    ["shared_co_op_meals", "Shared co-op meals"],
  ]),
  ...topic("Access features", [
    ["step_free_route_to_my_unit", "Step-free route to my unit"],
    ["step_free_laundry_access", "Step-free laundry access"],
    ["roll_in_shower", "Roll-in shower"],
  ]),
]

export const FACTOR_BY_ID: ReadonlyMap<string, Factor> = new Map(CATALOG.map(factor => [factor.id, factor]))
const starters = [
  'commute_to_my_pin', 'private_bedroom', 'apartment_size', 'private_bathroom',
  'laundry', 'furnished', 'air_conditioning', 'heat_included',
]
const extras: Record<TravelMode, string[]> = {
  walk: [],
  bike: ['indoor_bike_storage'],
  bus: ['one_seat_ride_to_my_pin', 'short_walk_to_my_bus_stop'],
  car: ['parking_space', 'ev_charging'],
}

export function suggestions(mode?: TravelMode): Factor[] {
  return [...starters, ...(mode ? extras[mode] : [])].map(id => FACTOR_BY_ID.get(id)!)
}

export function placementLabel(placement: Placement, mode?: TravelMode): string {
  const factor = FACTOR_BY_ID.get(placement.id)!
  const setting = factor.options.find(option => option.value === placement.value)?.label
  const travel = factor.id === 'commute_to_my_pin' && mode ? TRAVEL_LABELS[mode] : null
  return [factor.label, travel, setting].filter(Boolean).join(' · ')
}

export function acceptsValue(id: string, value: unknown): value is Value {
  const factor = FACTOR_BY_ID.get(id)
  if (!factor) return false
  return factor.options.length ? factor.options.some(option => option.value === value) : value === true
}

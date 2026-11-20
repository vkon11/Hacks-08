// Floor-plan matcher: PreferenceProfileV1 + housing data -> ranked top 10 with reasons.
// Deterministic, no ML. Steps: budget cap -> hard rules (require/forbid) -> soft weighted score -> top k.
// Unknown facts never count as a match or a violation: hard rules on unknowns become "confirm" items and a small
// penalty; soft weights give unknowns a fraction of the credit so documented places rank above undocumented ones.
import type { PreferenceProfileV1, TravelMode, WeightedFactor } from '../model/types.ts'

export interface FactorFact { state: 'true' | 'false' | 'known' | 'conflict' | 'unknown'; value?: number; text?: string; building_claim?: boolean }
export interface Price { rent_min: number | null; rent_max: number | null; basis: string; frequency: string; type: string; source_url: string }
export interface Plan { name: string; bedrooms: number | null; bathrooms: number | null; square_feet: number | null; prices: Price[] }
export interface Property {
  id: string; key: string; name: string; street: string | null; latitude: number | null; longitude: number | null
  property_type: string | null; official_website: string | null; floor_plans: Plan[]; unlinked_prices: Price[]
  factors: Record<string, FactorFact>
}
export type Truth = boolean | null   // null = unknown

export interface Match {
  propertyId: string; title: string; planName: string; url: string
  monthlyPerPerson: number | null; commuteMinutes: number | null; score: number
  matched: string[]; missed: string[]; confirm: string[]; reason: string
}

const UNKNOWN_CREDIT = 0.3          // share of a soft weight credited when the fact is unknown
const CONFIRM_PENALTY = 0.08        // per unverified hard rule, on a 0-1 score
const COMMUTE_TIEBREAK = 0.15       // max share of score from commute when the student didn't place a commute card

// Straight-line x detour at typical speeds (m/min). Bus adds a fixed walk + wait allowance. Estimates, labeled as such.
const SPEED: Record<TravelMode, number> = { walk: 80, bike: 250, car: 400, bus: 250 }
const DETOUR: Record<TravelMode, number> = { walk: 1.3, bike: 1.3, car: 1.4, bus: 1.4 }
const BUS_OVERHEAD = 8

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = (d: number) => (d * Math.PI) / 180
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(a))
}

export function commuteMinutes(p: Property, lat: number, lng: number, mode: TravelMode): number | null {
  if (p.latitude == null || p.longitude == null) return null
  const m = haversineM(p.latitude, p.longitude, lat, lng) * DETOUR[mode]
  return Math.round((m / SPEED[mode] + (mode === 'bus' ? BUS_OVERHEAD : 0)) * 10) / 10
}

/** Monthly cost per person for a plan. Per-unit prices split across bedrooms (the profile budget is per person).
 *  Unknown basis is treated as per person: the conservative reading for a budget cap. */
export function perPersonPrice(plan: Plan): number | null {
  const p = plan.prices.find(x => x.rent_min != null || x.rent_max != null)
  if (!p) return null
  const rent = p.rent_min ?? p.rent_max!
  if (p.basis === 'per_unit') return Math.round(rent / Math.max(1, plan.bedrooms ?? 1))
  return rent
}

const bool = (f?: FactorFact): Truth => (f?.state === 'true' ? true : f?.state === 'false' ? false : null)
const atMost = (v: number | undefined, limit: number): Truth => (v == null ? null : v <= limit)

// Board factor id -> data factor key, for plain yes/no factors.
const SAME: Record<string, string> = {
  private_bedroom: 'private_bedroom', private_bathroom: 'private_bathroom', separate_living_room: 'separate_living_room',
  separate_dining_room: 'separate_dining_room', bonus_room_or_den: 'bonus_room_den', walk_in_closet: 'walk_in_closet',
  extra_storage_locker: 'storage_locker', desk_included: 'desk_included', bedroom_has_an_exterior_window: 'bedroom_exterior_window',
  private_entrance: 'private_entrance', air_conditioning: 'air_conditioning', dishwasher: 'dishwasher', full_oven: 'full_oven',
  internet_included: 'internet_included', bedroom_ethernet: 'bedroom_ethernet', free_laundry: 'free_laundry',
  smoke_free_building: 'smoke_free', lock_on_bedroom_door: 'bedroom_door_lock', heat_included: 'heat_included',
  gym_in_building: 'gym', study_room_in_building: 'study_room', free_printing: 'free_printing', package_locker: 'package_locker',
  indoor_bike_storage: 'indoor_bike_storage', elevator: 'elevator', controlled_building_entry: 'controlled_entry', pool: 'pool',
  hot_tub: 'hot_tub', yoga_or_fitness_studio: 'fitness_studio', resident_lounge: 'resident_lounge', trash_chute: 'trash_chute',
  '24_hour_maintenance_contact': 'maintenance_24h', ev_charging: 'ev_charging', individual_lease: 'individual_lease',
  roommate_matching_offered: 'roommate_matching', academic_term_lease: 'academic_term_lease', subletting_permitted: 'subletting_permitted',
  personal_guarantor_optional: 'guarantor_optional', shared_co_op_meals: 'coop_meals', step_free_route_to_my_unit: 'step_free_to_unit',
  step_free_laundry_access: 'step_free_laundry', roll_in_shower: 'roll_in_shower',
  // Settings the data can't distinguish (balcony vs patio, cat vs dog, bedroom vs whole-unit furniture) use the yes/no fact.
  private_outdoor_space: 'private_outdoor_space', furnished: 'furnished', pet_allowed: 'pets_allowed',
}

const HOME_TYPE: Record<string, string> = { house: 'house', apartment: 'apartment_building', duplex: 'small_multi_unit_house', townhouse: 'small_multi_unit_house' }
const SURFACE: Record<string, string> = { carpet: 'carpet', hardwood: 'hard_surface', tile: 'hard_surface', wood_plank: 'hard_surface', vinyl: 'hard_surface' }
const OUTDOOR: Record<string, string> = { courtyard: 'courtyard', rooftop: 'rooftop_terrace', bbq: 'bbq_area' }

/** Is this factor's condition (id = value) true for this property and floor plan? null when the data can't say. */
export function evaluate(id: string, value: unknown, p: Property, plan: Plan, profile: PreferenceProfileV1): Truth {
  const f = p.factors
  const { lat, lng } = profile.idealLocation
  switch (id) {
    case 'commute_to_my_pin': return atMost(commuteMinutes(p, lat, lng, profile.rankedTravelModes[0]) ?? undefined, Number(value))
    case 'grocery_store_nearby': return atMost(f.grocery_nearby?.value, Number(value))
    case 'short_walk_to_my_bus_stop': return atMost(f.short_walk_bus_stop?.value, Number(value))
    case 'campus_library_nearby': return atMost(f.library_nearby?.value, Number(value))
    case 'campus_gym_nearby': return atMost(f.campus_gym_nearby?.value, Number(value))
    case 'one_seat_ride_to_my_pin': return null   // needs per-pin transit lookup (one_seat_routes); not in the static export
    case 'private_bedroom': return plan.bedrooms != null && plan.bedrooms <= 1 ? true : bool(f.private_bedroom)   // studio/1BR
    case 'apartment_size': return plan.square_feet != null ? plan.square_feet >= Number(value) : null
    case 'bedroom_size': return f.bedroom_size?.value != null ? f.bedroom_size.value >= Number(value) : null
    case 'bedroom_count': {
      if (plan.bedrooms == null) return null
      return value === 'one' ? plan.bedrooms === 1 : value === 'two' ? plan.bedrooms === 2 : plan.bedrooms >= 3
    }
    case 'whole_place_to_myself': {
      if (plan.bedrooms == null) return null
      const perUnit = plan.prices.some(x => x.basis === 'per_unit')
      if (!perUnit) return null
      return value === 'studio' ? plan.bedrooms === 0 : plan.bedrooms <= 1
    }
    case 'laundry': {
      const t = f.laundry?.text
      if (!t) return null
      return value === 'in_unit' ? t === 'in_unit' : t === 'in_unit' || t === 'in_building'
    }
    case 'type_of_home': return p.property_type && HOME_TYPE[p.property_type] ? HOME_TYPE[p.property_type] === value : null
    case 'bedroom_floor_surface': return f.bedroom_floor_surface?.text ? SURFACE[f.bedroom_floor_surface.text] === value : null
    case 'outdoor_hangout': {
      const t = f.outdoor_hangout?.text
      return t ? OUTDOOR[t] === value : bool(f.outdoor_hangout) === false ? false : null
    }
    case 'parking_space': return value === 'any_off_street' ? bool(f.parking_space) : null
    case 'floor_level': return null   // unit floor is rarely published
    default: return SAME[id] ? bool(f[SAME[id]]) : null
  }
}

function label(id: string, value: unknown): string {
  const nice = id.replace(/_/g, ' ').replace(/^24 hour/, '24-hour')
  return typeof value === 'string' ? `${nice} (${value.replace(/_/g, ' ')})` : typeof value === 'number' ? `${nice} ≤ ${value}` : nice
}

export function rank(profile: PreferenceProfileV1, properties: Property[], k = 10): Match[] {
  const budget = profile.budget.maxMonthlyCents / 100
  const hard = profile.factors.filter(x => x.rule !== 'soft')
  const soft = profile.factors.filter((x): x is WeightedFactor & { signedWeight: number } => x.rule === 'soft' && x.signedWeight != null)
  const softTotal = soft.reduce((s, x) => s + Math.abs(x.signedWeight), 0)
  const commutePlaced = profile.factors.some(x => x.id === 'commute_to_my_pin')
  const mode = profile.rankedTravelModes[0]
  const best = new Map<string, Match>()

  for (const p of properties) {
    const commute = commuteMinutes(p, profile.idealLocation.lat, profile.idealLocation.lng, mode)
    const plans = p.floor_plans.length ? p.floor_plans : [{ name: 'Listed price', bedrooms: null, bathrooms: null, square_feet: null, prices: p.unlinked_prices }]
    for (const plan of plans) {
      const price = perPersonPrice(plan)
      if (price != null && budget > 0 && price > budget) continue                  // hard budget cap
      const confirm: string[] = []
      let excluded = false
      for (const r of hard) {
        const t = evaluate(r.id, r.value, p, plan, profile)
        if (t === null) confirm.push(label(r.id, r.value))
        else if ((r.rule === 'require' && !t) || (r.rule === 'forbid' && t)) { excluded = true; break }
      }
      if (excluded) continue
      if (price == null) confirm.push('price')

      const matched: string[] = [], missed: string[] = []
      let soft01 = 0.5
      if (softTotal > 0) {
        let s = 0
        for (const w of soft) {
          const t = evaluate(w.id, w.value, p, plan, profile)
          const credit = t === true ? 1 : t === false ? 0 : UNKNOWN_CREDIT
          s += w.signedWeight * credit
          if (t === true && w.signedWeight > 0) matched.push(label(w.id, w.value))
          if (t === true && w.signedWeight < 0) missed.push(label(w.id, w.value))
        }
        soft01 = (s + softTotal) / (2 * softTotal)   // map [-total, +total] to [0, 1]
      }
      const commute01 = commute == null ? 0.3 : Math.max(0, 1 - commute / 60)
      const score = (commutePlaced ? soft01 : soft01 * (1 - COMMUTE_TIEBREAK) + commute01 * COMMUTE_TIEBREAK) - CONFIRM_PENALTY * confirm.length

      const prev = best.get(p.id)
      if (prev && prev.score >= score) continue
      const parts = [
        price != null ? `$${price.toLocaleString('en-US')}/person` : 'Price not published',
        commute != null ? `~${Math.round(commute)} min by ${mode} (estimate)` : null,
        matched.length ? `Has: ${matched.slice(0, 4).join(', ')}` : null,
        missed.length ? `Has what you'd avoid: ${missed.join(', ')}` : null,
      ].filter(Boolean)
      best.set(p.id, {
        propertyId: p.id, title: p.name, planName: plan.name,
        url: p.official_website ?? plan.prices[0]?.source_url ?? p.unlinked_prices[0]?.source_url ?? '',
        monthlyPerPerson: price, commuteMinutes: commute, score: Math.round(score * 1000) / 1000,
        matched, missed, confirm, reason: parts.join(' · '),
      })
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score || (a.monthlyPerPerson ?? 1e9) - (b.monthlyPerPerson ?? 1e9)).slice(0, k)
}

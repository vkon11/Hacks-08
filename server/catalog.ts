// Map the nested research export to the same offer, option and layout records used by the matcher.
import { z } from 'zod'
import type { Fact, Inventory, MatchEvidence } from './inventory.ts'

type Fields = Record<string, unknown>
// Accept older research exports while exposing one AC presence flag to the matcher.
export const acPresenceSchema = z.union([
  z.boolean(),
  z.enum(['central', 'non_central', 'installed', 'none']).transform(value => value !== 'none')
])
const fields = (value: unknown): Fields =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Fields) : {}
const row = z.object({ id: z.string() }).catchall(z.unknown())
const planRow = row.extend({ name: z.string().min(1), offers: z.array(row) })
export function isApartmentLayout(name: string) {
  return !/\b(?:(?:entire|whole|full)\s+house|single[- ]family\s+(?:home|house)|townhouses?|townhomes?|duplex(?:es)?)\b/i.test(name)
}

export function layoutKey(name: string, beds: number | undefined, baths: number | undefined, area: number | undefined, publishedArea: boolean) {
  const label = name.toLowerCase().trim()
  const counts = label.match(/^(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)$/)
    ?? label.match(/^(\d+)\s*[- ]?\s*(?:bedrooms?|beds?|br|b)(?:\s*[/, -]*\s*(\d+(?:\.\d+)?)\s*(?:bathrooms?|baths?|ba))?$/)
  const generic = (counts && Number(counts[1]) === beds && (!counts[2] || Number(counts[2]) === baths))
    || (beds === 0 && /^studio(?: apartment)?$/.test(label))
  // A generic label is interchangeable only when the published physical details agree.
  // Named variants retain their identity even when their dimensions match.
  const identity = generic && publishedArea && area !== undefined && baths !== undefined
    ? 'generic'
    : label.replace(/[^a-z0-9]+/g, ' ').trim()
  return JSON.stringify([identity, beds, baths, area])
}

const catalogSchema = z.object({
  templateVersion: z.literal(2),
  apartments: z.array(
    row.extend({
      floorPlans: z.array(z.union([planRow, z.object({ state: z.literal('listed_under_related_property') })]))
    })
  )
})
const string = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)
const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)
const bool = (value: unknown) => (typeof value === 'boolean' ? value : undefined)
const cents = (usd: unknown) =>
  typeof usd === 'number' && Number.isFinite(usd) && usd >= 0 ? Math.round(usd * 100) : undefined
function word<T extends string>(value: unknown, allowed: readonly T[]) {
  return allowed.find((item) => item === value)
}
function url(value: unknown) {
  const candidate = string(value)
  if (!candidate || !URL.canParse(candidate)) return undefined
  const parsed = new URL(candidate)
  return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password
    ? candidate
    : undefined
}
const first = <T>(items: (T | undefined)[]) => items.find((item) => item !== undefined)
type Source = { sourceUrl: string; checkedAt: string }
function source(value: unknown, fallback: Source): Source {
  const data = fields(value)
  return {
    sourceUrl: url(data.sourceUrl) ?? fallback.sourceUrl,
    checkedAt: string(data.checkedAt) ?? fallback.checkedAt
  }
}
const description = (value: unknown) => string(value)?.slice(0, 4000)

export function normalizeCatalog(input: unknown): Inventory {
  const catalog = catalogSchema.parse(input)
  const result: Inventory = {
    schemaVersion: 1,
    inventoryVersion: 'catalog-v2',
    buildings: [],
    layouts: [],
    options: [],
    offers: [],
    evidence: []
  }
  const evidence = new Map<string, MatchEvidence>()
  function add(id: string, label: string, text: string, ref: Source) {
    if (!evidence.has(id)) evidence.set(id, { id, label, text: text.slice(0, 4000), ...ref })
    return id
  }

  function recordFacts(recordId: string, ref: Source, meta: Fields, estimates: Fields, title?: unknown) {
    const titleEvidence = fields(title)
    function fieldFact<T>(
      key: string,
      value: T | undefined,
      label: string = key,
      fallbackTo?: string
    ): Fact<T> | undefined {
      if (value === undefined) return undefined
      const estimate = estimates[key] ?? (fallbackTo ? estimates[fallbackTo] : undefined)
      const entry = fields(meta[key] ?? (fallbackTo ? meta[fallbackTo] : undefined) ?? estimate)
      const isEstimate = Boolean(estimate)
      const titleQuote =
        Array.isArray(titleEvidence.fields) && titleEvidence.fields.includes(key)
          ? string(titleEvidence.text)
          : undefined
      const actual = typeof value === 'object' ? JSON.stringify(value) : String(value)
      const quote = string(entry.quote) ?? titleQuote
      const method = string(fields(estimate).method)?.replaceAll('_', ' ')
      const summary =
        (isEstimate ? 'Catalog estimate' : 'Catalog field') +
        ' · ' +
        label +
        ' = ' +
        actual +
        (method ? ' (' + method + ')' : '') +
        (quote ? '. Source excerpt: ' + quote : '')
      const evidenceId = add(
        recordId + '/' + key,
        (isEstimate ? 'Estimated ' : '') + label,
        summary,
        source(entry, ref)
      )
      return {
        state: 'known',
        value,
        evidenceIds: [evidenceId],
        ...(isEstimate ? { estimated: true as const } : {})
      }
    }
    return fieldFact
  }

  for (const building of catalog.apartments) {
    if (building.propertyType !== 'apartment') continue
    const plans = building.floorPlans.flatMap((plan) =>
      'id' in plan && isApartmentLayout(plan.name) ? [plan] : []
    )
    if (!plans.length) continue
    const firstPlan = plans[0],
      firstOffer = firstPlan.offers[0]
    const buildingUrl = first([url(building.officialWebsite), url(firstPlan.viewUrl), url(firstOffer?.sourceUrl)])
    if (!buildingUrl) throw new Error('Missing building reference for ' + building.id)
    const buildingSource: Source = source(building.descriptionEvidence, {
      sourceUrl: buildingUrl,
      checkedAt: 'Unpublished'
    })
    const buildingText = description(building.description)
    const buildingEvidence: string[] = []
    if (buildingText)
      buildingEvidence.push(
        add(building.id + '/description', 'Building description', buildingText, buildingSource)
      )
    const propertyFacts = fields(building.verifiedPropertyFacts)
    for (const [key, detail] of Object.entries(propertyFacts)) {
      const quote = string(fields(detail).quote)
      if (quote)
        buildingEvidence.push(
          add(building.id + '/property/' + key, 'Building listing · ' + key, quote, source(detail, buildingSource))
        )
    }
    const point = fields(building.residentialEntrance)
    const lat = number(point.lat),
      lng = number(point.lng)
    const geoMethod = fields(fields(building.estimatedFields).propertyCoordinates).method
    // A community center or postal centroid cannot stand in for a student's residential entrance.
    const specificAddress =
      !building.addressRole && !['postal_center', 'campus_default'].includes(String(geoMethod))
    const bFact = recordFacts(
      building.id,
      buildingSource,
      fields(building.fieldEvidence),
      fields(building.estimatedFields)
    )
    result.buildings.push({
      id: building.id,
      propertyType: 'apartment',
      name: string(building.name)!,
      address: string(building.address)!,
      description: buildingText,
      entrance: bFact(
        'residentialEntrance',
        specificAddress && lat !== undefined && lng !== undefined ? { lat, lng } : undefined,
        'Residential entrance'
      ),
      evidenceIds: buildingEvidence,
      officialUrls: [buildingUrl]
    })

    const sameLayout = new Map<string, string>()
    for (const plan of plans) {
      const planUrl = url(plan.viewUrl) ?? url(plan.floorPlanUrl) ?? buildingUrl
      const desc = description(plan.description)
      const firstLease = plan.offers[0]
      const planSource = { sourceUrl: planUrl, checkedAt: string(firstLease?.checkedAt) ?? 'Unpublished' }
      const meta = fields(plan.fieldEvidence),
        estimates = fields(plan.estimatedFields)
      const planFact = recordFacts(plan.id, planSource, meta, estimates, plan.titleEvidence)
      const descSource = source(plan.descriptionEvidence ?? meta.description, planSource)
      const refs = desc ? [add(plan.id + '/description', 'Floor-plan description', desc, descSource)] : []
      const name = plan.name.trim()
      const beds = number(plan.bedrooms)
      // A room listing's bedroom count can describe only the room. A one-bed assumption cannot establish solo occupancy.
      const unitBeds = plan.sourceRoomListingMeasurements && beds === 1 && estimates.bedrooms ? undefined : beds
      const baths = number(plan.bathrooms)
      const area = number(fields(plan.requirements).apartmentSqFt)
      const groupKey = layoutKey(name, beds, baths, area, !estimates.apartmentSqFt && !estimates.bedrooms && !estimates.bathrooms)
      const groupId = sameLayout.get(groupKey) ?? plan.id
      sameLayout.set(groupKey, groupId)
      result.layouts.push({
        id: plan.id,
        buildingId: building.id,
        groupId,
        name,
        description: desc,
        planUrl,
        beds: planFact('bedrooms', unitBeds, 'Bedrooms'),
        baths: planFact('bathrooms', baths, 'Bathrooms'),
        evidenceIds: refs,
        officialUrls: [planUrl]
      })
      for (const offer of plan.offers) {
        const ref = {
          sourceUrl: url(offer.sourceUrl) ?? planUrl,
          checkedAt: string(offer.checkedAt) ?? 'Unpublished'
        }
        const verified = cents(offer.verifiedMonthlyTotalPerPersonUsd),
          estimated = cents(offer.estimatedMonthlyTotalPerPersonUsd)
        const offerEstimates = fields(offer.estimatedFields)
        const rentMethod = fields(offerEstimates.monthlyRentPerPersonMinUsd).method
        const usesPerPersonRate = rentMethod === 'imported_per_person_rate' || rentMethod === 'corrected_room_price_basis'
        const priceConflict =
          Boolean(offer.sourceScopeConflict) ||
          [
            'whole_unit_share',
            'mixed_household_and_room_prices',
            'probable_bed_rate',
            'imported_rate_review',
            'advertised_total_scope_conflict'
          ].includes(String(rentMethod)) ||
          (fields(offer.originalPriceQuote).basis === 'per_unit' &&
            verified === undefined &&
            !usesPerPersonRate &&
            !number(offer.verifiedOccupantsForWholeUnitPrice))
        const rateMeta = { total: offer.priceEvidence, base: offer.priceEvidence, fees: offer.feeEvidence }
        const rateFact = recordFacts(offer.id, ref, rateMeta, {
          total:
            verified === undefined
              ? (offerEstimates.estimatedMonthlyTotalPerPersonUsd ?? { method: 'per_person_estimate' })
              : undefined,
          base: offerEstimates.monthlyRentPerPersonMinUsd,
          fees: offerEstimates.mandatoryMonthlyFeesPerPersonUsd
        })
        const total = rateFact('total', verified ?? estimated, 'Monthly total per person in cents')
        const requirements = fields(plan.requirements),
          override = fields(offer.requirementOverrides)
        const values = { ...requirements, ...override },
          overrideMeta = fields(offer.requirementOverrideEvidence)
        function reqFact<T>(
          key: string,
          value: T | undefined,
          label?: string,
          group?: string
        ): Fact<T> | undefined {
          if (key in override || (group && group in override))
            return recordFacts(offer.id, ref, overrideMeta, {})(key, value, label, group)
          return planFact(key, value, label, group)
        }
        const petPolicy = fields(values.pets)
        const species = (key: 'cat' | 'dog') =>
          !('pets' in override) && fields(estimates['pets.' + key]).method === 'permission_unconfirmed_default'
            ? undefined
            : bool(petPolicy[key])
        const cat = reqFact('pets.cat', species('cat'), 'Cats allowed', 'pets'),
          dog = reqFact('pets.dog', species('dog'), 'Dogs allowed', 'pets')
        const policy = [cat, dog].flatMap((item) => (item?.state === 'known' ? [item] : []))
        const parking = fields(values.onsiteParking)
        const obtainable = reqFact(
          'onsiteParking.obtainable',
          bool(parking.obtainable),
          'Parking obtainable',
          'onsiteParking'
        )
        const parkingCost = reqFact(
          'onsiteParking.monthlyUsd',
          cents(parking.monthlyUsd),
          'Monthly parking in cents',
          'onsiteParking'
        )
        const included = reqFact(
          'onsiteParking.includedInMonthlyTotal',
          bool(parking.includedInMonthlyTotal),
          'Parking included',
          'onsiteParking'
        )
        const parkingParts = [obtainable, parkingCost, included]
        const room = string(offer.roomOption) ?? string(plan.name)!
        result.options.push({
          id: offer.id,
          layoutId: plan.id,
          name: room,
          apartmentSqFt: reqFact('apartmentSqFt', number(values.apartmentSqFt), 'Apartment square footage'),
          roomSqFt: reqFact('roomSqFt', number(values.roomSqFt), 'Bedroom square footage'),
          bedroomOccupancy: reqFact('bedroomOccupancy', number(values.bedroomOccupancy), 'Bedroom occupants'),
          privateBathroom: reqFact('privateBathroom', bool(values.privateBathroom), 'Private bathroom'),
          ac: reqFact(
            'ac',
            acPresenceSchema.safeParse(values.ac).data,
            'Air conditioning'
          ),
          laundry: reqFact(
            'laundry',
            word(values.laundry, ['in_unit', 'in_building', 'none'] as const),
            'Laundry'
          ),
          heating: reqFact('heating', bool(values.heating), 'Installed heating'),
          furnishedBedroom: reqFact('furnishedBedroom', bool(values.furnishedBedroom), 'Furnished bedroom'),
          // Even an accessible front door cannot establish an uninterrupted route to the room or laundry.
          stepFreeUnit: reqFact(
            'stepFreeUnit',
            estimates.stepFreeUnit && !('stepFreeUnit' in override) ? undefined : bool(values.stepFreeUnit),
            'Step-free route to unit'
          ),
          stepFreeLaundry: reqFact(
            'stepFreeLaundry',
            estimates.stepFreeLaundry && !('stepFreeLaundry' in override)
              ? undefined
              : bool(values.stepFreeLaundry),
            'Step-free route to laundry'
          ),
          pets: policy.length
            ? {
                state: 'known',
                value: {
                  cat: cat?.state === 'known' ? cat.value : null,
                  dog: dog?.state === 'known' ? dog.value : null,
                  catEstimated: cat?.state === 'known' && Boolean(cat.estimated),
                  dogEstimated: dog?.state === 'known' && Boolean(dog.estimated)
                },
                evidenceIds: policy.flatMap((item) => item.evidenceIds),
                ...(policy.some((item) => item.estimated) ? { estimated: true as const } : {})
              }
            : undefined
        })
        // Preserve offer-specific room choices. A shared and a private room may have different terms under the same plan.
        result.offers.push({
          id: offer.id,
          optionId: offer.id,
          name: room,
          ...ref,
          requiredOccupants: number(offer.requiredOccupantsForAdvertisedPerPersonPrice),
          listedAvailabilityStatus: string(offer.listedAvailabilityStatus),
          scopeQualification: string(offer.scopeQualification),
          monthlyTotalCents: priceConflict
            ? { state: 'conflicting', evidenceIds: total?.evidenceIds ?? [] }
            : total,
          monthlyBaseCents: priceConflict
            ? undefined
            : rateFact('base', cents(offer.monthlyRentPerPersonMinUsd), 'Monthly base per person in cents'),
          mandatoryMonthlyFeesCents: priceConflict
            ? undefined
            : rateFact(
                'fees',
                cents(offer.mandatoryMonthlyFeesPerPersonUsd),
                'Mandatory monthly fees per person in cents'
              ),
          onsiteParking:
            obtainable?.state === 'known'
              ? {
                  state: 'known',
                  value: {
                    obtainable: obtainable.value,
                  availabilityEstimated: Boolean(obtainable.estimated),
                    monthlyCents: parkingCost?.state === 'known' ? parkingCost.value : null,
                    includedInMonthlyTotal: included?.state === 'known' ? included.value : null
                  },
                  evidenceIds: parkingParts.flatMap((item) => item?.evidenceIds ?? []),
                  ...(parkingParts.some((item) => item?.state === 'known' && item.estimated)
                    ? { estimated: true as const }
                    : {})
                }
              : undefined,
          heatIncluded: reqFact('heatIncluded', bool(values.heatIncluded), 'Heat included in rent'),
          availableFrom: string(offer.availableFrom) ?? null,
          availableUntil: string(offer.availableUntil) ?? null
        })
      }
    }
  }
  result.evidence = [...evidence.values()]
  return result
}

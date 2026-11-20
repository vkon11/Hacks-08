import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { loadInventory, parseInventory, resolveInventoryPath } from '../server/inventory'
import { filterInventory } from '../server/matching'
import type { SearchSetup } from '../src/ideal/contracts'

const origin = 'https://example.org'
const request: SearchSetup = {
  maxMonthlyCents: 110_000,
  householdSize: 2,
  pin: { lat: 42.27, lng: -83.74, source: 'map', label: 'Pin', landmarkId: null },
  travelModes: ['walk', 'bike', 'bus', 'car'],
  choices: {}
}
function offer(id: string, price: number, extras: Record<string, unknown> = {}) {
  return {
    id,
    roomOption: id,
    sourceUrl: origin + '/offer/' + id,
    checkedAt: '2026-11-20',
    verifiedMonthlyTotalPerPersonUsd: price,
    requirementOverrides: { state: 'inherits_floor_plan' },
    ...extras
  }
}
function plan(id: string, offers: ReturnType<typeof offer>[], extras: Record<string, unknown> = {}) {
  return {
    id,
    name: id,
    description: 'Open common room',
    bedrooms: 2,
    bathrooms: 2,
    viewUrl: origin + '/plan/' + id,
    requirements: { bedroomOccupancy: 1, apartmentSqFt: 920, ac: 'central', heatIncluded: true },
    offers,
    ...extras
  }
}
function catalog(plans: ReturnType<typeof plan>[], building: Record<string, unknown> = {}) {
  return parseInventory({
    templateVersion: 2,
    apartments: [
      {
        id: 'building',
        name: 'Apartment Building',
        propertyType: 'apartment',
        address: '1 Test Street',
        description: 'Courtyard',
        residentialEntrance: { lat: 42.273, lng: -83.751 },
        estimatedFields: { residentialEntrance: { method: 'address_point_as_entrance' } },
        floorPlans: plans,
        ...building
      },
      { id: 'alias-building', floorPlans: [{ state: 'listed_under_related_property' }] }
    ]
  })
}

test('only apartment properties and apartment layouts enter the matcher', async () => {
  const apartment = plan('Apartment', [offer('Apartment offer', 900)])
  const house = plan('Apt 1 – Entire House', [offer('House offer', 850)])
  const underApartment = await filterInventory(catalog([apartment, house]), request)
  assert.deepEqual(underApartment.candidates.map(candidate => candidate.offer.id), ['Apartment offer'])

  for (const propertyType of ['house', 'duplex', 'townhouse', 'co_op', 'university', 'other']) {
    const typed = await filterInventory(catalog([apartment], { propertyType }), request)
    assert.equal(typed.qualifiedLayouts, 0, propertyType)
  }
})

test('catalog filters individual per-person offers and preserves the matching room, description and link', async () => {
  const item = plan('A', [
    offer('shared', 800, { requirementOverrides: { bedroomOccupancy: 2 } }),
    offer('private', 1082.07),
    offer('over', 1130),
    offer('sold', 840, { listedAvailabilityStatus: 'sold_out' }),
    offer('incorrect group', 925, { requiredOccupantsForAdvertisedPerPersonPrice: 4 })
  ])
  const inventory = catalog([item, plan('solo', [offer('solo rate', 850)], { bedrooms: 1 })])
  const found = await filterInventory(inventory, {
    ...request,
    choices: { bedroom: { value: 'private', required: true } }
  })
  assert.equal(found.qualifiedLayouts, 1)
  const [candidate] = found.candidates
  assert.deepEqual(
    found.candidates.map((c) => c.offer.id),
    ['private']
  )
  assert.equal(candidate.monthlyCents, 108207)
  assert.equal(candidate.priceEstimated, false)
  assert.equal(candidate.layout.planUrl, origin + '/plan/A')
  assert.equal(candidate.layout.description, 'Open common room')
  assert.equal(candidate.building.description, 'Courtyard')
  assert.ok(candidate.evidence['A/description'])
})

test('floor-plan aliases preserve exact room offers and keep named variants distinct', async () => {
  const found = await filterInventory(
    catalog([
      plan('listed', [offer('rate one', 880)], { name: '2BR - A' }),
      plan('official', [offer('rate two', 870)], { name: '2BR – A' }),
      plan('different', [offer('rate three', 850)], { name: '2BR – A', bathrooms: 1 }),
      plan('two-bedrooms', [offer('private two-bedroom', 920)], { name: '2 Bedrooms' }),
      plan('2x2', [offer('shared two-bedroom', 895)], { name: '2x2' }),
      plan('named variant', [offer('balcony room', 990)], { name: '2x2 with balcony' })
    ]),
    request
  )
  assert.equal(found.qualifiedLayouts, 4)
  assert.deepEqual(
    found.candidates.map((c) => c.layout.id),
    ['listed', 'listed', 'different', 'two-bedrooms', 'two-bedrooms', 'named variant']
  )
})

test('estimated totals under the cap stay provisional, and contradictory pricing or unresolved requirements cannot qualify', async () => {
  const estimate = {
    verifiedMonthlyTotalPerPersonUsd: { state: 'not_verified' },
    estimatedMonthlyTotalPerPersonUsd: 1030,
    originalPriceQuote: { basis: 'per_unit', rent_min: 1000 },
    monthlyRentPerPersonMinUsd: 1000,
    mandatoryMonthlyFeesPerPersonUsd: 30,
    estimatedFields: {
      estimatedMonthlyTotalPerPersonUsd: { method: 'base_plus_estimated_fees' },
      monthlyRentPerPersonMinUsd: { method: 'imported_per_person_rate' },
      mandatoryMonthlyFeesPerPersonUsd: { method: 'comparable_fixed_fees' }
    }
  }
  const items = [
    plan(
      'estimated',
      [
        offer('under', 0, estimate),
        offer('ambiguous', 0, { ...estimate, sourceScopeConflict: {} }),
        offer('above', 0, { ...estimate, monthlyRentPerPersonMinUsd: 1080, estimatedMonthlyTotalPerPersonUsd: 1110 }),
        offer('old-split', 0, {
          ...estimate,
          estimatedOccupantsForWholeUnitPrice: 2,
          monthlyRentPerPersonMinUsd: 500,
          estimatedMonthlyTotalPerPersonUsd: 530,
          estimatedFields: { monthlyRentPerPersonMinUsd: { method: 'whole_unit_share' } }
        })
      ],
      {
        estimatedFields: {
          ac: { method: 'property_description_scope' },
          stepFreeUnit: { method: 'route_unconfirmed_default' },
          'pets.cat': { method: 'permission_unconfirmed_default' }
        },
        requirements: { ac: 'central', stepFreeUnit: false, pets: { cat: false, dog: true } }
      }
    )
  ]
  const inventory = catalog(items)
  const filtered = await filterInventory(inventory, {
    ...request,
    choices: { ac: { value: 'installed', required: true } }
  })
  assert.deepEqual(
    filtered.candidates.map((c) => c.offer.id),
    ['under']
  )
  const [match] = filtered.candidates
  assert.equal(match.priceEstimated, true)
  assert.equal(match.monthlyCents, 103_000)
  assert.ok(match.provisionalReasons.some((text) => text.includes('Air conditioning')))
  assert.deepEqual(
    filtered.needsConfirmation.map((p) => p.offerId),
    ['ambiguous', 'above', 'old-split']
  )
  for (const choices of [
    { stepFreeUnit: { value: 'step_free', required: true } },
    { pets: { value: 'cat', required: true } }
  ]) {
    const access = await filterInventory(inventory, { ...request, choices })
    assert.equal(access.qualifiedLayouts, 0)
    assert.ok(access.needsConfirmation.some((o) => o.offerId === 'under'))
  }
})

test('a required commute uses the student pin and first travel mode; centroid routes stay unresolved', async () => {
  const setup = { ...request, choices: { commute: { value: '20', required: true } } }
  const items = [plan('commute', [offer('short trip', 800)])]
  const lookup = async (point: { lat: number; lng: number }, current: SearchSetup) => {
    assert.equal(point.lat, 42.273)
    assert.equal(current.pin, setup.pin)
    assert.equal(current.travelModes[0], 'walk')
    return { minutes: 18, basis: 'Walking route', checkedAt: '2026-11-20', sourceUrl: origin }
  }
  const near = await filterInventory(catalog(items), setup, lookup)
  assert.equal(near.qualifiedLayouts, 1)
  assert.ok(near.candidates[0].provisionalReasons.some((reason) => reason.includes('commute')))
  const vague = await filterInventory(
    catalog(items, { estimatedFields: { propertyCoordinates: { method: 'postal_center' } } }),
    setup,
    lookup
  )
  assert.equal(vague.qualifiedLayouts, 0)
  assert.match(vague.needsConfirmation[0].reasons.join(' '), /Commute/)
})

test('the bundled enriched catalog is the default, including on installations with the older runtime path', async () => {
  assert.equal(resolveInventoryPath(), resolveInventoryPath('data/runtime/inventory.json'))
  const [feed, same] = await Promise.all([loadInventory(), loadInventory('data/runtime/inventory.json')])
  assert.equal(feed, same)
  assert.ok(feed.layouts.length > 1500)
  assert.ok(feed.layouts.every((layout) => layout.planUrl && layout.description))
  assert.ok(feed.offers.length > feed.layouts.length)
  assert.ok(feed.buildings.every((building) => building.description && building.propertyType === 'apartment'))
  assert.equal(feed.buildings.filter(building => building.name === 'Lurie Terrace').length, 1)
  const courtyards = feed.buildings.find(building => building.name === 'The Courtyards')!
  const plans = feed.layouts.filter(layout => layout.buildingId === courtyards.id)
  assert.deepEqual(plans.map(layout => layout.name), [
    '1 Bedroom', '2 Bedrooms', '3 Bedrooms - 1', '3 Bedrooms - 2', '4 Bedrooms'
  ])
  assert.equal(new Set(feed.layouts.map(layout => layout.groupId)).size, feed.layouts.length)
})

test('both bundled inventories return the Courtyards four-bedroom with AC, included heat and a private room', async () => {
  const setup: SearchSetup = {
    ...request, householdSize: 4, maxMonthlyCents: 150_000,
    choices: {
      ac: { required: true, value: 'installed' }, heat: { required: true, value: 'included' },
      bedroom: { required: true, value: 'private' }
    }
  }
  for (const path of ['data/apartment-inventory-template.json', 'data/runtime/inventory.json']) {
    const feed = parseInventory(JSON.parse(await readFile(path, 'utf8')))
    const found = await filterInventory(feed, setup)
    const match = found.candidates.find(candidate => candidate.building.name === 'The Courtyards')
    assert.ok(match, path)
    assert.ok(match.monthlyCents! <= setup.maxMonthlyCents)
    assert.equal(match.option.ac?.state === 'known' && match.option.ac.value, true)
  }
})

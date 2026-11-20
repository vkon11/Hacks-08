import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as model from '../src/model/index.ts'
import { evaluate, perPersonPrice, rank, type Property } from '../src/match/engine.ts'
import type { Placement, PreferenceProfileV1, TravelMode } from '../src/model/types.ts'

const properties: Property[] = JSON.parse(readFileSync(new URL('../data/export/properties.json', import.meta.url), 'utf8')).properties
const ross = { lat: 42.2730, lng: -83.7400, source: 'map', landmarkId: null, label: 'Ross School of Business' } as const
const north = { lat: 42.2913, lng: -83.7171, source: 'map', landmarkId: null, label: 'North Campus' } as const

function profile(placements: Placement[], dollars = 1500, pin: PreferenceProfileV1['idealLocation'] = ross, modes: TravelMode[] = ['walk', 'bus', 'bike', 'car']): PreferenceProfileV1 {
  return {
    schemaVersion: 1, weightPolicyVersion: 'category-rank-v1', catalogVersion: 'umich-factors-v1', profileId: 'test', status: 'complete',
    updatedAt: '2026-11-20T12:00:00.000Z', budget: { maxMonthlyCents: dollars * 100, currency: 'USD', basis: 'per_person' },
    idealLocation: pin, rankedTravelModes: modes, factors: model.weightedFactors(placements),
  }
}
const byId = new Map(properties.map(p => [p.id, p]))

test('returns at most ten places, each within the per-person budget when its price is known', () => {
  const top = rank(profile([]), properties)
  assert.ok(top.length > 0 && top.length <= 10)
  for (const m of top) if (m.monthlyPerPerson != null) assert.ok(m.monthlyPerPerson <= 1500, `${m.title} $${m.monthlyPerPerson}`)
})

test('never recommends a place that violates a known must-have or dealbreaker', () => {
  const p = profile([
    { id: 'laundry', value: 'in_unit', lane: 'must', starred: false },
    { id: 'pet_allowed', value: 'dog', lane: 'forbid', starred: false },
  ])
  for (const m of rank(p, properties, 50)) {
    const prop = byId.get(m.propertyId)!
    const plan = prop.floor_plans.find(x => x.name === m.planName) ?? prop.floor_plans[0]
    assert.notEqual(evaluate('laundry', 'in_unit', prop, plan, p), false, m.title)
    assert.notEqual(evaluate('pet_allowed', 'dog', prop, plan, p), true, m.title)
  }
})

test('unknown must-haves are listed to confirm, not treated as met', () => {
  const top = rank(profile([{ id: 'roll_in_shower', value: true, lane: 'must', starred: false }]), properties)
  assert.ok(top.every(m => m.confirm.some(c => c.includes('roll in shower'))))
})

test('changing an input changes the ranking: moving the pin to North Campus', () => {
  const central = rank(profile([]), properties).map(m => m.propertyId)
  const northTop = rank(profile([], 1500, north), properties).map(m => m.propertyId)
  assert.notDeepEqual(central, northTop)
})

test('changing an input changes the ranking: lowering the budget removes pricier places', () => {
  const rich = rank(profile([], 3000), properties, 50)
  const tight = rank(profile([], 900), properties, 50)
  assert.ok(tight.every(m => m.monthlyPerPerson == null || m.monthlyPerPerson <= 900))
  assert.notDeepEqual(rich.map(m => m.propertyId), tight.map(m => m.propertyId))
})

test('a starred want lifts places that have it', () => {
  const gym: Placement = { id: 'gym_in_building', value: true, lane: 'want', starred: true }
  const top = rank(profile([gym], 2500), properties)
  const withGym = top.filter(m => m.matched.some(x => x.includes('gym in building'))).length
  assert.ok(withGym >= 5, `only ${withGym} of top 10 have a gym`)
})

test('per-unit prices are split by bedrooms; per-person prices are not', () => {
  const plan = (basis: string, bedrooms: number) => ({ name: 'x', bedrooms, bathrooms: 1, square_feet: null,
    prices: [{ rent_min: 3000, rent_max: 3000, basis, frequency: 'monthly', type: 'range', source_url: '' }] })
  assert.equal(perPersonPrice(plan('per_unit', 3)), 1000)
  assert.equal(perPersonPrice(plan('per_person', 3)), 3000)
  assert.equal(perPersonPrice(plan('per_unit', 0)), 3000)
})

test('ranks the full dataset quickly', () => {
  const p = profile([
    { id: 'laundry', value: 'in_unit', lane: 'want', starred: true },
    { id: 'gym_in_building', value: true, lane: 'want', starred: false },
    { id: 'commute_to_my_pin', value: 15, lane: 'want', starred: true },
  ])
  const t0 = performance.now()
  for (let i = 0; i < 20; i++) rank(p, properties)
  const ms = (performance.now() - t0) / 20
  assert.ok(ms < 50, `${ms.toFixed(1)} ms per ranking`)
  console.log(`  ranking ${properties.length} properties: ${ms.toFixed(2)} ms`)
})

import { campusPlaces } from '../location/landmarks.ts'
import { isPlacementList, weightedFactors } from './board.ts'
import { DEFAULT_BUDGET, inBounds, isCompleteRanking, parseBudgetCents } from './inputs.ts'
import type { Draft, GuestRecord, IdealLocation, PreferenceProfileV1, Step } from './types.ts'

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function validLocation(value: unknown): value is IdealLocation {
  if (!isObject(value) || typeof value.lat !== 'number' || typeof value.lng !== 'number'
    || !inBounds(value.lat, value.lng) || typeof value.label !== 'string' || !value.label.trim()) return false
  if (value.source === 'landmark') {
    return campusPlaces.some(place => place.id === value.landmarkId) ||
      (typeof value.landmarkId === 'string' && /^osm-(node|way|relation)-[1-9]\d*$/.test(value.landmarkId))
  }
  return (value.source === 'map' || value.source === 'coordinates') && value.landmarkId === null
}

export function freshRecord(): GuestRecord {
  // randomUUID is secure-context only. getRandomValues also works on a local network demo.
  const profileId = crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)),
    byte => byte.toString(16).padStart(2, '0')).join('')
  return {
    version: 1,
    draft: {
      profileId, started: false, step: 'budget', editing: null,
      budgetInput: String(DEFAULT_BUDGET), budgetConfirmed: false,
      idealLocation: null, rankedTravelModes: [], locationConfirmed: false, placements: [],
    },
    completed: null,
  }
}

export function firstIncomplete(draft: Draft): Step {
  if (!draft.budgetConfirmed || parseBudgetCents(draft.budgetInput) === null) return 'budget'
  if (!draft.locationConfirmed || !validLocation(draft.idealLocation) || !isCompleteRanking(draft.rankedTravelModes)) return 'location'
  return 'board'
}

export function completeRecord(record: GuestRecord): GuestRecord {
  const { draft } = record
  const cents = parseBudgetCents(draft.budgetInput)
  if (cents === null || !draft.budgetConfirmed) throw new Error('Confirm your monthly budget.')
  if (!draft.locationConfirmed || !validLocation(draft.idealLocation)) throw new Error('Choose a location.')
  if (!isCompleteRanking(draft.rankedTravelModes)) throw new Error('Rank how you get around.')
  const profile: PreferenceProfileV1 = {
    schemaVersion: 1, weightPolicyVersion: 'category-rank-v1', catalogVersion: 'umich-factors-v1',
    profileId: draft.profileId, status: 'complete', updatedAt: new Date().toISOString(),
    budget: { maxMonthlyCents: cents, currency: 'USD', basis: 'per_person' },
    idealLocation: { ...draft.idealLocation },
    rankedTravelModes: [...draft.rankedTravelModes],
    factors: weightedFactors(draft.placements),
  }
  return { version: 1, draft: { ...draft, started: true, step: 'board', editing: null }, completed: profile }
}

export function isCompletedProfile(value: unknown): value is PreferenceProfileV1 {
  if (!isObject(value) || value.schemaVersion !== 1 || value.status !== 'complete'
    || value.weightPolicyVersion !== 'category-rank-v1' || value.catalogVersion !== 'umich-factors-v1'
    || typeof value.profileId !== 'string' || !value.profileId
    || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) return false
  const budget = value.budget
  if (!isObject(budget) || budget.basis !== 'per_person' || budget.currency !== 'USD'
    || typeof budget.maxMonthlyCents !== 'number' || !Number.isSafeInteger(budget.maxMonthlyCents)
    || budget.maxMonthlyCents < 0 || budget.maxMonthlyCents % 100 !== 0) return false
  if (!validLocation(value.idealLocation) || !isCompleteRanking(value.rankedTravelModes) || !isPlacementList(value.factors)) return false
  const expected = weightedFactors(value.factors)
  return value.factors.every((factor, index) => {
    const candidate = factor as unknown as Record<string, unknown>
    const correct = expected[index]
    return candidate.id === correct.id && candidate.rank === correct.rank
      && candidate.signedWeight === correct.signedWeight && candidate.rule === correct.rule
  })
}

export function draftFromProfile(profile: PreferenceProfileV1): Draft {
  return {
    profileId: profile.profileId, started: true, step: 'board', editing: null,
    budgetInput: String(profile.budget.maxMonthlyCents / 100), budgetConfirmed: true,
    idealLocation: { ...profile.idealLocation }, rankedTravelModes: [...profile.rankedTravelModes], locationConfirmed: true,
    placements: profile.factors.map(({ id, value, lane, starred }) => ({ id, value, lane, starred })),
  }
}

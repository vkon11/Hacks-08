import { z } from 'zod'
import {
  choicesSchema,
  criterionSchema,
  hasProvenance,
  messageSchema,
  modeSchema,
  pinSchema,
  setupSchema,
  type Criterion,
  type SearchSetup
} from '../ideal/contracts'
import { DEFAULT_BUDGET, isCompleteRanking, isTravelPrefix, parseBudgetCents } from './inputs'
import type { Step } from './types'
import type { MatchResult } from '../../server/matching'

export const draftSchema = z
  .object({
    profileId: z.string().min(1),
    started: z.boolean(),
    step: z.enum(['budget', 'location', 'essentials', 'builder']),
    editing: z.boolean(),
    budgetInput: z.string(),
    budgetConfirmed: z.boolean(),
    idealLocation: pinSchema.nullable(),
    rankedTravelModes: z.array(modeSchema).refine(isTravelPrefix),
    locationConfirmed: z.boolean(),
    choices: choicesSchema,
    essentialsConfirmed: z.boolean(),
    messages: z.array(messageSchema),
    criteria: z.array(criterionSchema),
    checkpointBase: z.array(criterionSchema),
    interpretedThrough: z.string().nullable(),
    clarification: z.string().nullable(),
    checkpoint: z.boolean(),
    accepted: z.boolean()
  })
  .refine((d) => hasProvenance(d.criteria, d.messages) && (!d.accepted || d.checkpoint))
export type Draft = z.infer<typeof draftSchema>
export type Profile = {
  schemaVersion: 2
  revision: string
  updatedAt: string
  setup: SearchSetup
  brief: Draft
  result: MatchResult | null
}
export interface HousingRecord {
  version: 2
  draft: Draft
  completed: Profile | null
}

export function newId() {
  return (
    crypto.randomUUID?.() ??
    Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join(
      ''
    )
  )
}
export function freshRecord(): HousingRecord {
  return {
    version: 2,
    completed: null,
    draft: {
      profileId: newId(),
      started: false,
      step: 'budget',
      editing: false,
      budgetInput: String(DEFAULT_BUDGET),
      budgetConfirmed: false,
      idealLocation: null,
      rankedTravelModes: [],
      locationConfirmed: false,
      choices: {},
      essentialsConfirmed: false,
      messages: [],
      criteria: [],
      checkpointBase: [],
      interpretedThrough: null,
      clarification: null,
      checkpoint: false,
      accepted: false
    }
  }
}
export function firstIncomplete(d: Draft): Step {
  if (!d.budgetConfirmed || parseBudgetCents(d.budgetInput) === null) return 'budget'
  if (
    !d.locationConfirmed ||
    !pinSchema.safeParse(d.idealLocation).success ||
    !isCompleteRanking(d.rankedTravelModes)
  )
    return 'location'
  return d.essentialsConfirmed ? 'builder' : 'essentials'
}
export function setupFromDraft(d: Draft): SearchSetup {
  return setupSchema.parse({
    maxMonthlyCents: parseBudgetCents(d.budgetInput),
    pin: d.idealLocation,
    travelModes: d.rankedTravelModes,
    choices: d.choices
  })
}
export function pendingIdeas(d: Draft) {
  return (d.messages.filter((m) => m.role === 'student').at(-1)?.id ?? null) !== d.interpretedThrough
}
export function completeRecord(record: HousingRecord): HousingRecord {
  const d = draftSchema.parse(record.draft)
  if (firstIncomplete(d) !== 'builder' || !d.checkpoint || pendingIdeas(d))
    throw Error('Wait for your current brief before viewing matches.')
  const draft = { ...d, editing: false, accepted: true }
  return {
    version: 2,
    draft,
    completed: {
      schemaVersion: 2,
      revision: newId(),
      updatedAt: new Date().toISOString(),
      setup: setupFromDraft(d),
      brief: draft,
      result: null
    }
  }
}
// Repeated wording or another supporting message for the same idea adds no weight or checkpoint count.
export function changedIdeas(base: Criterion[], latest: Criterion[]) {
  const signature = (c: Criterion) => JSON.stringify([c.label, c.importance, c.evidenceNeeded, c.condition])
  const before = new Map(base.map((c) => [c.id, signature(c)]))
  const current = new Map(latest.map((c) => [c.id, signature(c)]))
  return [...new Set([...before.keys(), ...current.keys()])].filter(
    (id) => before.get(id) !== current.get(id)
  ).length
}

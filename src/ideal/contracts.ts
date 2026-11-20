import { z } from 'zod'
import { inBounds, isCompleteRanking } from '../model/inputs.ts'
import type { IdealLocation, TravelMode } from '../model/types.ts'
export type { IdealLocation, TravelMode } from '../model/types.ts'

export const FINALISTS = 5
export const MAX_HOUSEHOLD_SIZE = 12
export const householdSizeSchema = z.number().int().min(1).max(MAX_HOUSEHOLD_SIZE).optional()

export function roommateCountLabel(count: number) {
  return count === 0 ? 'Living alone' : count === 1 ? '1 roommate' : count + ' roommates'
}

export const requirementValues = {
  commute: ['20', '30', '40'],
  area: ['500', '750', '1000', '1250'],
  ac: ['installed'],
  heat: ['installed', 'included'],
  bedroom: ['private'],
  bathroom: ['private'],
  pets: ['cat', 'dog', 'both'],
  parking: ['onsite'],
  laundry: ['in_unit', 'in_building'],
  furnishing: ['furnished'],
  stepFreeUnit: ['step_free'],
  stepFreeLaundry: ['step_free']
} as const
export type RequirementId = keyof typeof requirementValues
export const requirementLabels: Record<RequirementId, string> = {
  commute: 'Commute to your pin',
  area: 'Floor plan size',
  ac: 'Air conditioning',
  heat: 'Heating',
  bedroom: 'Bedroom',
  bathroom: 'Bathroom',
  pets: 'Pets',
  parking: 'Parking',
  laundry: 'Laundry',
  furnishing: 'Bedroom furniture',
  stepFreeUnit: 'Step-free route to your unit',
  stepFreeLaundry: 'Step-free route to laundry'
}
export function choiceLabel(id: RequirementId, value: string) {
  if (id === 'ac') return 'Required'
  if (id === 'commute') return value + ' minutes or less'
  if (id === 'area') return Number(value).toLocaleString('en-US') + '+ sq ft total'
  const labels: Record<string, string> = {
    installed: 'Installed',
    included: 'Installed and included in rent',
    private: 'Private',
    cat: 'Cat',
    dog: 'Dog',
    both: 'Cat and dog',
    onsite: 'On-site parking available',
    in_unit: 'In-unit',
    in_building: 'In-building or in-unit',
    furnished: 'Furnished',
    step_free: 'Step-free'
  }
  return labels[value] ?? value
}
export type RequirementChoices = Partial<Record<RequirementId, { value: string; required: boolean }>>
export interface SearchSetup {
  maxMonthlyCents: number
  householdSize?: number
  pin: IdealLocation
  travelModes: TravelMode[]
  choices: RequirementChoices
}
const ids = Object.keys(requirementValues) as [RequirementId, ...RequirementId[]]
export const validValue = (id: RequirementId, value: string) =>
  (requirementValues[id] as readonly string[]).includes(value)
const valueSchema = z.string().min(1).max(40)
function currentValue(id: RequirementId, value: string) {
  return id === 'ac' && value === 'central' ? 'installed' : value
}
export const choicesSchema = z
  .partialRecord(z.enum(ids), z.strictObject({ value: valueSchema, required: z.boolean() }))
  .overwrite(choices => choices.ac
    ? { ...choices, ac: { ...choices.ac, value: currentValue('ac', choices.ac.value) } }
    : choices)
  .refine((choices) =>
    Object.entries(choices).every(([id, choice]) => validValue(id as RequirementId, choice.value))
  )
  .transform((choices): RequirementChoices =>
    Object.fromEntries(Object.entries(choices).filter(([, choice]) => choice.required))
  )
export const pinSchema = z
  .strictObject({
    lat: z.number(),
    lng: z.number(),
    source: z.enum(['map', 'landmark', 'coordinates']),
    landmarkId: z.string().min(1).max(180).nullable(),
    label: z.string().trim().min(1).max(500)
  })
  .refine((pin) => inBounds(pin.lat, pin.lng) && (pin.source === 'landmark') === (pin.landmarkId !== null))
export const modeSchema = z.enum(['walk', 'car', 'bus', 'bike'])
export const setupSchema = z.strictObject({
  maxMonthlyCents: z.number().int().nonnegative(),
  householdSize: householdSizeSchema,
  pin: pinSchema,
  travelModes: z.array(modeSchema).refine(isCompleteRanking),
  choices: choicesSchema
})
export const messageSchema = z.strictObject({
  id: z.string().min(1).max(120),
  role: z.enum(['student', 'assistant']),
  text: z.string().trim().min(1).max(4000)
})
export type Message = z.infer<typeof messageSchema>
export const criterionSchema = z.strictObject({
  id: z.string().min(1).max(120),
  theme: z.string().min(1).max(140),
  label: z.string().min(1).max(240),
  importance: z.enum(['ordinary', 'strong']),
  evidenceNeeded: z.string().min(1).max(600),
  sourceMessageIds: z.array(z.string().min(1).max(120)).min(1),
  condition: z
    .strictObject({ id: z.enum(ids), value: valueSchema })
    .overwrite(c => ({ ...c, value: currentValue(c.id, c.value) }))
    .refine((c) => validValue(c.id, c.value))
    .nullable()
})
export type Criterion = z.infer<typeof criterionSchema>
export const interpretationSchema = z.object({
  criteria: z.array(criterionSchema),
  clarification: z.string().nullable()
})
export function hasProvenance(criteria: Criterion[], messages: Message[]) {
  const sources = new Set(messages.filter((m) => m.role === 'student').map((m) => m.id))
  return (
    new Set(criteria.map((c) => c.id)).size === criteria.length &&
    criteria.every((c) => c.sourceMessageIds.every((id) => sources.has(id)))
  )
}

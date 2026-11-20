import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { acPresenceSchema, normalizeCatalog } from './catalog.ts'
import { z } from 'zod'

const id = z.string().trim().min(1).max(160)
const text = z.string().trim().min(1).max(400)
const sourceUrl = z.url({ protocol: /^https?$/ }).refine(value => {
  const url = new URL(value)
  return !url.username && !url.password
})
const date = z.union([z.iso.date(), z.iso.datetime({ offset: true })])
const evidenceIds = z.array(id)
const money = z.number().int().nonnegative().max(100_000_000)
const coordinates = z.strictObject({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })

function fact<T extends z.ZodType>(value: T) {
  return z.discriminatedUnion('state', [
    z.strictObject({ state: z.literal('known'), value, evidenceIds: evidenceIds.min(1), estimated: z.literal(true).optional() }),
    z.strictObject({ state: z.enum(['unknown', 'conflicting']), evidenceIds }),
  ])
}

const record = { id, evidenceIds: evidenceIds.optional(), officialUrls: z.array(sourceUrl).optional() }
const pets = fact(z.strictObject({ cat: z.boolean().nullable(), dog: z.boolean().nullable(), catEstimated: z.boolean().optional(), dogEstimated: z.boolean().optional() }))
const inventorySchema = z.strictObject({
  schemaVersion: z.literal(1),
  inventoryVersion: id,
  buildings: z.array(z.strictObject({
    ...record, name: text, address: text, propertyType: z.literal('apartment').optional(),
    description: z.string().optional(), entrance: fact(coordinates).optional(),
    pets: pets.optional(),
  })),
  layouts: z.array(z.strictObject({
    ...record, buildingId: id, groupId: id.optional(), name: text, description: z.string().optional(), beds: fact(z.number().int().nonnegative()).optional(),
    baths: fact(z.number().nonnegative()).optional(), apartmentSqFt: fact(z.number().positive()).optional(),
    planUrl: sourceUrl.optional(),
  })),
  options: z.array(z.strictObject({
    ...record, layoutId: id, name: text, roomSqFt: fact(z.number().positive()).optional(),
    apartmentSqFt: fact(z.number().positive()).optional(), bedroomOccupancy: fact(z.number().int().positive()).optional(),
    privateBathroom: fact(z.boolean()).optional(), pets: pets.optional(),
    laundry: fact(z.enum(['in_unit', 'in_building', 'none'])).optional(),
    furnishedBedroom: fact(z.boolean()).optional(),
    ac: fact(acPresenceSchema).optional(),
    heating: fact(z.boolean()).optional(),
    stepFreeUnit: fact(z.boolean()).optional(), stepFreeLaundry: fact(z.boolean()).optional(),
  })),
  offers: z.array(z.strictObject({
    ...record, optionId: id, name: text, sourceUrl, checkedAt: z.union([date, z.literal('Unpublished')]),
    scopeQualification: z.string().optional(), listedAvailabilityStatus: z.string().optional(), priceAssumption: z.string().optional(), requiredOccupants: z.number().int().positive().optional(),
    estimatedOccupants: z.number().int().positive().optional(),
    monthlyTotalCents: fact(money).optional(),
    monthlyBaseCents: fact(money).optional(), mandatoryMonthlyFeesCents: fact(money).optional(),
    availableFrom: date.nullable().optional(), availableUntil: date.nullable().optional(),
    heatIncluded: fact(z.boolean()).optional(), pets: pets.optional(),
    onsiteParking: fact(z.strictObject({
      obtainable: z.boolean(), availabilityEstimated: z.boolean().optional(), monthlyCents: money.nullable(), includedInMonthlyTotal: z.boolean().nullable(),
    })).optional(),
  })),
  evidence: z.array(z.strictObject({
    id, label: text, text: z.string().trim().min(1).max(4000), sourceUrl, checkedAt: z.union([date, z.literal('Unpublished')]),
  })),
})

export type Inventory = z.infer<typeof inventorySchema>
export type MatchEvidence = Inventory['evidence'][number]
export type Fact<T> = { state: 'known'; value: T; evidenceIds: string[]; estimated?: true }
  | { state: 'unknown' | 'conflicting'; evidenceIds: string[] }

function indexUnique<T extends { id: string }>(records: T[], kind: string): Map<string, T> {
  const index = new Map<string, T>()
  for (const value of records) {
    if (index.has(value.id)) throw new Error('Duplicate ' + kind + ' ID ' + value.id)
    index.set(value.id, value)
  }
  return index
}

function assertEvidence(record: { id: string; evidenceIds?: string[] }, evidence: Map<string, MatchEvidence>) {
  const fieldReferences = Object.values(record).flatMap(value => {
    if (!value || typeof value !== 'object' || !('evidenceIds' in value)) return []
    return (value as { evidenceIds: string[] }).evidenceIds
  })
  for (const reference of [...record.evidenceIds ?? [], ...fieldReferences]) {
    if (!evidence.has(reference)) throw new Error('Unknown evidence ID ' + reference + ' on ' + record.id)
  }
}

export function parseInventory(input: unknown): Inventory {
  const catalog = typeof input === 'object' && input !== null && 'templateVersion' in input
  const inventory = inventorySchema.parse(catalog ? normalizeCatalog(input) : input)
  const buildings = indexUnique(inventory.buildings, 'building')
  const layouts = indexUnique(inventory.layouts, 'layout')
  const options = indexUnique(inventory.options, 'option')
  const offers = indexUnique(inventory.offers, 'offer')
  const evidence = indexUnique(inventory.evidence, 'evidence')

  for (const layout of layouts.values()) {
    if (!buildings.has(layout.buildingId)) throw new Error('Unknown building ' + layout.buildingId + ' on layout ' + layout.id)
  }
  for (const option of options.values()) {
    if (!layouts.has(option.layoutId)) throw new Error('Unknown layout ' + option.layoutId + ' on option ' + option.id)
  }
  for (const offer of offers.values()) {
    if (!options.has(offer.optionId)) throw new Error('Unknown option ' + offer.optionId + ' on offer ' + offer.id)
    if (offer.availableFrom && offer.availableUntil && Date.parse(offer.availableUntil) < Date.parse(offer.availableFrom)) {
      throw new Error('Availability end is before its start on offer ' + offer.id)
    }
  }
  for (const record of [...inventory.buildings, ...inventory.layouts, ...inventory.options, ...inventory.offers]) {
    assertEvidence(record, evidence)
  }
  return inventory
}

const catalogPath = 'data/apartment-inventory-template.json'
export function resolveInventoryPath(configured?: string) {
  const path = configured?.trim()
  return resolve(!path || resolve(path) === resolve('data/runtime/inventory.json') ? catalogPath : path)
}

// Many student setups share one published catalog. Cache the in-flight parse as well as its result.
let cached: { path: string; revision: string; loading: Promise<Inventory> } | undefined
export async function loadInventory(configured = process.env.INVENTORY_PATH): Promise<Inventory> {
  const path = resolveInventoryPath(configured)
  const { mtimeMs, size } = await stat(path)
  const revision = mtimeMs + ':' + size
  if (cached?.path === path && cached.revision === revision) return cached.loading
  const loading = readFile(path, 'utf-8').then(data => parseInventory(JSON.parse(data)))
  cached = { path, revision, loading }
  try {
    return await loading
  } catch (error) {
    if (cached?.loading === loading) cached = undefined
    throw error
  }
}

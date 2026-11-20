import { z } from 'zod'
import { FINALISTS } from './contracts'
import type { MatchResult } from '../../server/matching'

const link = z.url({ protocol: /^https?$/ })
const pending = z.object({
  layoutId: z.string(),
  optionId: z.string(),
  offerId: z.string(),
  buildingName: z.string(),
  address: z.string(),
  layoutName: z.string(),
  optionName: z.string(),
  reasons: z.array(z.string())
})
export const matchResultSchema = z
  .object({
    status: z.enum(['no_inventory', 'ready']),
    qualifiedLayouts: z.number().int().nonnegative(),
    assessedLayouts: z.number().int().nonnegative(),
    routingUnavailable: z.boolean(),
    qualitativeStatus: z.enum(['not_needed', 'complete', 'unavailable']),
    needsConfirmation: z.array(pending),
    needsConfirmationCount: z.number().int().nonnegative().optional(),
    matches: z
      .array(
        pending.extend({
          monthlyCents: z.number().int().nonnegative(),
          commuteMinutes: z.number().nonnegative().nullable(),
          routeBasis: z.string().nullable(),
          sourceUrl: link,
          planUrl: link.nullish().transform(url => url ?? undefined),
          buildingLat: z.number().min(-90).max(90).nullish(),
          buildingLng: z.number().min(-180).max(180).nullish(),
          priceEstimated: z.boolean().optional(),
          provisionalReasons: z.array(z.string()).optional(),
          buildingDescription: z.string().optional(),
          layoutDescription: z.string().optional(),
          beds: z.number().nonnegative().nullable().optional(),
          baths: z.number().nonnegative().nullable().optional(),
          apartmentSqFt: z.number().nonnegative().nullable().optional(),
          checkedAt: z.string(),
          availableFrom: z.string().nullable(),
          availableUntil: z.string().nullable(),
          coverage: z.number().min(0).max(1).nullable(),
          score: z.number().min(-1).max(1).nullable(),
          unknowns: z.array(z.string()),
          evidence: z.array(
            z.object({
              id: z.string(),
              label: z.string(),
              text: z.string(),
              sourceUrl: link,
              checkedAt: z.string()
            })
          )
        })
      )
      .max(FINALISTS)
  })
  .refine(
    (r) => new Set(r.matches.map((m) => m.layoutId)).size === r.matches.length
  ) satisfies z.ZodType<MatchResult>

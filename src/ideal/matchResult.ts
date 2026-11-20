import { z } from 'zod'
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
    matches: z
      .array(
        pending.extend({
          monthlyCents: z.number().int().nonnegative(),
          commuteMinutes: z.number().nonnegative().nullable(),
          routeBasis: z.string().nullable(),
          sourceUrl: link,
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
      .max(6)
  })
  .refine(
    (r) => new Set(r.matches.map((m) => m.layoutId)).size === r.matches.length
  ) satisfies z.ZodType<MatchResult>

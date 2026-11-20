import type { IncomingMessage, ServerResponse } from 'node:http'
import { stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import {
  setupSchema,
  messageSchema,
  criterionSchema,
  hasProvenance,
  type SearchSetup
} from '../src/ideal/contracts.ts'
import { defaultProjectUrl, defaultPublishableKey } from '../src/account/project.ts'
import { filterInventory, rankMatches, type FilteredInventory, type MatchResult } from './matching.ts'
import { createRouteLookup } from './routes.ts'
import { loadInventory, resolveInventoryPath } from './inventory.ts'
import { interpretBrief, assessOffers, LlmError } from './llm.ts'

type Env = Record<string, string | undefined>
const filterBody = z.strictObject({ setup: setupSchema })
const rankBody = filterBody.extend({ criteria: z.array(criterionSchema) })
const rankingRequest = rankBody.extend({ messages: z.array(messageSchema).optional() })
const interpretBody = rankBody.extend({
  messages: z.array(messageSchema).min(1),
  interpretedThrough: z.string().nullable().optional()
})
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}
async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    const part = Buffer.from(chunk)
    bytes += part.length
    if (bytes > 512_000) throw new HttpError(413, 'This brief is too large for one request.')
    chunks.push(part)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString())
  } catch {
    throw new HttpError(400, 'Send a valid housing request.')
  }
}
export function createHousingApi(env: Env) {
  const auth = createClient(
    env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || defaultProjectUrl,
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      env.VITE_SUPABASE_ANON_KEY ||
      defaultPublishableKey,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  )
  const route = createRouteLookup(env.OTP_GRAPHQL_URL)
  const recent = new Map<string, { at: number; filtered: Promise<FilteredInventory> }>()
  const rankedBySearch = new WeakMap<FilteredInventory, Map<string, Promise<MatchResult>>>()
  const calls = new Map<string, { since: number; count: number }>()
  async function filteredFor(userId: string, setup: SearchSetup) {
    const file = resolveInventoryPath(env.INVENTORY_PATH)
    const { mtimeMs, size } = await stat(file)
    const key = createHash('sha256')
      .update(JSON.stringify([userId, setup, file, mtimeMs, size]))
      .digest('hex')
    const now = Date.now()
    const cached = recent.get(key)
    if (cached && now - cached.at < 120000) return cached.filtered
    const filtered = loadInventory(file).then((inventory) => filterInventory(inventory, setup, route))
    recent.set(key, { at: now, filtered })
    if (recent.size > 12) recent.delete(recent.keys().next().value!)
    try {
      return await filtered
    } catch {
      recent.delete(key)
      throw new HttpError(503, 'The inventory could not be loaded. Your brief is saved. Please retry later.')
    }
  }
  return async function housingApi(req: IncomingMessage, res: ServerResponse, next?: () => void) {
    const op = (req.url || '').split('?')[0]
    if (!op.startsWith('/api/housing/')) {
      if (next) next()
      return false
    }
    let status = 200
    let response: unknown
    try {
      if (!['/api/housing/filter', '/api/housing/rank', '/api/housing/interpret'].includes(op))
        throw new HttpError(404, 'Unknown housing request.')
      if (req.method !== 'POST') throw new HttpError(405, 'Use POST for housing requests.')
      const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1]
      if (!token) throw new HttpError(401, 'Sign in to use your housing brief.')
      const { data, error } = await auth.auth.getUser(token)
      if (error || !data.user) throw new HttpError(401, 'Your sign-in expired. Sign in again to continue.')
      if (!data.user.email?.toLowerCase().endsWith('@umich.edu'))
        throw new HttpError(403, 'Sign in with your U-M account.')
      const userId = data.user.id
      const now = Date.now()
      const window = calls.get(userId)
      if (!window || now - window.since >= 60000) {
        for (const [id, bucket] of calls) if (now - bucket.since >= 60000) calls.delete(id)
        calls.set(userId, { since: now, count: 1 })
      } else if (++window.count > 45) throw new HttpError(429, 'Give the service a moment, then retry.')
      const raw = await readJson(req)
      const options = { apiKey: env.OPENAI_API_KEY }
      if (op.endsWith('/interpret')) {
        const input = interpretBody.parse(raw)
        if (!hasProvenance(input.criteria, input.messages))
          throw new HttpError(400, 'Brief cards must refer to your messages.')
        if (!env.OPENAI_API_KEY)
          throw new HttpError(
            503,
            'Chat interpretation is unavailable until the site connects its model. Your words are saved.'
          )
        const request = new AbortController()
        const abort = () => request.abort()
        res.once('close', abort)
        try {
          response = await interpretBrief(input, { ...options, signal: request.signal })
        } catch (e) {
          if (e instanceof LlmError) throw new HttpError(e.status, e.message + ' Your words are saved.')
          throw new HttpError(
            503,
            'The model could not interpret your ideas this time. Your words are saved. Retry to update your brief.'
          )
        } finally {
          res.off('close', abort)
        }
      } else if (op.endsWith('/filter')) {
        const { setup } = filterBody.parse(raw)
        const f = await filteredFor(userId, setup)
        const provisional = new Set(f.candidates.filter(c => c.provisionalReasons.length).map(c => c.layout.id))
        const verified = new Set(f.candidates.filter(c => !c.provisionalReasons.length).map(c => c.layout.id))
        for (const id of verified) provisional.delete(id)
        response = {
          qualifiedLayouts: f.qualifiedLayouts,
          message:
            f.status === 'no_inventory'
              ? 'Apartment listings are coming soon. You can build your brief now.'
              : f.qualifiedLayouts +
                ' qualifying floor plans' + (provisional.size ? ' (' + provisional.size + ' based on estimates)' : '') + ' · ' +
                f.needsConfirmation.length +
                ' offers need confirmation.'
        }
      } else {
        const input = rankingRequest.parse(raw)
        if (input.messages && !hasProvenance(input.criteria, input.messages))
          throw new HttpError(400, 'Brief cards must refer to your messages.')
        const filtered = await filteredFor(userId, input.setup)
        const assessor = env.OPENAI_API_KEY
          ? (cards: Parameters<typeof assessOffers>[0], criteria: Parameters<typeof assessOffers>[1], messages: Parameters<typeof assessOffers>[2]) =>
              assessOffers(cards, criteria, messages, options)
          : undefined
        const byBrief = rankedBySearch.get(filtered) ?? new Map<string, Promise<MatchResult>>()
        rankedBySearch.set(filtered, byBrief)
        const key = createHash('sha256').update(JSON.stringify([input.criteria, input.messages])).digest('hex')
        let pending = byBrief.get(key)
        if (!pending) {
          pending = rankMatches(
            filtered,
            input.criteria,
            assessor,
            input.messages
          )
          byBrief.set(key, pending)
          if (byBrief.size > 8) byBrief.delete(byBrief.keys().next().value!)
        }
        try {
          const result = await pending
          if (result.qualitativeStatus === 'unavailable') byBrief.delete(key)
          response = { ...result, needsConfirmationCount: result.needsConfirmation.length, needsConfirmation: result.needsConfirmation.slice(0, 30) }
        } catch (e) {
          byBrief.delete(key)
          throw e
        }
      }
    } catch (e) {
      status = e instanceof HttpError ? e.status : e instanceof z.ZodError ? 400 : 503
      response = {
        error:
          e instanceof HttpError
            ? e.message
            : status === 400
              ? 'Check your saved setup and try again.'
              : 'The housing service could not check the current listings. Please retry.'
      }
    }
    if (res.destroyed) return true
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    })
    res.end(JSON.stringify(response))
    return true
  }
}

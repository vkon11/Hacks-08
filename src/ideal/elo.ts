export const START_RATING = 1500
export const K = 32
export const TOP_PICKS = 3

export type Pair = [string, string]
export type Choice = { winner: string; loser: string } | { skipped: Pair }

const playedPair = (choice: Choice): Pair =>
  'skipped' in choice ? choice.skipped : [choice.winner, choice.loser]

const pairKey = ([a, b]: Pair) => JSON.stringify(a < b ? [a, b] : [b, a])
export const totalPairs = (count: number) => count * Math.max(0, count - 1) / 2

export function ratings(ids: string[], history: Choice[]) {
  const scores = new Map(ids.map(id => [id, START_RATING]))
  for (const choice of history) {
    if ('skipped' in choice || choice.winner === choice.loser) continue
    const winner = scores.get(choice.winner)
    const loser = scores.get(choice.loser)
    if (winner === undefined || loser === undefined) continue
    const expected = 1 / (1 + 10 ** ((loser - winner) / 400))
    const delta = K * (1 - expected)
    scores.set(choice.winner, winner + delta)
    scores.set(choice.loser, loser - delta)
  }
  return scores
}

// Introduce every finalist, then compare the closest-rated pair that has not met.
export function nextPair(ids: string[], history: Choice[]): Pair | null {
  if (ids.length < 2) return null
  if (!history.length) return [ids[0], ids[1]]
  const previousPairs = history.map(playedPair)
  const seen = new Set(previousPairs.flat())
  const fresh = ids.find(id => !seen.has(id))
  if (fresh) {
    const last = history[history.length - 1]
    return ['skipped' in last ? last.skipped[1] : last.winner, fresh]
  }
  const used = new Set(previousPairs.map(pairKey))
  const scores = ratings(ids, history)
  let smallestGap = Infinity
  let best: Pair | null = null
  for (let left = 0; left < ids.length; left++) {
    for (let right = left + 1; right < ids.length; right++) {
      const pair: Pair = [ids[left], ids[right]]
      if (used.has(pairKey(pair))) continue
      const gap = Math.abs(scores.get(pair[0])! - scores.get(pair[1])!)
      if (gap < smallestGap - 1e-9) {
        smallestGap = gap
        best = pair
      }
    }
  }
  return best
}

export function standings(ids: string[], history: Choice[]) {
  const scores = ratings(ids, history)
  // Stable sort preserves the original recommendation order for equal ratings.
  return ids.slice().sort((a, b) => scores.get(b)! - scores.get(a)!)
}

type Contender = { layoutId: string; optionId: string; offerId: string; monthlyCents: number }
const storageKey = (revision: string) => 'ann-arbor-housing-board:v2:final-round:' + revision

export function roundSignature(matches: Contender[]) {
  return JSON.stringify(matches.map(m => JSON.stringify([m.layoutId, m.optionId, m.offerId, m.monthlyCents])).sort())
}

function restoreChoice(value: unknown, pair: Pair): Choice | null {
  if (!value || typeof value !== 'object') return null
  if ('skipped' in value) {
    const skipped = value.skipped
    if (Array.isArray(skipped) && skipped.length === 2 && pairKey([skipped[0], skipped[1]]) === pairKey(pair))
      return { skipped: pair }
    return null
  }
  if (!('winner' in value && 'loser' in value)) return null
  const { winner, loser } = value
  if (typeof winner !== 'string' || typeof loser !== 'string' || pairKey([winner, loser]) !== pairKey(pair)) return null
  return { winner, loser }
}

export function loadRound(revision: string, matches: Contender[], storage?: Pick<Storage, 'getItem'>) {
  const fresh = { ids: matches.map(match => match.layoutId), picks: [] as Choice[] }
  try {
    const saved = JSON.parse((storage ?? localStorage).getItem(storageKey(revision)) ?? 'null')
    if (!saved || !Array.isArray(saved.ids) || !Array.isArray(saved.picks)) return fresh
    if (saved.signature !== undefined && saved.signature !== roundSignature(matches)) return fresh
    if (JSON.stringify([...saved.ids].sort()) !== JSON.stringify([...fresh.ids].sort())) return fresh
    // Replay the valid prefix. This also understands winner/loser histories saved by the original final round.
    const ids: string[] = saved.ids
    const picks: Choice[] = []
    for (const move of saved.picks) {
      const pair = nextPair(ids, picks)
      if (!pair) break
      const valid = restoreChoice(move, pair)
      if (!valid) break
      picks.push(valid)
    }
    return { ids, picks }
  } catch {
    return fresh
  }
}

export function saveRound(revision: string, matches: Contender[], ids: string[], picks: Choice[], storage?: Pick<Storage, 'setItem'>) {
  try {
    (storage ?? localStorage).setItem(storageKey(revision), JSON.stringify({ signature: roundSignature(matches), ids, picks }))
    return true
  } catch {
    return false
  }
}

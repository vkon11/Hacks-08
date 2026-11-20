// Final round: head-to-head picks between the shortlisted floor plans, scored with Elo.
// Ratings are recomputed from the pick history, so undo is just dropping the last pick.

export const START_RATING = 1500
export const K = 32

export interface Choice { winner: string; loser: string }

export function expected(rating: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - rating) / 400))
}

export function ratings(ids: string[], picks: Choice[]): Map<string, number> {
  const r = new Map(ids.map(id => [id, START_RATING]))
  for (const { winner, loser } of picks) {
    const w = r.get(winner), l = r.get(loser)
    if (w === undefined || l === undefined) continue
    const delta = K * (1 - expected(w, l))
    r.set(winner, w + delta)
    r.set(loser, l - delta)
  }
  return r
}

const key = (a: string, b: string) => (a < b ? a + '|' + b : b + '|' + a)

/**
 * Next matchup, or null when every pair has met.
 * Phase 1 (winner stays on): the last winner meets the next finalist, in shortlist order, that hasn't played yet.
 * Phase 2 (refine): the unplayed pair with the closest ratings; ties go to the higher-ranked shortlist pair.
 */
export function nextPair(ids: string[], picks: Choice[]): [string, string] | null {
  if (ids.length < 2) return null
  const played = new Set(picks.map(p => key(p.winner, p.loser)))
  const seen = new Set(picks.flatMap(p => [p.winner, p.loser]))
  const fresh = ids.find(id => !seen.has(id))
  if (!picks.length) return [ids[0], ids[1]]
  if (fresh) return [picks.at(-1)!.winner, fresh]
  const r = ratings(ids, picks)
  let best: [string, string] | null = null, gap = Infinity
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      if (played.has(key(ids[i], ids[j]))) continue
      const g = Math.abs(r.get(ids[i])! - r.get(ids[j])!)
      if (g < gap - 1e-9) { gap = g; best = [ids[i], ids[j]] }
    }
  return best
}

/** Highest Elo first; equal ratings keep the shortlist order. */
export function standings(ids: string[], picks: Choice[]): { id: string; rating: number }[] {
  const r = ratings(ids, picks)
  return ids.map((id, index) => ({ id, index, rating: r.get(id)! }))
    .sort((a, b) => b.rating - a.rating || a.index - b.index)
    .map(({ id, rating }) => ({ id, rating }))
}

export const totalPairs = (n: number) => (n * (n - 1)) / 2
/** Picks needed before every finalist has played once (winner-stays phase). */
export const firstPassLength = (n: number) => Math.max(0, n - 1)

// Picks are stored per saved brief revision and reset if the shortlist changes.
const storageKey = (revision: string) => 'ann-arbor-housing-board:v2:final-round:' + revision

export function loadPicks(revision: string, ids: string[], storage: Pick<Storage, 'getItem'> = localStorage): Choice[] {
  try {
    const raw = JSON.parse(storage.getItem(storageKey(revision)) ?? 'null')
    if (!raw || !Array.isArray(raw.ids) || raw.ids.join('|') !== ids.join('|') || !Array.isArray(raw.picks)) return []
    const known = new Set(ids)
    return raw.picks.filter((p: Choice) => known.has(p?.winner) && known.has(p?.loser) && p.winner !== p.loser)
  } catch {
    return []
  }
}

export function savePicks(revision: string, ids: string[], picks: Choice[], storage: Pick<Storage, 'setItem'> = localStorage) {
  try {
    storage.setItem(storageKey(revision), JSON.stringify({ ids, picks }))
  } catch {
    // Storage denied: the round still works for this visit.
  }
}

import test from 'node:test'
import assert from 'node:assert/strict'
import { firstPassLength, K, loadPicks, nextPair, ratings, savePicks, standings, START_RATING, totalPairs, type Choice } from '../src/ideal/elo.ts'

const ids = ['A', 'B', 'C', 'D', 'E', 'F']
const beat = (winner: string, loser: string): Choice => ({ winner, loser })

test('first matchup is the top two of the shortlist, then the winner stays on', () => {
  assert.deepEqual(nextPair(ids, []), ['A', 'B'])
  assert.deepEqual(nextPair(ids, [beat('B', 'A')]), ['B', 'C'])
  assert.deepEqual(nextPair(ids, [beat('B', 'A'), beat('C', 'B')]), ['C', 'D'])
})

test('after every finalist has played, pairs that never met (like A vs C) are still offered', () => {
  const picks = [beat('B', 'A'), beat('C', 'B'), beat('C', 'D'), beat('C', 'E'), beat('C', 'F')]
  assert.equal(picks.length, firstPassLength(ids.length))
  const offered = new Set<string>()
  let history = [...picks]
  for (let pair = nextPair(ids, history); pair; pair = nextPair(ids, history)) {
    offered.add([...pair].sort().join(''))
    history = [...history, beat(pair[0], pair[1])]
  }
  assert.ok(offered.has('AC'), 'A vs C offered')
  assert.equal(history.length, totalPairs(ids.length), 'every pair meets exactly once')
  assert.equal(new Set(history.map(p => [p.winner, p.loser].sort().join(''))).size, totalPairs(ids.length))
})

test('refinement picks the closest-rated unplayed pair', () => {
  const picks = [beat('B', 'A'), beat('C', 'B'), beat('C', 'D'), beat('C', 'E'), beat('C', 'F')]
  const r = ratings(ids, picks)
  const [x, y] = nextPair(ids, picks)!
  const gap = Math.abs(r.get(x)! - r.get(y)!)
  for (const a of ids) for (const b of ids)
    if (a < b && !picks.some(p => [p.winner, p.loser].sort().join('') === a + b))
      assert.ok(Math.abs(r.get(a)! - r.get(b)!) >= gap - 1e-9)
})

test('Elo moves K/2 on an even match and conserves total rating', () => {
  const r = ratings(ids, [beat('B', 'A')])
  assert.equal(r.get('B'), START_RATING + K / 2)
  assert.equal(r.get('A'), START_RATING - K / 2)
  const many = ratings(ids, [beat('B', 'A'), beat('C', 'B'), beat('A', 'C'), beat('D', 'A')])
  assert.ok(Math.abs([...many.values()].reduce((s, v) => s + v, 0) - START_RATING * ids.length) < 1e-9)
})

test('beating a stronger finalist is worth more than beating a weaker one', () => {
  const base = [beat('B', 'A'), beat('B', 'C')]
  const upset = ratings(ids, [...base, beat('A', 'B')]).get('A')! - ratings(ids, base).get('A')!
  const expectedWin = ratings(ids, [...base, beat('B', 'A')]).get('B')! - ratings(ids, base).get('B')!
  assert.ok(upset > expectedWin)
})

test('standings sort by Elo and keep shortlist order on ties', () => {
  assert.deepEqual(standings(ids, []).map(s => s.id), ids)
  assert.deepEqual(standings(ids, [beat('C', 'A')]).map(s => s.id), ['C', 'B', 'D', 'E', 'F', 'A'])
})

test('saved picks restore for the same shortlist and reset when it changes', () => {
  const store = new Map<string, string>()
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
  const picks = [beat('B', 'A'), beat('C', 'B')]
  savePicks('rev1', ids, picks, storage)
  assert.deepEqual(loadPicks('rev1', ids, storage), picks)
  assert.deepEqual(loadPicks('rev1', ['A', 'B', 'C'], storage), [])
  assert.deepEqual(loadPicks('rev2', ids, storage), [])
})

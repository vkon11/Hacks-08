import test from 'node:test'
import assert from 'node:assert/strict'
import { K, loadRound, nextPair, ratings, saveRound, standings, START_RATING, totalPairs, type Choice } from '../src/ideal/elo.ts'

const ids = ['A', 'B', 'C', 'D', 'E']
const matches = ids.map(id => ({ layoutId: id, optionId: 'room-' + id, offerId: 'offer-' + id, monthlyCents: 120000 }))
const vote = (winner: string, loser: string): Choice => ({ winner, loser })

test('Elo starts equally, gives a larger gain for an upset, and preserves total rating', () => {
  const initial = ratings(ids, [vote('A', 'B')])
  assert.equal(initial.get('A'), START_RATING + K / 2)
  assert.equal(initial.get('B'), START_RATING - K / 2)
  const upset = ratings(ids, [vote('A', 'B'), vote('B', 'A')])
  assert.ok(upset.get('B')! - initial.get('B')! > K / 2)
  assert.ok(Math.abs([...upset.values()].reduce((sum, value) => sum + value, 0) - START_RATING * ids.length) < 1e-8)
})

test('each pair meets once and a runner-up can finish second after losing the very first matchup', () => {
  const history: Choice[] = []
  const pairs = new Set<string>()
  for (let pair = nextPair(ids, history); pair; pair = nextPair(ids, history)) {
    const [winner, loser] = [...pair].sort() // A > B > C > D > E
    const key = winner + loser
    assert.ok(!pairs.has(key))
    pairs.add(key)
    history.push(vote(winner, loser))
  }
  assert.equal(pairs.size, 10)
  assert.deepEqual(standings(ids, history).slice(0, 3), ['A', 'B', 'C'])
  assert.deepEqual(nextPair(ids, [vote('B', 'A')]), ['B', 'C'])
})

test('after introductions the next opponents have the closest Elo among unplayed pairs', () => {
  const history = [vote('A', 'B'), vote('C', 'A'), vote('C', 'D'), vote('E', 'C')]
  const pair = nextPair(ids, history)!
  const r = ratings(ids, history)
  const gap = Math.abs(r.get(pair[0])! - r.get(pair[1])!)
  for (const a of ids) for (const b of ids) {
    if (a >= b || history.some(c => 'winner' in c && [c.winner, c.loser].sort().join() === [a, b].join())) continue
    assert.ok(gap <= Math.abs(r.get(a)! - r.get(b)!) + 1e-9)
  }
})

test('skips leave Elo alone, undo reoffers that matchup, and zero through five plans terminate', () => {
  for (let n = 0; n <= ids.length; n++) {
    const candidates = ids.slice(0, n)
    const history: Choice[] = []
    for (let pair = nextPair(candidates, history); pair; pair = nextPair(candidates, history)) {
      history.push({ skipped: pair })
      assert.deepEqual(nextPair(candidates, history.slice(0, -1)), pair)
    }
    assert.equal(history.length, totalPairs(n))
    assert.deepEqual(standings(candidates, history), candidates)
    assert.ok([...ratings(candidates, history).values()].every(score => score === START_RATING))
  }
})

test('progress tracks the brief, room offer and price, and retains original seed order on a reordered refresh', () => {
  const values = new Map<string, string>()
  const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v) } }
  const history: Choice[] = [vote('B', 'A'), { skipped: ['B', 'C'] }]
  saveRound('revision', matches, ids, history, storage)
  assert.deepEqual(loadRound('revision', [...matches].reverse(), storage), { ids, picks: history })
  assert.deepEqual(loadRound('other', matches, storage).picks, [])
  for (const change of [{ optionId: 'other' }, { offerId: 'other' }, { monthlyCents: 125000 }]) {
    assert.deepEqual(loadRound('revision', [{ ...matches[0], ...change }, ...matches.slice(1)], storage).picks, [])
  }
  assert.deepEqual(loadRound('revision', matches.slice(1), storage).picks, [])
})

test('legacy history restores only the valid sequence and corrupt storage falls back to a fresh round', () => {
  const get = (picks: unknown[]) => loadRound('rev', matches, {
    getItem: () => JSON.stringify({ ids, picks })
  }).picks
  assert.deepEqual(get([vote('B', 'A'), vote('C', 'B')]), [vote('B', 'A'), vote('C', 'B')])
  assert.deepEqual(get([vote('B', 'A'), vote('A', 'B')]), [vote('B', 'A')])
  assert.deepEqual(get([vote('B', 'B')]), [])
  assert.deepEqual(get([{ skipped: ['A', 'Z'] }]), [])
  assert.deepEqual(loadRound('rev', matches, { getItem: () => 'bad JSON' }).picks, [])
  assert.equal(saveRound('rev', matches, ids, [], { setItem: () => { throw Error('Quota') } }), false)
})

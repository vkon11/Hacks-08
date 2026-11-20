import test from 'node:test'
import assert from 'node:assert/strict'
import {
  changedIdeas,
  clearLegacyProfiles,
  completeRecord,
  firstIncomplete,
  freshRecord,
  loadRecord,
  parseBudgetCents,
  pickMode,
  saveRecord,
  sliderMax,
  storageKey,
  undoMode
} from '../src/model'
import { choicesSchema, setupSchema, type Criterion, type Message } from '../src/ideal/contracts'

const pin = { lat: 42.275, lng: -83.739, source: 'map', landmarkId: null, label: 'My pin' } as const
function answered() {
  const r = freshRecord()
  Object.assign(r.draft, {
    budgetConfirmed: true,
    idealLocation: pin,
    rankedTravelModes: ['bus', 'walk', 'bike', 'car'],
    locationConfirmed: true,
    essentialsConfirmed: true,
    checkpoint: true
  })
  return r
}
test('monthly cents are exact, and three distinct travel modes fill the fourth', () => {
  for (const input of ['', '-1', '0.5', '1e9', '9007199254740991'])
    assert.equal(parseBudgetCents(input), null)
  assert.equal(parseBudgetCents('1423'), 142300)
  assert.equal(sliderMax('4201'), 4500)
  assert.deepEqual(undoMode(pickMode(['bus', 'walk'], 'bike')), ['bus', 'walk'])
})
test('a saved v2 revision requires confirmed setup and current interpreted messages', () => {
  const r = answered()
  assert.equal(firstIncomplete(r.draft), 'builder')
  const p = completeRecord(r).completed!
  assert.equal(p.setup.maxMonthlyCents, 150000)
  assert.deepEqual(p.setup.choices, {})
  assert.equal(p.brief.accepted, true)
  for (const changes of [
    { checkpoint: false },
    { essentialsConfirmed: false },
    { budgetInput: '' },
    { messages: [{ id: 'a', text: 'sun', role: 'student' }] }
  ]) {
    assert.throws(() => completeRecord({ ...r, draft: { ...r.draft, ...changes } as typeof r.draft }))
  }
  assert.equal(
    setupSchema.safeParse({ ...p.setup, travelModes: ['bus', 'bus', 'walk', 'bike'] }).success,
    false
  )
  assert.equal(
    choicesSchema.safeParse({
      area: { value: '750', required: true },
      heat: { value: 'maybe', required: false }
    }).success,
    false
  )
})
test('reused ideas do not advance checkpoints and independent edits change only their own ideas', () => {
  const a: Criterion = {
    id: 'space',
    theme: 'Friends',
    label: 'Room to host',
    importance: 'ordinary',
    evidenceNeeded: 'Usable living room dimensions',
    sourceMessageIds: ['a'],
    condition: null
  }
  assert.equal(changedIdeas([a], [{ ...a, sourceMessageIds: ['a', 'b'] }]), 0)
  assert.equal(changedIdeas([a], [{ ...a, importance: 'strong' }]), 1)
  assert.equal(changedIdeas([a], []), 1)
})
test('version-one cleanup removes only questionnaire records and account drafts round-trip', () => {
  const entries = new Map([
    ['sb-auth', 'keep'],
    ['unrelated', 'keep'],
    ['ann-arbor-housing-board:v1:guest', 'remove'],
    ['ann-arbor-housing-board:v1:account:123', 'remove']
  ])
  const storage = {
    get length() {
      return entries.size
    },
    key: (i: number) => Array.from(entries.keys())[i] ?? null,
    getItem: (k: string) => entries.get(k) ?? null,
    setItem: (k: string, v: string) => {
      entries.set(k, v)
    },
    removeItem: (k: string) => {
      entries.delete(k)
    },
    clear: () => entries.clear()
  }
  const r = answered()
  const m: Message = { id: 'a', text: 'in-unit laundry please', role: 'student' }
  Object.assign(r.draft, {
    choices: { area: { value: '750', required: true } },
    messages: [m],
    interpretedThrough: 'a',
    criteria: [
      {
        id: 'laundry',
        theme: 'Home',
        label: 'In-unit laundry',
        condition: { id: 'laundry', value: 'in_unit' },
        importance: 'ordinary',
        sourceMessageIds: ['a'],
        evidenceNeeded: 'A washer and dryer in the unit'
      }
    ]
  })
  const saved = completeRecord(r)
  saveRecord(saved, 'student', storage)
  clearLegacyProfiles(storage)
  assert.deepEqual([...entries.keys()], ['sb-auth', 'unrelated', storageKey('student')])
  assert.deepEqual(loadRecord('student', storage), saved)
  assert.equal(loadRecord('other', storage).completed, null)
  assert.throws(() =>
    saveRecord(saved, 'student', {
      setItem() {
        throw Error('quota')
      }
    })
  )
})

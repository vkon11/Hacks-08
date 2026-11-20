import test from 'node:test'
import assert from 'node:assert/strict'
import { addDays, buildTimeline, defaultMoveIn, isDate, nextKeyDate } from '../src/timeline/timeline.ts'

const byId = (rows: ReturnType<typeof buildTimeline>) => new Map(rows.map((m) => [m.id, m]))

test('occupied units open 210 days into a lease that began a year before move-in', () => {
  const rows = byId(buildTimeline({ moveIn: '2027-08-15', today: '2026-11-20' }))
  assert.equal(rows.get('renewals')!.date, '2027-02-11') // 2026-08-15 + 180
  assert.equal(rows.get('showings')!.date, '2027-03-13') // 2026-08-15 + 210
  assert.equal(rows.get('checklist')!.date, '2027-08-22')
  assert.equal(rows.get('deposit-notice')!.date, '2027-08-29')
})

test('milestones are in date order, past ones are done and exactly one is next', () => {
  const rows = buildTimeline({ moveIn: '2027-08-15', today: '2027-03-01' })
  assert.deepEqual(rows.map((m) => m.date), [...rows.map((m) => m.date)].sort())
  assert.equal(rows.find((m) => m.id === 'renewals')!.status, 'done')
  assert.equal(rows.filter((m) => m.status === 'next').length, 1)
  assert.equal(rows.find((m) => m.status === 'next')!.id, 'brief')
})

test('deposit uses the 1.5-month cap when rent is given', () => {
  const deposit = byId(buildTimeline({ moveIn: '2027-08-15', today: '2026-11-20', monthlyRent: 1200 })).get('deposit')!
  assert.match(deposit.detail, /\$1,800 at \$1,200 a month/)
  const without = byId(buildTimeline({ moveIn: '2027-08-15', today: '2026-11-20' })).get('deposit')!
  assert.match(without.detail, /Add your monthly rent/)
})

test('a current Ann Arbor lease adds the student’s own renewal dates', () => {
  const rows = byId(buildTimeline({ moveIn: '2027-08-15', today: '2026-11-20', currentLeaseStart: '2026-09-01' }))
  assert.equal(rows.get('my-renewal')!.date, addDays('2026-09-01', 180))
  assert.equal(rows.get('my-showings')!.date, addDays('2026-09-01', 210))
  assert.equal(byId(buildTimeline({ moveIn: '2027-08-15', today: '2026-11-20' })).has('my-renewal'), false)
})

test('every rule-based milestone cites a source', () => {
  for (const m of buildTimeline({ moveIn: '2027-08-15', today: '2026-11-20', currentLeaseStart: '2026-09-01' }))
    if (m.id !== 'brief') assert.ok(m.source?.url.startsWith('https://'), m.id)
})

test('countdown points at the next real milestone, not the brief', () => {
  const rows = buildTimeline({ moveIn: '2027-08-15', today: '2026-11-20' })
  const key = nextKeyDate(rows, '2026-11-20')!
  assert.equal(key.milestone.id, 'renewals')
  assert.equal(key.days, 83)
})

test('default move-in is the next mid-August at least four months away', () => {
  assert.equal(defaultMoveIn('2026-11-20'), '2027-08-15')
  assert.equal(defaultMoveIn('2027-02-01'), '2027-08-15')
  assert.equal(defaultMoveIn('2027-06-01'), '2028-08-15')
  assert.ok(isDate('2027-08-15') && !isDate('2027-8-15') && !isDate(null))
})

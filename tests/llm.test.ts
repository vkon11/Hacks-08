import assert from 'node:assert/strict'
import test from 'node:test'
import { assessOffers, interpretBrief, LlmError } from '../server/llm'
import { createResearchEnricher } from '../server/research'
import type { Criterion, SearchSetup } from '../src/ideal/contracts'

const setup: SearchSetup = {
  maxMonthlyCents: 125000,
  pin: { lat: 42.28, lng: -83.74, source: 'map', landmarkId: null, label: 'My spot' },
  travelModes: ['bus', 'walk', 'bike', 'car'],
  choices: { commute: { value: '30', required: true } },
}
const living: Criterion = {
  id: 'living-space', theme: 'Space for friends', label: 'A roomy living room', importance: 'ordinary',
  evidenceNeeded: 'Living-room dimensions or a labeled floor plan', condition: null, sourceMessageIds: ['first'],
}
const card = {
  optionId: 'unit', offerId: 'offer', layoutId: 'layout', buildingName: 'An example', layoutName: '2 bed', optionName: 'Whole place',
  buildingDescription:'A fictional building.', layoutDescription:'A large living room.',
  evidence: [{ id: 'diagram', label: 'Living room', text: 'Living room measures 18 by 16 feet.',
    sourceUrl: 'https://housing.example/layout', checkedAt: '2026-11-20' }],
}
function output(value: unknown, annotations: unknown[] = []) {
  return Response.json({ status: 'completed', output: [{ type: 'message', role: 'assistant',
    content: [{ type: 'output_text', text: JSON.stringify(value), annotations }] }] })
}

test('the interpreter applies grounded changes without rewriting unrelated ideas or hard requirements', async () => {
  const inputs = {
    setup,
    messages: [
      { id: 'first', role: 'student' as const, text: 'big living room for pregames' },
      { id: 'second', role: 'student' as const, text: 'laundry inside the apt would be nice' },
    ],
    interpretedThrough: 'first',
    criteria: [living],
  }
  const laundry = { ...living, id: 'laundry', label: 'In-unit laundry', theme: 'Laundry', sourceMessageIds: ['second'],
    condition: { id: 'laundry', value: 'in_unit' } }
  const result = await interpretBrief(inputs, {
    apiKey: 'test',
    fetch: async (_url, request) => {
      const body = JSON.parse(String(request?.body))
      assert.equal(body.model, 'gpt-5.4-mini-2026-03-17')
      assert.equal(body.store, false)
      assert.equal(body.text.format.strict, true)
      assert.ok(!body.tools)
      assert.ok(!String(body.input).includes(String(setup.pin.lat)))
      return output({ changes: [{ action: 'set', id: laundry.id, criterion: laundry, removedBy: null }], clarification: null })
    },
  })
  assert.deepEqual(result, { criteria: [living, laundry], clarification: null })
  assert.equal(setup.choices.commute?.required, true)
})

test('the interpreter rejects a preference attached to an invented student message', async () => {
  await assert.rejects(interpretBrief({ setup, criteria: [], messages: [{ id: 'first', role: 'student', text: 'random' }] }, {
    apiKey: 'test',
    fetch: async () => output({ changes: [{ action: 'set', id: living.id, criterion: { ...living, sourceMessageIds: ['made-up'] }, removedBy: null }],
      clarification: null }),
  }), (error: unknown) => error instanceof LlmError && error.status === 502)
})

test('exhausted credits and temporary rate limits give different recovery messages', async () => {
  const input = { setup, criteria: [], messages: [{ id: 'first', role: 'student' as const, text: 'sunny living room' }] }
  for (const [code, status, message] of [
    ['credit_balance_exhausted', 503, /credits ran out/],
    ['rate_limit_exceeded', 429, /retry in a moment/i],
  ] as const) {
    await assert.rejects(interpretBrief(input, {
      apiKey: 'test',
      fetch: async () => Response.json({ error: { code } }, { status: 429 }),
    }), (error: unknown) => error instanceof LlmError && error.status === status && message.test(error.message))
  }
})

test('a correction can remove an existing idea only when it cites a pending student message', async () => {
  const input = {
    setup, criteria: [living], interpretedThrough: 'first', messages: [
      { id: 'first', role: 'student' as const, text: 'big living room for pregames' },
      { id: 'correction', role: 'student' as const, text: 'actually drop the hangout space completely' },
    ],
  }
  const options = (removedBy: string) => ({ apiKey: 'test', fetch: async () =>
    output({ changes: [{ action: 'remove', id: living.id, criterion: null, removedBy }], clarification: null }) })
  assert.deepEqual((await interpretBrief(input, options('correction'))).criteria, [])
  await assert.rejects(interpretBrief(input, options('first')), (error: unknown) =>
    error instanceof LlmError && error.status === 502)
})

test('the interpreter cannot emit an invalid option or turn an idea into a hard requirement', async () => {
  const input = { setup, criteria: [], messages: [{ id: 'first', role: 'student' as const, text: 'i need room for my friends' }] }
  for (const criterion of [
    { ...living, condition: { id: 'area', value: '200' } },
    { ...living, required: true },
  ]) {
    await assert.rejects(interpretBrief(input, {
      apiKey: 'test',
      fetch: async () => output({ changes: [{ action: 'set', id: living.id, criterion, removedBy: null }], clarification: null }),
    }), (error: unknown) => error instanceof LlmError && error.status === 502)
  }
})

test('one compact request assesses every selected layout and rejects evidence from another offer', async () => {
  let calls = 0
  const result = await assessOffers([card, { ...card, offerId: 'other', evidence: [] }], [living],
    [{role:'student',id:'first',text:'give me room for pregames'}], {
      apiKey: 'test',
      fetch: async (_url, init) => {
        calls++
        const body = JSON.parse(String(init?.body))
        assert.equal(body.tools,undefined)
        const payload = JSON.parse(body.input)
        assert.equal(payload.offers.length,2)
        assert.equal(payload.offers[0].planDescription,card.layoutDescription)
        assert.deepEqual(payload.inTheirWords,['give me room for pregames'])
        assert.equal(payload.currentBrief[0].weight,1)
        return output({ offers: [
          {offer:0,fit:90,reason:'The living room has space to host.',tradeoff:null,evidence:[0],
            factors:[{criterion:0,status:'supported',evidence:[0]}]},
          {offer:1,fit:95,reason:'Borrowed another layout’s evidence.',tradeoff:null,evidence:[0],factors:[]},
        ] })
      },
    })
  assert.equal(calls,1)
  assert.deepEqual(result.map(rating => [rating.offerId,rating.fit,rating.evidenceIds]), [['offer',90,['diagram']]])
  assert.equal(result[0].factors[0].criterionId,living.id)
})

test('research performs up to three lookups and requires an exact allow-listed page citation', async () => {
  let requests = 0
  const cards = Array.from({ length: 4 }, (_, index) => ({
    ...card, offerId: 'offer-' + index, layoutId: 'layout-' + index, officialUrls: ['https://housing.example/layout-' + index],
    evidence: [],
  }))
  const enrich = createResearchEnricher({ apiKey: 'test', fetch: async (_url, request) => {
    const body = JSON.parse(String(request?.body))
    const index = requests++
    const sourceUrl = 'https://housing.example/layout-' + index
    assert.equal(body.max_tool_calls, 1)
    assert.deepEqual(body.tools[0].filters.allowed_domains, ['housing.example'])
    return output({ facts: [{ label: 'Dimensions', quote: 'Living room measures 18 by 16 feet.', sourceUrl }] }, [
      { type: 'url_citation', url: index === 1 ? 'https://housing.example/other' : sourceUrl },
    ])
  } })
  const result = await enrich(cards, [living])
  assert.equal(requests, 3)
  assert.equal(result[0].evidence[0]?.text, 'Living room measures 18 by 16 feet.')
  assert.equal(result[0].evidence[0]?.sourceUrl, cards[0].officialUrls[0])
  assert.equal(result[1].evidence.length, 0)
  assert.equal(result[2].evidence.length, 1)
  assert.equal(result[3].evidence.length, 0)
})

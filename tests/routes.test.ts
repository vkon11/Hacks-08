import test from 'node:test'
import assert from 'node:assert/strict'
import { createRouteLookup, estimateRoute } from '../server/routes.ts'
import type { SearchSetup } from '../src/ideal/contracts.ts'

const ross = { lat: 42.273, lng: -83.74, source: 'map', landmarkId: null, label: 'Ross' } as const
const setup = (mode: 'walk' | 'bus'): SearchSetup => ({
  maxMonthlyCents: 150000, pin: ross, choices: {},
  travelModes: mode === 'walk' ? ['walk', 'bus', 'bike', 'car'] : ['bus', 'walk', 'bike', 'car'],
})
const origin = { lat: 42.2812, lng: -83.7430 } // about 0.9 km north of the pin

test('distance estimate is labeled and scales with mode', () => {
  const walk = estimateRoute(origin, setup('walk'))
  const bus = estimateRoute(origin, setup('bus'))
  assert.ok(walk.basis.startsWith('Estimate'))
  assert.ok(walk.minutes > 10 && walk.minutes < 20, String(walk.minutes))
  assert.ok(bus.minutes > 8, 'bus includes walk and wait')
})

test('no routing service configured falls back to the estimate', async () => {
  const route = await createRouteLookup('')(origin, setup('walk'))
  assert.ok(route?.basis.startsWith('Estimate'))
})

test('a failing routing service falls back, but a service "no route" stays unknown', async () => {
  const down = createRouteLookup('https://example.org/otp', async () => new Response('', { status: 503 }))
  assert.ok((await down(origin, setup('walk')))?.basis.startsWith('Estimate'))
  const noRoute = createRouteLookup('https://example.org/otp', async () => Response.json({ data: { planConnection: { edges: [] } } }))
  assert.equal(await noRoute(origin, setup('bus')), null)
})

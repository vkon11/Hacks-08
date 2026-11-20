import assert from 'node:assert/strict'
import { createServer, type RequestListener, type Server } from 'node:http'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { AddressInfo } from 'node:net'
import { createHousingApi } from '../server/api'

async function serve(handler: RequestListener) {
  const server: Server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    url: 'http://127.0.0.1:' + (server.address() as AddressInfo).port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  }
}
const setup = {
  maxMonthlyCents: 120000,
  pin: { lat: 42.28, lng: -83.74, label: 'My pin', source: 'map', landmarkId: null },
  travelModes: ['walk', 'bus', 'car', 'bike'],
  choices: {}
}
test('authenticated HTTP path filters an inventory file, ranks six distinct layouts and surfaces missing configuration', async (t) => {
  const folder = await mkdtemp(join(tmpdir(), 'housing-test-'))
  const auth = await serve((req, res) => {
    res.setHeader('Content-Type', 'application/json')
    if (req.url !== '/auth/v1/user' || req.headers.authorization === 'Bearer invalid') {
      res.writeHead(401).end('{}')
      return
    }
    res.end(
      JSON.stringify({
        id: 'fixture-user',
        email: req.headers.authorization === 'Bearer external' ? 'other@example.com' : 'fixture@umich.edu'
      })
    )
  })
  const env: Record<string, string | undefined> = {
    VITE_SUPABASE_URL: auth.url,
    VITE_SUPABASE_PUBLISHABLE_KEY: 'local-test-key'
  }
  const api = await serve(createHousingApi(env))
  t.after(async () => {
    await Promise.all([auth.close(), api.close(), rm(folder, { recursive: true, force: true })])
  })
  async function post(op: string, body: unknown, authToken = 'student') {
    const res = await fetch(api.url + '/api/housing/' + op, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: 'Bearer ' + authToken } : {})
      },
      body: JSON.stringify(body)
    })
    return { status: res.status, data: await res.json(), cache: res.headers.get('cache-control') }
  }
  assert.equal((await post('rank', { setup, criteria: [] }, '')).status, 401)
  assert.equal((await post('filter', { setup }, 'invalid')).status, 401)
  assert.equal((await post('filter', { setup }, 'external')).status, 403)
  assert.equal((await post('rank', { setup: { ...setup, travelModes: [] }, criteria: [] })).status, 400)
  assert.equal((await post('rank', { setup, criteria: [] })).data.status, 'no_inventory')
  assert.equal(
    (
      await post('interpret', {
        setup,
        criteria: [],
        messages: [{ id: 'one', role: 'student', text: 'big kitchen' }]
      })
    ).status,
    503
  )
  const sourceUrl = 'https://test.example/housing',
    checkedAt = '2026-10-01'
  const known = (value: unknown) => ({ state: 'known', value, evidenceIds: ['fact'] })
  const fixture = {
    schemaVersion: 1,
    inventoryVersion: 'fictional-integration',
    evidence: [{ id: 'fact', label: 'Fixture only', text: 'Synthetic offer sheet', sourceUrl, checkedAt }],
    buildings: [{ id: 'b', name: 'Fictional House', address: 'Fixture campus' }],
    layouts: Array.from({ length: 8 }, (_, i) => ({ id: 'l' + i, name: 'Layout ' + i, buildingId: 'b' })),
    options: Array.from({ length: 8 }, (_, i) => ({ id: 'r' + i, name: 'Room ' + i, layoutId: 'l' + i })),
    offers: Array.from({ length: 8 }, (_, i) => ({
      id: 'o' + i,
      name: 'Offer ' + i,
      optionId: 'r' + i,
      sourceUrl,
      checkedAt,
      monthlyTotalCents: known(104000 + i * 1000)
    }))
  }
  env.INVENTORY_PATH = join(folder, 'fictional.json')
  await writeFile(env.INVENTORY_PATH, JSON.stringify(fixture))
  const preliminary = await post('filter', { setup })
  assert.match(preliminary.data.message, /8 qualifying/)
  const ranked = await post('rank', { setup, criteria: [] })
  assert.equal(ranked.status, 200)
  assert.equal(ranked.cache, 'private, no-store')
  assert.deepEqual(
    ranked.data.matches.map((m: { layoutId: string }) => m.layoutId),
    ['l0', 'l1', 'l2', 'l3', 'l4', 'l5']
  )
  const hard = await post('rank', {
    setup: { ...setup, choices: { heat: { value: 'included', required: true } } },
    criteria: []
  })
  assert.deepEqual(hard.data.matches, [])
  assert.equal(hard.data.needsConfirmation.length, 8)
  await writeFile(env.INVENTORY_PATH, '{"malformed":true}')
  assert.equal((await post('rank', { setup, criteria: [] })).status, 503)
})

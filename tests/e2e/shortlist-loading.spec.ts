import { expect, test, type Page } from '../accountFixture'
import { storageKey } from '../../src/model/storage'
import { completeRecord, freshRecord } from '../../src/model/profile'

const base = freshRecord()
const record = completeRecord({
  ...base,
  draft: {
    ...base.draft,
    started: true,
    step: 'builder',
    budgetInput: '1500',
    budgetConfirmed: true,
    idealLocation: { lat: 42.273, lng: -83.74, source: 'map', landmarkId: null, label: 'Ross School of Business' },
    rankedTravelModes: ['walk', 'bus', 'bike', 'car'],
    locationConfirmed: true,
    essentialsConfirmed: true,
    checkpoint: true
  }
})
const match = (i: number) => ({
  layoutId: 'L' + i, optionId: 'O' + i, offerId: 'F' + i, buildingName: 'Fictional Home ' + i, address: i + ' Main St',
  layoutName: 'Studio', optionName: '12-month lease', reasons: [], monthlyCents: 120000 + i * 1000, commuteMinutes: 10 + i,
  routeBasis: 'Walking route', sourceUrl: 'https://example.com/' + i, checkedAt: '2026-11-20', availableFrom: null,
  availableUntil: null, coverage: null, score: null, unknowns: [], evidence: [], buildingLat: null, buildingLng: null,
  planUrl: null, bedrooms: null, bathrooms: null, apartmentSqFt: null
})
const result = (count: number) => ({
  status: 'ready', qualifiedLayouts: count, assessedLayouts: 0, routingUnavailable: false,
  qualitativeStatus: 'not_needed', needsConfirmation: [], matches: Array.from({ length: count }, (_, i) => match(i))
})

async function openSaved(page: Page) {
  await page.addInitScript(([k, v]: string[]) => localStorage.setItem(k, v), [storageKey('test-student'), JSON.stringify(record)])
  await page.goto('/preferences/saved')
}

test('a loading indicator shows until the finalists arrive', async ({ page }) => {
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/api/housing/rank', async (route) => {
    await held
    await route.fulfill({ json: result(5) })
  })
  await openSaved(page)
  await expect(page.getByText('Finding your finalists…')).toBeVisible()
  release()
  await expect(page.getByRole('heading', { name: 'Fictional Home 0' }).first()).toBeVisible()
  await expect(page.getByText('Finding your finalists…')).toHaveCount(0)
})

test('a stalled shortlist request ends in a retryable error instead of loading forever', async ({ page }) => {
  await page.clock.install()
  let calls = 0
  await page.route('**/api/housing/rank', async (route) => {
    if (++calls === 1) return // never answers
    await route.fulfill({ json: result(0) })
  })
  await openSaved(page)
  await expect(page.getByText('Finding your finalists…')).toBeVisible()
  await page.clock.fastForward(121_000) // just past REQUEST_TIMEOUT_MS in src/ideal/api.ts
  await expect(page.getByRole('alert')).toContainText('took too long')
  await expect(page.getByText('Finding your finalists…')).toHaveCount(0)
  await page.getByRole('button', { name: 'Retry shortlist' }).click()
  await expect(page.getByText('No floor plan clears every must-have yet.')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

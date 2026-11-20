import { expect, test, type Page } from '../accountFixture'
import { storageKey } from '../../src/model/storage'
import type { HousingRecord } from '../../src/model/profile'
import type { Criterion, Message } from '../../src/ideal/contracts'

const key = storageKey('test-student')
const noInventory = {
  status: 'no_inventory',
  matches: [],
  needsConfirmation: [],
  qualifiedLayouts: 0,
  assessedLayouts: 0,
  routingUnavailable: false,
  qualitativeStatus: 'not_needed'
}
const read = (page: Page): Promise<HousingRecord> =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key)

async function reachRequirements(page: Page) {
  await page.goto('/dashboard')
  await page.getByRole('link', { name: 'Start questionnaire' }).click()
  await page.getByLabel('Maximum monthly budget').fill('1423')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByLabel('Find a campus building or place').fill('Ross')
  await page.getByRole('button', { name: /Ross School of Business/ }).click()
  for (const name of ['Bus', 'Walk', 'Bike']) await page.getByRole('button', { name, exact: true }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page).toHaveURL(/\/essentials$/)
}
test.beforeEach(async ({ page }) => {
  await page.route('**/api/housing/filter', (route) =>
    route.fulfill({ json: { message: 'Apartment listings are coming soon.' } })
  )
  await page.route('**/api/housing/rank', (route) => route.fulfill({ json: noInventory }))
})
test('setup-only gate, saved-state reload, editable requirements and mode change', async ({ page }) => {
  await reachRequirements(page)
  await page.getByRole('button', { name: '750+ sq ft total', exact: true }).click()
  await page.getByRole('button', { name: 'Floor plan size required' }).click()
  await page.getByRole('button', { name: 'Central AC', exact: true }).click()
  await page.getByRole('button', { name: '30 minutes or less', exact: true }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  const results = page.getByRole('button', { name: 'Show my matches' })
  await expect(results).toBeDisabled()
  await page.getByRole('button', { name: 'Use my setup' }).click()
  await expect(page.getByRole('heading', { name: 'What I’m hearing' })).toBeVisible()
  await expect(results).toBeEnabled()
  await results.click()
  await expect(page.getByText('Apartment listings are coming soon.', { exact: false })).toBeVisible()
  const saved = (await read(page)).completed!
  expect(saved.setup.maxMonthlyCents).toBe(142300)
  expect(saved.setup.choices.area).toEqual({ value: '750', required: true })
  expect(saved.setup.choices.ac).toEqual({ value: 'central', required: false })
  expect(saved.brief.criteria).toEqual([])
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your housing brief is saved' })).toBeVisible()
  await page.getByRole('button', { name: 'Edit location & travel' }).click()
  await page.getByRole('button', { name: '2 Walk' }).click()
  await page.getByRole('button', { name: 'Move up' }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('button', { name: '30 minutes or less', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false'
  )
  expect((await read(page)).completed!.revision).toBe(saved.revision)
  await expect(page.getByRole('button', { name: 'Floor plan size required' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
})
test('chat can revise, remove and add ideas without leaving the brief', async ({
  page
}) => {
  let received = ''
  const editMessage = 'Actually skip the bike storage, change the bedroom light to a sunny living room, and add a balcony.'
  await page.route('**/api/housing/interpret', (route) => {
    const { messages } = route.request().postDataJSON() as { messages: Message[] }
    received = messages.at(-1)!.text
    const criteria: Criterion[] = [
      'Room for friends',
      'A sunny bedroom',
      'Bike storage',
      'Kitchen counter space'
    ].map((label, i) => ({
      id: 'c' + i,
      label,
      theme: i ? 'Daily life' : 'Hosting',
      condition: null,
      importance: 'ordinary',
      evidenceNeeded: 'Evidence of ' + label,
      sourceMessageIds: [messages[0].id]
    }))
    if (received === editMessage) {
      const sourceMessageIds = [messages.at(-1)!.id]
      criteria.splice(1, 2, { ...criteria[1], label: 'A sunny living room', sourceMessageIds })
      criteria.push({ ...criteria[0], id: 'balcony', label: 'A balcony', sourceMessageIds })
    }
    return route.fulfill({ json: { criteria, clarification: null } })
  })
  await reachRequirements(page)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  const input = page.getByRole('textbox', { name: 'Your ideas' })
  await input.fill('pregames, sun!! bike goes where? cook a ton')
  await input.press('Enter')
  await expect(page.getByRole('heading', { name: 'What I’m hearing' })).toBeVisible()
  expect(received).toContain('pregames')
  await expect(page.getByRole('button', { name: 'Natural light' })).toBeVisible()
  for (const label of ['That sounds right', 'Change something', 'Add more']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0)
  }
  await input.fill(editMessage)
  await input.press('Enter')
  const brief = page.getByRole('region', { name: 'Brief details' })
  await expect(brief.getByRole('heading', { name: 'A sunny living room', exact: true })).toBeVisible()
  await expect(brief.getByRole('heading', { name: 'Bike storage', exact: true })).toHaveCount(0)
  await expect(brief.getByRole('heading', { name: 'A balcony', exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Show my matches' }).click()
  await expect(page.getByText('Apartment listings are coming soon.', { exact: false })).toBeVisible()
  expect((await read(page)).completed!.brief.criteria.map(criterion => criterion.label)).toEqual([
    'Room for friends', 'A sunny living room', 'Kitchen counter space', 'A balcony'
  ])
})
test('on mobile a saved message survives model failure and retry opens a readable brief', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let attempts = 0
  await page.route('**/api/housing/interpret', (route) => {
    if (!attempts++)
      return route.fulfill({ status: 503, json: { error: 'The model is temporarily unavailable.' } })
    const { messages } = route.request().postDataJSON()
    return route.fulfill({
      json: {
        criteria: [
          {
            id: 'friends',
            theme: 'Social life',
            label: 'Space for friends',
            evidenceNeeded: 'Living room dimensions',
            importance: 'ordinary',
            condition: null,
            sourceMessageIds: [messages[0].id]
          }
        ],
        clarification: null
      }
    })
  })
  await reachRequirements(page)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Living room for friends', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable')
  await page.reload()
  await expect(page.getByRole('log')).toContainText('Living room for friends')
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  const modal = page.getByRole('dialog')
  await expect(modal.getByRole('heading', { name: 'What I’m hearing' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await modal.getByRole('button', { name: 'Show my matches' }).click()
  await expect(page.getByRole('heading', { name: 'Your housing brief is saved' })).toBeVisible()
})
test('legacy route resumes the first missing step and old browser profiles are cleared', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem('ann-arbor-housing-board:v1:guest', 'old')
    localStorage.setItem('keep-this', 'yes')
  })
  await page.goto('/preferences/board')
  await expect(page).toHaveURL(/\/budget$/)
  expect(
    await page.evaluate(() => [
      localStorage.getItem('ann-arbor-housing-board:v1:guest'),
      localStorage.getItem('keep-this')
    ])
  ).toEqual([null, 'yes'])
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.goto('/preferences/builder')
  await expect(page).toHaveURL(/\/location$/)
})

test('leaving during interpretation preserves the pending text and ignores the stale response', async ({
  page
}) => {
  let release!: () => void
  const wait = new Promise<void>((r) => {
    release = r
  })
  let received!: () => void
  const seen = new Promise<void>((r) => {
    received = r
  })
  await page.route('**/api/housing/interpret', async (route) => {
    received()
    await wait
    await route.fulfill({ json: { criteria: [], clarification: null } }).catch(() => {})
  })
  await reachRequirements(page)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'In-unit laundry', exact: true }).click()
  await seen
  await page.getByRole('link', { name: 'Back', exact: true }).click()
  await expect(page).toHaveURL(/\/essentials$/)
  release()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('needs interpretation')
  expect((await read(page)).draft.interpretedThrough).toBeNull()
  await page.getByRole('button', { name: 'Set aside unprocessed messages' }).click()
  await expect(page.getByRole('heading', { name: 'What I’m hearing' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show my matches' })).toBeEnabled()
})
test('a failed write from the mobile brief can be retried before showing the saved brief', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await reachRequirements(page)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Use my setup' }).click()
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (k, value) {
      if (k === key && JSON.parse(value).completed) {
        Storage.prototype.setItem = original
        throw new DOMException('Quota exceeded', 'QuotaExceededError')
      }
      original.call(this, k, value)
    }
  }, key)
  await page.getByRole('dialog').getByRole('button', { name: 'Show my matches' }).click()
  await expect(page.getByRole('alert')).toContainText('couldn’t be saved')
  expect((await read(page)).completed).toBeNull()
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your housing brief is saved' })).toBeVisible()
})

test('four messages open the brief automatically and a failed fifth leaves it available for retry', async ({ page }) => {
  const messagesFromScreenshot = [
    'big space for pregames',
    'super celan bathroom',
    'natural light in the living room',
    'gym in house',
    'social hallways'
  ]
  const labels = [
    'Room for friends',
    'A well-maintained bathroom',
    'Natural light in the living room',
    'Gym in the building',
    'Shared spaces for socializing'
  ]
  let failed = false
  await page.route('**/api/housing/interpret', async (route) => {
    const { messages, interpretedThrough } = route.request().postDataJSON() as {
      messages: Message[]
      interpretedThrough: string | null
    }
    if (messages.length === 5 && !failed) {
      failed = true
      return route.fulfill({ status: 503, json: { error: 'Temporarily unavailable. Your ideas are saved.' } })
    }
    const criteria: Criterion[] = messages.map((message, index) => ({
      id: 'idea-' + index,
      label: labels[index],
      theme: 'Apartment',
      importance: 'ordinary',
      evidenceNeeded: 'Listing evidence',
      condition: null,
      sourceMessageIds: [message.id]
    }))
    // Simulate an interpreter that missed the first two fragments on their own.
    const recognized = messages.length < 4 || (messages.length === 4 && interpretedThrough)
      ? criteria.slice(2)
      : criteria
    return route.fulfill({ json: { criteria: recognized, clarification: null } })
  })

  await reachRequirements(page)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  const input = page.getByRole('textbox', { name: 'Your ideas' })
  const checkpoint = page.getByRole('heading', { name: 'What I’m hearing' })
  async function sendIdea(index: number) {
    await input.fill(messagesFromScreenshot[index])
    const response = page.waitForResponse((res) => res.url().endsWith('/api/housing/interpret'))
    await input.press('Enter')
    await response
    await expect(page.getByText('Updating your brief…')).toHaveCount(0)
  }
  for (let index = 0; index < 4; index++) await sendIdea(index)
  await expect(checkpoint).toBeVisible()
  await expect(page.getByRole('heading', { name: 'A well-maintained bathroom' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Gym in the building' })).toBeVisible()

  await sendIdea(4)
  await expect(page.getByRole('alert')).toContainText('Your ideas are saved.')
  await expect(checkpoint).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Gym in the building' })).toBeVisible()
  await expect(page.getByRole('log')).toContainText('social hallways')
  await expect(page.getByRole('button', { name: 'Show my matches' })).toBeDisabled()
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Shared spaces for socializing' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show my matches' })).toBeEnabled()
})

test('the mobile checkpoint updates while typing and commits only the text sent', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let requests = 0
  await page.route('**/api/housing/interpret', (route) => {
    requests++
    const { messages } = route.request().postDataJSON() as { messages: Message[] }
    const latest = messages.at(-1)!
    return route.fulfill({ json: {
      criteria: [{
        id: 'light', label: latest.text, theme: 'Windows', importance: 'ordinary',
        evidenceNeeded: 'Window locations', sourceMessageIds: [latest.id], condition: null
      }],
      clarification: null
    } })
  })
  await reachRequirements(page)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Use my setup' }).click()
  const brief = page.getByRole('dialog')
  const input = brief.getByRole('textbox', { name: 'Your ideas' })
  const results = brief.getByRole('button', { name: 'Show my matches' })
  await input.fill('Morning sun')
  await expect(brief.getByRole('heading', { name: 'Morning sun' })).toBeVisible()
  await expect(results).toBeDisabled()
  expect((await read(page)).draft.messages).toEqual([])

  await input.fill('Afternoon sun')
  await expect(brief.getByRole('heading', { name: 'Afternoon sun' })).toBeVisible()
  await expect(brief.getByRole('heading', { name: 'Morning sun' })).toHaveCount(0)
  await brief.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(results).toBeEnabled()
  expect((await read(page)).draft.messages.map(message => message.text)).toEqual(['Afternoon sun'])
  expect(requests).toBe(2)
})

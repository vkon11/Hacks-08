import { expect, test } from '../accountFixture'
import type { Criterion, Message } from '../../src/ideal/contracts'

const noInventory = {
  status: 'no_inventory', matches: [], needsConfirmation: [], qualifiedLayouts: 0, assessedLayouts: 0,
  routingUnavailable: false, qualitativeStatus: 'not_needed'
}

test('ideas sent while the brief is still being read are kept, and matches wait for them', async ({ page }) => {
  await page.route('**/api/housing/filter', (route) => route.fulfill({ json: { message: 'Listings ready.' } }))
  await page.route('**/api/housing/rank', (route) => route.fulfill({ json: noInventory }))
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  let calls = 0
  await page.route('**/api/housing/interpret', async (route) => {
    const { messages } = route.request().postDataJSON() as { messages: Message[] }
    calls++
    await held // reading is slow; the student keeps typing
    const criteria: Criterion[] = messages
      .filter((m) => m.role === 'student')
      .map((m) => ({
        id: 'idea-' + m.id, label: 'Idea: ' + m.text, theme: 'Daily life', condition: null,
        importance: 'ordinary', evidenceNeeded: 'Evidence of ' + m.text, sourceMessageIds: [m.id]
      }))
    await route.fulfill({ json: { criteria, clarification: null } }).catch(() => {}) // superseded requests are aborted
  })

  await page.goto('/dashboard')
  await page.getByRole('link', { name: 'Build my shortlist' }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByLabel('Find a campus building or place').fill('Ross')
  await page.getByRole('button', { name: /Ross School of Business/ }).click()
  await page.getByRole('button', { name: 'Walk', exact: true }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Use my setup' }).click()

  const input = page.getByPlaceholder('Add an idea or tell us what to change…')
  await input.fill('lots of natural light')
  await input.press('Enter')
  await input.fill('a quiet building')
  await input.press('Enter')

  // Both messages are in the conversation and visibly waiting; matches can't be opened yet.
  await expect(input).toHaveValue('')
  await expect(page.locator('.message-state.is-unread')).toHaveCount(2)
  await expect(page.locator('.brief-preview-status')).toContainText('Reading 2 new ideas')
  const matches = page.locator('.builder-footer .btn-primary')
  await expect(matches).toHaveText(/Waiting for your brief/)
  await expect(matches).toBeDisabled()

  expect(calls).toBeGreaterThanOrEqual(2) // the second send restarted the read with both messages
  release()
  const brief = page.getByRole('region', { name: 'Brief details' })
  await expect(brief.getByRole('heading', { name: 'Idea: lots of natural light' })).toBeVisible()
  await expect(brief.getByRole('heading', { name: 'Idea: a quiet building' })).toBeVisible()
  await expect(page.locator('.message-state.is-unread')).toHaveCount(0)
  await expect(page.locator('.brief-preview-status')).toContainText('Brief up to date · 2 ideas')
  await expect(page.getByRole('button', { name: 'Show my matches' })).toBeEnabled()
})

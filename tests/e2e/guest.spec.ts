import { expect, test, type Page } from '@playwright/test'
import type { GuestRecord } from '../../src/model/types'

const guestKey = 'ann-arbor-housing-board:v1:guest'

async function latestRecord(page: Page): Promise<GuestRecord> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), guestKey)
}

async function reachBoard(page: Page) {
  await page.goto('/')
  await page.getByText('Start questionnaire', { exact: true }).click()
  await page.getByLabel('Maximum monthly budget').fill('1423')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByLabel('Find a campus landmark').fill('ross')
  await page.getByRole('button', { name: /Ross School of Business/ }).click()
  for (const name of ['Bus', 'Walk', 'Bike']) {
    await page.getByRole('button', { name, exact: true }).click()
  }
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page).toHaveURL(/\/preferences\/board$/)
}

test('a guest reloads offline and edits budget and commute mode independently', async ({ page, context }) => {
  await reachBoard(page)
  await page.getByRole('button', { name: 'Private bedroom', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'Private bedroom' })
  await editor.getByRole('radio', { name: 'Must have' }).check()
  await editor.getByRole('button', { name: 'Add to board' }).click()
  await page.getByRole('button', { name: /^Commute to my pin/ }).click()
  const commute = page.getByRole('dialog', { name: 'Commute to my pin' })
  await commute.getByRole('radio', { name: '15 min max' }).check()
  await commute.getByRole('radio', { name: 'Nice to have' }).check()
  await commute.getByRole('button', { name: 'Add to board' }).click()
  await page.getByRole('button', { name: 'Save my priorities' }).click()
  const summary = page.getByRole('heading', { name: 'Your priorities are saved' })
  await expect(summary).toBeVisible()
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible()

  const before = (await latestRecord(page)).completed!
  expect(before.budget.maxMonthlyCents).toEqual(142300)
  expect(before.idealLocation.landmarkId).toBe('ross')
  expect(before.rankedTravelModes).toEqual(['bus', 'walk', 'bike', 'car'])
  expect(before.factors).toEqual([
    { id: 'private_bedroom', value: true, lane: 'must', starred: false, rank: 1, rule: 'require', signedWeight: null },
    { id: 'commute_to_my_pin', value: 15, lane: 'want', starred: false, rank: 1, rule: 'soft', signedWeight: 1 },
  ])

  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller))
  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(summary).toBeVisible()
  await expect(page.getByText('Private bedroom', { exact: true })).toBeVisible()
  expect((await latestRecord(page)).completed).toEqual(before)
  await context.setOffline(false)

  await page.getByText('Edit budget', { exact: true }).click()
  await expect(page.getByLabel('Maximum monthly budget')).toHaveValue('1423')
  await page.getByLabel('Maximum monthly budget').fill('1750')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByLabel('Maximum monthly budget')).toHaveValue('1750')
  expect((await latestRecord(page)).completed).toEqual(before)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(summary).toBeVisible()
  const after = (await latestRecord(page)).completed!
  expect(after).toEqual({ ...before, budget: { ...before.budget, maxMonthlyCents: 175000 }, updatedAt: after.updatedAt })

  await page.getByText('Edit location & travel', { exact: true }).click()
  await page.getByRole('button', { name: '3 Bike' }).click()
  await page.getByRole('button', { name: 'Move up' }).click()
  await page.getByRole('button', { name: 'Move up' }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(summary).toBeVisible()
  await expect(page.getByText('Bike · 15 min max', { exact: true })).toBeVisible()
  const revised = (await latestRecord(page)).completed!
  expect(revised).toEqual({ ...after, rankedTravelModes: ['bike', 'bus', 'walk', 'car'], updatedAt: revised.updatedAt })
  await page.goto('/')
  await page.getByText('View my priorities', { exact: true }).click()
  await expect(summary).toBeVisible()
})

test('direct URLs preserve the first missing step until its answers are confirmed', async ({ page }) => {
  await page.goto('/preferences/saved')
  await expect(page).toHaveURL(/\/preferences\/budget$/)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.goto('/preferences/board')
  await expect(page).toHaveURL(/\/preferences\/location$/)
  await page.getByRole('button', { name: 'Bus', exact: true }).click()
  await page.goto('/')
  await page.getByText('Continue questionnaire', { exact: true }).click()
  await expect(page).toHaveURL(/\/preferences\/location$/)
  await expect(page.getByRole('button', { name: '1 Bus', exact: true })).toBeVisible()
})

test('a failed final write can be retried without losing or falsely confirming the empty profile', async ({ page }) => {
  await reachBoard(page)
  await page.getByRole('button', { name: 'Save my priorities' }).click()
  const confirm = page.getByRole('dialog', { name: 'Save without any extra priorities?' })
  await expect(confirm).toBeVisible()
  await page.evaluate(key => {
    const write = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, value) {
      if (name === key && JSON.parse(value).completed) {
        Storage.prototype.setItem = write
        throw new DOMException('Device quota exceeded', 'QuotaExceededError')
      }
      return write.call(this, name, value)
    }
  }, guestKey)
  await confirm.getByRole('button', { name: 'Save these preferences' }).click()
  await expect(page.getByText('Changes couldn’t be saved on this device', { exact: false })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your priorities are saved' })).toHaveCount(0)
  expect((await latestRecord(page)).completed).toBeNull()
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your priorities are saved' })).toBeVisible()
  await expect(page.getByText('You saved your budget, location and travel order without extra priorities.')).toBeVisible()
  const result = (await latestRecord(page)).completed!
  expect(result.factors).toEqual([])
  expect(result.idealLocation.landmarkId).toBe('ross')
})

test('another section of the saved snapshot can be edited while a budget edit is incomplete', async ({ page }) => {
  await reachBoard(page)
  await page.getByRole('button', { name: 'Save my priorities' }).click()
  await page.getByRole('button', { name: 'Save these preferences' }).click()
  await page.getByRole('button', { name: 'Edit budget' }).click()
  await page.getByLabel('Maximum monthly budget').fill('')
  await page.getByRole('link', { name: 'Back', exact: true }).click()
  await page.getByRole('button', { name: 'Edit location & travel' }).click()
  await expect(page).toHaveURL(/\/preferences\/location$/)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  expect((await latestRecord(page)).completed?.budget.maxMonthlyCents).toBe(142300)
})

test('budget rejects invalid input and keeps a typed high ceiling reachable with the slider', async ({ page }) => {
  await page.goto('/preferences/budget')
  const field = page.getByLabel('Maximum monthly budget')
  const slider = page.getByRole('slider')
  for (const invalid of ['', '-2', '1.5', 'two']) {
    await field.fill(invalid)
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(field).toBeFocused()
    await expect(page.getByText('Enter a whole-dollar amount of $0 or more.')).toBeVisible()
  }
  await field.fill('5001')
  await expect(slider).toHaveAttribute('max', '5500')
  await slider.press('ArrowLeft')
  await expect(field).toHaveValue('5000')
  await slider.press('ArrowRight')
  await expect(field).toHaveValue('5001')
})

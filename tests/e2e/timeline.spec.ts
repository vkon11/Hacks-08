import { expect, test } from '@playwright/test'

test('a signed-out student opens the leasing timeline from the landing page', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-20T12:00:00'))
  await page.goto('/')
  await page.getByRole('link', { name: 'See your leasing timeline' }).click()
  await expect(page).toHaveURL(/\/timeline$/)
  await expect(page.getByRole('heading', { name: 'When should you start looking?' })).toBeVisible()

  // Default move-in is next mid-August; occupied units open 210 days into a lease that began a year earlier.
  await expect(page.getByLabel('Move-in date')).toHaveValue('2027-08-15')
  const tours = page.locator('.milestone', { hasText: 'Tours and signing open for occupied units' })
  await expect(tours).toContainText('Mar 13, 2027')
  await expect(tours.getByRole('link', { name: /City of Ann Arbor/ })).toHaveAttribute('href', /a2gov\.org/)
  await expect(page.getByRole('status')).toContainText('83 days')
  await expect(page.locator('.track-legend')).toContainText('Tours open · Mar 13')

  // Moving the move-in date moves the map.
  await page.getByLabel('Move-in date').fill('2027-05-01')
  await expect(page.locator('.track-legend')).toContainText('Tours open · Nov 27')
  await page.getByLabel('Move-in date').fill('2027-08-15')

  await page.getByLabel(/Monthly rent per person/).fill('1200')
  await expect(page.locator('.milestone', { hasText: 'Have your deposit ready' })).toContainText('$1,800')

  await page.getByLabel('I rent in Ann Arbor now').check()
  await page.getByLabel('My current lease started').fill('2026-09-01')
  await expect(page.locator('.milestone', { hasText: 'Your renewal offer arrives' })).toContainText('Feb 28, 2027')
  await expect(page.locator('.track-legend .is-mine')).toHaveCount(2)

  await page.reload()
  await expect(page.getByLabel(/Monthly rent per person/)).toHaveValue('1200')
  await expect(page.locator('.milestone', { hasText: 'Your renewal offer arrives' })).toBeVisible()
})

import { test, expect } from '@playwright/test'

test('landing is public and dashboard and all questionnaire routes require sign-in', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Which Ann Arbor apartment fits the way you live?' })).toBeVisible()
  await page.getByRole('link', { name: 'Start questionnaire' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled()
  for (const path of ['/dashboard', '/preferences/budget', '/preferences/location', '/preferences/board', '/preferences/essentials', '/preferences/builder', '/preferences/saved']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Your dashboard' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Save my priorities' })).toHaveCount(0)
  }
})

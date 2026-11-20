import { test, expect } from '@playwright/test'

test('the landing page stays public and private pages require sign-in', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Get started' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled()
  for (const path of ['/dashboard', '/preferences/board', '/preferences/saved']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/login$/)
  }
})

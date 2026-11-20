import { expect, test } from '../accountFixture'

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

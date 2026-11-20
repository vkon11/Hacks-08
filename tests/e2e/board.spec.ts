import { expect, test, type Page } from '../accountFixture';

async function reachBoard(page: Page) {
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.goto('/dashboard');
  await page.getByText('Start questionnaire', { exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Continue', exact: true }).press('Enter');
  await page.getByLabel('Find a campus building or place').pressSequentially('Ross');
  await page.getByRole('button', { name: /Ross School of Business/ }).press('Enter');
  for (const mode of ['Walk', 'Bus', 'Bike']) {
    await page.getByRole('button', { name: mode, exact: true }).press('Enter');
  }
  await page.getByRole('button', { name: 'Continue', exact: true }).press('Enter');
  await expect(page.getByRole('heading', { name: 'What matters in your apartment?' })).toBeVisible();
}

test('a keyboard user can find, place, star, reorder, move and undo priorities before saving', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await reachBoard(page);
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  await button('Add a factor').press('Enter');
  const picker = page.getByRole('dialog', { name: 'Add a factor' });
  await expect(picker.locator('.factor-card')).toHaveCount(61);
  await picker.getByRole('searchbox').pressSequentially('Laundry');
  await picker.getByRole('button', { name: 'Laundry', exact: true }).press('Enter');
  await page.getByRole('radio', { name: 'In unit', exact: true }).press('Space');
  await page.getByRole('radio', { name: 'Nice to have' }).press('Space');
  await button('Add to board').press('Enter');
  const lane = page.getByRole('region', { name: 'Nice to have', exact: true });
  await expect(lane.getByRole('button', { name: /Laundry In unit/ })).toBeFocused();
  await button('Strong preference for Laundry').press('Enter');

  await button('Private bedroom').press('Enter');
  await page.getByRole('radio', { name: 'Nice to have' }).press('Space');
  await button('Add to board').press('Enter');
  await button('Strong preference for Private bedroom').press('Enter');
  await button('Move Private bedroom up').press('Enter');
  await expect(lane.getByRole('listitem').first()).toContainText('Private bedroom');

  await button('Move Laundry').press('Enter');
  await page.getByRole('radio', { name: 'Dealbreaker' }).press('Space');
  await button('Apply changes').press('Enter');
  await expect(page.getByRole('region', { name: 'Dealbreaker' })).toContainText('In unit');
  await button('Undo').press('Enter');
  await expect(button('Strong preference for Laundry')).toHaveAttribute('aria-pressed', 'true');
  await button('Save my priorities').press('Enter');
  await expect(page.getByRole('heading', { name: 'Your priorities are saved' })).toBeVisible();
  await page.reload();
  await expect(page.getByText('In unit', { exact: true })).toBeVisible();
});

test('a preset drop holds its destination until confirmed and cancellation leaves the board empty', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await reachBoard(page);
  const handle = page.getByRole('button', { name: 'Drag Laundry', exact: true });
  const lane = page.getByRole('region', { name: 'Nice to have', exact: true });
  await handle.dragTo(lane, { steps: 14 });
  const editor = page.getByRole('dialog', { name: 'Laundry', exact: true });
  await expect(editor.getByRole('radio', { name: 'Nice to have' })).toBeChecked();
  await editor.press('Escape');
  await expect(lane.getByRole('listitem')).toHaveCount(0);
  await handle.dragTo(lane, { steps: 14 });
  await editor.getByRole('radio', { name: 'In unit', exact: true }).press('Space');
  await editor.getByRole('button', { name: 'Add to board' }).press('Enter');
  await expect(lane.getByRole('listitem')).toHaveCount(1);
  await expect(lane.getByRole('listitem')).toContainText('In unit');
});

test.describe('touch board', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  test('a touch drag places a starter into an empty lane', async ({ page, context }) => {
    await reachBoard(page);
    const lane = page.getByRole('region', { name: 'Must have', exact: true });
    const handle = page.getByRole('button', { name: 'Drag Private bedroom', exact: true });
    await handle.scrollIntoViewIfNeeded();
    const from = (await handle.boundingBox())!;
    const to = (await lane.boundingBox())!;
    const client = await context.newCDPSession(page);
    const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    const goal = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    for (let i = 1; i <= 12; i++) {
      const point = { x: start.x + (goal.x - start.x) * i / 12, y: start.y + (goal.y - start.y) * i / 12 };
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(lane.getByRole('listitem')).toContainText('Private bedroom');
    await page.getByRole('button', { name: 'Save my priorities' }).tap();
    await expect(page.getByRole('heading', { name: 'Your priorities are saved' })).toBeVisible();
  });
});

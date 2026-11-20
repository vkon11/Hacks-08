import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { once } from 'node:events'
import { resolve } from 'node:path'
import { expect, test } from '../accountFixture'

test('production server returns six floor plans and recalculates after a budget edit', async ({ page }) => {
  const identity = createServer((req, res) => {
    if (req.url !== '/auth/v1/user' || !req.headers.authorization) {
      res.writeHead(401).end()
      return
    }
    res
      .writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ id: 'test-student', email: 'student@umich.edu' }))
  })
  identity.listen(0, '127.0.0.1')
  await once(identity, 'listening')
  const child = spawn(process.execPath, ['dist-server/start.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '0',
      OPENAI_API_KEY: '',
      OTP_GRAPHQL_URL: '',
      INVENTORY_PATH: resolve('tests/fixtures/fictional-inventory.json'),
      VITE_SUPABASE_URL: 'http://127.0.0.1:' + (identity.address() as AddressInfo).port,
      VITE_SUPABASE_PUBLISHABLE_KEY: 'fixture'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  try {
    const port = await new Promise<string>((ok, fail) => {
      child.once('exit', (code) => fail(Error('Production server exited with ' + code)))
      child.once('error', fail)
      child.stdout.on('data', (chunk) => {
        const m = String(chunk).match(/port (\d+)/)
        if (m) ok(m[1])
      })
    })
    await page.goto('http://127.0.0.1:' + port + '/dashboard')
    await page.getByRole('link', { name: 'Start questionnaire' }).click()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByLabel('Find a campus building or place').fill('Ross')
    await page.getByRole('button', { name: /Ross School of Business/ }).click()
    for (const name of ['Walk', 'Bus', 'Bike']) await page.getByRole('button', { name, exact: true }).click()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('button', { name: 'Central AC', exact: true }).click()
    await page.getByRole('button', { name: 'Air conditioning required' }).click()
    async function submitSetup() {
      await page.getByRole('button', { name: 'Continue', exact: true }).click()
      await page.getByRole('button', { name: 'Use my setup' }).click()
      await page.getByRole('button', { name: 'Show my matches' }).click()
    }
    await submitSetup()
    await expect(page.locator('.shortlist>li')).toHaveCount(6)
    await expect(page.locator('.shortlist>li').first()).toContainText('$1,090 per person')
    await page.locator('.shortlist>li .shortlist-summary').first().click()
    await page.locator('.shortlist>li').first().getByText('Sources for this match').click()
    await expect(
      page
        .locator('.shortlist>li')
        .first()
        .getByRole('link', { name: /fictional/i })
        .first()
    ).toBeVisible()
    await page.getByRole('button', { name: 'Edit budget' }).click()
    await page.getByLabel('Maximum monthly budget').fill('1100')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await submitSetup()
    await expect(page.locator('.shortlist>li')).toHaveCount(2)
    await page.reload()
    await expect(page.locator('.shortlist>li')).toHaveCount(2)
  } finally {
    child.kill()
    identity.closeAllConnections()
    await new Promise<void>((done) => identity.close(() => done()))
  }
})

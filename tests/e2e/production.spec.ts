import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { once } from 'node:events'
import { resolve } from 'node:path'
import { expect, test } from '../accountFixture'

test('the studio shows three picks while the Elo round compares all five finalists', async ({ page }) => {
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
    await page.getByRole('link', { name: 'Build my shortlist' }).click()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByLabel('Find a campus building or place').fill('Ross')
    await page.getByRole('button', { name: /Ross School of Business/ }).click()
    await page.getByRole('button', { name: 'Walk', exact: true }).click()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('group', { name: 'Air conditioning choices' }).getByRole('button', { name: 'Yes', exact: true }).click()
    async function submitSetup() {
      await page.getByRole('button', { name: 'Continue', exact: true }).click()
      await page.getByRole('button', { name: 'Use my setup' }).click()
      await page.getByRole('button', { name: 'Show my matches' }).click()
    }
    await submitSetup()
    const cards = page.locator('.shortlist > li')
    await expect(cards).toHaveCount(3)
    await expect(page.locator('.result-map-canvas button')).toHaveCount(3)
    const initialPicks = await cards.locator('h3').allTextContents()
    await expect(page.locator('.shortlist>li').first()).toContainText('$1,090')
    await page.locator('.shortlist>li').first().getByText('Evidence and assumptions').click()
    await expect(
      page
        .locator('.shortlist>li')
        .first()
        .getByRole('link', { name: 'Open source' })
        .first()
    ).toBeVisible()
    await page.getByRole('link', { name: 'Compare head to head' }).click()
    const choices = page.getByRole('button', { name: /^Choose .* at / })
    await expect(choices).toHaveCount(2)
    await expect(page.getByRole('heading', { name: 'Best-fit floor plans' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toBeHidden()
    await choices.first().click()
    await page.reload()
    await expect(page.getByText('Comparison 2 of 10', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Undo last choice' }).click()
    await expect(page.getByText('Comparison 1 of 10', { exact: true })).toBeVisible()
    const seen = new Set<string>()
    for (let i = 0; i < 10; i++) {
      await expect(choices).toHaveCount(2)
      const pair = (await choices.evaluateAll(nodes => nodes.map(n => n.getAttribute('aria-label')))).sort().join('|')
      expect(seen.has(pair)).toBe(false)
      seen.add(pair)
      await choices.last().click()
    }
    await expect(page.getByRole('heading', { name: 'Your personal top three' })).toBeVisible()
    await expect(page.locator('.final-podium > li')).toHaveCount(3)
    await page.reload()
    await expect(page.locator('.final-podium > li')).toHaveCount(3)
    const finalPicks = await page.locator('.final-podium h2').allTextContents()
    expect(finalPicks).not.toEqual(initialPicks)
    await page.getByRole('button', { name: 'Back to results' }).click()
    await expect(page.getByRole('heading', { name: 'Your top picks' })).toBeVisible()
    await expect(cards.locator('h3')).toHaveText(finalPicks)
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

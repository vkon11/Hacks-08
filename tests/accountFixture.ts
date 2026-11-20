import { test as base, expect } from '@playwright/test'

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      const expires = Math.floor(Date.now() / 1000) + 3600
      const user = { id: 'test-student', email: 'student@umich.edu', user_metadata: { full_name: 'Test Student' } }
      const payload = btoa(JSON.stringify({ sub: user.id, exp: expires }))
      localStorage.setItem('sb-olguszfrdrseguaqajst-auth-token', JSON.stringify({
        access_token: 'eyJhbGciOiJIUzI1NiJ9.' + payload + '.dGVzdA', refresh_token: 'test-only', expires_at: expires, user,
      }))
    })
    await page.route('https://*.supabase.co/rest/v1/**', route => route.fulfill({ json: [] }))
    await use(page)
  },
})
export { expect }
export type { Page } from '@playwright/test'

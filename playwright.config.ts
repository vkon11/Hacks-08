import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

const chromePaths = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/opt/google/chrome/chrome',
  ...[process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)']].filter(Boolean)
    .map(folder => folder + '/Google/Chrome/Application/chrome.exe'),
]
const baseURL = 'http://127.0.0.1:4173'

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  use: {
    baseURL,
    channel: chromePaths.some(path => existsSync(path)) ? 'chrome' : undefined,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
})

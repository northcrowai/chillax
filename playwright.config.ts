import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.CHILLAX_BASE_URL ?? 'http://127.0.0.1:4173'

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './output/playwright/test-results',
  reporter: [['list'], ['html', { outputFolder: './output/playwright/report', open: 'never' }]],
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.CHILLAX_BASE_URL
    ? undefined
    : {
        command: 'npm run preview',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    {
      name: 'edge',
      use: { ...devices['Desktop Chrome'], channel: 'msedge' },
    },
  ],
})

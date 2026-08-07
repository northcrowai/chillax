import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.CHILLAX_BASE_URL ?? 'http://127.0.0.1:4174'

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
        command: 'npx vite build --outDir dev-dist && npx vite preview --outDir dev-dist --host 127.0.0.1 --port 4174',
        env: {
          VITE_GOOGLE_ROUTES_API_KEY: 'e2e-routes-placeholder',
          VITE_GOOGLE_STATIC_MAPS_API_KEY: 'e2e-static-placeholder',
        },
        url: baseURL,
        reuseExistingServer: false,
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

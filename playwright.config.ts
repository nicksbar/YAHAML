import { defineConfig } from '@playwright/test'

const apiPort = Number(process.env.PLAYWRIGHT_API_PORT || 3100)
const uiPort = Number(process.env.PLAYWRIGHT_UI_PORT || 4173)
const databaseUrl = process.env.PLAYWRIGHT_DATABASE_URL || 'file:./data/yahaml-playwright.db'
const useExistingServer = process.env.PLAYWRIGHT_USE_EXISTING_SERVER === 'true'

export default defineConfig({
  testDir: './playwright/tests',
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${uiPort}`,
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: useExistingServer
    ? undefined
    : [
        {
          command: 'rm -f data/yahaml-playwright.db data/yahaml-playwright.db-journal && npm run db:push && npm run dev:api',
          url: `http://127.0.0.1:${apiPort}/health`,
          reuseExistingServer: false,
          timeout: 180_000,
          env: {
            DATABASE_URL: databaseUrl,
            PORT: String(apiPort),
            HOST: '127.0.0.1',
            RELAY_PORT: '11000',
            RELAY_HOST: '127.0.0.1',
            UDP_PORT: '3237',
            UDP_HOST: '127.0.0.1',
            NODE_ENV: 'test',
          },
        },
        {
          command: `npm --prefix ui run dev -- --host 127.0.0.1 --port ${uiPort}`,
          url: `http://127.0.0.1:${uiPort}`,
          reuseExistingServer: false,
          timeout: 120_000,
          env: {
            VITE_API_URL: `http://127.0.0.1:${apiPort}`,
          },
        },
      ],
})

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  webServer: {
    command: 'npm run dev',
    cwd: './template',
    url: 'http://localhost:5173',
    reuseExistingServer: true
  },
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1440, height: 900 },
    headless: true
  }
})
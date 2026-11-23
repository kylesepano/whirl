import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: 'tests',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    channel: process.env.WHIRL_BROWSER || undefined,
    baseURL: 'http://127.0.0.1:5178',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'npm run dev -- --port 5178',
    url: 'http://127.0.0.1:5178/api/health',
    reuseExistingServer: false,
    timeout: 45_000,
    env: {
      WHIRL_LOCAL_DIR: '.whirl/e2e/' + Date.now(),
      WHIRL_API_PORT: '4318',
      WHIRL_ADMIN_EMAIL: 'admin@whirl.example',
      WHIRL_ADMIN_PASSWORD: 'playwright-local-admin',
    },
  },
})

import nextEnv from '@next/env'
import { defineConfig, devices } from '@playwright/test'

// Playwright's own process doesn't read .env.local the way `next dev` does, so
// NEXT_PUBLIC_API_URL (and friends) would be undefined here even though the webServer
// picks them up fine. Load them the same way Next.js does so specs that gate on it run.
nextEnv.loadEnvConfig(process.cwd())

export default defineConfig({
  testDir: './e2e',
  // Specs share a single local auth backend whose default rate limiter allows only
  // 3 sign-up/sign-in requests per 10s per IP, so they can't run concurrently against it.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    // The offline/PWA specs need a real service worker, which `@serwist/next` only emits
    // for `next build` (it's disabled in `next dev` to avoid a rebuild loop — see
    // next.config.js). Run a production build rather than the dev server, so the service
    // worker is actually present for these specs to exercise. `pnpm start` also runs the
    // migrations, which the auth specs need when a database is configured.
    command: 'pnpm build && pnpm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})

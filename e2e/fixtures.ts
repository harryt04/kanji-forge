import { test as base, type Page } from '@playwright/test'

/** The API stack (Postgres + better-auth) is a separate deployment; when its origin
 * isn't configured, auth-dependent specs degrade to a skip instead of failing CI. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL

export interface AuthedUser {
  readonly email: string
  readonly password: string
}

/** Registers a fresh user directly against the auth API (bypassing the sign-up form) so
 * specs that aren't testing the form itself don't have to re-drive it every time.
 *
 * The auth backend enforces better-auth's default rate limit (3 sign-ups per 10s per IP),
 * which real e2e runs against a shared local backend can hit. Retry using the server's
 * X-Retry-After hint rather than treating it as a test failure. */
export async function registerUser(page: Page): Promise<AuthedUser> {
  if (!API_URL) throw new Error('NEXT_PUBLIC_API_URL is not configured.')
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@kanjiforge.test`
  const password = 'a-very-secure-password-123'

  for (let attempt = 0; ; attempt++) {
    const response = await page.request.post(
      `${API_URL}/api/auth/sign-up/email`,
      {
        data: { name: 'E2E Learner', email, password },
        headers: { 'content-type': 'application/json' },
      },
    )
    if (response.ok()) return { email, password }
    if (response.status() === 429 && attempt < 5) {
      const retryAfterSeconds = Number(
        response.headers()['x-retry-after'] ?? '2',
      )
      await new Promise((resolve) =>
        setTimeout(resolve, (retryAfterSeconds || 2) * 1000),
      )
      continue
    }
    throw new Error(
      `Failed to register the e2e test user: ${response.status()}`,
    )
  }
}

/** The service worker only intercepts navigations it's already controlling — a page it
 * merely installed under isn't covered until it claims clients. Wait for that here so
 * every navigation the test drives afterward is actually cached for offline use. */
async function waitForServiceWorkerControl(page: Page): Promise<void> {
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return
    await navigator.serviceWorker.ready
    if (navigator.serviceWorker.controller) return
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => resolve(),
        {
          once: true,
        },
      )
    })
  })
}

export const test = base.extend<{ authedUser: AuthedUser }>({
  authedUser: async ({ page }, use) => {
    const user = await registerUser(page)
    await page.goto('/home')
    // The authenticated shell renders two "Sign out" buttons — one in the
    // desktop sidebar, one in the mobile header — and hides whichever one
    // doesn't match the current viewport with CSS, not conditional
    // rendering. `page.waitForSelector('text=Sign out')` matches both and
    // (its pre-strict-mode API) waits on the first DOM match, which is the
    // sidebar's copy — permanently hidden below the `lg` breakpoint. Every
    // existing project was desktop-width, so that copy was always the
    // visible one and this never mattered; a mobile-width project hangs on
    // it forever. The CSS `:visible` pseudo-class, combined with `hasText`
    // via the locator API (not appended to a `text=` prefix — that consumes
    // the rest of the string as literal text to match, not a selector to
    // chain), scopes the wait to whichever copy the viewport actually shows.
    await page.locator('button:visible', { hasText: 'Sign out' }).waitFor()
    await waitForServiceWorkerControl(page)
    await use(user)
  },
})

export { expect } from '@playwright/test'

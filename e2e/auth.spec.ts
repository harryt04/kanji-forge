import { test as base, expect, type Page } from '@playwright/test'
import { API_URL } from './fixtures'

/** The auth backend enforces better-auth's default rate limit (3 sign-ups per 10s per
 * IP), which this suite's own sign-up traffic can trip. Retry through the form rather
 * than treating a transient 429 as a form bug. */
async function createAccountAndWaitForSignOut(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  const signedIn = page.getByRole('button', { name: 'Sign out' })
  // Scoped to the auth form's own error text: a generic `role=alert` locator can
  // also match unrelated live regions elsewhere in the page, causing false-positive
  // "rate limited" detections on a submit that actually succeeded.
  const rateLimited = page.getByText('Unable to create that account.')
  for (let attempt = 0; ; attempt++) {
    // `force` skips Playwright's element-stability wait: on a successful submit the
    // form unmounts almost immediately (fast local API), and the stability check can
    // otherwise lose the race and retry against a button that will never come back.
    await page
      .getByRole('button', { name: 'Create account' })
      .click({ force: true })
    const outcome = await Promise.race([
      signedIn.waitFor({ state: 'visible' }).then(() => 'signed-in' as const),
      rateLimited
        .waitFor({ state: 'visible' })
        .then(() => 'rate-limited' as const),
    ])
    if (outcome === 'signed-in') return
    if (attempt >= 5) throw new Error('Failed to create account: rate limited')
    await page.waitForTimeout(2000)
  }
}

base.describe('landing page', () => {
  base('renders publicly with no auth flash', async ({ page }) => {
    await page.goto('/')
    await expect(
      page.getByRole('heading', { name: /wall of color/ }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Create a free account' }).first(),
    ).toBeVisible()
  })

  // A signed-in visitor used to receive the marketing page, paint it, and only
  // then bounce to /home. Middleware now redirects before any HTML is generated,
  // so the marketing markup never reaches the browser at all.
  base(
    'redirects a signed-in visitor before sending any HTML',
    async ({ page, context }) => {
      await context.addCookies([
        {
          name: 'better-auth.session_token',
          value: 'e2e-session.signature',
          url: 'http://localhost:3000',
        },
      ])

      const response = await page.goto('/', { waitUntil: 'commit' })
      expect(new URL(page.url()).pathname).toBe('/home')
      expect(await response?.text()).not.toContain('wall of color')
    },
  )
})

base(
  'sign-in password has the exact accessible name Password',
  async ({ page }) => {
    await page.goto('/sign-in')
    const password = page.getByRole('textbox', {
      name: 'Password',
      exact: true,
    })
    await expect(password).toHaveAttribute('name', 'password')
    await expect(password).toHaveCount(1)
  },
)

base.describe('sign-in smoke', () => {
  base.skip(
    !API_URL,
    'NEXT_PUBLIC_API_URL is not configured; the auth backend is not reachable.',
  )

  base('registers a new account through the sign-up form', async ({ page }) => {
    await page.goto('/sign-up')
    await expect(
      page.getByRole('heading', { name: 'Create your account' }),
    ).toBeVisible()

    const email = `e2e-form-${Date.now()}@kanjiforge.test`
    await createAccountAndWaitForSignOut(
      page,
      email,
      'a-very-secure-password-123',
    )

    await expect(page).toHaveURL(/\/home$/)
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  base('signs out and returns to the auth form', async ({ page }) => {
    await page.goto('/sign-up')
    const email = `e2e-signout-${Date.now()}@kanjiforge.test`
    await createAccountAndWaitForSignOut(
      page,
      email,
      'a-very-secure-password-123',
    )
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()

    await page.getByRole('button', { name: 'Sign out' }).click({ force: true })
    await expect(
      page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible()
  })
})

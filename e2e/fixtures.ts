import { test as base, type Page } from '@playwright/test'

/** The API stack (Postgres + better-auth) is a separate deployment; when its origin
 * isn't configured, auth-dependent specs degrade to a skip instead of failing CI. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL

export interface AuthedUser {
  readonly email: string
  readonly password: string
}

/** Registers a fresh user directly against the auth API (bypassing the sign-up form) so
 * specs that aren't testing the form itself don't have to re-drive it every time. */
export async function registerUser(page: Page): Promise<AuthedUser> {
  if (!API_URL) throw new Error('NEXT_PUBLIC_API_URL is not configured.')
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@kanjiforge.test`
  const password = 'a-very-secure-password-123'
  const response = await page.request.post(
    `${API_URL}/api/auth/sign-up/email`,
    {
      data: { name: 'E2E Learner', email, password },
      headers: { 'content-type': 'application/json' },
    },
  )
  if (!response.ok())
    throw new Error(
      `Failed to register the e2e test user: ${response.status()}`,
    )
  return { email, password }
}

export const test = base.extend<{ authedUser: AuthedUser }>({
  authedUser: async ({ page }, use) => {
    const user = await registerUser(page)
    await page.goto('/')
    await page.waitForSelector('text=Sign out')
    await use(user)
  },
})

export { expect } from '@playwright/test'

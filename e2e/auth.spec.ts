import { test as base, expect } from '@playwright/test'
import { API_URL } from './fixtures'

base.describe('sign-in smoke', () => {
  base.skip(
    !API_URL,
    'NEXT_PUBLIC_API_URL is not configured; the auth backend is not reachable.',
  )

  base('registers a new account through the sign-up form', async ({ page }) => {
    await page.goto('/')
    await expect(
      page.getByRole('heading', { name: 'KanjiForge' }),
    ).toBeVisible()

    await page.getByText('New here? Create an account').click()
    const email = `e2e-form-${Date.now()}@kanjiforge.test`
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('a-very-secure-password-123')
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  })

  base('signs out and returns to the auth form', async ({ page }) => {
    await page.goto('/')
    await page.getByText('New here? Create an account').click()
    const email = `e2e-signout-${Date.now()}@kanjiforge.test`
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('a-very-secure-password-123')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(
      page.getByRole('heading', { name: 'KanjiForge' }),
    ).toBeVisible()
  })
})

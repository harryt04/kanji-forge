import { expect, test } from '@playwright/test'

/**
 * The theme used to be applied in a `useEffect`, so every dark-mode visitor got a
 * light frame first. These specs pin down the two things that removed it: the
 * resolver runs as a blocking script inside `<head>`, and it wins over the system
 * preference when the device has made an explicit choice.
 */
test.describe('appearance', () => {
  test.use({ colorScheme: 'dark' })

  test('resolves the theme in <head>, before the body can paint', async ({
    page,
  }) => {
    const response = await page.goto('/')
    const html = (await response?.text()) ?? ''

    const scriptIndex = html.indexOf('kanjiforge-theme')
    const bodyIndex = html.indexOf('<body')
    expect(scriptIndex).toBeGreaterThan(-1)
    expect(scriptIndex).toBeLessThan(bodyIndex)
    // The script patches this meta in place, so it has to be parsed first.
    expect(html.indexOf('name="theme-color"')).toBeLessThan(scriptIndex)

    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('keeps an explicit device choice over the system preference', async ({
    page,
  }) => {
    await page.goto('/')
    await page.evaluate(() =>
      window.localStorage.setItem('kanjiforge-theme', 'light'),
    )
    await page.reload()

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(page.locator('html')).not.toHaveClass(/dark/)
  })
})

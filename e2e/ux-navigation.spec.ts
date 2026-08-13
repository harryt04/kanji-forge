import { API_URL, expect, test } from './fixtures'

test.describe('authenticated navigation wayfinding', () => {
  test.skip(
    !API_URL,
    'NEXT_PUBLIC_API_URL is not configured; the auth backend is not reachable.',
  )

  for (const viewport of [375, 1440]) {
    test(`marks the current destination at ${viewport}px`, async ({ page }) => {
      await page.setViewportSize({ width: viewport, height: 900 })

      for (const route of [
        '/home',
        '/study',
        '/browse',
        '/history',
        '/dictionary',
        '/writing',
        '/help',
      ]) {
        await page.goto(route)
        const navigation = page.locator('nav[aria-label="Primary"]:visible')
        await navigation.waitFor()

        const metrics = await navigation.evaluate((nav) => {
          const active = nav.querySelector('a[aria-current="page"]')
          const links = Array.from(nav.querySelectorAll('a'))
          const inactive = links.find((link) => link !== active)
          if (!active || !inactive) {
            return null
          }

          const activeStyle = getComputedStyle(active)
          const inactiveStyle = getComputedStyle(inactive)
          return {
            activeHref: active.getAttribute('href'),
            activeColor: activeStyle.color,
            activeBackground: activeStyle.backgroundColor,
            activeWeight: activeStyle.fontWeight,
            inactiveColor: inactiveStyle.color,
            inactiveBackground: inactiveStyle.backgroundColor,
            inactiveWeight: inactiveStyle.fontWeight,
          }
        })

        expect(metrics, `${route} active navigation`).not.toBeNull()
        expect(metrics?.activeHref).toBe(route)
        expect(
          metrics?.activeColor !== metrics?.inactiveColor ||
            metrics?.activeBackground !== metrics?.inactiveBackground ||
            metrics?.activeWeight !== metrics?.inactiveWeight,
          `${route} active and inactive navigation styles should differ`,
        ).toBe(true)
      }
    })
  }
})

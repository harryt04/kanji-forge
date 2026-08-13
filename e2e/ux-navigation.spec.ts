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

  test('shows a visible edge fade when mobile destinations overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 900 })
    await page.goto('/home')

    const navigation = page.locator('nav[aria-label="Primary"]:visible')
    await navigation.waitFor()

    const metrics = await navigation.evaluate((nav) => {
      const cue = nav.parentElement?.querySelector<HTMLElement>(
        '[data-testid="navigation-overflow-cue"]',
      )
      if (!cue) return null

      const navRect = nav.getBoundingClientRect()
      const cueRect = cue.getBoundingClientRect()
      const style = getComputedStyle(cue)

      return {
        isOverflowing: nav.scrollWidth > nav.clientWidth,
        cueWidth: cueRect.width,
        cueWithinNav:
          cueRect.left >= navRect.left && cueRect.right <= navRect.right,
        cueBackground: style.backgroundImage,
        cueVisibility: style.visibility,
      }
    })

    expect(metrics, 'mobile navigation overflow cue').not.toBeNull()
    expect(metrics?.isOverflowing).toBe(true)
    expect(metrics?.cueWidth).toBeGreaterThan(0)
    expect(metrics?.cueWithinNav).toBe(true)
    expect(metrics?.cueBackground).toContain('gradient')
    expect(metrics?.cueVisibility).toBe('visible')
  })
})

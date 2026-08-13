import { API_URL, expect, test } from './fixtures'

test.describe('Settings section navigation', () => {
  test.skip(
    !API_URL,
    'NEXT_PUBLIC_API_URL is not configured; the auth backend is not reachable.',
  )

  for (const viewport of [375, 1440]) {
    test(`jumps to every major section at ${viewport}px`, async ({ page }) => {
      await page.setViewportSize({ width: viewport, height: 900 })
      await page.goto('/settings')
      await page.getByRole('heading', { name: 'Settings' }).waitFor()

      const navigation = page.getByRole('navigation', {
        name: 'Settings sections',
      })
      const linkData = await navigation.getByRole('link').evaluateAll((links) =>
        links.map((link) => ({
          label: link.textContent?.trim() ?? '',
          id: new URL(
            link.getAttribute('href') ?? '',
            window.location.href,
          ).hash.slice(1),
        })),
      )
      const headingIds = await page
        .locator('main.reading-page > section > h2[id]')
        .evaluateAll((headings) => headings.map((heading) => heading.id))

      expect(linkData.length, 'major section link count').toBeGreaterThan(0)
      expect(linkData.map(({ id }) => id)).toEqual(headingIds)

      for (const { label, id } of linkData) {
        const link = navigation.getByRole('link', { name: label, exact: true })
        await link.click()
        await expect(page).toHaveURL(new RegExp(`#${id}$`))

        const target = page.locator(`#${id}`)
        await expect(target).toBeVisible()
        const metrics = await target.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          const root = document.documentElement
          return {
            top: rect.top,
            bottom: rect.bottom,
            viewportHeight: window.innerHeight,
            clientWidth: root.clientWidth,
            scrollWidth: root.scrollWidth,
          }
        })

        expect(metrics.top, `${label} target top`).toBeGreaterThanOrEqual(0)
        expect(metrics.bottom, `${label} target bottom`).toBeLessThanOrEqual(
          metrics.viewportHeight,
        )
        expect(
          metrics.scrollWidth,
          `${label} horizontal overflow`,
        ).toBeLessThanOrEqual(metrics.clientWidth)
      }
    })
  }
})

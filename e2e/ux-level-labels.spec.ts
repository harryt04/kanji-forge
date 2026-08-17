import { API_URL, expect, test } from './fixtures'
import { forEachBrowseMenu } from './browse-menus'

test.describe('level swatch accessible names', () => {
  test.skip(
    !API_URL,
    'NEXT_PUBLIC_API_URL is not configured; the auth backend is not reachable.',
  )

  for (const route of ['/home', '/browse', '/detail', '/settings']) {
    test(`${route} names each visible level swatch with its belt`, async ({
      page,
    }) => {
      await page.goto(route)
      await page.locator('main').waitFor()

      const measureLabels = async () =>
        page
          .locator('.level-swatch, [data-testid="kanji-detail"]')
          .evaluateAll((swatches) =>
            swatches
              .filter((swatch) => swatch.getAttribute('aria-hidden') !== 'true')
              .map((swatch) => swatch.getAttribute('aria-label')),
          )

      const labels = await measureLabels()
      if (route === '/browse') {
        await forEachBrowseMenu(page, async () => {
          labels.push(...(await measureLabels()))
        })
      }

      for (const label of labels) {
        expect(label ?? '').toMatch(
          /(?:^|, )Level [0-4], (white \(Shiro\)|yellow \(Ki\)|green \(Midori\)|blue \(Ao\)|black \(Kuro\))/,
        )
      }
    })
  }
})

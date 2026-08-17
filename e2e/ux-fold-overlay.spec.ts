import { type Page } from '@playwright/test'
import { API_URL, expect, test } from './fixtures'
import { forEachBrowseMenu } from './browse-menus'

async function measureFoldAreas(page: Page, route: string): Promise<void> {
  const measurements = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.sticky-shape'))
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })
      .map((element) => {
        const rect = element.getBoundingClientRect()
        const fold = getComputedStyle(element, '::before')
        const foldWidth = Number.parseFloat(fold.width)
        const foldHeight = Number.parseFloat(fold.height)
        return {
          tag: element.tagName,
          width: rect.width,
          height: rect.height,
          foldWidth,
          foldArea: (foldWidth * foldHeight) / 2,
        }
      }),
  )

  expect(measurements.length, `${route} has visible swatches`).toBeGreaterThan(
    0,
  )
  for (const measurement of measurements) {
    expect(
      measurement.foldArea,
      `${route} ${measurement.tag} fold area`,
    ).toBeLessThan(measurement.width * measurement.height * 0.5)
  }
  expect(
    measurements.some((measurement) => measurement.foldWidth > 0),
    `${route} renders a non-zero fold`,
  ).toBeTruthy()
}

async function assertFoldAreas(page: Page, route: string): Promise<void> {
  await page.goto(route)
  await page.locator('.sticky-shape').first().waitFor()
  await measureFoldAreas(page, route)
}

test.describe('fold overlay proportions', () => {
  for (const viewport of [375, 1440]) {
    test(`keeps the marketing folds proportional at ${viewport}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport, height: 900 })
      await assertFoldAreas(page, '/')
    })
  }

  test.describe('authenticated app', () => {
    test.skip(
      !API_URL,
      'NEXT_PUBLIC_API_URL is not configured; the auth backend is not reachable.',
    )

    for (const viewport of [375, 1440]) {
      test(`keeps the fold from covering a majority of visible swatches at ${viewport}px`, async ({
        page,
        authedUser: _authedUser,
      }) => {
        await page.setViewportSize({ width: viewport, height: 900 })

        for (const route of [
          '/home',
          '/browse',
          '/detail?contentRef=kanji%3A%E6%97%A5',
        ]) {
          await assertFoldAreas(page, route)
          if (route === '/browse') {
            await forEachBrowseMenu(page, async (menuName) => {
              await measureFoldAreas(
                page,
                `${route} with ${menuName} menu open`,
              )
            })
          }
        }
      })
    }
  })
})

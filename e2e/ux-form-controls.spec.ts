import { test as publicTest } from '@playwright/test'
import { API_URL, expect, test } from './fixtures'

test.describe('form control type size', () => {
  test.skip(
    !API_URL,
    'NEXT_PUBLIC_API_URL is not configured; the auth backend is not reachable.',
  )

  test('keeps every form control at the 16px mobile minimum', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 900 })

    for (const { route, ready } of [
      { route: '/home', ready: '[data-testid="builtin-deck-shelf"]' },
      { route: '/study', ready: '[data-testid="study-question"]' },
      { route: '/browse', ready: '[data-testid="browse-card-list"]' },
      { route: '/dictionary', ready: 'h1' },
      {
        route: '/detail?contentRef=kanji%3A%E6%97%A5',
        ready: '[data-testid="kanji-detail"]',
      },
      { route: '/writing', ready: 'h1' },
      { route: '/settings', ready: 'h1' },
      { route: '/analyze', ready: '#analyze-text' },
    ]) {
      await page.goto(route)
      await page.locator(ready).waitFor()

      const controls = await page
        .locator('input, select, textarea')
        .evaluateAll((elements) =>
          elements.map((element) => ({
            tag: element.tagName.toLowerCase(),
            type: element.getAttribute('type'),
            fontSize: getComputedStyle(element).fontSize,
          })),
        )

      expect(
        controls.filter(({ fontSize }) => Number.parseFloat(fontSize) < 16),
        `${route} form controls below 16px`,
      ).toEqual([])
    }
  })
})

publicTest.describe('auth form control type size', () => {
  for (const route of ['/sign-in', '/sign-up']) {
    publicTest(
      `keeps ${route} controls at the 16px minimum`,
      async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 900 })
        await page.goto(route)
        await page.getByRole('heading').first().waitFor()

        const fontSizes = await page
          .locator('input, select, textarea')
          .evaluateAll((elements) =>
            elements.map((element) => getComputedStyle(element).fontSize),
          )

        expect(
          fontSizes.filter((fontSize) => Number.parseFloat(fontSize) < 16),
          `${route} form controls below 16px`,
        ).toEqual([])
      },
    )
  }
})

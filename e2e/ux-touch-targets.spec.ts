import { API_URL, expect, test } from './fixtures'

test.describe('authenticated touch targets', () => {
  test.skip(
    !API_URL,
    'NEXT_PUBLIC_API_URL is not configured; the auth backend is not reachable.',
  )

  const routes = [
    { path: '/home', ready: '[data-testid="builtin-deck-shelf"]' },
    { path: '/study', ready: '[data-testid="study-remaining"]' },
    { path: '/browse', ready: '[data-testid="browse-card-list"]' },
    { path: '/settings', ready: 'h1' },
    { path: '/dictionary', ready: 'h1' },
    { path: '/writing', ready: '[role="application"]' },
  ] as const

  for (const viewport of [375, 1440]) {
    for (const route of routes) {
      test(`${route.path} has 44px targets at ${viewport}px`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: viewport, height: 900 })
        await page.goto(route.path)
        await page.locator(route.ready).first().waitFor()

        const undersized = await page.evaluate(() => {
          const selectors = [
            'a',
            'button',
            'input:not([type="hidden"])',
            'select',
            'textarea',
            '[role="button"]',
            '[role="checkbox"]',
            '[role="radio"]',
          ]
          const elements = Array.from(
            new Set(
              selectors.flatMap((selector) =>
                Array.from(document.querySelectorAll<HTMLElement>(selector)),
              ),
            ),
          ).filter((element) => {
            const style = getComputedStyle(element)
            return (
              !element.classList.contains('sr-only') &&
              style.display !== 'none' &&
              style.visibility !== 'hidden'
            )
          })

          return elements.flatMap((element) => {
            // Native checkboxes keep their compact visual glyph; their label
            // is the intended tappable surface.
            const target =
              element instanceof HTMLInputElement &&
              (element.type === 'checkbox' || element.type === 'radio')
                ? (element.closest('label') ?? element)
                : element
            const rect = target.getBoundingClientRect()
            return rect.width >= 44 && rect.height >= 44
              ? []
              : [
                  {
                    tag: element.tagName.toLowerCase(),
                    label:
                      element.getAttribute('aria-label') ??
                      element.textContent?.trim().slice(0, 60) ??
                      '',
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                  },
                ]
          })
        })

        expect(undersized, `${route.path} undersized targets`).toEqual([])
      })
    }
  }
})

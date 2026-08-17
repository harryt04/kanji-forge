import { API_URL, expect, test } from './fixtures'
import { forEachBrowseMenu } from './browse-menus'

const japaneseText = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/u

test.describe('Japanese language metadata', () => {
  test.skip(
    !API_URL,
    'NEXT_PUBLIC_API_URL is not configured; the auth backend is not reachable.',
  )

  test('marks every rendered Japanese text node with lang=ja', async ({
    page,
  }) => {
    for (const { route, ready } of [
      { route: '/home', ready: '[data-testid="builtin-deck-shelf"]' },
      { route: '/study', ready: '[data-testid="study-question"]' },
      { route: '/browse', ready: '[data-testid="browse-cards"]' },
      {
        route: '/browse?deckId=dev-kanji&contentRef=kanji%3A%E6%97%A5',
        ready: '[data-testid="browse-detail-pane"]',
      },
      { route: '/history', ready: 'main' },
      { route: '/dictionary', ready: 'h1' },
      {
        route: '/detail?contentRef=kanji%3A%E6%97%A5',
        ready: '[data-testid="kanji-detail"]',
      },
      { route: '/writing', ready: 'h1' },
      { route: '/settings', ready: 'h1' },
      { route: '/analyze', ready: '#analyze-text' },
      { route: '/help', ready: 'main' },
    ]) {
      await page.goto(route)
      await page.locator(ready).waitFor()

      const findMissing = async () =>
        page.evaluate((pattern) => {
          const expression = new RegExp(pattern, 'u')
          const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
          )
          const failures: string[] = []
          let node = walker.nextNode()
          while (node) {
            const text = node.textContent?.trim() ?? ''
            const parent = node.parentElement
            if (
              parent &&
              text &&
              expression.test(text) &&
              !['SCRIPT', 'STYLE'].includes(parent.tagName) &&
              parent.closest('[lang]')?.getAttribute('lang') !== 'ja'
            ) {
              failures.push(text.slice(0, 80))
            }
            node = walker.nextNode()
          }
          return failures
        }, japaneseText.source)

      const missing = await findMissing()
      if (route === '/browse' || route.startsWith('/browse?')) {
        await forEachBrowseMenu(page, async () => {
          missing.push(...(await findMissing()))
        })
      }

      expect(missing, `${route} Japanese text`).toEqual([])
    }
  })
})

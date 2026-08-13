import { API_URL, expect, test } from './fixtures'

test.describe('authenticated layout overflow', () => {
  test.skip(
    !API_URL,
    'NEXT_PUBLIC_API_URL is not configured; the auth backend is not reachable.',
  )

  for (const viewport of [375, 768, 1440]) {
    test(`keeps Browse, Dictionary, and Detail within ${viewport}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport, height: 900 })

      for (const { route, readyTestId, readyHeading } of [
        {
          route: '/browse',
          readyTestId: 'browse-card-list',
        },
        {
          route: '/browse?deckId=dev-kanji&contentRef=kanji%3A%E6%97%A5',
          readyTestId: 'browse-detail-pane',
        },
        {
          route: '/dictionary',
          readyHeading: 'Dictionary',
        },
        {
          route: '/dictionary?contentRef=kanji%3A%E6%97%A5',
          readyTestId: 'dictionary-detail-pane',
        },
        {
          route: '/detail?contentRef=kanji%3A%E6%97%A5',
          readyTestId: 'kanji-detail',
        },
      ]) {
        await page.goto(route)
        if (readyTestId) await page.getByTestId(readyTestId).waitFor()
        if (readyHeading)
          await page.getByRole('heading', { name: readyHeading }).waitFor()

        const metrics = await page.evaluate(() => {
          const documentElement = document.documentElement
          const main = document.querySelector('main')
          const directTracks = main
            ? Array.from(main.children).filter(
                (element) =>
                  element.tagName === 'SECTION' || element.tagName === 'ASIDE',
              )
            : []
          const tracks = directTracks.length === 2 ? directTracks : []
          const [leftTrack, rightTrack] = tracks
          const leftRect = leftTrack?.getBoundingClientRect()
          const rightRect = rightTrack?.getBoundingClientRect()
          const crossTrackElements =
            leftRect && rightRect
              ? Array.from(leftTrack?.querySelectorAll('*') ?? [])
                  .map((element) => ({
                    element,
                    rect: element.getBoundingClientRect(),
                  }))
                  .filter(({ rect }) => rect.right > rightRect.left + 1)
                  .map(({ element }) => element.tagName.toLowerCase())
              : []

          return {
            clientWidth: documentElement.clientWidth,
            scrollWidth: documentElement.scrollWidth,
            crossTrackElements,
          }
        })

        expect(
          metrics.scrollWidth,
          `${route} scroll width`,
        ).toBeLessThanOrEqual(metrics.clientWidth)
        expect(
          metrics.crossTrackElements,
          `${route} left track overflow`,
        ).toEqual([])
      }
    })
  }

  test('keeps the Home deck action row within the mobile viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 900 })
    await page.goto('/home')
    await page.getByTestId('builtin-deck-shelf').waitFor()

    const metrics = await page.evaluate(() => {
      const documentElement = document.documentElement
      return {
        clientWidth: documentElement.clientWidth,
        scrollWidth: documentElement.scrollWidth,
      }
    })

    expect(metrics.scrollWidth, 'Home scroll width').toBeLessThanOrEqual(
      metrics.clientWidth,
    )
  })

  test('keeps the Study remaining count visible on mobile', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 900 })
    await page.goto('/study')
    const remaining = page.getByTestId('study-remaining')
    await remaining.waitFor()

    const metrics = await page.evaluate(() => {
      const documentElement = document.documentElement
      const element = document.querySelector('[data-testid="study-remaining"]')
      const rect = element?.getBoundingClientRect()
      return {
        clientWidth: documentElement.clientWidth,
        scrollWidth: documentElement.scrollWidth,
        remainingLeft: rect?.left ?? Number.NaN,
        remainingRight: rect?.right ?? Number.NaN,
      }
    })

    expect(metrics.scrollWidth, 'Study scroll width').toBeLessThanOrEqual(
      metrics.clientWidth,
    )
    expect(
      metrics.remainingLeft,
      'Remaining count left edge',
    ).toBeGreaterThanOrEqual(0)
    expect(
      metrics.remainingRight,
      'Remaining count right edge',
    ).toBeLessThanOrEqual(metrics.clientWidth)
  })

  for (const viewport of [375, 1440]) {
    test(`uses one reading width token across single-column screens at ${viewport}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport, height: 900 })

      const screens = [
        '/home',
        '/history',
        '/settings',
        '/writing?contentRef=kanji%3A%E6%97%A5',
        '/help',
      ]
      const maxWidths: string[] = []

      for (const route of screens) {
        await page.goto(route)
        const main = page.locator('main.reading-page')
        await main.waitFor()
        maxWidths.push(
          await main.evaluate((element) => {
            const root = getComputedStyle(document.documentElement)
            const pageStyle = getComputedStyle(element)
            return `${pageStyle.maxWidth}|${root.getPropertyValue('--content-reading-max').trim()}`
          }),
        )
      }

      expect(maxWidths).toEqual([
        '768px|48rem',
        '768px|48rem',
        '768px|48rem',
        '768px|48rem',
        '768px|48rem',
      ])
    })
  }
})

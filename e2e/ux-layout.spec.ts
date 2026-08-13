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
})

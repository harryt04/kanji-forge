import { API_URL, expect, test } from './fixtures'

test.describe('Browse Workbench', () => {
  test.skip(
    !API_URL,
    'NEXT_PUBLIC_API_URL is not configured; the auth backend is not reachable.',
  )

  test('renders a signed-in tile wall with measurable geometry', async ({
    page,
    authedUser: _authedUser,
  }) => {
    await page.goto('/browse')

    await expect(
      page.getByRole('heading', { name: 'Browse', exact: true }),
    ).toBeVisible()

    const tileWall = page.getByTestId('browse-tile-wall')
    await expect(tileWall).toBeVisible()

    const firstTile = page.getByTestId('browse-tile').first()
    await expect(firstTile).toBeVisible()

    const geometry = await firstTile.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { width: rect.width, height: rect.height }
    })

    expect(geometry.width).toBeGreaterThan(0)
    expect(geometry.height).toBeGreaterThan(0)
  })

  test('records the Browse workbench baseline geometry', async ({
    page,
    authedUser: _authedUser,
  }) => {
    const measurements: Array<Record<string, number | string>> = []

    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate((value) => {
        window.localStorage.setItem('kanjiforge-theme', value)
      }, theme)

      for (const viewport of [
        { name: '1440', width: 1440, height: 900 },
        { name: '375', width: 375, height: 667 },
      ]) {
        await page.setViewportSize(viewport)
        await page.goto('/browse')
        await expect(page.getByTestId('browse-tile-wall')).toBeVisible()

        const chrome = await page
          .getByTestId('browse-cards')
          .evaluate((element) => element.getBoundingClientRect().top)

        await page.getByLabel('Tile zoom').selectOption('1')
        await page.getByRole('button', { name: 'Select cards' }).click()
        const selectionCoverage = await page
          .getByTestId('browse-tile')
          .first()
          .evaluate((tile) => {
            const tileRect = tile.getBoundingClientRect()
            const overlay = tile.parentElement?.querySelector('label')
            if (!overlay) throw new Error('Selection overlay was not rendered')
            const overlayRect = overlay.getBoundingClientRect()
            const width = Math.max(
              0,
              Math.min(tileRect.right, overlayRect.right) -
                Math.max(tileRect.left, overlayRect.left),
            )
            const height = Math.max(
              0,
              Math.min(tileRect.bottom, overlayRect.bottom) -
                Math.max(tileRect.top, overlayRect.top),
            )
            return (width * height) / (tileRect.width * tileRect.height)
          })

        await page.getByRole('button', { name: 'Select cards' }).click()
        await page.getByLabel('Tile zoom').selectOption('0.75')
        const compactTile = await page
          .getByTestId('browse-tile')
          .first()
          .evaluate((element) => {
            const rect = element.getBoundingClientRect()
            return { width: rect.width, height: rect.height }
          })

        measurements.push({
          theme,
          viewport: viewport.name,
          chromeTop: chrome,
          selectionCoverage,
          compactTileWidth: compactTile.width,
          compactTileHeight: compactTile.height,
        })
      }
    }

    console.log(`BROWSE_BASELINE ${JSON.stringify(measurements)}`)
  })
})

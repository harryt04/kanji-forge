import { API_URL, expect, test } from './fixtures'
import type { Page } from '@playwright/test'
import { BROWSE_MENU_NAMES } from './browse-menus'

async function openViewMenu(page: Page) {
  await page.getByRole('menuitem', { name: 'View', exact: true }).click()
}

async function chooseViewOption(page: Page, name: string) {
  await openViewMenu(page)
  await page
    .getByRole('menuitemradio', { name, exact: true })
    .evaluate((element) => (element as HTMLElement).click())
}

async function toggleSelectionMode(page: Page) {
  await page.getByRole('menuitem', { name: 'Select', exact: true }).click()
  await page
    .getByRole('menuitemcheckbox', { name: 'Select cards', exact: true })
    .click()
}

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

  test('mounts Search, Sort, and Filter content only in the active menu', async ({
    page,
    authedUser: _authedUser,
  }) => {
    await page.goto('/browse')

    await expect(
      page.getByRole('searchbox', { name: 'Search this deck' }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('menuitemradio', { name: 'Deck order', exact: true }),
    ).toHaveCount(0)

    await page.getByRole('menuitem', { name: 'Search', exact: true }).click()
    await expect(
      page.getByRole('searchbox', { name: 'Search this deck' }),
    ).toBeVisible()

    await page.getByRole('menuitem', { name: 'Sort', exact: true }).hover()
    await expect(
      page.getByRole('searchbox', { name: 'Search this deck' }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('menuitemradio', { name: 'Deck order', exact: true }),
    ).toBeVisible()

    await page.getByRole('menuitem', { name: 'Filter', exact: true }).hover()
    await expect(
      page.getByRole('menuitemradio', { name: 'Deck order', exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('menuitemradio', { name: 'All levels', exact: true }),
    ).toBeVisible()
  })

  test('mounts View settings and defaults only inside the View menu', async ({
    page,
    authedUser: _authedUser,
  }) => {
    await page.goto('/browse')

    await expect(page.locator('#browse-tile-content')).toHaveCount(0)
    await expect(page.locator('#browse-tile-zoom')).toHaveCount(0)
    await expect(
      page.getByRole('menuitem', {
        name: 'Use these settings for all decks',
        exact: true,
      }),
    ).toHaveCount(0)

    await openViewMenu(page)
    await expect(
      page.getByRole('menuitemradio', { name: 'Tiles', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('menuitemradio', { name: 'Kanji', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('menuitemradio', {
        name: '100% · Standard',
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      page.getByRole('menuitem', {
        name: 'Use these settings for all decks',
        exact: true,
      }),
    ).toBeVisible()
  })

  test('keeps every Browse menu inside the mobile viewport while scrolling internally', async ({
    page,
    authedUser: _authedUser,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/browse')
    await expect(page.getByTestId('browse-tile-wall')).toBeVisible()

    for (const [index, menuName] of BROWSE_MENU_NAMES.entries()) {
      const trigger = page.getByRole('menuitem', {
        name: menuName,
        exact: true,
      })
      if (index === 0) await trigger.click()
      else await trigger.hover()

      const menu = page.locator(
        '[data-radix-menubar-content][data-state="open"]',
      )
      await expect(menu).toBeVisible()

      const metrics = await menu.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const lastInteractive = Array.from(
          element.querySelectorAll<HTMLElement>(
            '[role^="menuitem"], input, select, textarea',
          ),
        ).at(-1)
        if (!lastInteractive) throw new Error('Menu has no interactive item')

        const lastBeforeScroll = lastInteractive.getBoundingClientRect()
        const initialScrollTop = element.scrollTop
        element.scrollTop = element.scrollHeight
        const lastAfterScroll = lastInteractive.getBoundingClientRect()
        const isInside = (itemRect: DOMRect) =>
          itemRect.top >= rect.top && itemRect.bottom <= rect.bottom

        return {
          documentScrollWidth: document.documentElement.scrollWidth,
          documentClientWidth: document.documentElement.clientWidth,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          menu: {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
          },
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
          initialScrollTop,
          scrollTopAfter: element.scrollTop,
          lastBeforeScrollInside: isInside(lastBeforeScroll),
          lastAfterScrollInside: isInside(lastAfterScroll),
        }
      })

      expect(metrics.documentScrollWidth).toBeLessThanOrEqual(
        metrics.documentClientWidth,
      )
      expect(metrics.menu.left).toBeGreaterThanOrEqual(0)
      expect(metrics.menu.right).toBeLessThanOrEqual(metrics.viewportWidth)
      expect(metrics.menu.top).toBeGreaterThanOrEqual(0)
      expect(metrics.menu.bottom).toBeLessThanOrEqual(metrics.viewportHeight)
      expect(metrics.lastAfterScrollInside).toBe(true)
      if (metrics.scrollHeight > metrics.clientHeight) {
        expect(metrics.scrollTopAfter).toBeGreaterThan(metrics.initialScrollTop)
      } else {
        expect(metrics.lastBeforeScrollInside).toBe(true)
      }
    }

    await page.keyboard.press('Escape')
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

        await chooseViewOption(page, '100% · Standard')
        await toggleSelectionMode(page)
        const selectionTile = await page.getByTestId('browse-tile').first()
        const selectionGeometry = await selectionTile.evaluate((tile) => {
          const rect = tile.getBoundingClientRect()
          return { width: rect.width, height: rect.height }
        })

        await toggleSelectionMode(page)
        await chooseViewOption(page, '75% · Compact')
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
          selectionTileWidth: selectionGeometry.width,
          selectionTileHeight: selectionGeometry.height,
          compactTileWidth: compactTile.width,
          compactTileHeight: compactTile.height,
        })
      }
    }

    console.log(`BROWSE_BASELINE ${JSON.stringify(measurements)}`)
  })

  test('selection tiles stay visible and become the checkbox control', async ({
    page,
    authedUser: _authedUser,
  }) => {
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate((value) => {
        window.localStorage.setItem('kanjiforge-theme', value)
      }, theme)
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto('/browse')
      await expect(page.getByTestId('browse-tile-wall')).toBeVisible()
      await chooseViewOption(page, '100% · Standard')
      await toggleSelectionMode(page)

      const tile = page.getByTestId('browse-tile').first()
      await expect(tile).toHaveRole('checkbox')
      await expect(tile).toHaveAttribute('aria-checked', 'false')

      const before = await tile.evaluate((element) => {
        const style = getComputedStyle(element)
        return { background: style.backgroundColor, boxShadow: style.boxShadow }
      })

      const unpaintedDescendantBackgrounds = await tile.evaluate((element) =>
        [...element.querySelectorAll('*')]
          .map((descendant) => getComputedStyle(descendant).backgroundColor)
          .filter((background) => {
            if (background === 'transparent') return false
            const alpha = background.match(
              /rgba?\([^,]+,[^,]+,[^,]+,\s*([^)]+)\)/,
            )
            return alpha ? Number(alpha[1]) > 0 : true
          }),
      )
      expect(unpaintedDescendantBackgrounds).toEqual([])

      const expectedLevelBackground = await tile.evaluate((element) => {
        const level = element.getAttribute('data-level')
        const token = getComputedStyle(document.documentElement)
          .getPropertyValue(`--level-${level}`)
          .trim()
        const probe = document.createElement('span')
        probe.style.backgroundColor = token
        document.body.append(probe)
        const background = getComputedStyle(probe).backgroundColor
        probe.remove()
        return { background, token }
      })
      expect(before.background).toBe(expectedLevelBackground.background)

      await tile.click()
      await expect(tile).toHaveAttribute('aria-checked', 'true')
      await expect(
        tile.getByTestId('browse-tile-selection-check'),
      ).toBeVisible()

      const after = await tile.evaluate((element) => {
        const glyph = element.querySelector('span')
        if (!glyph) throw new Error('Tile glyph is missing')
        const glyphRect = glyph.getBoundingClientRect()
        const overlaps = [...element.querySelectorAll('*')]
          .filter((descendant) => descendant !== glyph)
          .some((descendant) => {
            const rect = descendant.getBoundingClientRect()
            return (
              rect.left < glyphRect.right &&
              rect.right > glyphRect.left &&
              rect.top < glyphRect.bottom &&
              rect.bottom > glyphRect.top
            )
          })
        return {
          boxShadow: getComputedStyle(element).boxShadow,
          overlaps,
        }
      })
      expect(after.boxShadow).not.toBe(before.boxShadow)
      expect(after.overlaps).toBe(false)
    }
  })

  test('compact tile targets stay at least 44px in both modes', async ({
    page,
    authedUser: _authedUser,
  }) => {
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate((value) => {
        window.localStorage.setItem('kanjiforge-theme', value)
      }, theme)

      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 375, height: 667 },
      ]) {
        await page.setViewportSize(viewport)
        await page.goto('/browse')
        await expect(page.getByTestId('browse-tile-wall')).toBeVisible()
        await chooseViewOption(page, '75% · Compact')

        for (const selectionMode of [false, true]) {
          if (selectionMode) {
            await toggleSelectionMode(page)
          }

          const dimensions = await page
            .getByTestId('browse-tile')
            .evaluateAll((tiles) =>
              tiles.map((tile) => {
                const rect = tile.getBoundingClientRect()
                return { width: rect.width, height: rect.height }
              }),
            )

          expect(dimensions.length).toBeGreaterThan(0)
          for (const dimension of dimensions) {
            expect(dimension.width).toBeGreaterThanOrEqual(44)
            expect(dimension.height).toBeGreaterThanOrEqual(44)
          }

          if (selectionMode) {
            await toggleSelectionMode(page)
          }
        }
      }
    }
  })
})

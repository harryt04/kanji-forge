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
})

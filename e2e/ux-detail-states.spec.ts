import { API_URL, expect, test } from './fixtures'

test.describe('Detail recovery states', () => {
  test.skip(
    !API_URL,
    'NEXT_PUBLIC_API_URL is not configured; the auth backend is not reachable.',
  )

  test('shows a not-found state for an unresolved content ref', async ({
    page,
  }) => {
    await page.goto(`/detail?contentRef=${encodeURIComponent('kanji:不存在')}`)

    await expect(page.getByTestId('detail-not-found')).toBeVisible()
    await expect(page.getByText("Couldn't find that card.")).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Back to Browse' }),
    ).toHaveAttribute('href', '/browse')
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  })
})

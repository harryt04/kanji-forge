import { API_URL, expect, test } from './fixtures'

test.describe('offline Japanese analyzer', () => {
  test.skip(
    !API_URL,
    'NEXT_PUBLIC_API_URL is not configured; the auth backend is not reachable.',
  )

  test('serves its tokenizer dictionary and completes analysis', async ({
    page,
  }) => {
    const dictionaryAsset = await page.request.get(
      '/packs/tokenizer/dict/base.dat.gz',
    )
    expect(dictionaryAsset).toBeOK()

    await page.goto('/analyze?text=%E3%81%8A%E9%87%91%E3%82%92')
    const results = page.getByLabel('Text analysis results')
    await expect(results).toBeVisible()
    await expect(results).toContainText('お金')
  })
})

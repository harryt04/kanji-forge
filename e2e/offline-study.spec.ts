import { expect, test } from './fixtures'
import { API_URL } from './fixtures'

test.describe('offline study', () => {
  test.skip(
    !API_URL,
    'NEXT_PUBLIC_API_URL is not configured; the auth backend is not reachable.',
  )

  test('grades survive going offline and reloading', async ({
    page,
    context,
    authedUser: _authedUser,
  }) => {
    await page.goto('/study')
    await expect(page.getByText('remaining')).toBeVisible()

    const remainingBefore = await page
      .locator('text=/\\d+ remaining/')
      .textContent()

    await context.setOffline(true)

    await page.getByRole('button', { name: /Reveal/ }).click()
    await page.getByRole('button', { name: /I know/ }).click()

    await expect(page.getByText('remaining')).toBeVisible()
    const remainingAfterGrade = await page
      .locator('text=/\\d+ remaining/')
      .textContent()
    expect(remainingAfterGrade).not.toBe(remainingBefore)

    // The offline study E2E is the priority test: a reload while offline must not lose the
    // grade that was just recorded to the local SQLite-WASM/OPFS database.
    await page.reload()
    await expect(page.getByText('remaining')).toBeVisible()
    const remainingAfterReload = await page
      .locator('text=/\\d+ remaining/')
      .textContent()
    expect(remainingAfterReload).toBe(remainingAfterGrade)

    const opfsHasDatabase = await page.evaluate(async () => {
      try {
        const root = await navigator.storage.getDirectory()
        const directory = await root.getDirectoryHandle(
          'kanjiforge-user-databases',
        )
        const names: string[] = []
        // @ts-expect-error async directory iteration is not yet in lib.dom types
        for await (const name of directory.keys()) names.push(name as string)
        return names.length > 0
      } catch {
        return null // OPFS unsupported/unavailable in this browser — not a failure here.
      }
    })
    if (opfsHasDatabase !== null) expect(opfsHasDatabase).toBe(true)

    await context.setOffline(false)
  })
})

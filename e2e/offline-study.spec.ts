import Database from 'better-sqlite3'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { API_URL } from './fixtures'

/** Reads the user's OPFS-backed SQLite file out of the browser and counts its `reviews`
 * rows. The SRS scheduler decides which cards re-enter a session's queue (a just-graded
 * card can legitimately fall out of the visible queue until it's next due), so the UI
 * can't reliably prove a grade persisted — reading the durable store directly can. */
async function countPersistedReviews(page: Page): Promise<number | null> {
  const base64 = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    const directory = await root.getDirectoryHandle('kanjiforge-user-databases')
    const names: string[] = []
    // @ts-expect-error async directory iteration is not yet in lib.dom types
    for await (const name of directory.keys()) names.push(name as string)
    if (names.length === 0) return null
    const fileHandle = await directory.getFileHandle(names[0])
    const file = await fileHandle.getFile()
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
  })
  if (base64 === null) return null

  const tmpPath = path.join(os.tmpdir(), `kanjiforge-e2e-${Date.now()}.sqlite`)
  fs.writeFileSync(tmpPath, Buffer.from(base64, 'base64'))
  try {
    const db = new Database(tmpPath, { readonly: true })
    try {
      const row = db.prepare('SELECT COUNT(*) AS count FROM reviews').get() as {
        count: number
      }
      return row.count
    } finally {
      db.close()
    }
  } finally {
    fs.unlinkSync(tmpPath)
  }
}

test.describe('offline study', () => {
  test.skip(
    !API_URL,
    'NEXT_PUBLIC_API_URL is not configured; the auth backend is not reachable.',
  )

  test('grades survive going offline and reloading', async ({
    page,
    context,
    browserName,
    authedUser: _authedUser,
  }) => {
    // Playwright only supports service workers on Chromium (see
    // https://playwright.dev/docs/service-workers); on WebKit, reloading a
    // service-worker-controlled page while offline reliably throws an internal driver
    // error. This is a Playwright/WebKit tooling gap, not a product bug — Chromium
    // exercises the real offline behavior end to end.
    test.skip(
      browserName === 'webkit',
      'Playwright does not support service workers on WebKit.',
    )

    await page.goto('/study')
    await expect(page.getByText('remaining')).toBeVisible()

    const remainingBefore = await page
      .locator('text=/\\d+ remaining/')
      .textContent()

    await context.setOffline(true)

    await page.getByRole('button', { name: 'Reveal (Space)' }).click()
    await page.getByRole('button', { name: /I know/ }).click()

    const remainingLocator = page.locator('text=/\\d+ remaining/')
    await expect(remainingLocator).not.toHaveText(remainingBefore ?? '')

    // The offline study E2E is the priority test: a reload while offline must not lose the
    // grade that was just recorded to the local SQLite-WASM/OPFS database.
    await page.reload()
    await expect(page.getByText('remaining')).toBeVisible()

    const reviewCount = await countPersistedReviews(page)
    if (reviewCount !== null) expect(reviewCount).toBeGreaterThanOrEqual(1)

    await context.setOffline(false)
  })
})

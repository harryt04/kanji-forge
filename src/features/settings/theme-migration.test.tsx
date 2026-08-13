import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bootstrapUserRuntime,
  clearUserRuntime,
  getActiveUserRuntime,
} from '@/auth/runtime'
import { createUserRepositories } from '@/data/repo'
import { FONT_SCALE_SETTING, THEME_SETTING } from './theme'
import { ThemeMigration } from './theme-migration'
import { FONT_SCALE_STORAGE_KEY, THEME_STORAGE_KEY } from './theme-storage'

describe('ThemeMigration', () => {
  let userId: string

  beforeEach(() => {
    window.localStorage.removeItem(THEME_STORAGE_KEY)
    window.localStorage.removeItem(FONT_SCALE_STORAGE_KEY)
    userId = `theme-migration-${crypto.randomUUID()}`
    bootstrapUserRuntime(userId)
  })

  afterEach(() => {
    clearUserRuntime()
    vi.restoreAllMocks()
  })

  async function saveLegacySettings(): Promise<void> {
    const runtime = getActiveUserRuntime()!
    await runtime.database.ready
    const settings = createUserRepositories(runtime.database).settings
    await settings.set({
      key: THEME_SETTING,
      value: 'night',
      updatedAt: Date.now(),
    })
    await settings.set({
      key: FONT_SCALE_SETTING,
      value: 'x-large',
      updatedAt: Date.now(),
    })
  }

  it('adopts the old database preference onto this device', async () => {
    await saveLegacySettings()
    render(<ThemeMigration userId={userId} />)

    await waitFor(() => {
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('night')
      expect(window.localStorage.getItem(FONT_SCALE_STORAGE_KEY)).toBe(
        'x-large',
      )
    })
  })

  it('leaves an existing device choice alone', async () => {
    await saveLegacySettings()
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light')
    window.localStorage.setItem(FONT_SCALE_STORAGE_KEY, 'default')

    render(<ThemeMigration userId={userId} />)

    // Nothing async should overwrite the device's own choice; give the effect a
    // chance to run and then confirm it did not.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(window.localStorage.getItem(FONT_SCALE_STORAGE_KEY)).toBe('default')
  })
})

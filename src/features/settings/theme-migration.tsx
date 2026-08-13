'use client'

import { useEffect } from 'react'
import { getActiveUserRuntime } from '@/auth/runtime'
import { createUserRepositories } from '@/data/repo'
import {
  FONT_SCALE_SETTING,
  isFontScalePreference,
  isThemePreference,
  THEME_SETTING,
} from './theme'
import {
  hasStoredFontScalePreference,
  hasStoredThemePreference,
  writeFontScalePreference,
  writeThemePreference,
} from './theme-storage'

/**
 * Appearance used to live in the per-user SQLite `settings` table. It is a device
 * setting now, so accounts created before the move still have their choice
 * stranded in the database. Copy it into localStorage once, the first time this
 * device signs in after the change; afterwards the localStorage value exists and
 * this does nothing. The old rows stay put — harmless, and the table is shared
 * with other settings.
 */
export function ThemeMigration({ userId }: { userId: string }): null {
  useEffect(() => {
    const needsTheme = !hasStoredThemePreference()
    const needsFontScale = !hasStoredFontScalePreference()
    if (!needsTheme && !needsFontScale) return

    const runtime = getActiveUserRuntime()
    if (!runtime || runtime.userId !== userId) return

    let cancelled = false
    void (async () => {
      await runtime.database.ready
      if (cancelled) return
      const settings = createUserRepositories(runtime.database).settings
      if (needsTheme) {
        const saved = await settings.get(THEME_SETTING)
        if (!cancelled && isThemePreference(saved?.value))
          writeThemePreference(saved.value)
      }
      if (needsFontScale) {
        const saved = await settings.get(FONT_SCALE_SETTING)
        if (!cancelled && isFontScalePreference(saved?.value))
          writeFontScalePreference(saved.value)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [userId])

  return null
}

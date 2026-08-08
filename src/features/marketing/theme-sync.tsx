'use client'

import { useEffect } from 'react'
import { applyTheme } from '@/features/settings/theme'

/**
 * Public pages have no signed-in user, so `ThemeController` (which reads a
 * per-user setting from the local SQLite database) never runs here. Follow
 * the system preference instead — the same default a fresh account gets.
 * Renders nothing; only toggles the `.dark` class the token layer reads.
 */
export function MarketingThemeSync(): null {
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    )
      return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = (): void => applyTheme(media.matches ? 'dark' : 'light')
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  return null
}

'use client'

import { useEffect } from 'react'
import { getActiveUserRuntime } from '@/auth/runtime'
import { createUserRepositories } from '@/data/repo'
import {
  applyTheme,
  isThemePreference,
  resolveTheme,
  THEME_SETTING,
  type ThemePreference,
} from './theme'

/** Applies the saved preference everywhere, including pages other than Settings. */
export function ThemeController({ userId }: { userId: string }): null {
  useEffect(() => {
    const runtime = getActiveUserRuntime()
    if (!runtime || runtime.userId !== userId) return

    let cancelled = false
    let preference: ThemePreference = 'system'
    const media =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null

    const renderTheme = (): void => {
      if (!cancelled)
        applyTheme(
          resolveTheme(preference, new Date(), media?.matches ?? false),
        )
    }

    void (async () => {
      await runtime.database.ready
      const saved = await createUserRepositories(runtime.database).settings.get(
        THEME_SETTING,
      )
      if (cancelled) return
      if (isThemePreference(saved?.value)) preference = saved.value
      renderTheme()
    })()

    const onSystemChange = (): void => {
      if (preference === 'system') renderTheme()
    }
    media?.addEventListener('change', onSystemChange)
    const timerId = window.setInterval(() => {
      if (preference === 'night') {
        // Re-evaluate at the minute boundary so the schedule changes without a reload.
        renderTheme()
      }
    }, 60_000)

    return () => {
      cancelled = true
      media?.removeEventListener('change', onSystemChange)
      window.clearInterval(timerId)
    }
  }, [userId])

  return null
}

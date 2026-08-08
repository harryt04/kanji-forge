'use client'

import { useEffect } from 'react'
import { getActiveUserRuntime } from '@/auth/runtime'
import { createUserRepositories } from '@/data/repo'
import {
  applyFontScale,
  applyTheme,
  FONT_SCALE_SETTING,
  getMillisecondsUntilNextMinute,
  isFontScalePreference,
  isThemePreference,
  resolveTheme,
  THEME_SETTING,
  type FontScalePreference,
  type ThemePreference,
} from './theme'

/** Applies the saved preference everywhere, including pages other than Settings. */
export function ThemeController({ userId }: { userId: string }): null {
  useEffect(() => {
    const runtime = getActiveUserRuntime()
    if (!runtime || runtime.userId !== userId) return

    let cancelled = false
    let preference: ThemePreference = 'system'
    let fontScale: FontScalePreference = 'default'
    let timerId: number | undefined
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

    const scheduleNightRefresh = (): void => {
      if (cancelled || preference !== 'night') return
      timerId = window.setTimeout(() => {
        renderTheme()
        scheduleNightRefresh()
      }, getMillisecondsUntilNextMinute(new Date()))
    }

    void (async () => {
      await runtime.database.ready
      const saved = await createUserRepositories(runtime.database).settings.get(
        THEME_SETTING,
      )
      const savedFontScale = await createUserRepositories(
        runtime.database,
      ).settings.get(FONT_SCALE_SETTING)
      if (cancelled) return
      if (isThemePreference(saved?.value)) preference = saved.value
      if (isFontScalePreference(savedFontScale?.value))
        fontScale = savedFontScale.value
      applyFontScale(fontScale)
      renderTheme()
      scheduleNightRefresh()
    })()

    const onSystemChange = (): void => {
      if (preference === 'system') renderTheme()
    }
    media?.addEventListener('change', onSystemChange)
    return () => {
      cancelled = true
      media?.removeEventListener('change', onSystemChange)
      if (timerId !== undefined) window.clearTimeout(timerId)
    }
  }, [userId])

  return null
}

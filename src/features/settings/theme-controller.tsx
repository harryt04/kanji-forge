'use client'

import { useEffect } from 'react'
import {
  applyFontScale,
  applyTheme,
  getMillisecondsUntilNextMinute,
  resolveTheme,
} from './theme'
import {
  readFontScalePreference,
  readThemePreference,
  THEME_CHANGE_EVENT,
} from './theme-storage'

/**
 * Keeps appearance current after the first paint. The pre-paint script in
 * `<head>` already applied the stored preference, so this component never causes
 * a visible change on load — it only reacts to what happens next: the system
 * switching to dark, the clock crossing the night boundary, or another tab
 * changing the setting.
 *
 * Mounted once in the root layout, so marketing, auth and app routes all behave
 * identically. Appearance is a device setting and needs no signed-in user.
 */
export function ThemeController(): null {
  useEffect(() => {
    let timerId: number | undefined
    const media =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null

    const render = (): void => {
      const preference = readThemePreference()
      applyTheme(resolveTheme(preference, new Date(), media?.matches ?? false))
      applyFontScale(readFontScalePreference())

      if (timerId !== undefined) window.clearTimeout(timerId)
      timerId = undefined
      // Night mode is the only preference whose result changes on its own.
      if (preference === 'night') {
        timerId = window.setTimeout(
          render,
          getMillisecondsUntilNextMinute(new Date()),
        )
      }
    }

    render()
    media?.addEventListener('change', render)
    window.addEventListener('storage', render)
    window.addEventListener(THEME_CHANGE_EVENT, render)
    return () => {
      media?.removeEventListener('change', render)
      window.removeEventListener('storage', render)
      window.removeEventListener(THEME_CHANGE_EVENT, render)
      if (timerId !== undefined) window.clearTimeout(timerId)
    }
  }, [])

  return null
}

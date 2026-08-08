import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyFontScale,
  applyTheme,
  getMillisecondsUntilNextMinute,
  isFontScalePreference,
  isNightWindow,
  isThemePreference,
  resolveTheme,
} from './theme'

describe('theme preferences', () => {
  beforeEach(() => {
    document.documentElement.className = ''
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-font-scale')
  })

  it('recognizes only supported persisted values', () => {
    expect(isThemePreference('night')).toBe(true)
    expect(isThemePreference('auto')).toBe(false)
    expect(isThemePreference(undefined)).toBe(false)
    expect(isFontScalePreference('large')).toBe(true)
    expect(isFontScalePreference('huge')).toBe(false)
  })

  it('uses the 21:00–06:00 local night window', () => {
    expect(isNightWindow(new Date(2026, 7, 7, 20, 59))).toBe(false)
    expect(isNightWindow(new Date(2026, 7, 7, 21, 0))).toBe(true)
    expect(isNightWindow(new Date(2026, 7, 8, 5, 59))).toBe(true)
    expect(isNightWindow(new Date(2026, 7, 8, 6, 0))).toBe(false)
    expect(resolveTheme('night', new Date(2026, 7, 7, 22))).toBe('dark')
    expect(resolveTheme('night', new Date(2026, 7, 7, 12))).toBe('light')
  })

  it('schedules night-mode refreshes on the next minute boundary', () => {
    expect(
      getMillisecondsUntilNextMinute(new Date(2026, 7, 7, 21, 0, 0, 0)),
    ).toBe(60_000)
    expect(
      getMillisecondsUntilNextMinute(new Date(2026, 7, 7, 20, 59, 59, 999)),
    ).toBe(1)
  })

  it('resolves explicit and device preferences', () => {
    expect(resolveTheme('light', new Date(), true)).toBe('light')
    expect(resolveTheme('dark', new Date(), false)).toBe('dark')
    expect(resolveTheme('system', new Date(), true)).toBe('dark')
    expect(resolveTheme('system', new Date(), false)).toBe('light')
  })

  it('applies the resolved theme and browser chrome color', () => {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.append(meta)

    applyTheme('dark')
    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(meta.content).toBe('#1c1a17')

    applyTheme('light')
    expect(document.documentElement).not.toHaveClass('dark')
    expect(meta.content).toBe('#f7f4ec')
  })

  it('applies the selected font scale to the app root', () => {
    applyFontScale('x-large')
    expect(document.documentElement.dataset.fontScale).toBe('x-large')

    applyFontScale('default')
    expect(document.documentElement.dataset.fontScale).toBe('default')
  })
})

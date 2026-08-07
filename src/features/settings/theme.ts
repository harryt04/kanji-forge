export const THEME_SETTING = 'theme'

export const THEME_PREFERENCES = ['light', 'dark', 'system', 'night'] as const

export type ThemePreference = (typeof THEME_PREFERENCES)[number]
export type ResolvedTheme = 'light' | 'dark'

export function isThemePreference(
  value: string | undefined,
): value is ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference)
}

/** StickyStudy's night window: dark from 21:00 through 05:59 local time. */
export function isNightWindow(date: Date): boolean {
  const hour = date.getHours()
  return hour >= 21 || hour < 6
}

export function resolveTheme(
  preference: ThemePreference,
  date: Date = new Date(),
  systemPrefersDark = false,
): ResolvedTheme {
  if (preference === 'dark') return 'dark'
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light'
  if (preference === 'night') return isNightWindow(date) ? 'dark' : 'light'
  return 'light'
}

export function applyTheme(theme: ResolvedTheme): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.dataset.theme = theme

  const themeColor = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )
  if (themeColor) themeColor.content = theme === 'dark' ? '#1c1a17' : '#f7f4ec'
}

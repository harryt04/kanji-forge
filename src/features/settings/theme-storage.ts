import {
  isFontScalePreference,
  isThemePreference,
  type FontScalePreference,
  type ThemePreference,
} from './theme'

/**
 * Appearance is a per-device, per-browser choice, not a synced account setting.
 * It lives in localStorage so the pre-paint script in `<head>` can read it
 * synchronously — the per-user SQLite database only opens after hydration, far
 * too late to decide the first paint. Keep these keys in sync with the literals
 * embedded in `theme-script.ts`.
 */
export const THEME_STORAGE_KEY = 'kanjiforge-theme'
export const FONT_SCALE_STORAGE_KEY = 'kanjiforge-font-scale'

/**
 * The browser's own `storage` event only fires in *other* tabs. This one covers
 * the tab that made the change, so `ThemeController` stays the single place that
 * applies appearance no matter who wrote the value.
 */
export const THEME_CHANGE_EVENT = 'kanjiforge:theme-change'

function read(key: string): string | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    return window.localStorage.getItem(key) ?? undefined
  } catch {
    // Storage can throw in private modes and under blocked third-party cookies.
    return undefined
  }
}

function write(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // The in-memory state still applies for this session; only persistence is lost.
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
}

/** The stored device preference, or `'system'` when nothing valid is stored. */
export function readThemePreference(): ThemePreference {
  const stored = read(THEME_STORAGE_KEY)
  return isThemePreference(stored) ? stored : 'system'
}

export function writeThemePreference(preference: ThemePreference): void {
  write(THEME_STORAGE_KEY, preference)
}

/** True when this device has never made an explicit choice — used by the migration. */
export function hasStoredThemePreference(): boolean {
  return isThemePreference(read(THEME_STORAGE_KEY))
}

export function readFontScalePreference(): FontScalePreference {
  const stored = read(FONT_SCALE_STORAGE_KEY)
  return isFontScalePreference(stored) ? stored : 'default'
}

export function writeFontScalePreference(
  preference: FontScalePreference,
): void {
  write(FONT_SCALE_STORAGE_KEY, preference)
}

export function hasStoredFontScalePreference(): boolean {
  return isFontScalePreference(read(FONT_SCALE_STORAGE_KEY))
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THEME_INIT_SCRIPT } from './theme-script'
import { FONT_SCALE_STORAGE_KEY, THEME_STORAGE_KEY } from './theme-storage'
import {
  applyFontScale,
  applyTheme,
  FONT_SCALE_PREFERENCES,
  resolveTheme,
  THEME_PREFERENCES,
} from './theme'

/** Snapshot of everything the pre-paint script is responsible for setting. */
function readDocumentState(): Record<string, string> {
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )
  return {
    dark: String(document.documentElement.classList.contains('dark')),
    theme: document.documentElement.dataset.theme ?? '',
    fontScale: document.documentElement.dataset.fontScale ?? '',
    themeColor: meta?.content ?? '',
  }
}

function resetDocument(): void {
  document.documentElement.className = ''
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-font-scale')
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.remove()
  const fresh = document.createElement('meta')
  fresh.name = 'theme-color'
  document.head.append(fresh)
}

function setSystemPrefersDark(prefersDark: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: prefersDark,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

describe('pre-paint theme script', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetDocument()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  const hours = [0, 5, 6, 12, 20, 21, 23]

  it('matches applyTheme(resolveTheme(...)) for every input combination', () => {
    for (const preference of THEME_PREFERENCES) {
      for (const fontScale of FONT_SCALE_PREFERENCES) {
        for (const systemPrefersDark of [true, false]) {
          for (const hour of hours) {
            const now = new Date(2026, 7, 7, hour, 30)
            vi.useFakeTimers()
            vi.setSystemTime(now)
            setSystemPrefersDark(systemPrefersDark)

            window.localStorage.setItem(THEME_STORAGE_KEY, preference)
            window.localStorage.setItem(FONT_SCALE_STORAGE_KEY, fontScale)
            resetDocument()
            ;(0, eval)(THEME_INIT_SCRIPT)
            const fromScript = readDocumentState()

            resetDocument()
            applyTheme(resolveTheme(preference, now, systemPrefersDark))
            applyFontScale(fontScale)
            const fromRuntime = readDocumentState()

            expect(fromScript, `${preference}/${fontScale}/${hour}`).toEqual(
              fromRuntime,
            )
            vi.useRealTimers()
          }
        }
      }
    }
  })

  it('falls back to the system preference when nothing is stored', () => {
    setSystemPrefersDark(true)
    ;(0, eval)(THEME_INIT_SCRIPT)
    expect(readDocumentState()).toEqual({
      dark: 'true',
      theme: 'dark',
      fontScale: 'default',
      themeColor: '#1c1a17',
    })
  })

  it('ignores unrecognized stored values', () => {
    setSystemPrefersDark(false)
    window.localStorage.setItem(THEME_STORAGE_KEY, 'sepia')
    window.localStorage.setItem(FONT_SCALE_STORAGE_KEY, 'gigantic')
    ;(0, eval)(THEME_INIT_SCRIPT)
    expect(readDocumentState()).toEqual({
      dark: 'false',
      theme: 'light',
      fontScale: 'default',
      themeColor: '#f7f4ec',
    })
  })

  it('never throws when storage is unavailable', () => {
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked')
      })
    expect(() => (0, eval)(THEME_INIT_SCRIPT)).not.toThrow()
    getItem.mockRestore()
  })
})

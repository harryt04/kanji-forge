'use client'

import { useEffect } from 'react'
import { getActiveUserRuntime } from '@/auth/runtime'
import { createUserRepositories } from '@/data/repo'
import { loadStarterDeck } from '@/features/study/deck-loader'
import { APP_BADGE_STATE_CHANGED_EVENT } from './events'

export { APP_BADGE_STATE_CHANGED_EVENT } from './events'

export const APP_BADGE_SETTING = 'app-badge'
export const APP_BADGE_SETTING_CHANGED_EVENT =
  'kanjiforge:app-badge-setting-changed'

export const APP_BADGE_PREFERENCES = ['due', 'total', 'off'] as const
export type AppBadgePreference = (typeof APP_BADGE_PREFERENCES)[number]

export function isAppBadgePreference(
  value: string,
): value is AppBadgePreference {
  return APP_BADGE_PREFERENCES.includes(value as AppBadgePreference)
}

export function countAppBadgeCards(
  cards: ReadonlyArray<{
    readonly state:
      { readonly level: number; readonly dueAt: number | null } | undefined
  }>,
  preference: AppBadgePreference,
  now: number,
): number {
  if (preference === 'off') return 0
  if (preference === 'total') return cards.length
  return cards.filter(
    (card) =>
      card.state === undefined ||
      (card.state.level >= 1 &&
        card.state.level <= 4 &&
        card.state.dueAt !== null &&
        card.state.dueAt <= now),
  ).length
}

type AppBadgeNavigator = Omit<Navigator, 'clearAppBadge' | 'setAppBadge'> & {
  setAppBadge?: (contents?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

const BADGE_ICON_BACKGROUND = '#e8e4dc'
const BADGE_ICON_FOREGROUND = '#27231f'
const BADGE_ICON_ACCENT = '#c87842'

function getFaviconLink(): HTMLLinkElement | null {
  if (typeof document === 'undefined') return null
  return document.querySelector<HTMLLinkElement>('link[rel="icon"]')
}

/** Creates a small, self-contained favicon badge for browsers without Badging API. */
export function createBrowserBadgeIconDataUrl(count: number): string {
  const label = count > 99 ? '99+' : String(Math.max(0, count))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="32" fill="${BADGE_ICON_BACKGROUND}"/><text x="78" y="119" fill="${BADGE_ICON_FOREGROUND}" font-family="serif" font-size="92" text-anchor="middle">鍛</text><circle cx="151" cy="43" r="36" fill="${BADGE_ICON_ACCENT}"/><text x="151" y="52" fill="${BADGE_ICON_BACKGROUND}" font-family="sans-serif" font-size="28" font-weight="700" text-anchor="middle">${label}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function updateBrowserBadgeIcon(
  link: HTMLLinkElement | null,
  originalHref: string | null,
  count: number,
): void {
  if (!link) return
  link.href =
    count > 0 ? createBrowserBadgeIconDataUrl(count) : (originalHref ?? '')
}

function getAppBadgeNavigator(): AppBadgeNavigator | undefined {
  if (typeof navigator === 'undefined') return undefined
  const candidate = navigator as AppBadgeNavigator
  return typeof candidate.setAppBadge === 'function' ? candidate : undefined
}

async function updateAppBadge(
  userId: string,
  fallbackTitle: string,
  faviconLink: HTMLLinkElement | null,
  originalFaviconHref: string | null,
): Promise<void> {
  const badgeNavigator = getAppBadgeNavigator()

  const runtime = getActiveUserRuntime()
  if (!runtime || runtime.userId !== userId) return
  await runtime.database.ready
  const repositories = createUserRepositories(runtime.database)
  const saved = await repositories.settings.get(APP_BADGE_SETTING)
  const savedPreference = saved?.value ?? ''
  const preference: AppBadgePreference = isAppBadgePreference(savedPreference)
    ? savedPreference
    : 'due'
  const deck = await loadStarterDeck(runtime.database)
  const count = countAppBadgeCards(deck.cards, preference, Date.now())

  if (!badgeNavigator) {
    document.title = count > 0 ? `${fallbackTitle} (${count})` : fallbackTitle
    updateBrowserBadgeIcon(faviconLink, originalFaviconHref, count)
    return
  }

  document.title = fallbackTitle
  updateBrowserBadgeIcon(faviconLink, originalFaviconHref, 0)
  if (count === 0) {
    if (typeof badgeNavigator.clearAppBadge === 'function') {
      try {
        await badgeNavigator.clearAppBadge()
      } catch {
        // Some browsers expose the API but reject it for the current display
        // mode or permission state. Keep the browser-only fallback visible.
        document.title = fallbackTitle
        updateBrowserBadgeIcon(faviconLink, originalFaviconHref, 0)
      }
    }
    return
  }
  try {
    await badgeNavigator.setAppBadge!(count)
  } catch {
    // The Badging API is optional and can fail at runtime even when present.
    // Title/favicon badges still provide useful feedback in that case.
    document.title = `${fallbackTitle} (${count})`
    updateBrowserBadgeIcon(faviconLink, originalFaviconHref, count)
  }
}

/** Keeps the install icon's optional badge aligned with local study state. */
export function AppBadgeController({
  userId,
}: {
  readonly userId: string
}): null {
  useEffect(() => {
    let active = true
    const fallbackTitle = document.title || 'KanjiForge'
    const faviconLink = getFaviconLink()
    const originalFaviconHref = faviconLink?.href ?? null

    const refresh = (): void => {
      void updateAppBadge(
        userId,
        fallbackTitle,
        faviconLink,
        originalFaviconHref,
      ).catch(() => {
        // A missing pack or rejected platform badge must never affect study.
      })
    }
    const onSettingChange = (): void => refresh()
    const onStateChange = (): void => refresh()
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') refresh()
    }

    refresh()
    const interval = window.setInterval(() => {
      if (active) refresh()
    }, 30_000)
    window.addEventListener('focus', refresh)
    window.addEventListener(APP_BADGE_SETTING_CHANGED_EVENT, onSettingChange)
    window.addEventListener(APP_BADGE_STATE_CHANGED_EVENT, onStateChange)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      window.removeEventListener(
        APP_BADGE_SETTING_CHANGED_EVENT,
        onSettingChange,
      )
      window.removeEventListener(APP_BADGE_STATE_CHANGED_EVENT, onStateChange)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      void getAppBadgeNavigator()?.clearAppBadge?.()
      document.title = fallbackTitle
      updateBrowserBadgeIcon(faviconLink, originalFaviconHref, 0)
    }
  }, [userId])

  return null
}

'use client'

import { useEffect } from 'react'
import { getActiveUserRuntime } from '@/auth/runtime'
import { createUserRepositories } from '@/data/repo'
import { loadStarterDeck } from '@/features/study/deck-loader'

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

function getAppBadgeNavigator(): AppBadgeNavigator | undefined {
  if (typeof navigator === 'undefined') return undefined
  const candidate = navigator as AppBadgeNavigator
  return typeof candidate.setAppBadge === 'function' ? candidate : undefined
}

async function updateAppBadge(userId: string): Promise<void> {
  const badgeNavigator = getAppBadgeNavigator()
  if (!badgeNavigator) return

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

  if (count === 0) {
    if (typeof badgeNavigator.clearAppBadge === 'function') {
      await badgeNavigator.clearAppBadge()
    }
    return
  }
  await badgeNavigator.setAppBadge!(count)
}

/** Keeps the install icon's optional badge aligned with local study state. */
export function AppBadgeController({
  userId,
}: {
  readonly userId: string
}): null {
  useEffect(() => {
    let active = true

    const refresh = (): void => {
      void updateAppBadge(userId).catch(() => {
        // A missing pack or rejected platform badge must never affect study.
      })
    }
    const onSettingChange = (): void => refresh()
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') refresh()
    }

    refresh()
    const interval = window.setInterval(() => {
      if (active) refresh()
    }, 30_000)
    window.addEventListener('focus', refresh)
    window.addEventListener(APP_BADGE_SETTING_CHANGED_EVENT, onSettingChange)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      window.removeEventListener(
        APP_BADGE_SETTING_CHANGED_EVENT,
        onSettingChange,
      )
      document.removeEventListener('visibilitychange', onVisibilityChange)
      void getAppBadgeNavigator()?.clearAppBadge?.()
    }
  }, [userId])

  return null
}

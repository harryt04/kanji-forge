'use client'

import { useEffect } from 'react'
import { getActiveUserRuntime } from '@/auth/runtime'
import { createUserRepositories } from '@/data/repo'
import { loadStarterDeck } from '@/features/study/deck-loader'

export const DAILY_REMINDER_ENABLED_SETTING =
  'notifications.daily-reminder.enabled'
export const DAILY_REMINDER_TIME_SETTING = 'notifications.daily-reminder.time'
export const DAILY_REMINDER_SETTING_CHANGED_EVENT =
  'kanjiforge:daily-reminder-setting-changed'
export const DEFAULT_DAILY_REMINDER_TIME = '19:00'

export function isDailyReminderTime(value: string): boolean {
  if (!/^\d{2}:\d{2}$/u.test(value)) return false
  const hours = Number(value.slice(0, 2))
  const minutes = Number(value.slice(3, 5))
  return (
    Number.isInteger(hours) &&
    Number.isInteger(minutes) &&
    hours >= 0 &&
    hours <= 23 &&
    minutes >= 0 &&
    minutes <= 59
  )
}

/** Returns the next local occurrence of a HH:mm reminder. */
export function nextDailyReminderAt(time: string, now: Date): Date | null {
  if (!isDailyReminderTime(time)) return null
  const hours = Number(time.slice(0, 2))
  const minutes = Number(time.slice(3, 5))
  const next = new Date(now)
  next.setHours(hours, minutes, 0, 0)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  return next
}

export function countDueReminderCards(
  cards: ReadonlyArray<{
    readonly state:
      { readonly level: number; readonly dueAt: number | null } | undefined
  }>,
  now: number,
): number {
  return cards.filter(
    (card) =>
      card.state === undefined ||
      (card.state.level >= 1 &&
        card.state.level <= 4 &&
        card.state.dueAt !== null &&
        card.state.dueAt <= now),
  ).length
}

export type DailyReminderPermission = NotificationPermission | 'unsupported'

export async function requestDailyReminderPermission(): Promise<DailyReminderPermission> {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission === 'default')
    return Notification.requestPermission()
  return Notification.permission
}

function canNotify(): boolean {
  return (
    typeof Notification !== 'undefined' && Notification.permission === 'granted'
  )
}

async function scheduleReminder(
  userId: string,
  onReminderFired: () => void,
): Promise<() => void> {
  if (!canNotify()) return () => undefined
  const runtime = getActiveUserRuntime()
  if (!runtime || runtime.userId !== userId) return () => undefined

  await runtime.database.ready
  const repositories = createUserRepositories(runtime.database)
  const [enabled, savedTime] = await Promise.all([
    repositories.settings.get(DAILY_REMINDER_ENABLED_SETTING),
    repositories.settings.get(DAILY_REMINDER_TIME_SETTING),
  ])
  if (enabled?.value !== 'true') return () => undefined

  const time = isDailyReminderTime(savedTime?.value ?? '')
    ? savedTime!.value
    : DEFAULT_DAILY_REMINDER_TIME
  const next = nextDailyReminderAt(time, new Date())
  if (!next) return () => undefined

  const timeout = window.setTimeout(
    () => {
      void (async () => {
        try {
          const currentRuntime = getActiveUserRuntime()
          if (!currentRuntime || currentRuntime.userId !== userId) return
          const deck = await loadStarterDeck(currentRuntime.database)
          const due = countDueReminderCards(deck.cards, Date.now())
          if (due > 0 && canNotify()) {
            new Notification('KanjiForge study reminder', {
              body: `${due} card${due === 1 ? '' : 's'} ready to study.`,
              tag: 'kanjiforge-daily-reminder',
            })
          }
        } catch {
          // A reminder must never affect the study loop if the local pack is unavailable.
        } finally {
          onReminderFired()
        }
      })()
    },
    Math.max(0, next.getTime() - Date.now()),
  )

  return () => window.clearTimeout(timeout)
}

/** Schedules the optional local fallback reminder for the signed-in user. */
export function DailyReminderController({
  userId,
}: {
  readonly userId: string
}): null {
  useEffect(() => {
    let cancel: (() => void) | undefined
    let active = true

    const refresh = (): void => {
      if (!active) return
      cancel?.()
      cancel = undefined
      void scheduleReminder(userId, refresh).then((nextCancel) => {
        if (!active) {
          nextCancel()
          return
        }
        cancel = nextCancel
      })
    }
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') refresh()
    }

    refresh()
    window.addEventListener(DAILY_REMINDER_SETTING_CHANGED_EVENT, refresh)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      active = false
      cancel?.()
      window.removeEventListener(DAILY_REMINDER_SETTING_CHANGED_EVENT, refresh)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [userId])

  return null
}

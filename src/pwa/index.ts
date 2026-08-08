'use client'

import { useEffect } from 'react'
export {
  APP_BADGE_PREFERENCES,
  APP_BADGE_SETTING,
  APP_BADGE_SETTING_CHANGED_EVENT,
  AppBadgeController,
  countAppBadgeCards,
  isAppBadgePreference,
  type AppBadgePreference,
} from './app-badge'
export {
  DAILY_REMINDER_ENABLED_SETTING,
  DAILY_REMINDER_SETTING_CHANGED_EVENT,
  DAILY_REMINDER_TIME_SETTING,
  DEFAULT_DAILY_REMINDER_TIME,
  DailyReminderController,
  countDueReminderCards,
  isDailyReminderTime,
  nextDailyReminderAt,
  requestDailyReminderPermission,
  type DailyReminderPermission,
} from './daily-reminder'

/** Register the build-generated Serwist worker without making startup network-dependent. */
export function PwaRegistration(): null {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Browsers can reject registration in private browsing, embedded webviews,
      // or development servers. The app remains usable without the worker.
    })
  }, [])

  return null
}

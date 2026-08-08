'use client'

import { useEffect } from 'react'
export {
  APP_BADGE_PREFERENCES,
  APP_BADGE_SETTING,
  APP_BADGE_SETTING_CHANGED_EVENT,
  APP_BADGE_STATE_CHANGED_EVENT,
  AppBadgeController,
  countAppBadgeCards,
  isAppBadgePreference,
  type AppBadgePreference,
} from './app-badge'
export { requestAppBadgeRefresh } from './events'
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
export {
  getStoragePersistenceStatus,
  requestStoragePersistence,
  requestStoragePersistenceAfterSession,
  STORAGE_PERSISTENCE_REQUESTED_SETTING,
  type StoragePersistenceStatus,
} from './storage-persistence'
export {
  disableBackgroundPush,
  enableBackgroundPush,
  type BackgroundPushStatus,
} from './push'

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

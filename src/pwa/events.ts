'use client'

export const APP_BADGE_STATE_CHANGED_EVENT =
  'kanjiforge:app-badge-state-changed'

/** Ask the mounted badge controller to read the local study projection again. */
export function requestAppBadgeRefresh(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(APP_BADGE_STATE_CHANGED_EVENT))
}

import { describe, expect, it } from 'vitest'
import {
  isReminderMinute,
  isPushSubscriptionExpired,
  isValidPushSubscription,
  reminderPayload,
} from './push'

describe('background push reminders', () => {
  it('validates browser subscriptions without trusting arbitrary endpoints', () => {
    expect(
      isValidPushSubscription({
        endpoint: 'https://push.example.test/subscription',
        keys: { p256dh: 'public-key', auth: 'auth-secret' },
        timezone: 'America/Denver',
      }),
    ).toBe(true)
    expect(
      isValidPushSubscription({
        endpoint: 'http://insecure.test/subscription',
        keys: { p256dh: 'public-key', auth: 'auth-secret' },
      }),
    ).toBe(false)
  })

  it('matches the configured local reminder minute', () => {
    const now = new Date('2026-08-08T01:19:00.000Z')
    expect(isReminderMinute('19:19', 'America/Denver', now)).toBe(true)
    expect(isReminderMinute('01:19', 'UTC', now)).toBe(true)
    expect(isReminderMinute('19:20', 'America/Denver', now)).toBe(false)
  })

  it('recognizes expired browser subscriptions without expiring open-ended ones', () => {
    const now = new Date('2026-08-08T01:19:00.000Z')
    expect(
      isPushSubscriptionExpired(new Date('2026-08-08T01:18:59.000Z'), now),
    ).toBe(true)
    expect(isPushSubscriptionExpired(now, now)).toBe(true)
    expect(
      isPushSubscriptionExpired(new Date('2026-08-08T01:19:01.000Z'), now),
    ).toBe(false)
    expect(isPushSubscriptionExpired(null, now)).toBe(false)
    expect(isPushSubscriptionExpired(undefined, now)).toBe(false)
  })

  it('produces an app-relative study notification payload', () => {
    expect(reminderPayload()).toEqual({
      title: 'KanjiForge study reminder',
      body: 'It is time to review your kanji cards.',
      url: '/study',
      tag: 'kanjiforge-daily-reminder',
    })
  })
})

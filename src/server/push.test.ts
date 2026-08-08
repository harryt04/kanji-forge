import { describe, expect, it } from 'vitest'
import webpush from 'web-push'
import {
  isReminderMinute,
  isPushSubscriptionExpired,
  isValidPushSubscription,
  reminderPayload,
  sendTestPushReminder,
  testReminderPayload,
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

  it('produces a distinct payload for immediate delivery checks', () => {
    expect(testReminderPayload()).toEqual({
      title: 'KanjiForge test reminder',
      body: 'Background reminders are working. Tap to study your kanji cards.',
      url: '/study?source=push-test',
      tag: 'kanjiforge-test-reminder',
    })
  })

  it('sends a test payload to the user subscriptions and removes expired endpoints', async () => {
    const sent: string[] = []
    const send = async (
      subscription: { endpoint: string },
      payload: string,
    ) => {
      if (subscription.endpoint.includes('expired')) throw { statusCode: 410 }
      sent.push(payload)
    }
    const deleted: unknown[] = []
    const database = {
      select: () => ({
        from: () => ({
          where: async () => [
            {
              endpoint: 'https://push.example.test/subscription',
              userId: 'user-1',
              p256dh: 'public-key',
              auth: 'auth-secret',
            },
            {
              endpoint: 'https://push.example.test/expired',
              userId: 'user-1',
              p256dh: 'public-key',
              auth: 'auth-secret',
            },
          ],
        }),
      }),
      delete: () => ({
        where: async (condition: unknown) => {
          deleted.push(condition)
        },
      }),
    } as never

    await expect(
      sendTestPushReminder(
        database,
        'user-1',
        { ...webpush.generateVAPIDKeys(), subject: 'mailto:test@example.test' },
        send,
      ),
    ).resolves.toEqual({ sent: 1, removed: 1 })
    expect(sent).toEqual([JSON.stringify(testReminderPayload())])
    expect(deleted).toHaveLength(1)
  })
})

import { and, eq } from 'drizzle-orm'
import webpush from 'web-push'
import { createDatabase } from './db/client'
import { pushSubscriptions, settings } from './db/schema'

export const DAILY_REMINDER_ENABLED_SETTING =
  'notifications.daily-reminder.enabled'
export const DAILY_REMINDER_TIME_SETTING = 'notifications.daily-reminder.time'

export interface PushSubscriptionInput {
  readonly endpoint: string
  readonly keys: { readonly p256dh: string; readonly auth: string }
  readonly expirationTime?: number | null
  readonly timezone?: string
}

export interface PushReminderPayload {
  readonly title: string
  readonly body: string
  readonly url: string
  readonly tag: string
}

export function isValidPushSubscription(
  value: unknown,
): value is PushSubscriptionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const input = value as Record<string, unknown>
  const keys = input.keys
  return (
    typeof input.endpoint === 'string' &&
    input.endpoint.startsWith('https://') &&
    !!keys &&
    typeof keys === 'object' &&
    !Array.isArray(keys) &&
    typeof (keys as Record<string, unknown>).p256dh === 'string' &&
    typeof (keys as Record<string, unknown>).auth === 'string' &&
    (input.expirationTime === undefined ||
      input.expirationTime === null ||
      (typeof input.expirationTime === 'number' &&
        Number.isSafeInteger(input.expirationTime))) &&
    (input.timezone === undefined ||
      (typeof input.timezone === 'string' && input.timezone.length <= 100))
  )
}

export function reminderPayload(): PushReminderPayload {
  return {
    title: 'KanjiForge study reminder',
    body: 'It is time to review your kanji cards.',
    url: '/study',
    tag: 'kanjiforge-daily-reminder',
  }
}

export function isReminderMinute(
  time: string,
  timezone: string,
  now: Date,
): boolean {
  if (!/^\d{2}:\d{2}$/u.test(time)) return false
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now)
    const hour = parts.find((part) => part.type === 'hour')?.value
    const minute = parts.find((part) => part.type === 'minute')?.value
    return `${hour}:${minute}` === time
  } catch {
    return false
  }
}

/** Returns whether a browser-provided push subscription expiry has passed. */
export function isPushSubscriptionExpired(
  expirationTime: Date | null | undefined,
  now: Date,
): boolean {
  return expirationTime !== null && expirationTime !== undefined
    ? expirationTime.getTime() <= now.getTime()
    : false
}

type ApiDatabase = ReturnType<typeof createDatabase>

export async function savePushSubscription(
  database: ApiDatabase,
  userId: string,
  input: PushSubscriptionInput,
): Promise<void> {
  await database
    .insert(pushSubscriptions)
    .values({
      endpoint: input.endpoint,
      userId,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      expirationTime: input.expirationTime
        ? new Date(input.expirationTime)
        : null,
      timezone: input.timezone ?? 'UTC',
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        expirationTime: input.expirationTime
          ? new Date(input.expirationTime)
          : null,
        timezone: input.timezone ?? 'UTC',
        updatedAt: new Date(),
      },
    })
}

export async function removePushSubscription(
  database: ApiDatabase,
  userId: string,
  endpoint: string,
): Promise<void> {
  await database
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, endpoint),
        eq(pushSubscriptions.userId, userId),
      ),
    )
}

export async function sendDuePushReminders(
  database: ApiDatabase,
  now: Date,
  vapid: {
    readonly subject: string
    readonly publicKey: string
    readonly privateKey: string
  },
  send: typeof webpush.sendNotification = webpush.sendNotification,
): Promise<{ sent: number; removed: number; skipped: number }> {
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)
  const rows = await database
    .select({
      endpoint: pushSubscriptions.endpoint,
      userId: pushSubscriptions.userId,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      expirationTime: pushSubscriptions.expirationTime,
      timezone: pushSubscriptions.timezone,
      lastSentAt: pushSubscriptions.lastSentAt,
      enabled: settings.value,
    })
    .from(pushSubscriptions)
    .leftJoin(
      settings,
      and(
        eq(settings.userId, pushSubscriptions.userId),
        eq(settings.key, DAILY_REMINDER_ENABLED_SETTING),
      ),
    )

  const timeRows = await database
    .select({
      userId: pushSubscriptions.userId,
      endpoint: pushSubscriptions.endpoint,
      time: settings.value,
    })
    .from(pushSubscriptions)
    .innerJoin(
      settings,
      and(
        eq(settings.userId, pushSubscriptions.userId),
        eq(settings.key, DAILY_REMINDER_TIME_SETTING),
      ),
    )
  const times = new Map(timeRows.map((row) => [row.endpoint, row.time]))
  let sent = 0
  let removed = 0
  let skipped = 0
  for (const row of rows) {
    if (isPushSubscriptionExpired(row.expirationTime, now)) {
      await database
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.endpoint, row.endpoint),
            eq(pushSubscriptions.userId, row.userId),
          ),
        )
      removed += 1
      continue
    }
    if (row.enabled !== 'true') {
      skipped += 1
      continue
    }
    const reminderTime = times.get(row.endpoint)
    if (!reminderTime || !isReminderMinute(reminderTime, row.timezone, now)) {
      skipped += 1
      continue
    }
    if (row.lastSentAt && now.getTime() - row.lastSentAt.getTime() < 60_000) {
      skipped += 1
      continue
    }
    try {
      await send(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        JSON.stringify(reminderPayload()),
      )
      await database
        .update(pushSubscriptions)
        .set({ lastSentAt: now, updatedAt: now })
        .where(eq(pushSubscriptions.endpoint, row.endpoint))
      sent += 1
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode
      if (statusCode === 404 || statusCode === 410) {
        await database
          .delete(pushSubscriptions)
          .where(eq(pushSubscriptions.endpoint, row.endpoint))
        removed += 1
      } else {
        skipped += 1
      }
    }
  }
  return { sent, removed, skipped }
}

export interface PushNotificationPayload {
  readonly title: string
  readonly body: string
  readonly url: string
  readonly tag: string
}

const DEFAULT_PAYLOAD: PushNotificationPayload = {
  title: 'KanjiForge study reminder',
  body: 'It is time to review your kanji cards.',
  url: '/study',
  tag: 'kanjiforge-daily-reminder',
}

export function parsePushNotificationPayload(
  value: unknown,
): PushNotificationPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return DEFAULT_PAYLOAD
  const input = value as Record<string, unknown>
  return {
    title:
      typeof input.title === 'string' ? input.title : DEFAULT_PAYLOAD.title,
    body: typeof input.body === 'string' ? input.body : DEFAULT_PAYLOAD.body,
    url:
      typeof input.url === 'string' && input.url.startsWith('/')
        ? input.url
        : DEFAULT_PAYLOAD.url,
    tag: typeof input.tag === 'string' ? input.tag : DEFAULT_PAYLOAD.tag,
  }
}

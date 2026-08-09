'use client'

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? ''

export type BackgroundPushStatus =
  | 'unsupported'
  | 'not-configured'
  | 'permission-denied'
  | 'subscribed'
  | 'not-subscribed'

interface PushConfig {
  readonly enabled: boolean
  readonly publicKey: string | null
}

function isSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

function apiUrl(path: string): string {
  return `${apiBase}${path}`
}

function base64UrlToBytes(value: string): ArrayBuffer {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`
  const decoded = atob(padded.replace(/-/gu, '+').replace(/_/gu, '/'))
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0))
    .buffer as ArrayBuffer
}

async function readPushConfig(): Promise<PushConfig | null> {
  const response = await fetch(apiUrl('/api/push/config'), {
    credentials: 'include',
  })
  if (!response.ok) return null
  const body: unknown = await response.json()
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const config = body as Record<string, unknown>
  return {
    enabled: config.enabled === true,
    publicKey: typeof config.publicKey === 'string' ? config.publicKey : null,
  }
}

export async function enableBackgroundPush(): Promise<BackgroundPushStatus> {
  if (!isSupported()) return 'unsupported'
  if (Notification.permission !== 'granted') return 'permission-denied'
  const config = await readPushConfig()
  if (!config?.enabled || !config.publicKey) return 'not-configured'
  const registration = await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(config.publicKey),
    }))
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth)
    throw new Error('The browser returned an incomplete push subscription.')
  const response = await fetch(apiUrl('/api/push/subscription'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      expirationTime: json.expirationTime,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    }),
  })
  if (!response.ok)
    throw new Error('Could not save the background reminder subscription.')
  return 'subscribed'
}

/** Reports the current device's background-push state without changing it. */
export async function getBackgroundPushStatus(): Promise<BackgroundPushStatus> {
  if (!isSupported()) return 'unsupported'
  if (Notification.permission !== 'granted') return 'permission-denied'
  try {
    const config = await readPushConfig()
    if (!config?.enabled || !config.publicKey) return 'not-configured'
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    return subscription ? 'subscribed' : 'not-subscribed'
  } catch {
    return 'not-configured'
  }
}

export async function disableBackgroundPush(): Promise<void> {
  if (!isSupported()) return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return
  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  await fetch(apiUrl('/api/push/subscription'), {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  })
}

/** Requests an immediate delivery check for the current authenticated device. */
export async function sendTestBackgroundPush(): Promise<void> {
  const response = await fetch(apiUrl('/api/push/test'), {
    method: 'POST',
    credentials: 'include',
  })
  if (response.ok) return
  if (response.status === 404)
    throw new Error('This device is not registered for background Web Push.')
  if (response.status === 503)
    throw new Error('Background Web Push is unavailable on this server.')
  throw new Error('Could not send a test reminder.')
}

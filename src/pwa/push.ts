'use client'

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? ''

export type BackgroundPushStatus =
  'unsupported' | 'not-configured' | 'permission-denied' | 'subscribed'

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

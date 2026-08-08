import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { NetworkFirst, Serwist } from 'serwist'
import { parsePushNotificationPayload } from './push-payload'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Leave updated workers waiting so a study session is never hot-swapped.
  // The next navigation can activate the new shell safely.
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // `next build`'s static export produces per-page HTML that isn't part of the
    // precache manifest (that manifest only covers `.next`'s build assets, generated
    // before the export step runs). Cache documents as they're visited instead, so a
    // page seen once while online is available on a later offline reload.
    {
      matcher: ({ request }) => request.mode === 'navigate',
      handler: new NetworkFirst({
        cacheName: 'pages',
        networkTimeoutSeconds: 3,
      }),
    },
    ...defaultCache,
  ],
})

serwist.addEventListeners()

type PushEventLike = ExtendableEvent & {
  readonly data: { json(): unknown } | null
}

self.addEventListener('push', (event) => {
  const pushEvent = event as unknown as PushEventLike
  let payload: ReturnType<typeof parsePushNotificationPayload>
  try {
    payload = parsePushNotificationPayload(pushEvent.data?.json())
  } catch {
    payload = parsePushNotificationPayload(null)
  }
  pushEvent.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      data: { url: payload.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  const notificationEvent = event as unknown as ExtendableEvent & {
    readonly notification: { close(): void; data?: { url?: string } }
  }
  const targetUrl = notificationEvent.notification.data?.url ?? '/study'
  notificationEvent.notification.close()
  notificationEvent.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((client) => 'focus' in client)
        if (existing && 'focus' in existing) {
          if (
            'navigate' in existing &&
            typeof existing.navigate === 'function'
          ) {
            return existing
              .navigate(new URL(targetUrl, self.location.origin).href)
              .then((navigated) => navigated?.focus())
          }
          return existing.focus()
        }
        return self.clients.openWindow(targetUrl)
      }),
  )
})

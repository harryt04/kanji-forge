import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { NetworkFirst, Serwist } from 'serwist'

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

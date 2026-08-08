import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBackgroundPushStatus } from './push'

function installPushBrowser(
  subscription: PushSubscription | null = null,
): void {
  Object.defineProperty(window, 'PushManager', {
    configurable: true,
    value: class PushManager {},
  })
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: { permission: 'granted' },
  })
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: vi.fn(async () => subscription),
        },
      }),
    },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete (window as Window & { PushManager?: unknown }).PushManager
  delete (window as Window & { Notification?: unknown }).Notification
  delete (navigator as Navigator & { serviceWorker?: unknown }).serviceWorker
})

describe('background push status', () => {
  it('distinguishes a configured server from an unregistered device', async () => {
    installPushBrowser()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ enabled: true, publicKey: 'public' }), {
            status: 200,
          }),
      ),
    )

    await expect(getBackgroundPushStatus()).resolves.toBe('not-subscribed')
  })

  it('restores the subscribed state when the browser already has a subscription', async () => {
    installPushBrowser({} as PushSubscription)
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ enabled: true, publicKey: 'public' }), {
            status: 200,
          }),
      ),
    )

    await expect(getBackgroundPushStatus()).resolves.toBe('subscribed')
  })

  it('reports unsupported or unconfigured environments without touching push state', async () => {
    await expect(getBackgroundPushStatus()).resolves.toBe('unsupported')

    installPushBrowser()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 503 })),
    )
    await expect(getBackgroundPushStatus()).resolves.toBe('not-configured')

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('offline'))),
    )
    await expect(getBackgroundPushStatus()).resolves.toBe('not-configured')
  })
})

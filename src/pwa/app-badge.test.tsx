import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bootstrapUserRuntime, clearUserRuntime } from '@/auth/runtime'
import { createUserRepositories } from '@/data/repo'
import {
  APP_BADGE_STATE_CHANGED_EVENT,
  AppBadgeController,
  APP_BADGE_SETTING,
  createBrowserBadgeIconDataUrl,
  countAppBadgeCards,
} from './app-badge'

vi.mock('@/features/study/deck-loader', () => ({
  loadStarterDeck: vi.fn(async () => ({
    cards: [
      { state: undefined },
      { state: { level: 2, dueAt: 10 } },
      { state: { level: 3, dueAt: 20 } },
      { state: { level: 0, dueAt: null } },
    ],
  })),
}))

describe('app icon badges', () => {
  const now = 15

  beforeEach(() => {
    document.title = 'KanjiForge'
    const favicon = document.createElement('link')
    favicon.rel = 'icon'
    favicon.href = 'original-icon.svg'
    document.head.append(favicon)
    Object.defineProperty(navigator, 'setAppBadge', {
      configurable: true,
      value: vi.fn(async () => undefined),
    })
    Object.defineProperty(navigator, 'clearAppBadge', {
      configurable: true,
      value: vi.fn(async () => undefined),
    })
  })

  afterEach(() => {
    clearUserRuntime()
    vi.restoreAllMocks()
    document.title = 'KanjiForge'
    document.head.querySelector('link[rel="icon"]')?.remove()
    delete (navigator as Navigator & { setAppBadge?: unknown }).setAppBadge
    delete (navigator as Navigator & { clearAppBadge?: unknown }).clearAppBadge
  })

  it('counts new and due cards while excluding future and manually untouched cards', () => {
    const cards = [
      { state: undefined },
      { state: { level: 2, dueAt: 10 } },
      { state: { level: 3, dueAt: 20 } },
      { state: { level: 0, dueAt: null } },
    ]

    expect(countAppBadgeCards(cards, 'due', now)).toBe(2)
    expect(countAppBadgeCards(cards, 'total', now)).toBe(4)
    expect(countAppBadgeCards(cards, 'off', now)).toBe(0)
  })

  it('publishes the local deck count and clears it when disabled', async () => {
    const userId = `badge-${crypto.randomUUID()}`
    const runtime = bootstrapUserRuntime(userId)
    await createUserRepositories(runtime.database).settings.set({
      key: APP_BADGE_SETTING,
      value: 'total',
      updatedAt: Date.now(),
    })

    const { unmount } = render(<AppBadgeController userId={userId} />)
    await waitFor(() => expect(navigator.setAppBadge).toHaveBeenCalledWith(4))

    window.dispatchEvent(new Event(APP_BADGE_STATE_CHANGED_EVENT))
    await waitFor(() => expect(navigator.setAppBadge).toHaveBeenCalledTimes(2))

    await createUserRepositories(runtime.database).settings.set({
      key: APP_BADGE_SETTING,
      value: 'off',
      updatedAt: Date.now(),
    })
    window.dispatchEvent(new Event('kanjiforge:app-badge-setting-changed'))
    await waitFor(() => expect(navigator.clearAppBadge).toHaveBeenCalled())
    unmount()
  })

  it('shows the count in the browser tab when app badges are unsupported', async () => {
    delete (navigator as Navigator & { setAppBadge?: unknown }).setAppBadge
    delete (navigator as Navigator & { clearAppBadge?: unknown }).clearAppBadge

    const userId = `badge-title-${crypto.randomUUID()}`
    const runtime = bootstrapUserRuntime(userId)
    await createUserRepositories(runtime.database).settings.set({
      key: APP_BADGE_SETTING,
      value: 'total',
      updatedAt: Date.now(),
    })

    const { unmount } = render(<AppBadgeController userId={userId} />)
    await waitFor(() => {
      expect(document.title).toBe('KanjiForge (4)')
      expect(
        document.head.querySelector('link[rel="icon"]')?.getAttribute('href'),
      ).toBe(createBrowserBadgeIconDataUrl(4))
    })

    await createUserRepositories(runtime.database).settings.set({
      key: APP_BADGE_SETTING,
      value: 'off',
      updatedAt: Date.now(),
    })
    window.dispatchEvent(new Event('kanjiforge:app-badge-setting-changed'))
    await waitFor(() => {
      expect(document.title).toBe('KanjiForge')
      expect(
        document.head.querySelector('link[rel="icon"]')?.getAttribute('href'),
      ).toBe(new URL('original-icon.svg', window.location.href).href)
    })
    unmount()
  })

  it('falls back to the browser tab when the Badging API rejects', async () => {
    const setAppBadge = vi.fn(async () => {
      throw new Error('badge unavailable')
    })
    Object.defineProperty(navigator, 'setAppBadge', {
      configurable: true,
      value: setAppBadge,
    })

    const userId = `badge-reject-${crypto.randomUUID()}`
    const runtime = bootstrapUserRuntime(userId)
    await createUserRepositories(runtime.database).settings.set({
      key: APP_BADGE_SETTING,
      value: 'total',
      updatedAt: Date.now(),
    })

    const { unmount } = render(<AppBadgeController userId={userId} />)
    await waitFor(() => {
      expect(setAppBadge).toHaveBeenCalledWith(4)
      expect(document.title).toBe('KanjiForge (4)')
      expect(
        document.head.querySelector('link[rel="icon"]')?.getAttribute('href'),
      ).toBe(createBrowserBadgeIconDataUrl(4))
    })
    unmount()
  })
})

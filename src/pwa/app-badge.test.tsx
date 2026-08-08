import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bootstrapUserRuntime, clearUserRuntime } from '@/auth/runtime'
import { createUserRepositories } from '@/data/repo'
import {
  AppBadgeController,
  APP_BADGE_SETTING,
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

    await createUserRepositories(runtime.database).settings.set({
      key: APP_BADGE_SETTING,
      value: 'off',
      updatedAt: Date.now(),
    })
    window.dispatchEvent(new Event('kanjiforge:app-badge-setting-changed'))
    await waitFor(() => expect(navigator.clearAppBadge).toHaveBeenCalled())
    unmount()
  })
})

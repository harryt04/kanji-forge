import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getStoragePersistenceStatus,
  requestStoragePersistence,
  requestStoragePersistenceAfterSession,
  STORAGE_PERSISTENCE_REQUESTED_SETTING,
} from './storage-persistence'

const originalStorage = Object.getOwnPropertyDescriptor(navigator, 'storage')

afterEach(() => {
  if (originalStorage) {
    Object.defineProperty(navigator, 'storage', originalStorage)
  } else {
    Reflect.deleteProperty(navigator, 'storage')
  }
  vi.restoreAllMocks()
})

describe('storage persistence', () => {
  it('reports unsupported when the browser has no persistence API', async () => {
    Reflect.deleteProperty(navigator, 'storage')

    await expect(getStoragePersistenceStatus()).resolves.toBe('unsupported')
    await expect(requestStoragePersistence()).resolves.toBe('unsupported')
  })

  it('requests and reports granted durable storage', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    const persisted = vi.fn().mockResolvedValue(false)
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persist, persisted },
    })

    await expect(getStoragePersistenceStatus()).resolves.toBe('denied')
    await expect(requestStoragePersistence()).resolves.toBe('granted')
    expect(persist).toHaveBeenCalledOnce()
  })

  it('requests only after the first completed session', async () => {
    const persist = vi.fn().mockResolvedValue(false)
    const persisted = vi.fn().mockResolvedValue(false)
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persist, persisted },
    })
    const settings = new Map<
      string,
      { key: string; value: string; updatedAt: number }
    >()
    const repositories = {
      settings: {
        get: vi.fn(async (key: string) => settings.get(key)),
        set: vi.fn(async (setting) => settings.set(setting.key, setting)),
      },
    } as never

    await expect(
      requestStoragePersistenceAfterSession(repositories, 123),
    ).resolves.toBe('denied')
    await expect(
      requestStoragePersistenceAfterSession(repositories, 456),
    ).resolves.toBe('denied')

    expect(persist).toHaveBeenCalledOnce()
    expect(settings.get(STORAGE_PERSISTENCE_REQUESTED_SETTING)).toEqual({
      key: STORAGE_PERSISTENCE_REQUESTED_SETTING,
      value: 'true',
      updatedAt: 123,
    })
  })
})

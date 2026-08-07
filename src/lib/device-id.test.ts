import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDeviceId } from './device-id'

describe('getDeviceId', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('is stable across calls', () => {
    expect(getDeviceId()).toBe(getDeviceId())
  })

  it('persists the generated id to localStorage', () => {
    const id = getDeviceId()
    expect(window.localStorage.getItem('kanjiforge-device-id')).toBe(id)
  })

  it('reuses a previously persisted id', () => {
    window.localStorage.setItem('kanjiforge-device-id', 'existing-id')
    expect(getDeviceId()).toBe('existing-id')
  })

  it('returns a safe placeholder when window is undefined', () => {
    const original = globalThis.window
    // @ts-expect-error simulating a non-browser environment
    delete globalThis.window
    try {
      expect(getDeviceId()).toBe('server')
    } finally {
      globalThis.window = original
    }
  })

  it('generates ids via crypto.randomUUID', () => {
    const spy = vi.spyOn(crypto, 'randomUUID')
    getDeviceId()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

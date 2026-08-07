import { afterEach, describe, expect, it } from 'vitest'
import {
  bootstrapUserRuntime,
  clearUserRuntime,
  getActiveUserRuntime,
} from './runtime'

afterEach(clearUserRuntime)

describe('authenticated user runtime', () => {
  it('requires a user id and never creates an anonymous database', () => {
    expect(() => bootstrapUserRuntime('')).toThrow('authenticated user id')
    expect(getActiveUserRuntime()).toBeUndefined()
  })

  it('closes and replaces the active runtime when accounts switch', () => {
    const alice = bootstrapUserRuntime('alice@example.test')
    const bob = bootstrapUserRuntime('bob@example.test')

    expect(alice.database.name).toBe('kanjiforge-user:alice%40example.test')
    expect(bob.database.name).toBe('kanjiforge-user:bob%40example.test')
    expect(getActiveUserRuntime()).toBe(bob)
    expect(alice.database).not.toBe(bob.database)

    clearUserRuntime()
    expect(getActiveUserRuntime()).toBeUndefined()
  })
})

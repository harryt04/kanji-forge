import { describe, expect, it } from 'vitest'
import { readEnv } from './env'

const validEnv = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/kanjiforge',
  BETTER_AUTH_SECRET: 'a-secure-secret-that-is-more-than-32-chars',
  BETTER_AUTH_URL: 'https://api.example.test',
}

describe('readEnv', () => {
  it('requires the backend secrets and applies safe network defaults', () => {
    expect(readEnv(validEnv)).toMatchObject({
      ELECTRIC_URL: null,
      ELECTRIC_SECRET: null,
      VAPID_PUBLIC_KEY: null,
      VAPID_PRIVATE_KEY: null,
      VAPID_SUBJECT: 'mailto:admin@example.invalid',
      PUSH_CRON_SECRET: null,
    })
  })

  it('rejects an absent or short better-auth secret', () => {
    expect(() => readEnv({ ...validEnv, BETTER_AUTH_SECRET: '' })).toThrow(
      'BETTER_AUTH_SECRET',
    )
    expect(() =>
      readEnv({ ...validEnv, BETTER_AUTH_SECRET: 'too-short' }),
    ).toThrow('at least 32')
  })
})

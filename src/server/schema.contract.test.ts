import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = [
  '0000_young_wraith.sql',
  '0001_sync_mutation_shape.sql',
  '0002_sticky_annotations.sql',
]
  .map((file) =>
    readFileSync(resolve(import.meta.dirname, `../../drizzle/${file}`), 'utf8'),
  )
  .join('\n')

describe('backend schema contract', () => {
  it('contains better-auth tables and only the syncable app projections', () => {
    for (const table of [
      'user',
      'session',
      'account',
      'verification',
      'reviews',
      'decks',
      'settings',
      'deck_membership',
      'sticky_annotations',
    ]) {
      expect(migration).toContain(`CREATE TABLE "${table}"`)
    }
    expect(migration).not.toContain('CREATE TABLE "card_states"')
    expect(migration).not.toContain('CREATE TABLE "outbox"')
  })
})

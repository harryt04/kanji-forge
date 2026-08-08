import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateUserDatabase, type MigrationExecutor } from './migrations'
import { USER_DATABASE_MIGRATIONS } from './schema'

const EXPECTED_TABLES = [
  'schema_migrations',
  'decks',
  'deck_membership',
  'card_states',
  'reviews',
  'sessions',
  'settings',
  'daily_stats',
  'outbox',
  'sticky_annotations',
]

let database: SqlJsDatabase
beforeEach(async () => {
  const SQL = await initSqlJs()
  database = new SQL.Database()
})
afterEach(() => database.close())

function executor(): MigrationExecutor {
  return {
    run(sql, parameters = []) {
      database.run(sql, parameters as (string | number | null | Uint8Array)[])
    },
    hasMigration(version) {
      const statement = database.prepare(
        'SELECT 1 FROM schema_migrations WHERE version = ?',
        [version],
      )
      const exists = statement.step()
      statement.free()
      return exists
    },
    transaction(action) {
      database.run('BEGIN')
      try {
        action()
        database.run('COMMIT')
      } catch (error) {
        database.run('ROLLBACK')
        throw error
      }
    },
  }
}

function tableNames(): string[] {
  const statement = database.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table'",
  )
  const names: string[] = []
  while (statement.step()) names.push(String(statement.getAsObject().name))
  statement.free()
  return names.sort()
}

describe('migrateUserDatabase', () => {
  it('creates every table on a fresh v0 database', () => {
    migrateUserDatabase(executor(), Date.now())
    expect(tableNames()).toEqual([...EXPECTED_TABLES].sort())
  })

  it('records applied migrations with their applied-at timestamp', () => {
    const appliedAt = 1_700_000_000_000
    migrateUserDatabase(executor(), appliedAt)
    const statement = database.prepare(
      'SELECT version, applied_at FROM schema_migrations',
    )
    const rows: { version: number; applied_at: number }[] = []
    while (statement.step())
      rows.push(
        statement.getAsObject() as never as {
          version: number
          applied_at: number
        },
      )
    statement.free()
    expect(rows).toEqual([
      { version: 1, applied_at: appliedAt },
      { version: 2, applied_at: appliedAt },
    ])
  })

  it('is idempotent: a second run does not re-apply or throw', () => {
    migrateUserDatabase(executor(), 1)
    expect(() => migrateUserDatabase(executor(), 2)).not.toThrow()
    const statement = database.prepare(
      'SELECT COUNT(*) AS n FROM schema_migrations',
    )
    statement.step()
    expect(statement.getAsObject().n).toBe(2)
    statement.free()
    expect(tableNames()).toEqual([...EXPECTED_TABLES].sort())
  })

  it('matches the declared schema version against the last migration', () => {
    expect(USER_DATABASE_MIGRATIONS.at(-1)?.version).toBe(2)
  })
})

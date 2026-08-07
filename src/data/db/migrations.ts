import {
  USER_DATABASE_MIGRATIONS,
  USER_DATABASE_SCHEMA_VERSION,
} from './schema'
import type { SqlValue } from './index'

export interface MigrationExecutor {
  run(sql: string, parameters?: readonly SqlValue[]): void
  hasMigration(version: number): boolean
  transaction(action: () => void): void
}

/** Applies each migration once. Kept engine-neutral so the browser adapter is replaceable. */
export function migrateUserDatabase(
  database: MigrationExecutor,
  now: number,
): void {
  database.run(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)',
  )
  for (const migration of USER_DATABASE_MIGRATIONS) {
    if (database.hasMigration(migration.version)) continue
    database.transaction(() => {
      for (const statement of migration.sql.slice(1)) database.run(statement)
      database.run(
        'INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)',
        [migration.version, now],
      )
    })
  }
  if (
    USER_DATABASE_MIGRATIONS.at(-1)?.version !== USER_DATABASE_SCHEMA_VERSION
  ) {
    throw new Error(
      'The user database migration list does not match its declared schema version.',
    )
  }
}

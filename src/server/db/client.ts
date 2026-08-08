import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// Kept unexported so its return type stays inferred; `Database` below re-exports that
// inference, which the explicit-return-type lint rule needs at the module boundary and
// which spelling the drizzle generics by hand would only get wrong.
function buildDatabase(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 10, prepare: false })
  return drizzle({ client, schema })
}

export type Database = ReturnType<typeof buildDatabase>

export function createDatabase(databaseUrl: string): Database {
  return buildDatabase(databaseUrl)
}

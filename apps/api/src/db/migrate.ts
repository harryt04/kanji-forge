import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { createDatabase } from './client.js'
import { readEnv } from '../env.js'

const db = createDatabase(readEnv().DATABASE_URL)
try {
  await migrate(db, {
    migrationsFolder: new URL('../../drizzle', import.meta.url).pathname,
  })
} finally {
  await db.$client.end({ timeout: 5 })
}

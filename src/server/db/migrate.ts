import { createRequire } from 'node:module'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { createDatabase } from './client'
import { readEnv } from '../env'

// This runs as a plain script (via `pnpm start`, before `next start`), so nothing has
// loaded .env.local for it the way the Next server would. Deployments set real
// environment variables, where this is a no-op.
// @next/env is CJS with no usable ESM interop under tsx, hence createRequire.
const { loadEnvConfig } = createRequire(import.meta.url)(
  '@next/env',
) as typeof import('@next/env')
loadEnvConfig(process.cwd())

const db = createDatabase(readEnv().DATABASE_URL)
try {
  await migrate(db, {
    migrationsFolder: new URL('../../../drizzle', import.meta.url).pathname,
  })
  console.info('Migrations are up to date.')
} finally {
  await db.$client.end({ timeout: 5 })
}

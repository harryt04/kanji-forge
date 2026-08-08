import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { ApiEnv } from './env'
import { createDatabase, type Database } from './db/client'
import * as schema from './db/schema'

// Unexported so the betterAuth generics stay inferred — `Auth` below carries that
// inference to the module boundary, keeping `auth.api.getSession` fully typed.
function buildAuth(env: ApiEnv, db: Database) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    // The client is served from this same origin now, so the app's own URL is the only
    // origin that ever posts credentials here.
    trustedOrigins: [env.BETTER_AUTH_URL],
    emailAndPassword: { enabled: true },
  })
}

export type Auth = ReturnType<typeof buildAuth>

export function createAuth(
  env: ApiEnv,
  db: Database = createDatabase(env.DATABASE_URL),
): Auth {
  return buildAuth(env, db)
}

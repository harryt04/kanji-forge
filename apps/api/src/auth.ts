import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { ApiEnv } from './env.js'
import { createDatabase } from './db/client.js'
import * as schema from './db/schema.js'

export function createAuth(
  env: ApiEnv,
  db: ReturnType<typeof createDatabase> = createDatabase(env.DATABASE_URL),
) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.CORS_ORIGIN],
    emailAndPassword: { enabled: true },
  })
}

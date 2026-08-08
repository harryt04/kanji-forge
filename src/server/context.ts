import { createAuth } from './auth'
import { createDatabase } from './db/client'
import { readEnv, type ApiEnv } from './env'

export interface ServerContext {
  readonly env: ApiEnv
  readonly database: ReturnType<typeof createDatabase>
  readonly auth: ReturnType<typeof createAuth>
}

let cached: ServerContext | undefined

/**
 * Builds the env/database/auth trio on first use and memoises it.
 *
 * This must stay lazy. `readEnv()` throws when DATABASE_URL is absent and `createDatabase`
 * opens a connection pool, and Next imports every route module during `next build` — so
 * doing either at module scope would break builds and CI, which have no database. Call this
 * inside a route handler, never at the top level of one.
 */
export function getServerContext(): ServerContext {
  if (!cached) {
    const env = readEnv()
    const database = createDatabase(env.DATABASE_URL)
    cached = { env, database, auth: createAuth(env, database) }
  }
  return cached
}

export function jsonResponse(status: number, body: unknown): Response {
  if (status === 204) return new Response(null, { status })
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export interface SessionUser {
  readonly id: string
}

/**
 * Resolves the better-auth session for a request, or null when there isn't one. Routes
 * translate a null into the shared 401 body rather than throwing, matching the contract the
 * client's fetch helpers already expect.
 */
export async function readSessionUser(
  request: Request,
): Promise<SessionUser | null> {
  const { auth } = getServerContext()
  const session = await auth.api.getSession({ headers: request.headers })
  return session ? session.user : null
}

/** A fresh 401 each call — a Response body is single-use, so this cannot be a shared constant. */
export function unauthenticated(): Response {
  return jsonResponse(401, { error: 'unauthenticated' })
}

/** Mirrors the old server's catch-all: log the detail, return an opaque 500. */
export function internalError(error: unknown): Response {
  console.error('API request failed', error)
  return jsonResponse(500, { error: 'internal_error' })
}

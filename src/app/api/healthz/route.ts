import { jsonResponse } from '@/server/context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Deliberately touches neither env nor the database, so it stays a true liveness probe. */
export function GET(): Response {
  return jsonResponse(200, { ok: true })
}

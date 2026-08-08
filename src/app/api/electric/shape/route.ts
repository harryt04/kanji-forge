import {
  getServerContext,
  internalError,
  jsonResponse,
  readSessionUser,
  unauthenticated,
} from '@/server/context'
import {
  ElectricShapeRequestError,
  electricRequestHeaders,
  prepareElectricShapeUrl,
} from '@/server/electric'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Authenticated proxy to Electric. Electric is not deployed by default — the client falls
 * back to polling /api/sync — but the route stays so switching Electric on is purely an
 * ELECTRIC_URL/ELECTRIC_SECRET change with no code edit. The secret never reaches the
 * browser, and the upstream filter is pinned to the session user server-side.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await readSessionUser(request)
    if (!user) return unauthenticated()
    const { env } = getServerContext()
    if (!env.ELECTRIC_URL || !env.ELECTRIC_SECRET)
      return jsonResponse(503, { error: 'electric_proxy_not_configured' })

    try {
      const upstreamUrl = prepareElectricShapeUrl(
        request.url,
        env.ELECTRIC_URL,
        env.ELECTRIC_SECRET,
        user.id,
      )
      // Returned as-is so live shapes keep streaming rather than being buffered here.
      return await fetch(upstreamUrl, {
        method: 'GET',
        headers: electricRequestHeaders(request),
      })
    } catch (error) {
      if (error instanceof ElectricShapeRequestError)
        return jsonResponse(400, { error: error.message })
      throw error
    }
  } catch (error) {
    return internalError(error)
  }
}

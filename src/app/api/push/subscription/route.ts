import {
  getServerContext,
  internalError,
  jsonResponse,
  readSessionUser,
  unauthenticated,
} from '@/server/context'
import {
  isValidPushSubscription,
  removePushSubscription,
  savePushSubscription,
} from '@/server/push'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const INVALID = { error: 'invalid_push_subscription' }

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await readSessionUser(request)
    if (!user) return unauthenticated()
    const body: unknown = await request.json()
    if (!isValidPushSubscription(body)) return jsonResponse(400, INVALID)
    const { database } = getServerContext()
    await savePushSubscription(database, user.id, body)
    return jsonResponse(204, null)
  } catch (error) {
    return internalError(error)
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const user = await readSessionUser(request)
    if (!user) return unauthenticated()
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return jsonResponse(400, INVALID)
    const endpoint = (body as Record<string, unknown>).endpoint
    if (typeof endpoint !== 'string' || !endpoint.startsWith('https://'))
      return jsonResponse(400, INVALID)
    const { database } = getServerContext()
    // Scoped to this user's rows as well as the endpoint, so one account cannot delete
    // another's subscription by guessing an endpoint.
    await removePushSubscription(database, user.id, endpoint)
    return jsonResponse(204, null)
  } catch (error) {
    return internalError(error)
  }
}

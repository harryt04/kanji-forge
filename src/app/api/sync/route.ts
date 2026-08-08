import {
  getServerContext,
  internalError,
  jsonResponse,
  readSessionUser,
  unauthenticated,
} from '@/server/context'
import { readSyncSnapshot } from '@/server/sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await readSessionUser(request)
    if (!user) return unauthenticated()
    const { database } = getServerContext()
    return jsonResponse(200, await readSyncSnapshot(database, user.id))
  } catch (error) {
    return internalError(error)
  }
}

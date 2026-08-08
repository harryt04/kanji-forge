import {
  getServerContext,
  internalError,
  jsonResponse,
  readSessionUser,
  unauthenticated,
} from '@/server/context'
import {
  MutationValidationError,
  applyMutation,
  parseMutationBatch,
} from '@/server/mutations'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await readSessionUser(request)
    if (!user) return unauthenticated()
    const { database } = getServerContext()

    try {
      const mutations = parseMutationBatch(await request.json())
      const applied: string[] = []
      const rejected: Array<{ id: string; reason: string }> = []
      // Each mutation stands alone: one bad write is reported back for the client's outbox
      // to retry or drop, and must not discard the rest of the batch.
      for (const mutation of mutations) {
        try {
          await applyMutation(database, user.id, mutation)
          applied.push(mutation.id)
        } catch (error) {
          rejected.push({
            id: mutation.id,
            reason: error instanceof Error ? error.message : 'apply_failed',
          })
        }
      }
      return jsonResponse(200, { applied, rejected })
    } catch (error) {
      if (error instanceof MutationValidationError)
        return jsonResponse(400, { error: error.message })
      throw error
    }
  } catch (error) {
    return internalError(error)
  }
}

import { getServerContext, internalError, jsonResponse } from '@/server/context'
import { sendDuePushReminders } from '@/server/push'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NOT_CONFIGURED = { error: 'push_sender_not_configured' }

/** Cron entry point — authenticated by a shared secret header, not a user session, because
 * the scheduler acts for every due user rather than one of them. */
export async function POST(request: Request): Promise<Response> {
  try {
    const { env, database } = getServerContext()
    if (!env.PUSH_CRON_SECRET) return jsonResponse(503, NOT_CONFIGURED)
    if (
      request.headers.get('x-kanjiforge-push-secret') !== env.PUSH_CRON_SECRET
    )
      return jsonResponse(401, { error: 'unauthorized' })
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY)
      return jsonResponse(503, NOT_CONFIGURED)

    const result = await sendDuePushReminders(database, new Date(), {
      subject: env.VAPID_SUBJECT,
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    })
    return jsonResponse(200, result)
  } catch (error) {
    return internalError(error)
  }
}

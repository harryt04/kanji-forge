import {
  getServerContext,
  internalError,
  jsonResponse,
  readSessionUser,
  unauthenticated,
} from '@/server/context'
import { sendTestPushReminder } from '@/server/push'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await readSessionUser(request)
    if (!user) return unauthenticated()
    const { env, database } = getServerContext()
    if (
      !env.PUSH_CRON_SECRET ||
      !env.VAPID_PUBLIC_KEY ||
      !env.VAPID_PRIVATE_KEY
    )
      return jsonResponse(503, { error: 'push_sender_not_configured' })

    const result = await sendTestPushReminder(database, user.id, {
      subject: env.VAPID_SUBJECT,
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    })
    if (result.sent === 0 && result.removed === 0)
      return jsonResponse(404, { error: 'push_subscription_not_found' })
    return jsonResponse(200, result)
  } catch (error) {
    return internalError(error)
  }
}

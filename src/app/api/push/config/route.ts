import {
  getServerContext,
  internalError,
  jsonResponse,
  readSessionUser,
  unauthenticated,
} from '@/server/context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await readSessionUser(request)
    if (!user) return unauthenticated()
    const { env } = getServerContext()
    return jsonResponse(200, {
      enabled: Boolean(
        env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.PUSH_CRON_SECRET,
      ),
      publicKey: env.VAPID_PUBLIC_KEY,
    })
  } catch (error) {
    return internalError(error)
  }
}

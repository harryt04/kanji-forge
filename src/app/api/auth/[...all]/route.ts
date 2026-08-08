import { getServerContext } from '@/server/context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** better-auth ships a standard fetch handler, so the whole /api/auth/* surface
 * (sign-up, sign-in, sign-out, get-session, …) is just a passthrough. */
async function handler(request: Request): Promise<Response> {
  const { auth } = getServerContext()
  return auth.handler(request)
}

export { handler as GET, handler as POST }

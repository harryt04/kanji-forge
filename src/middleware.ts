import { NextResponse, type NextRequest } from 'next/server'

/**
 * better-auth's own `getSessionCookie` helper would do this, but importing it
 * drags `jose` into the middleware bundle, which the build reports as Edge
 * Runtime warnings for crypto this file never performs. Match the cookie by name
 * instead. `middleware.test.ts` checks these names against better-auth's helper,
 * so an upstream rename fails the test rather than silently disabling the gate.
 */
export const SESSION_COOKIE_NAMES = [
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
]

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => {
    const value = request.cookies.get(name)?.value
    return value !== undefined && value.length > 0
  })
}

/**
 * Routes under the `(app)` group. `AuthGate` still does the real session check
 * inside them; this list only decides where an obviously-signed-out visitor is
 * sent before any HTML is generated.
 */
const APP_PATHS = [
  '/analyze',
  '/browse',
  '/detail',
  '/dictionary',
  '/help',
  '/history',
  '/home',
  '/prototype',
  '/settings',
  '/study',
  '/writing',
]

const PUBLIC_PATHS = ['/', '/sign-in', '/sign-up']

/**
 * Decides authenticated-versus-anonymous before the browser paints anything.
 * Without this, a signed-in visitor received the marketing page, painted it, and
 * only then bounced to `/home` — a visible flash of the wrong screen.
 *
 * This reads the session cookie only. It makes no database call, so it adds no
 * measurable latency and runs fine on the edge runtime. The check is therefore
 * optimistic: an expired cookie still passes here and `AuthGate` rejects it a
 * moment later. That is the intended split — this is a routing hint, not a
 * security boundary.
 *
 * Middleware does not run when the service worker answers a navigation from its
 * cache, which is why `SignedInRedirect` stays in place as the offline fallback.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl
  const signedIn = hasSessionCookie(request)

  if (signedIn && PUBLIC_PATHS.includes(pathname))
    return NextResponse.redirect(new URL('/home', request.url))

  const isAppPath = APP_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  )
  if (!signedIn && isAppPath)
    return NextResponse.redirect(new URL('/sign-in', request.url))

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/',
    '/sign-in',
    '/sign-up',
    '/analyze/:path*',
    '/browse/:path*',
    '/detail/:path*',
    '/dictionary/:path*',
    '/help/:path*',
    '/history/:path*',
    '/home/:path*',
    '/prototype/:path*',
    '/settings/:path*',
    '/study/:path*',
    '/writing/:path*',
  ],
}

import { getSessionCookie } from 'better-auth/cookies'
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { middleware, SESSION_COOKIE_NAMES } from './middleware'

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(new URL(path, 'https://kanjiforge.test'), {
    headers: cookie ? { cookie } : undefined,
  })
}

function redirectTarget(path: string, cookie?: string): string | null {
  const response = middleware(request(path, cookie))
  return response.headers.get('location')
}

const SIGNED_IN = 'better-auth.session_token=session-value.signature'

describe('middleware', () => {
  // The bundle-size shortcut in middleware.ts is only safe while these names are
  // the ones better-auth actually issues. Ask better-auth's own reader.
  it('matches the cookie names better-auth looks for', () => {
    for (const name of SESSION_COOKIE_NAMES) {
      const headers = new Headers({ cookie: `${name}=value.signature` })
      expect(getSessionCookie(headers), name).not.toBeNull()
    }
  })

  it('sends a signed-in visitor from public pages to the app', () => {
    expect(redirectTarget('/', SIGNED_IN)).toContain('/home')
    expect(redirectTarget('/sign-in', SIGNED_IN)).toContain('/home')
    expect(redirectTarget('/sign-up', SIGNED_IN)).toContain('/home')
  })

  it('sends a signed-out visitor from app pages to sign-in', () => {
    expect(redirectTarget('/home')).toContain('/sign-in')
    expect(redirectTarget('/study')).toContain('/sign-in')
    expect(redirectTarget('/detail/kanji')).toContain('/sign-in')
  })

  it('leaves the pages each visitor belongs on alone', () => {
    expect(redirectTarget('/')).toBeNull()
    expect(redirectTarget('/sign-in')).toBeNull()
    expect(redirectTarget('/home', SIGNED_IN)).toBeNull()
  })

  it('ignores an empty session cookie', () => {
    expect(redirectTarget('/', 'better-auth.session_token=')).toBeNull()
  })
})

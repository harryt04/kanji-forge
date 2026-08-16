import { getSessionCookie } from 'better-auth/cookies'
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { config, middleware, SESSION_COOKIE_NAMES } from './middleware'

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

  // The public /kanji/* content pages must never bounce to /sign-in — they
  // are meant to be crawlable and readable by anonymous visitors. This
  // guards both layers: the matcher config that decides which requests
  // middleware even runs on, and the redirect logic itself.
  it('never redirects the public /kanji content pages', () => {
    expect(redirectTarget('/kanji')).toBeNull()
    expect(redirectTarget('/kanji/日')).toBeNull()
    expect(redirectTarget('/kanji/lists')).toBeNull()
    expect(redirectTarget('/kanji/lists/jlpt-kanji-n5')).toBeNull()

    expect(redirectTarget('/kanji', SIGNED_IN)).toBeNull()
    expect(redirectTarget('/kanji/日', SIGNED_IN)).toBeNull()
    expect(redirectTarget('/kanji/lists', SIGNED_IN)).toBeNull()
    expect(redirectTarget('/kanji/lists/jlpt-kanji-n5', SIGNED_IN)).toBeNull()
  })

  it('excludes /kanji from the middleware matcher entirely', () => {
    expect(
      config.matcher.some((pattern) => pattern.startsWith('/kanji')),
    ).toBe(false)
  })
})

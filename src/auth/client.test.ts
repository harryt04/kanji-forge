import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const CACHE_KEY = 'kanjiforge-cached-session'

async function importClient(): Promise<typeof import('./client')> {
  vi.resetModules()
  return import('./client')
}

describe('auth client', () => {
  const originalApiUrl = process.env.NEXT_PUBLIC_API_URL

  beforeEach(() => {
    window.localStorage.clear()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL
    else process.env.NEXT_PUBLIC_API_URL = originalApiUrl
  })

  it('requests the current origin when NEXT_PUBLIC_API_URL is unset', async () => {
    delete process.env.NEXT_PUBLIC_API_URL
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ user: { id: 'u1', email: 'a@b.test' } }),
          {
            status: 200,
          },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { getSession } = await importClient()

    await getSession()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/get-session',
      expect.anything(),
    )
  })

  it('prefixes requests with NEXT_PUBLIC_API_URL when set', async () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.test'
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ user: null }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { getSession } = await importClient()

    await getSession()

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/auth/get-session',
      expect.anything(),
    )
  })

  it('falls back to a cached session when the network is unreachable', async () => {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ id: 'cached-user', email: 'cached@example.test' }),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network unreachable')
      }),
    )
    const { getSession } = await importClient()

    await expect(getSession()).resolves.toEqual({
      id: 'cached-user',
      email: 'cached@example.test',
    })
  })

  it('returns null and clears the cache when the server reports no user', async () => {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ id: 'stale', email: 'stale@example.test' }),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ user: null }), { status: 200 }),
      ),
    )
    const { getSession } = await importClient()

    await expect(getSession()).resolves.toBeNull()
    expect(window.localStorage.getItem(CACHE_KEY)).toBeNull()
  })

  it('falls back to a cached session when the response body is not JSON', async () => {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ id: 'cached-user', email: 'cached@example.test' }),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response('<!DOCTYPE html><html></html>', { status: 200 }),
      ),
    )
    const { getSession } = await importClient()

    await expect(getSession()).resolves.toEqual({
      id: 'cached-user',
      email: 'cached@example.test',
    })
  })

  it('signOut clears the cached session and calls the sign-out endpoint', async () => {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ id: 'u1', email: 'a@b.test' }),
    )
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({}), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { signOut } = await importClient()

    await signOut()

    expect(window.localStorage.getItem(CACHE_KEY)).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/sign-out'),
      expect.anything(),
    )
  })

  it('signIn caches the session on success and throws on failure', async () => {
    const okFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ user: { id: 'u1', email: 'a@b.test' } }),
          {
            status: 200,
          },
        ),
    )
    vi.stubGlobal('fetch', okFetch)
    const { signIn } = await importClient()
    await signIn('a@b.test', 'secret')
    expect(JSON.parse(window.localStorage.getItem(CACHE_KEY)!)).toEqual({
      id: 'u1',
      email: 'a@b.test',
    })

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({}), { status: 401 })),
    )
    const { signIn: signInAgain } = await importClient()
    await expect(signInAgain('a@b.test', 'wrong')).rejects.toThrow(
      'Unable to sign in',
    )
  })
})

export interface AuthUser {
  id: string
  email: string
}

interface SessionResponse {
  user?: AuthUser
}

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? ''
const authUrl = (path: string): string => `${apiBase}/api/auth${path}`
const CACHED_SESSION_KEY = 'kanjiforge-cached-session'

function cacheSession(user: AuthUser): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CACHED_SESSION_KEY, JSON.stringify(user))
}

function readCachedSession(): AuthUser | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(CACHED_SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

function clearCachedSession(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(CACHED_SESSION_KEY)
}

async function authRequest(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(authUrl(path), {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
}

/**
 * Falls back to the last verified session when the network is unreachable, rather than blocking
 * forever — local-first study must survive a reload while offline (TRD acceptance criterion #1).
 * A stale cached identity is safe here: it only ever unlocks this browser's own local database,
 * which the server-authoritative session already scoped to that user on an earlier successful check.
 */
export async function getSession(): Promise<AuthUser | null> {
  let response: Response
  try {
    response = await authRequest('/get-session', { method: 'GET' })
  } catch {
    return readCachedSession()
  }
  if (!response.ok) return null
  let body: SessionResponse | null
  try {
    body = (await response.json()) as SessionResponse | null
  } catch {
    return readCachedSession()
  }
  const user = body?.user?.id ? body.user : null
  if (user) cacheSession(user)
  else clearCachedSession()
  return user
}

export async function signIn(
  email: string,
  password: string,
): Promise<AuthUser> {
  const response = await authRequest('/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  if (!response.ok)
    throw new Error('Unable to sign in with that email and password.')
  const body = (await response.json()) as SessionResponse
  if (!body.user?.id)
    throw new Error('The sign-in response did not include a user.')
  cacheSession(body.user)
  return body.user
}

export async function register(
  email: string,
  password: string,
): Promise<AuthUser> {
  const response = await authRequest('/sign-up/email', {
    method: 'POST',
    body: JSON.stringify({
      name: email.split('@')[0] || 'KanjiForge learner',
      email,
      password,
    }),
  })
  if (!response.ok) throw new Error('Unable to create that account.')
  const body = (await response.json()) as SessionResponse
  if (!body.user?.id)
    throw new Error('The registration response did not include a user.')
  cacheSession(body.user)
  return body.user
}

export async function signOut(): Promise<void> {
  clearCachedSession()
  await authRequest('/sign-out', { method: 'POST', body: JSON.stringify({}) })
}

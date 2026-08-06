export interface AuthUser {
  id: string;
  email: string;
}

interface SessionResponse {
  user?: AuthUser;
}

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';
const authUrl = (path: string): string => `${apiBase}/api/auth${path}`;

async function authRequest(path: string, init?: RequestInit): Promise<Response> {
  return fetch(authUrl(path), {
    ...init,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
}

export async function getSession(): Promise<AuthUser | null> {
  const response = await authRequest('/get-session', { method: 'GET' });
  if (!response.ok) return null;
  const body = (await response.json()) as SessionResponse | null;
  return body?.user?.id ? body.user : null;
}

export async function signIn(email: string, password: string): Promise<AuthUser> {
  const response = await authRequest('/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error('Unable to sign in with that email and password.');
  const body = (await response.json()) as SessionResponse;
  if (!body.user?.id) throw new Error('The sign-in response did not include a user.');
  return body.user;
}

export async function register(email: string, password: string): Promise<AuthUser> {
  const response = await authRequest('/sign-up/email', {
    method: 'POST',
    body: JSON.stringify({ name: email.split('@')[0] || 'KanjiForge learner', email, password }),
  });
  if (!response.ok) throw new Error('Unable to create that account.');
  const body = (await response.json()) as SessionResponse;
  if (!body.user?.id) throw new Error('The registration response did not include a user.');
  return body.user;
}

export async function signOut(): Promise<void> {
  await authRequest('/sign-out', { method: 'POST', body: JSON.stringify({}) });
}

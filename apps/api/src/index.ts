import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createAuth } from './auth.js';
import { readEnv } from './env.js';

const env = readEnv();
const auth = createAuth(env);

function originAllowed(origin: string | undefined): boolean {
  return origin === undefined || origin === env.CORS_ORIGIN;
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function toRequest(request: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const protocol = request.headers['x-forwarded-proto'] ?? 'http';
  const host = request.headers.host ?? 'localhost';
  return new Request(`${protocol}://${host}${request.url ?? '/'}`, {
    method: request.method,
    headers: request.headers as HeadersInit,
    body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
  });
}

async function sendFetchResponse(response: ServerResponse, result: Response): Promise<void> {
  const headers = Object.fromEntries(result.headers.entries());
  response.writeHead(result.status, headers);
  response.end(Buffer.from(await result.arrayBuffer()));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const origin = request.headers.origin;
  if (!originAllowed(origin)) return json(response, 403, { error: 'origin_not_allowed' });

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'access-control-allow-origin': env.CORS_ORIGIN,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      vary: 'Origin',
    });
    return response.end();
  }

  if (url.pathname === '/healthz' && request.method === 'GET') return json(response, 200, { ok: true });

  try {
    const fetchRequest = await toRequest(request);
    if (url.pathname.startsWith('/api/auth/')) return sendFetchResponse(response, await auth.handler(fetchRequest));

    if (url.pathname === '/api/mutations' && request.method === 'POST') {
      const session = await auth.api.getSession({ headers: fetchRequest.headers });
      if (!session) return json(response, 401, { error: 'unauthenticated' });

      // T1.0 deliberately does not apply mutations yet. T1.4 will validate each
      // mutation and stamp session.user.id rather than accepting user_id from the body.
      return json(response, 501, { error: 'mutation_ingest_not_implemented' });
    }
  } catch (error) {
    console.error('API request failed', error);
    return json(response, 500, { error: 'internal_error' });
  }

  return json(response, 404, { error: 'not_found' });
});

server.listen(env.API_PORT, env.API_HOST, () => {
  console.info(`KanjiForge API listening on ${env.API_HOST}:${env.API_PORT}`);
});

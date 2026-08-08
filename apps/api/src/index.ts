import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { createAuth } from './auth.js'
import { createDatabase } from './db/client.js'
import { readEnv } from './env.js'
import {
  MutationValidationError,
  applyMutation,
  parseMutationBatch,
} from './mutations.js'
import { readSyncSnapshot } from './sync.js'

const env = readEnv()
const database = createDatabase(env.DATABASE_URL)
const auth = createAuth(env, database)

function originAllowed(origin: string | undefined): boolean {
  return origin === undefined || origin === env.CORS_ORIGIN
}

function corsHeaders(origin: string | undefined): Record<string, string> {
  if (origin === undefined) return {}
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    vary: 'Origin',
  }
}

function json(
  response: ServerResponse,
  status: number,
  body: unknown,
  origin?: string,
): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    ...corsHeaders(origin),
  })
  response.end(JSON.stringify(body))
}

async function toRequest(request: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = []
  for await (const chunk of request)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  const protocol = request.headers['x-forwarded-proto'] ?? 'http'
  const host = request.headers.host ?? 'localhost'
  return new Request(`${protocol}://${host}${request.url ?? '/'}`, {
    method: request.method,
    headers: request.headers as HeadersInit,
    body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
  })
}

async function sendFetchResponse(
  response: ServerResponse,
  result: Response,
  origin: string | undefined,
): Promise<void> {
  const headers = {
    ...Object.fromEntries(result.headers.entries()),
    ...corsHeaders(origin),
  }
  response.writeHead(result.status, headers)
  response.end(Buffer.from(await result.arrayBuffer()))
}

const server = createServer(async (request, response) => {
  const url = new URL(
    request.url ?? '/',
    `http://${request.headers.host ?? 'localhost'}`,
  )
  const origin = request.headers.origin
  if (!originAllowed(origin))
    return json(response, 403, { error: 'origin_not_allowed' })

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      ...corsHeaders(origin),
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
    })
    return response.end()
  }

  if (url.pathname === '/healthz' && request.method === 'GET')
    return json(response, 200, { ok: true }, origin)

  try {
    const fetchRequest = await toRequest(request)
    if (url.pathname.startsWith('/api/auth/'))
      return sendFetchResponse(
        response,
        await auth.handler(fetchRequest),
        origin,
      )

    if (url.pathname === '/api/mutations' && request.method === 'POST') {
      const session = await auth.api.getSession({
        headers: fetchRequest.headers,
      })
      if (!session)
        return json(response, 401, { error: 'unauthenticated' }, origin)

      try {
        const mutations = parseMutationBatch(await fetchRequest.json())
        const applied: string[] = []
        const rejected: Array<{ id: string; reason: string }> = []
        for (const mutation of mutations) {
          try {
            await applyMutation(database, session.user.id, mutation)
            applied.push(mutation.id)
          } catch (error) {
            rejected.push({
              id: mutation.id,
              reason: error instanceof Error ? error.message : 'apply_failed',
            })
          }
        }
        return json(response, 200, { applied, rejected }, origin)
      } catch (error) {
        if (error instanceof MutationValidationError)
          return json(response, 400, { error: error.message }, origin)
        throw error
      }
    }

    if (url.pathname === '/api/sync' && request.method === 'GET') {
      const session = await auth.api.getSession({
        headers: fetchRequest.headers,
      })
      if (!session)
        return json(response, 401, { error: 'unauthenticated' }, origin)
      return json(
        response,
        await readSyncSnapshot(database, session.user.id),
        origin,
      )
    }
  } catch (error) {
    console.error('API request failed', error)
    return json(response, 500, { error: 'internal_error' }, origin)
  }

  return json(response, 404, { error: 'not_found' }, origin)
})

server.listen(env.API_PORT, env.API_HOST, () => {
  console.info(`KanjiForge API listening on ${env.API_HOST}:${env.API_PORT}`)
})

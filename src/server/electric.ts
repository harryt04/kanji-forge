const ELECTRIC_TABLES = [
  'reviews',
  'decks',
  'settings',
  'deck_membership',
  'sticky_annotations',
] as const

export type ElectricTable = (typeof ELECTRIC_TABLES)[number]

export class ElectricShapeRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ElectricShapeRequestError'
  }
}

function readTable(value: string | null): ElectricTable {
  if (!ELECTRIC_TABLES.includes(value as ElectricTable))
    throw new ElectricShapeRequestError('That Electric shape is not supported.')
  return value as ElectricTable
}

/**
 * Builds the upstream shape request without allowing the browser to widen its
 * tenant scope. Electric receives the authenticated user id as a parameter,
 * never as a client-controlled where clause.
 */
export function prepareElectricShapeUrl(
  requestUrl: string,
  electricUrl: string,
  electricSecret: string,
  userId: string,
): URL {
  if (!userId.trim())
    throw new ElectricShapeRequestError('A user id is required.')

  const requested = new URL(requestUrl)
  const upstream = new URL('/v1/shape', electricUrl)
  const table = readTable(requested.searchParams.get('table'))

  for (const key of ['offset', 'handle', 'live', 'cursor', 'columns']) {
    const value = requested.searchParams.get(key)
    if (value !== null) upstream.searchParams.set(key, value)
  }

  upstream.searchParams.set('table', table)
  upstream.searchParams.set('where', 'user_id = $1')
  upstream.searchParams.set('params[1]', userId)
  upstream.searchParams.set('secret', electricSecret)
  return upstream
}

export function electricRequestHeaders(request: Request): Headers {
  const headers = new Headers()
  const accept = request.headers.get('accept')
  if (accept) headers.set('accept', accept)
  const cacheControl = request.headers.get('cache-control')
  if (cacheControl) headers.set('cache-control', cacheControl)
  return headers
}

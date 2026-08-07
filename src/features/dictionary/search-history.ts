export const DICTIONARY_HISTORY_SETTING = 'dictionary:search-history'
export const DICTIONARY_PINNED_SETTING = 'dictionary:pinned-searches'
export const MAX_DICTIONARY_HISTORY = 10

function cleanQuery(query: string): string {
  return query.trim().normalize('NFC')
}

function parseList(value: string | undefined): readonly string[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

function sameQuery(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0
}

export function parseSearchHistory(
  value: string | undefined,
): readonly string[] {
  return parseList(value)
    .map(cleanQuery)
    .filter(Boolean)
    .filter(
      (query, index, queries) =>
        queries.findIndex((candidate) => sameQuery(candidate, query)) === index,
    )
    .slice(0, MAX_DICTIONARY_HISTORY)
}

export function serializeSearchHistory(queries: readonly string[]): string {
  return JSON.stringify(parseSearchHistory(JSON.stringify(queries)))
}

export function recordSearch(
  queries: readonly string[],
  query: string,
): readonly string[] {
  const nextQuery = cleanQuery(query)
  if (!nextQuery) return parseSearchHistory(JSON.stringify(queries))
  return parseSearchHistory(
    JSON.stringify([
      nextQuery,
      ...queries.filter((candidate) => !sameQuery(candidate, nextQuery)),
    ]),
  )
}

export function parsePinnedSearches(
  value: string | undefined,
): readonly string[] {
  return parseSearchHistory(value)
}

export function togglePinnedSearch(
  queries: readonly string[],
  query: string,
): readonly string[] {
  const nextQuery = cleanQuery(query)
  if (!nextQuery) return parseSearchHistory(JSON.stringify(queries))
  const current = parsePinnedSearches(JSON.stringify(queries))
  return current.some((candidate) => sameQuery(candidate, nextQuery))
    ? current.filter((candidate) => !sameQuery(candidate, nextQuery))
    : parsePinnedSearches(JSON.stringify([nextQuery, ...current]))
}

export function isPinnedSearch(
  queries: readonly string[],
  query: string,
): boolean {
  return parsePinnedSearches(JSON.stringify(queries)).some((candidate) =>
    sameQuery(candidate, cleanQuery(query)),
  )
}

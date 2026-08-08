import type {
  Deck,
  DeckMembership,
  Review,
  Setting,
  StickyAnnotation,
} from '@/data/repo'
import type { SyncSnapshot } from './index'

export const ELECTRIC_TABLES = [
  'reviews',
  'decks',
  'settings',
  'deck_membership',
  'sticky_annotations',
] as const

export type ElectricTable = (typeof ELECTRIC_TABLES)[number]

type JsonObject = Record<string, unknown>
type ElectricHeaders = NonNullable<ElectricShapeMessage['headers']>

export interface ElectricShapeMessage {
  readonly key?: string
  readonly value?: JsonObject
  readonly headers?: {
    readonly operation?: 'insert' | 'update' | 'delete'
    readonly control?: 'up-to-date' | 'must-refetch' | 'snapshot-end'
  }
}

export interface ElectricShapeCursor {
  readonly handle?: string
  readonly offset?: string
  readonly cursor?: string
}

export interface ElectricShapeState {
  readonly rows: Map<ElectricTable, Map<string, JsonObject>>
  readonly cursors: Map<ElectricTable, ElectricShapeCursor>
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseMessage(value: unknown): ElectricShapeMessage | null {
  if (!isObject(value)) return null
  const headers = isObject(value.headers) ? value.headers : undefined
  const operation = headers?.operation
  const control = headers?.control
  if (
    operation !== undefined &&
    operation !== 'insert' &&
    operation !== 'update' &&
    operation !== 'delete'
  )
    return null
  if (
    control !== undefined &&
    control !== 'up-to-date' &&
    control !== 'must-refetch' &&
    control !== 'snapshot-end'
  )
    return null
  return {
    key: typeof value.key === 'string' ? value.key : undefined,
    value: isObject(value.value) ? value.value : undefined,
    headers: headers
      ? {
          operation: operation as ElectricHeaders['operation'],
          control: control as ElectricHeaders['control'],
        }
      : undefined,
  }
}

/** Parses Electric JSON arrays, NDJSON, and SSE data lines without a dependency. */
export function parseElectricShapeMessages(
  body: string,
): readonly ElectricShapeMessage[] {
  const source = body.trim()
  if (!source) return []
  const values: unknown[] = []
  try {
    const parsed: unknown = JSON.parse(source)
    if (Array.isArray(parsed)) values.push(...parsed)
    else values.push(parsed)
  } catch {
    for (const line of source.split(/\r?\n/u)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith(':')) continue
      const payload = trimmed.startsWith('data:')
        ? trimmed.slice('data:'.length).trim()
        : trimmed
      try {
        values.push(JSON.parse(payload) as unknown)
      } catch {
        // Ignore comments and malformed keep-alive chunks; a valid control
        // message or change in the same response remains usable.
      }
    }
  }
  return values.flatMap((value) => {
    const message = parseMessage(value)
    return message ? [message] : []
  })
}

export function createElectricShapeState(): ElectricShapeState {
  return {
    rows: new Map(ELECTRIC_TABLES.map((table) => [table, new Map()])),
    cursors: new Map(),
  }
}

function rowKey(message: ElectricShapeMessage): string | null {
  if (message.key) return message.key
  const value = message.value
  if (!value) return null
  if (typeof value.id === 'string' || typeof value.id === 'number')
    return String(value.id)
  if (typeof value.key === 'string') return value.key
  if (
    typeof value.deck_id === 'string' &&
    typeof value.content_ref === 'string'
  )
    return `${value.deck_id}:${value.content_ref}`
  if (typeof value.deckId === 'string' && typeof value.contentRef === 'string')
    return `${value.deckId}:${value.contentRef}`
  return null
}

/** Applies one Electric response to a materialized per-table row set. */
export function applyElectricShapeMessages(
  state: ElectricShapeState,
  table: ElectricTable,
  messages: readonly ElectricShapeMessage[],
): void {
  const rows = state.rows.get(table)
  if (!rows) return
  for (const message of messages) {
    const control = message.headers?.control
    if (control === 'must-refetch') rows.clear()
    const operation = message.headers?.operation
    if (!operation) continue
    const key = rowKey(message)
    if (!key) continue
    if (operation === 'delete') rows.delete(key)
    else if (message.value) {
      const previous = rows.get(key)
      rows.set(
        key,
        operation === 'update'
          ? { ...previous, ...message.value }
          : message.value,
      )
    }
  }
}

function stringField(row: JsonObject, ...keys: string[]): string | null {
  for (const key of keys) {
    if (typeof row[key] === 'string') return row[key] as string
  }
  return null
}

function numberField(row: JsonObject, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (
      typeof value === 'string' &&
      value.trim() &&
      Number.isFinite(Number(value))
    )
      return Number(value)
  }
  return null
}

function rowsFor(
  state: ElectricShapeState,
  table: ElectricTable,
): readonly JsonObject[] {
  return [...(state.rows.get(table)?.values() ?? [])]
}

function toReview(row: JsonObject): Review | null {
  const id = stringField(row, 'id')
  const deckId = stringField(row, 'deck_id', 'deckId')
  const contentRef = stringField(row, 'content_ref', 'contentRef')
  const at = numberField(row, 'at')
  const grade = stringField(row, 'grade')
  const levelBefore = numberField(row, 'level_before', 'levelBefore')
  const levelAfter = numberField(row, 'level_after', 'levelAfter')
  const intervalBefore = numberField(row, 'interval_before', 'intervalBefore')
  const elapsedDays = numberField(row, 'elapsed_days', 'elapsedDays')
  const responseMs = numberField(row, 'response_ms', 'responseMs')
  const source = stringField(row, 'source')
  const deviceId = stringField(row, 'device_id', 'deviceId')
  if (
    !id ||
    !deckId ||
    !contentRef ||
    at === null ||
    (grade !== 'again' && grade !== 'good' && grade !== 'easy') ||
    levelBefore === null ||
    levelAfter === null ||
    intervalBefore === null ||
    elapsedDays === null ||
    responseMs === null ||
    (source !== 'study' &&
      source !== 'manual' &&
      source !== 'import' &&
      source !== 'transfer') ||
    !deviceId
  )
    return null
  if (
    ![levelBefore, levelAfter].every(
      (value) => Number.isInteger(value) && value >= 0 && value <= 4,
    )
  )
    return null
  return {
    id,
    deckId,
    contentRef,
    at,
    grade: grade as Review['grade'],
    levelBefore: levelBefore as Review['levelBefore'],
    levelAfter: levelAfter as Review['levelAfter'],
    intervalBefore,
    elapsedDays,
    responseMs,
    source: source as Review['source'],
    deviceId,
  }
}

function toSnapshot(state: ElectricShapeState): SyncSnapshot {
  const decks: Deck[] = rowsFor(state, 'decks').flatMap((row) => {
    const id = stringField(row, 'id')
    const name = stringField(row, 'name')
    const kind = stringField(row, 'kind')
    const updatedAt = numberField(row, 'updated_at', 'updatedAt')
    if (
      !id ||
      !name ||
      (kind !== 'saved' && kind !== 'custom' && kind !== 'derived') ||
      updatedAt === null
    )
      return []
    return [
      {
        id,
        name,
        kind: kind as Deck['kind'],
        definitionId: stringField(row, 'definition_id', 'definitionId'),
        updatedAt,
      },
    ]
  })
  const settings: Setting[] = rowsFor(state, 'settings').flatMap((row) => {
    const key = stringField(row, 'key')
    const value = stringField(row, 'value')
    const updatedAt = numberField(row, 'updated_at', 'updatedAt')
    return key && value !== null && updatedAt !== null
      ? [{ key, value, updatedAt }]
      : []
  })
  const deckMembership: DeckMembership[] = rowsFor(
    state,
    'deck_membership',
  ).flatMap((row) => {
    const deckId = stringField(row, 'deck_id', 'deckId')
    const contentRef = stringField(row, 'content_ref', 'contentRef')
    const sortOrder = numberField(row, 'sort_order', 'sortOrder')
    const addedAt = numberField(row, 'added_at', 'addedAt')
    const updatedAt = numberField(row, 'updated_at', 'updatedAt')
    return deckId &&
      contentRef &&
      sortOrder !== null &&
      addedAt !== null &&
      updatedAt !== null
      ? [{ deckId, contentRef, sortOrder, addedAt, updatedAt }]
      : []
  })
  const annotations: StickyAnnotation[] = rowsFor(
    state,
    'sticky_annotations',
  ).flatMap((row) => {
    const deckId = stringField(row, 'deck_id', 'deckId')
    const contentRef = stringField(row, 'content_ref', 'contentRef')
    const note = stringField(row, 'note')
    const tagsJson = stringField(row, 'tags_json', 'tagsJson')
    const updatedAt = numberField(row, 'updated_at', 'updatedAt')
    const updatedBy = stringField(row, 'updated_by', 'updatedBy')
    let tags: readonly string[] = []
    try {
      const parsed: unknown = tagsJson ? JSON.parse(tagsJson) : []
      tags = Array.isArray(parsed)
        ? parsed.filter((tag): tag is string => typeof tag === 'string')
        : []
    } catch {
      return []
    }
    return deckId &&
      contentRef &&
      note !== null &&
      updatedAt !== null &&
      updatedBy
      ? [{ deckId, contentRef, note, tags, updatedAt, updatedBy }]
      : []
  })
  return {
    reviews: rowsFor(state, 'reviews').flatMap((row) => {
      const review = toReview(row)
      return review ? [review] : []
    }),
    decks,
    settings,
    deckMembership,
    annotations,
  }
}

export function electricSnapshot(state: ElectricShapeState): SyncSnapshot {
  return toSnapshot(state)
}

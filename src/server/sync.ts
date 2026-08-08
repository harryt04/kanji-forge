import { eq } from 'drizzle-orm'
import { createDatabase } from './db/client'
import {
  deckMembership,
  decks,
  reviews,
  settings,
  stickyAnnotations,
} from './db/schema'

export interface SyncReview {
  readonly id: string
  readonly deckId: string
  readonly contentRef: string
  readonly at: number
  readonly grade: 'again' | 'good' | 'easy'
  readonly levelBefore: number
  readonly levelAfter: number
  readonly intervalBefore: number
  readonly elapsedDays: number
  readonly responseMs: number
  readonly source: 'study' | 'manual' | 'import' | 'transfer'
  readonly deviceId: string
}

export interface SyncDeck {
  readonly id: string
  readonly name: string
  readonly kind: 'saved' | 'custom' | 'derived'
  readonly definitionId: string | null
  readonly updatedAt: number
}

export interface SyncSetting {
  readonly key: string
  readonly value: string
  readonly updatedAt: number
}

export interface SyncMembership {
  readonly deckId: string
  readonly contentRef: string
  readonly sortOrder: number
  readonly addedAt: number
  readonly updatedAt: number
}

export interface SyncAnnotation {
  readonly deckId: string
  readonly contentRef: string
  readonly note: string
  readonly tags: readonly string[]
  readonly updatedAt: number
  readonly updatedBy: string
}

export interface SyncSnapshot {
  readonly reviews: readonly SyncReview[]
  readonly decks: readonly SyncDeck[]
  readonly settings: readonly SyncSetting[]
  readonly deckMembership: readonly SyncMembership[]
  readonly annotations: readonly SyncAnnotation[]
}

type ApiDatabase = ReturnType<typeof createDatabase>

function payloadValue(
  payload: unknown,
  key: string,
  fallback: string | number,
): string | number {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return fallback
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' || typeof value === 'number'
    ? value
    : fallback
}

function grade(value: number): SyncReview['grade'] {
  return value === 0 ? 'again' : value === 1 ? 'good' : 'easy'
}

function reviewSource(value: string | number): SyncReview['source'] {
  return value === 'manual' || value === 'import' || value === 'transfer'
    ? value
    : 'study'
}

/** Reads only the authenticated user's sync projections for the client read path. */
export async function readSyncSnapshot(
  database: ApiDatabase,
  userId: string,
): Promise<SyncSnapshot> {
  const [reviewRows, deckRows, settingRows, membershipRows, annotationRows] =
    await Promise.all([
      database.select().from(reviews).where(eq(reviews.userId, userId)),
      database.select().from(decks).where(eq(decks.userId, userId)),
      database.select().from(settings).where(eq(settings.userId, userId)),
      database
        .select()
        .from(deckMembership)
        .where(eq(deckMembership.userId, userId)),
      database
        .select()
        .from(stickyAnnotations)
        .where(eq(stickyAnnotations.userId, userId)),
    ])

  return {
    reviews: reviewRows.map((row) => ({
      id: row.id,
      deckId: String(payloadValue(row.payload, 'deckId', row.deckId)),
      contentRef: String(
        payloadValue(row.payload, 'contentRef', row.contentRef),
      ),
      at: Number(payloadValue(row.payload, 'at', row.reviewedAt.getTime())),
      grade: String(
        payloadValue(row.payload, 'grade', grade(row.grade)),
      ) as SyncReview['grade'],
      levelBefore: Number(payloadValue(row.payload, 'levelBefore', 0)),
      levelAfter: Number(payloadValue(row.payload, 'levelAfter', 0)),
      intervalBefore: Number(payloadValue(row.payload, 'intervalBefore', 0)),
      elapsedDays: Number(payloadValue(row.payload, 'elapsedDays', 0)),
      responseMs: Number(payloadValue(row.payload, 'responseMs', 0)),
      source: reviewSource(payloadValue(row.payload, 'source', 'study')),
      deviceId: String(payloadValue(row.payload, 'deviceId', 'server')),
    })),
    decks: deckRows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind as SyncDeck['kind'],
      definitionId: row.definitionId,
      updatedAt: row.updatedAt.getTime(),
    })),
    settings: settingRows.map((row) => ({
      key: row.key,
      value: row.value,
      updatedAt: row.updatedAt.getTime(),
    })),
    deckMembership: membershipRows.map((row) => ({
      deckId: row.deckId,
      contentRef: row.contentRef,
      sortOrder: row.order,
      addedAt: row.addedAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    })),
    annotations: annotationRows.map((row) => ({
      deckId: row.deckId,
      contentRef: row.contentRef,
      note: row.note,
      tags: Array.isArray(row.tags)
        ? row.tags.filter((tag): tag is string => typeof tag === 'string')
        : [],
      updatedAt: row.updatedAt.getTime(),
      updatedBy: row.updatedBy,
    })),
  }
}

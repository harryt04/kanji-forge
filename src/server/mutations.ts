import { and, eq, sql } from 'drizzle-orm'
import { createDatabase } from './db/client'
import {
  deckMembership,
  decks,
  reviews,
  settings,
  stickyAnnotations,
} from './db/schema'

export const MUTATION_TYPES = [
  'review.append',
  'deck.upsert',
  'settings.upsert',
  'deckMembership.upsert',
  'annotation.upsert',
] as const

export type MutationType = (typeof MUTATION_TYPES)[number]

export interface MutationEnvelope {
  readonly id: string
  readonly mutType: MutationType
  readonly payload: unknown
}

interface ReviewPayload {
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

interface DeckPayload {
  readonly id: string
  readonly name: string
  readonly kind: 'saved' | 'custom' | 'derived'
  readonly definitionId: string | null
  readonly updatedAt: number
}

interface SettingPayload {
  readonly key: string
  readonly value: string
  readonly updatedAt: number
}

interface MembershipPayload {
  readonly deckId: string
  readonly contentRef: string
  readonly sortOrder: number
  readonly addedAt: number
  readonly updatedAt: number
}

interface AnnotationPayload {
  readonly deckId: string
  readonly contentRef: string
  readonly note: string
  readonly tags: readonly string[]
  readonly updatedAt: number
  readonly updatedBy: string
}

export type ValidatedMutation =
  | {
      readonly id: string
      readonly mutType: 'review.append'
      readonly payload: ReviewPayload
    }
  | {
      readonly id: string
      readonly mutType: 'deck.upsert'
      readonly payload: DeckPayload
    }
  | {
      readonly id: string
      readonly mutType: 'settings.upsert'
      readonly payload: SettingPayload
    }
  | {
      readonly id: string
      readonly mutType: 'deckMembership.upsert'
      readonly payload: MembershipPayload
    }
  | {
      readonly id: string
      readonly mutType: 'annotation.upsert'
      readonly payload: AnnotationPayload
    }

export class MutationValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MutationValidationError'
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new MutationValidationError(`${label} must be an object.`)
  return value as Record<string, unknown>
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '')
    throw new MutationValidationError(`${label} must be a non-empty string.`)
  return value
}

function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new MutationValidationError(`${label} must be a safe integer.`)
  return value
}

function nullableText(value: unknown, label: string): string | null {
  if (value === null) return null
  return text(value, label)
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T))
    throw new MutationValidationError(`${label} is not supported.`)
  return value as T
}

function reviewPayload(id: string, value: unknown): ReviewPayload {
  const payload = object(value, 'Review payload')
  const payloadId = text(payload.id, 'Review id')
  if (payloadId !== id)
    throw new MutationValidationError(
      'Review mutation id must equal review id.',
    )
  return {
    id: payloadId,
    deckId: text(payload.deckId, 'Review deckId'),
    contentRef: text(payload.contentRef, 'Review contentRef'),
    at: integer(payload.at, 'Review at'),
    grade: enumValue(payload.grade, ['again', 'good', 'easy'], 'Review grade'),
    levelBefore: integer(payload.levelBefore, 'Review levelBefore'),
    levelAfter: integer(payload.levelAfter, 'Review levelAfter'),
    intervalBefore: integer(payload.intervalBefore, 'Review intervalBefore'),
    elapsedDays: integer(payload.elapsedDays, 'Review elapsedDays'),
    responseMs: integer(payload.responseMs, 'Review responseMs'),
    source: enumValue(
      payload.source,
      ['study', 'manual', 'import', 'transfer'],
      'Review source',
    ),
    deviceId: text(payload.deviceId, 'Review deviceId'),
  }
}

function deckPayload(value: unknown): DeckPayload {
  const payload = object(value, 'Deck payload')
  return {
    id: text(payload.id, 'Deck id'),
    name: text(payload.name, 'Deck name'),
    kind: enumValue(payload.kind, ['saved', 'custom', 'derived'], 'Deck kind'),
    definitionId: nullableText(payload.definitionId, 'Deck definitionId'),
    updatedAt: integer(payload.updatedAt, 'Deck updatedAt'),
  }
}

function settingPayload(value: unknown): SettingPayload {
  const payload = object(value, 'Setting payload')
  return {
    key: text(payload.key, 'Setting key'),
    value: text(payload.value, 'Setting value'),
    updatedAt: integer(payload.updatedAt, 'Setting updatedAt'),
  }
}

function membershipPayload(value: unknown): MembershipPayload {
  const payload = object(value, 'Deck membership payload')
  return {
    deckId: text(payload.deckId, 'Membership deckId'),
    contentRef: text(payload.contentRef, 'Membership contentRef'),
    sortOrder: integer(payload.sortOrder, 'Membership sortOrder'),
    addedAt: integer(payload.addedAt, 'Membership addedAt'),
    updatedAt: integer(payload.updatedAt, 'Membership updatedAt'),
  }
}

function annotationPayload(value: unknown): AnnotationPayload {
  const payload = object(value, 'Annotation payload')
  if (
    !Array.isArray(payload.tags) ||
    payload.tags.some((tag) => typeof tag !== 'string')
  )
    throw new MutationValidationError('Annotation tags must be strings.')
  return {
    deckId: text(payload.deckId, 'Annotation deckId'),
    contentRef: text(payload.contentRef, 'Annotation contentRef'),
    note: typeof payload.note === 'string' ? payload.note : '',
    tags: payload.tags,
    updatedAt: integer(payload.updatedAt, 'Annotation updatedAt'),
    updatedBy: text(payload.updatedBy, 'Annotation updatedBy'),
  }
}

export function validateMutation(value: unknown): ValidatedMutation {
  const mutation = object(value, 'Mutation')
  const id = text(mutation.id, 'Mutation id')
  const mutType = enumValue(mutation.mutType, MUTATION_TYPES, 'Mutation type')
  switch (mutType) {
    case 'review.append':
      return { id, mutType, payload: reviewPayload(id, mutation.payload) }
    case 'deck.upsert':
      return { id, mutType, payload: deckPayload(mutation.payload) }
    case 'settings.upsert':
      return { id, mutType, payload: settingPayload(mutation.payload) }
    case 'deckMembership.upsert':
      return { id, mutType, payload: membershipPayload(mutation.payload) }
    case 'annotation.upsert':
      return { id, mutType, payload: annotationPayload(mutation.payload) }
  }
}

export function parseMutationBatch(
  value: unknown,
): readonly ValidatedMutation[] {
  const body = object(value, 'Mutation request')
  if (!Array.isArray(body.mutations) || body.mutations.length > 100)
    throw new MutationValidationError(
      'Mutations must be an array of at most 100 items.',
    )
  return body.mutations.map(validateMutation)
}

type ApiDatabase = ReturnType<typeof createDatabase>

async function assertWritableDeck(
  tx: Parameters<Parameters<ApiDatabase['transaction']>[0]>[0],
  userId: string,
  deckId: string,
): Promise<void> {
  const rows = await tx
    .select({ kind: decks.kind })
    .from(decks)
    .where(and(eq(decks.id, deckId), eq(decks.userId, userId)))
    .limit(1)
  if (rows[0]?.kind === 'derived')
    throw new Error('Derived decks cannot receive synced mutations.')
  if (!rows[0]) throw new Error('Deck is not owned by the authenticated user.')
}

/** Applies one already-validated mutation. The caller supplies the authenticated user id. */
export async function applyMutation(
  database: ApiDatabase,
  userId: string,
  mutation: ValidatedMutation,
): Promise<void> {
  await database.transaction(async (tx) => {
    switch (mutation.mutType) {
      case 'review.append': {
        const payload = mutation.payload
        if (payload.deckId === 'saved' || payload.deckId.startsWith('custom-'))
          await assertWritableDeck(tx, userId, payload.deckId)
        await tx
          .insert(reviews)
          .values({
            id: payload.id,
            userId,
            contentRef: payload.contentRef,
            deckId: payload.deckId,
            grade:
              payload.grade === 'again' ? 0 : payload.grade === 'good' ? 1 : 2,
            reviewedAt: new Date(payload.at),
            payload,
          })
          .onConflictDoNothing({ target: reviews.id })
        return
      }
      case 'deck.upsert': {
        const payload = mutation.payload
        await tx
          .insert(decks)
          .values({
            id: payload.id,
            userId,
            name: payload.name,
            kind: payload.kind,
            definitionId: payload.definitionId,
            updatedAt: new Date(payload.updatedAt),
          })
          .onConflictDoUpdate({
            target: [decks.id, decks.userId],
            set: {
              name: payload.name,
              kind: payload.kind,
              definitionId: payload.definitionId,
              updatedAt: new Date(payload.updatedAt),
            },
            where: sql`${decks.updatedAt} < excluded.updated_at`,
          })
        return
      }
      case 'settings.upsert': {
        const payload = mutation.payload
        await tx
          .insert(settings)
          .values({
            userId,
            key: payload.key,
            value: payload.value,
            updatedAt: new Date(payload.updatedAt),
          })
          .onConflictDoUpdate({
            target: [settings.userId, settings.key],
            set: {
              value: payload.value,
              updatedAt: new Date(payload.updatedAt),
            },
            where: sql`${settings.updatedAt} < excluded.updated_at`,
          })
        return
      }
      case 'deckMembership.upsert': {
        const payload = mutation.payload
        await assertWritableDeck(tx, userId, payload.deckId)
        await tx
          .insert(deckMembership)
          .values({
            userId,
            deckId: payload.deckId,
            contentRef: payload.contentRef,
            order: payload.sortOrder,
            addedAt: new Date(payload.addedAt),
            updatedAt: new Date(payload.updatedAt),
          })
          .onConflictDoUpdate({
            target: [
              deckMembership.userId,
              deckMembership.deckId,
              deckMembership.contentRef,
            ],
            set: {
              order: payload.sortOrder,
              updatedAt: new Date(payload.updatedAt),
            },
            where: sql`${deckMembership.updatedAt} < excluded.updated_at`,
          })
        return
      }
      case 'annotation.upsert': {
        const payload = mutation.payload
        await tx
          .insert(stickyAnnotations)
          .values({
            userId,
            deckId: payload.deckId,
            contentRef: payload.contentRef,
            note: payload.note,
            tags: payload.tags,
            updatedAt: new Date(payload.updatedAt),
            updatedBy: payload.updatedBy,
          })
          .onConflictDoUpdate({
            target: [
              stickyAnnotations.userId,
              stickyAnnotations.deckId,
              stickyAnnotations.contentRef,
            ],
            set: {
              note: payload.note,
              tags: payload.tags,
              updatedAt: new Date(payload.updatedAt),
              updatedBy: payload.updatedBy,
            },
            where: sql`${stickyAnnotations.updatedAt} < excluded.updated_at`,
          })
        return
      }
    }
  })
}

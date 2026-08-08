import type {
  Deck,
  DeckMembership,
  Review,
  Setting,
  UserRepositories,
} from '@/data/repo'

export const BACKUP_FORMAT = 'kanjiforge-backup'
export const BACKUP_VERSION = 1

export interface KanjiForgeBackup {
  readonly format: typeof BACKUP_FORMAT
  readonly version: typeof BACKUP_VERSION
  readonly exportedAt: number
  readonly user: { readonly id: string }
  readonly decks: readonly Deck[]
  readonly settings: readonly Setting[]
  readonly deckMembership: readonly DeckMembership[]
  readonly reviews: readonly Review[]
}

export async function createBackup(
  repositories: UserRepositories,
  userId: string,
  exportedAt = Date.now(),
): Promise<KanjiForgeBackup> {
  const [decks, settings, deckMembership, reviews] = await Promise.all([
    repositories.decks.list(),
    repositories.settings.list(),
    repositories.deckMembership.list(),
    repositories.reviews.list(),
  ])
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    user: { id: userId },
    decks,
    settings,
    deckMembership,
    reviews,
  }
}

export function parseBackup(raw: string, userId: string): KanjiForgeBackup {
  let value: unknown
  try {
    value = JSON.parse(raw) as unknown
  } catch {
    throw new Error('Backup file is not valid JSON.')
  }
  if (!isRecord(value)) throw new Error('Backup file must contain an object.')
  if (value.format !== BACKUP_FORMAT || value.version !== BACKUP_VERSION)
    throw new Error('Backup file format or version is not supported.')
  if (
    !isFiniteNumber(value.exportedAt) ||
    !isRecord(value.user) ||
    value.user.id !== userId ||
    !Array.isArray(value.decks) ||
    !Array.isArray(value.settings) ||
    !Array.isArray(value.deckMembership) ||
    !Array.isArray(value.reviews) ||
    !value.decks.every(isDeck) ||
    !value.settings.every(isSetting) ||
    !value.deckMembership.every(isDeckMembership) ||
    !value.reviews.every(isReview)
  )
    throw new Error('Backup file is incomplete or belongs to another account.')

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: value.exportedAt,
    user: { id: userId },
    decks: value.decks,
    settings: value.settings,
    deckMembership: value.deckMembership,
    reviews: value.reviews,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isLevel(value: unknown): boolean {
  return (
    isFiniteNumber(value) && Number.isInteger(value) && value >= 0 && value <= 4
  )
}

function isDeck(value: unknown): value is Deck {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (value.kind === 'saved' || value.kind === 'derived') &&
    (value.definitionId === null || typeof value.definitionId === 'string') &&
    isFiniteNumber(value.updatedAt)
  )
}

function isSetting(value: unknown): value is Setting {
  return (
    isRecord(value) &&
    typeof value.key === 'string' &&
    typeof value.value === 'string' &&
    isFiniteNumber(value.updatedAt)
  )
}

function isDeckMembership(value: unknown): value is DeckMembership {
  return (
    isRecord(value) &&
    value.deckId === 'saved' &&
    typeof value.contentRef === 'string' &&
    isFiniteNumber(value.sortOrder) &&
    isFiniteNumber(value.addedAt) &&
    isFiniteNumber(value.updatedAt)
  )
}

function isReview(value: unknown): value is Review {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.deckId === 'string' &&
    typeof value.contentRef === 'string' &&
    isFiniteNumber(value.at) &&
    (value.grade === 'again' ||
      value.grade === 'good' ||
      value.grade === 'easy') &&
    isLevel(value.levelBefore) &&
    isLevel(value.levelAfter) &&
    isFiniteNumber(value.intervalBefore) &&
    isFiniteNumber(value.elapsedDays) &&
    isFiniteNumber(value.responseMs) &&
    (value.source === 'study' ||
      value.source === 'manual' ||
      value.source === 'import' ||
      value.source === 'transfer') &&
    typeof value.deviceId === 'string'
  )
}

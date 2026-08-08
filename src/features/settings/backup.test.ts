import { afterEach, describe, expect, it } from 'vitest'
import { openLocalUserDatabase, type LocalUserDatabase } from '@/data/db'
import { createUserRepositories } from '@/data/repo'
import { repoReview } from '../../../test/factories'
import {
  BACKUP_REMINDER_INTERVAL_MS,
  BACKUP_FORMAT,
  getBackupReminder,
  BACKUP_VERSION,
  createBackup,
  parseBackup,
} from './backup'

const databases: LocalUserDatabase[] = []

afterEach(() => {
  for (const database of databases.splice(0)) database.close()
})

async function freshRepo(userId: string) {
  const database = openLocalUserDatabase(userId)
  databases.push(database)
  await database.ready
  return { database, repositories: createUserRepositories(database) }
}

describe('KanjiForge backups', () => {
  it('reminds users who have never backed up or are past the 30-day window', () => {
    expect(getBackupReminder(undefined, 100)).toBe('missing')
    expect(getBackupReminder(100, 100 + BACKUP_REMINDER_INTERVAL_MS - 1)).toBe(
      null,
    )
    expect(getBackupReminder(100, 100 + BACKUP_REMINDER_INTERVAL_MS)).toBe(
      'stale',
    )
  })

  it('exports the complete review log and user-owned metadata', async () => {
    const { repositories } = await freshRepo('backup-export-user')
    const review = repoReview()
    await repositories.decks.upsert({
      id: 'jlpt-n5',
      name: 'JLPT N5',
      kind: 'derived',
      definitionId: 'jlpt-kanji-n5',
      updatedAt: 10,
    })
    await repositories.settings.set({
      key: 'theme',
      value: 'dark',
      updatedAt: 11,
    })
    await repositories.reviews.append(review)

    await expect(
      createBackup(repositories, 'backup-export-user', 12),
    ).resolves.toMatchObject({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: 12,
      user: { id: 'backup-export-user' },
      decks: [{ id: 'jlpt-n5' }],
      settings: [{ key: 'theme', value: 'dark' }],
      reviews: [review],
    })
  })

  it('rejects malformed or cross-account backups before touching local data', () => {
    expect(() => parseBackup('not json', 'learner')).toThrow('valid JSON')
    expect(() =>
      parseBackup(
        JSON.stringify({
          format: BACKUP_FORMAT,
          version: BACKUP_VERSION,
          exportedAt: 1,
          user: { id: 'someone-else' },
          decks: [],
          settings: [],
          deckMembership: [],
          reviews: [],
        }),
        'learner',
      ),
    ).toThrow('another account')
  })

  it('restores reviews and replays them without replacing newer settings', async () => {
    const { repositories } = await freshRepo('backup-restore-user')
    await repositories.settings.set({
      key: 'theme',
      value: 'light',
      updatedAt: 20,
    })
    const review = repoReview({ id: 'restore-review', at: 10 })
    const backup = parseBackup(
      JSON.stringify({
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: 1,
        user: { id: 'backup-restore-user' },
        decks: [
          {
            id: 'jlpt-n5',
            name: 'JLPT N5',
            kind: 'derived',
            definitionId: 'jlpt-kanji-n5',
            updatedAt: 10,
          },
        ],
        settings: [{ key: 'theme', value: 'dark', updatedAt: 11 }],
        deckMembership: [],
        reviews: [review],
      }),
      'backup-restore-user',
    )

    await repositories.restoreBackup(backup)

    expect(await repositories.reviews.list()).toEqual([review])
    expect(
      await repositories.cardStates.get('jlpt-n5', 'kanji:未'),
    ).toMatchObject({
      level: 1,
      totalReviews: 1,
    })
    await expect(repositories.settings.get('theme')).resolves.toMatchObject({
      value: 'light',
    })
  })
})

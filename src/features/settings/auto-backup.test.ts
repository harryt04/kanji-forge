import { afterEach, describe, expect, it, vi } from 'vitest'
import { openLocalUserDatabase, type LocalUserDatabase } from '@/data/db'
import { createUserRepositories } from '@/data/repo'
import {
  AUTO_BACKUP_INTERVAL_MS,
  chooseAutoBackupDirectory,
  getAutoBackupDirectory,
  supportsAutoBackup,
  writeAutomaticBackup,
} from './auto-backup'
import { BACKUP_LAST_EXPORTED_SETTING } from './backup'

const databases: LocalUserDatabase[] = []

afterEach(() => {
  for (const database of databases.splice(0)) database.close()
  Reflect.deleteProperty(window, 'showDirectoryPicker')
  vi.restoreAllMocks()
})

function fakeDirectory(): {
  handle: {
    name: string
    requestPermission: ReturnType<typeof vi.fn>
    queryPermission: ReturnType<typeof vi.fn>
    getFileHandle: ReturnType<typeof vi.fn>
  }
  writes: string[]
} {
  const writes: string[] = []
  const writable = {
    write: vi.fn(async (data: string) => {
      writes.push(data)
    }),
    close: vi.fn(async () => undefined),
  }
  const handle = {
    name: 'Study Backups',
    requestPermission: vi.fn().mockResolvedValue('granted'),
    queryPermission: vi.fn().mockResolvedValue('granted'),
    getFileHandle: vi.fn().mockResolvedValue({
      createWritable: vi.fn().mockResolvedValue(writable),
    }),
  }
  return { handle, writes }
}

describe('automatic folder backups', () => {
  it('detects whether the browser can choose a persistent folder', () => {
    expect(supportsAutoBackup()).toBe(false)
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: vi.fn(),
    })
    expect(supportsAutoBackup()).toBe(false)
  })

  it('stores a chosen folder and writes a complete backup once', async () => {
    const userId = `auto-backup-${crypto.randomUUID()}`
    const { handle, writes } = fakeDirectory()
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: vi.fn().mockResolvedValue(handle),
    })
    await expect(chooseAutoBackupDirectory(userId)).resolves.toBe(handle)
    await expect(getAutoBackupDirectory(userId)).resolves.toBe(handle)

    const database = openLocalUserDatabase(userId)
    databases.push(database)
    await database.ready
    const repositories = createUserRepositories(database)
    await expect(writeAutomaticBackup(userId, repositories, 100)).resolves.toBe(
      true,
    )
    expect(writes).toHaveLength(1)
    expect(JSON.parse(writes[0] ?? '')).toMatchObject({
      format: 'kanjiforge-backup',
      user: { id: userId },
      exportedAt: 100,
    })
    await expect(
      repositories.settings.get(BACKUP_LAST_EXPORTED_SETTING),
    ).resolves.toMatchObject({ value: '100' })
  })

  it('does not rewrite a folder more than once per day', async () => {
    const userId = `auto-backup-${crypto.randomUUID()}`
    const { handle, writes } = fakeDirectory()
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: vi.fn().mockResolvedValue(handle),
    })
    await chooseAutoBackupDirectory(userId)
    const database = openLocalUserDatabase(userId)
    databases.push(database)
    await database.ready
    const repositories = createUserRepositories(database)

    await expect(writeAutomaticBackup(userId, repositories, 100)).resolves.toBe(
      true,
    )
    await expect(
      writeAutomaticBackup(
        userId,
        repositories,
        100 + AUTO_BACKUP_INTERVAL_MS - 1,
      ),
    ).resolves.toBe(false)
    expect(writes).toHaveLength(1)
  })
})

'use client'

import { useEffect } from 'react'
import { getActiveUserRuntime } from '@/auth/runtime'
import { createUserRepositories, type UserRepositories } from '@/data/repo'
import {
  BACKUP_LAST_EXPORTED_SETTING,
  createBackup,
  type KanjiForgeBackup,
} from './backup'

export const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000
export const AUTO_BACKUP_LAST_WRITTEN_SETTING = 'backup:auto-last-written-at'
const HANDLE_DATABASE = 'kanjiforge-backup-folders'
const HANDLE_STORE = 'directories'
const AUTO_BACKUP_FILENAME = 'kanjiforge-auto-backup.json'

interface WritableFile {
  createWritable(): Promise<{
    write(data: string): Promise<void>
    close(): Promise<void>
  }>
}

export interface BackupDirectoryHandle {
  readonly name: string
  queryPermission?(descriptor?: { mode: 'readwrite' }): Promise<string>
  requestPermission?(descriptor?: { mode: 'readwrite' }): Promise<string>
  getFileHandle(
    name: string,
    options: { create: boolean },
  ): Promise<WritableFile>
}

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: () => Promise<BackupDirectoryHandle>
}

const memoryHandles = new Map<string, BackupDirectoryHandle>()

function getDirectoryPickerWindow(): DirectoryPickerWindow | undefined {
  if (typeof window === 'undefined') return undefined
  return window as DirectoryPickerWindow
}

export function supportsAutoBackup(): boolean {
  return Boolean(
    getDirectoryPickerWindow()?.showDirectoryPicker &&
    typeof indexedDB !== 'undefined',
  )
}

function openHandleDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined')
    return Promise.reject(new Error('IndexedDB is unavailable.'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DATABASE, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(HANDLE_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('Could not open backup storage.'))
  })
}

async function storeHandle(
  userId: string,
  handle: BackupDirectoryHandle,
): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    memoryHandles.set(userId, handle)
    return
  }
  const database = await openHandleDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(HANDLE_STORE, 'readwrite')
    transaction.objectStore(HANDLE_STORE).put(handle, userId)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Could not save backup folder.'))
  })
  database.close()
}

async function readHandle(
  userId: string,
): Promise<BackupDirectoryHandle | undefined> {
  if (typeof indexedDB === 'undefined') return memoryHandles.get(userId)
  const database = await openHandleDatabase()
  const handle = await new Promise<BackupDirectoryHandle | undefined>(
    (resolve, reject) => {
      const transaction = database.transaction(HANDLE_STORE, 'readonly')
      const request = transaction.objectStore(HANDLE_STORE).get(userId)
      request.onsuccess = () =>
        resolve(request.result as BackupDirectoryHandle | undefined)
      request.onerror = () =>
        reject(request.error ?? new Error('Could not read backup folder.'))
    },
  )
  database.close()
  return handle
}

async function deleteHandle(userId: string): Promise<void> {
  memoryHandles.delete(userId)
  if (typeof indexedDB === 'undefined') return
  const database = await openHandleDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(HANDLE_STORE, 'readwrite')
    transaction.objectStore(HANDLE_STORE).delete(userId)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Could not forget backup folder.'))
  })
  database.close()
}

export async function getAutoBackupDirectory(
  userId: string,
): Promise<BackupDirectoryHandle | undefined> {
  return readHandle(userId)
}

export async function chooseAutoBackupDirectory(
  userId: string,
): Promise<BackupDirectoryHandle> {
  const picker = getDirectoryPickerWindow()?.showDirectoryPicker
  if (!picker)
    throw new Error('Automatic folder backups are unavailable in this browser.')
  const handle = await picker()
  const permission = handle.requestPermission
    ? await handle.requestPermission({ mode: 'readwrite' })
    : 'granted'
  if (permission !== 'granted')
    throw new Error('Allow folder access to enable automatic backups.')
  await storeHandle(userId, handle)
  return handle
}

export async function forgetAutoBackupDirectory(userId: string): Promise<void> {
  await deleteHandle(userId)
}

export async function writeBackupToDirectory(
  handle: BackupDirectoryHandle,
  backup: KanjiForgeBackup,
): Promise<void> {
  const permission = handle.queryPermission
    ? await handle.queryPermission({ mode: 'readwrite' })
    : 'granted'
  if (permission !== 'granted')
    throw new Error(
      'Folder access is no longer available. Choose the folder again.',
    )
  const file = await handle.getFileHandle(AUTO_BACKUP_FILENAME, {
    create: true,
  })
  const writable = await file.createWritable()
  await writable.write(JSON.stringify(backup, null, 2))
  await writable.close()
}

export async function writeAutomaticBackup(
  userId: string,
  repositories: UserRepositories,
  now = Date.now(),
): Promise<boolean> {
  const handle = await readHandle(userId)
  if (!handle) return false
  const lastWritten = await repositories.settings.get(
    AUTO_BACKUP_LAST_WRITTEN_SETTING,
  )
  const lastWrittenAt = Number(lastWritten?.value)
  if (
    Number.isFinite(lastWrittenAt) &&
    now - lastWrittenAt < AUTO_BACKUP_INTERVAL_MS
  )
    return false
  const backup = await createBackup(repositories, userId, now)
  await writeBackupToDirectory(handle, backup)
  await Promise.all([
    repositories.settings.set({
      key: AUTO_BACKUP_LAST_WRITTEN_SETTING,
      value: String(now),
      updatedAt: now,
    }),
    repositories.settings.set({
      key: BACKUP_LAST_EXPORTED_SETTING,
      value: String(now),
      updatedAt: now,
    }),
  ])
  return true
}

/** Writes at most one backup per day whenever the authenticated app is foregrounded. */
export function AutoBackupController({ userId }: { userId: string }): null {
  useEffect(() => {
    const run = (): void => {
      const runtime = getActiveUserRuntime()
      if (!runtime || runtime.userId !== userId) return
      void runtime.database.ready
        .then(() =>
          writeAutomaticBackup(
            userId,
            createUserRepositories(runtime.database),
          ),
        )
        .catch(() => {
          // Automatic backups must never block or surface errors in study.
        })
    }
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') run()
    }
    run()
    window.addEventListener('focus', run)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('focus', run)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [userId])

  return null
}

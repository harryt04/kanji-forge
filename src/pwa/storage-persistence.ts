'use client'

import type { UserRepositories } from '@/data/repo'

export const STORAGE_PERSISTENCE_REQUESTED_SETTING =
  'pwa.storagePersistenceRequested'

export type StoragePersistenceStatus = 'granted' | 'denied' | 'unsupported'

interface StorageManagerWithPersistence {
  persist?(): Promise<boolean>
  persisted?(): Promise<boolean>
}

function getStorageManager(): StorageManagerWithPersistence | undefined {
  if (typeof navigator === 'undefined' || !navigator.storage) return undefined
  return navigator.storage as StorageManagerWithPersistence
}

export async function getStoragePersistenceStatus(): Promise<StoragePersistenceStatus> {
  const storage = getStorageManager()
  if (!storage?.persisted) return 'unsupported'

  try {
    return (await storage.persisted()) ? 'granted' : 'denied'
  } catch {
    return 'unsupported'
  }
}

export async function requestStoragePersistence(): Promise<StoragePersistenceStatus> {
  const storage = getStorageManager()
  if (!storage?.persist) return 'unsupported'

  try {
    return (await storage.persist()) ? 'granted' : 'denied'
  } catch {
    return 'denied'
  }
}

/** Requests eviction protection once, after a learner completes a non-empty session. */
export async function requestStoragePersistenceAfterSession(
  repositories: UserRepositories,
  now = Date.now(),
): Promise<StoragePersistenceStatus> {
  const requested = await repositories.settings.get(
    STORAGE_PERSISTENCE_REQUESTED_SETTING,
  )
  if (requested?.value === 'true') return getStoragePersistenceStatus()

  const status = await requestStoragePersistence()
  await repositories.settings.set({
    key: STORAGE_PERSISTENCE_REQUESTED_SETTING,
    value: 'true',
    updatedAt: now,
  })
  return status
}

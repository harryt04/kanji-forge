import { afterEach, describe, expect, it, vi } from 'vitest'
import { openLocalUserDatabase, type LocalUserDatabase } from './index'

interface FakeFileHandle {
  getFile(): Promise<{ size: number; arrayBuffer(): Promise<ArrayBuffer> }>
  createWritable(): Promise<{
    write(data: Uint8Array): Promise<void>
    close(): Promise<void>
  }>
}

function fakeOpfs(): { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>()
  const directoryHandle = {
    async getDirectoryHandle() {
      return directoryHandle
    },
    async getFileHandle(name: string): Promise<FakeFileHandle> {
      return {
        async getFile() {
          const data = files.get(name)
          return {
            size: data?.length ?? 0,
            async arrayBuffer() {
              const bytes = data ?? new Uint8Array()
              return bytes.buffer.slice(
                bytes.byteOffset,
                bytes.byteOffset + bytes.byteLength,
              ) as ArrayBuffer
            },
          }
        },
        async createWritable() {
          return {
            async write(data: Uint8Array) {
              files.set(name, data)
            },
            async close() {},
          }
        },
      }
    },
  }
  Object.defineProperty(globalThis.navigator, 'storage', {
    configurable: true,
    value: { getDirectory: async () => directoryHandle },
  })
  return { files }
}

const databases: LocalUserDatabase[] = []
afterEach(() => {
  for (const database of databases.splice(0)) database.close()
  // @ts-expect-error test-only cleanup of the fake OPFS shim
  delete globalThis.navigator.storage
  vi.restoreAllMocks()
})

describe('openLocalUserDatabase', () => {
  it('rejects an empty user id', () => {
    expect(() => openLocalUserDatabase('')).toThrow('authenticated user id')
    expect(() => openLocalUserDatabase('   ')).toThrow('authenticated user id')
  })

  it('namespaces the database name per user', async () => {
    const a = openLocalUserDatabase('alice')
    const b = openLocalUserDatabase('bob')
    databases.push(a, b)
    await Promise.all([a.ready, b.ready])
    expect(a.name).not.toBe(b.name)
    expect(a.name).toContain('alice')
    expect(b.name).toContain('bob')
  })

  it('serializes concurrent writes so none are lost', async () => {
    const database = openLocalUserDatabase('concurrent-writer')
    databases.push(database)
    await database.ready

    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        database.write(
          'INSERT INTO settings(user_id, key, value, updated_at) VALUES (?, ?, ?, ?)',
          [database.userId, `key-${index}`, String(index), index],
        ),
      ),
    )

    const rows = await database.read('SELECT key FROM settings ORDER BY key')
    expect(rows.map((row) => row.key)).toEqual([
      'key-0',
      'key-1',
      'key-2',
      'key-3',
      'key-4',
    ])
  })

  it('persists writes across close and reopen via OPFS', async () => {
    fakeOpfs()
    const first = openLocalUserDatabase('persisted-user')
    databases.push(first)
    await first.ready
    await first.write(
      'INSERT INTO settings(user_id, key, value, updated_at) VALUES (?, ?, ?, ?)',
      ['persisted-user', 'theme', 'dark', 1],
    )
    first.close()

    const second = openLocalUserDatabase('persisted-user')
    databases.push(second)
    await second.ready
    const rows = await second.read('SELECT value FROM settings WHERE key = ?', [
      'theme',
    ])
    expect(rows).toEqual([{ value: 'dark' }])
  })

  it('keeps each user namespace isolated even with OPFS enabled', async () => {
    fakeOpfs()
    const alice = openLocalUserDatabase('alice@example.test')
    const bob = openLocalUserDatabase('bob@example.test')
    databases.push(alice, bob)
    await Promise.all([alice.ready, bob.ready])
    await alice.write(
      'INSERT INTO settings(user_id, key, value, updated_at) VALUES (?, ?, ?, ?)',
      ['alice@example.test', 'k', 'alice-value', 1],
    )
    const bobRows = await bob.read('SELECT value FROM settings WHERE key = ?', [
      'k',
    ])
    expect(bobRows).toEqual([])
  })

  it('throws once closed', async () => {
    const database = openLocalUserDatabase('closer')
    await database.ready
    database.close()
    await expect(database.read('SELECT 1')).rejects.toThrow('closed')
  })
})

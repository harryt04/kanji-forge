import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'
import { migrateUserDatabase } from './migrations'

export type SqlValue = string | number | null | Uint8Array
export type SqlParameters = readonly SqlValue[]
export type SqlRow = Readonly<Record<string, SqlValue>>

export interface LocalUserDatabase {
  readonly userId: string
  readonly name: string
  /** Resolves after SQLite-WASM has loaded, restored its OPFS snapshot, and migrated. */
  readonly ready: Promise<void>
  read(sql: string, parameters?: SqlParameters): Promise<readonly SqlRow[]>
  write(sql: string, parameters?: SqlParameters): Promise<void>
  transaction(
    statements: readonly {
      readonly sql: string
      readonly parameters?: SqlParameters
    }[],
  ): Promise<void>
  close(): void
}

const DATABASE_PREFIX = 'kanjiforge-user:'
const OPFS_DIRECTORY = 'kanjiforge-user-databases'

interface OpfsFileHandle {
  getFile(): Promise<File>
  createWritable(): Promise<{
    write(data: Uint8Array): Promise<void>
    close(): Promise<void>
  }>
}

interface OpfsDirectoryHandle {
  getDirectoryHandle(
    name: string,
    options: { create: boolean },
  ): Promise<OpfsDirectoryHandle>
  getFileHandle(
    name: string,
    options: { create: boolean },
  ): Promise<OpfsFileHandle>
}

function hasOpfs(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    typeof navigator.storage.getDirectory === 'function'
  )
}

async function restoreFromOpfs(name: string): Promise<Uint8Array | undefined> {
  if (!hasOpfs()) return undefined
  try {
    const root =
      (await navigator.storage.getDirectory()) as unknown as OpfsDirectoryHandle
    const directory = await root.getDirectoryHandle(OPFS_DIRECTORY, {
      create: true,
    })
    const file = await directory.getFileHandle(`${name}.sqlite`, {
      create: true,
    })
    const contents = await file.getFile()
    return contents.size === 0
      ? undefined
      : new Uint8Array(await contents.arrayBuffer())
  } catch {
    // Storage may be denied (notably in private browsing). The session-local DB still works.
    return undefined
  }
}

async function persistToOpfs(name: string, bytes: Uint8Array): Promise<void> {
  if (!hasOpfs()) return
  try {
    const root =
      (await navigator.storage.getDirectory()) as unknown as OpfsDirectoryHandle
    const directory = await root.getDirectoryHandle(OPFS_DIRECTORY, {
      create: true,
    })
    const file = await directory.getFileHandle(`${name}.sqlite`, {
      create: true,
    })
    const writable = await file.createWritable()
    await writable.write(bytes)
    await writable.close()
  } catch {
    // Do not make a grade fail because the browser revoked durable-storage access.
  }
}

/** Opens a SQLite-WASM handle whose namespace is deterministic and private to one real user. */
export function openLocalUserDatabase(userId: string): LocalUserDatabase {
  if (!userId.trim())
    throw new Error(
      'An authenticated user id is required to open a local database.',
    )

  const name = `${DATABASE_PREFIX}${encodeURIComponent(userId)}`
  let database: SqlJsDatabase | undefined
  let closed = false
  let writeChain = Promise.resolve()
  const ready = (async (): Promise<void> => {
    const snapshot = await restoreFromOpfs(name)
    const SQL = await initSqlJs()
    database = new SQL.Database(snapshot)
    migrateUserDatabase(
      {
        run(sql, parameters) {
          database?.run(sql, parameters)
        },
        hasMigration(version) {
          const statement = database?.prepare(
            'SELECT 1 FROM schema_migrations WHERE version = ?',
            [version],
          )
          if (!statement) return false
          const exists = statement.step()
          statement.free()
          return exists
        },
        transaction(action) {
          database?.run('BEGIN')
          try {
            action()
            database?.run('COMMIT')
          } catch (error) {
            database?.run('ROLLBACK')
            throw error
          }
        },
      },
      Date.now(),
    )
    if (closed) {
      database.close()
      database = undefined
      return
    }
    await persistToOpfs(name, database.export())
  })()

  async function getDatabase(): Promise<SqlJsDatabase> {
    await ready
    if (closed || !database)
      throw new Error('The local user database is closed.')
    return database
  }

  async function persist(databaseToPersist: SqlJsDatabase): Promise<void> {
    await persistToOpfs(name, databaseToPersist.export())
  }

  return {
    userId,
    name,
    ready,
    async read(sql, parameters = []) {
      const active = await getDatabase()
      const statement = active.prepare(sql, parameters)
      const rows: SqlRow[] = []
      while (statement.step()) rows.push(statement.getAsObject() as SqlRow)
      statement.free()
      return rows
    },
    async write(sql, parameters = []) {
      writeChain = writeChain.then(async () => {
        const active = await getDatabase()
        active.run(sql, parameters)
        await persist(active)
      })
      return writeChain
    },
    async transaction(statements) {
      writeChain = writeChain.then(async () => {
        const active = await getDatabase()
        active.run('BEGIN')
        try {
          for (const statement of statements)
            active.run(statement.sql, statement.parameters ?? [])
          active.run('COMMIT')
        } catch (error) {
          active.run('ROLLBACK')
          throw error
        }
        await persist(active)
      })
      return writeChain
    },
    close() {
      closed = true
      database?.close()
      database = undefined
    },
  }
}

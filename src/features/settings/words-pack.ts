import initSqlJs from 'sql.js'
import { unzipSync } from 'fflate'

export interface WordsPackManifest {
  readonly id: 'words-full'
  readonly name: string
  readonly version: string
  readonly schemaVersion: number
  readonly license: string
  readonly attribution: string
  readonly entryCount?: number
}

export interface InstalledWordsPack {
  readonly manifest: WordsPackManifest
  readonly bytes: Uint8Array
}

const WORDS_PACK_DB = 'kanjiforge-content-packs-v1'
const WORDS_PACK_STORE = 'optional'
const WORDS_PACK_KEY = 'words-full'

const DEFAULT_WORDS_PACK_MANIFEST: WordsPackManifest = {
  id: 'words-full',
  name: 'Full JMdict dictionary',
  version: 'v1',
  schemaVersion: 1,
  license: 'CC BY-SA 4.0',
  attribution:
    'JMdict — © Electronic Dictionary Research and Development Group, Monash University. Used under CC BY-SA 4.0. Modified: converted to a SQLite database containing all JMdict English entries.',
}

let memoryPack: InstalledWordsPack | null = null
let databasePromise: Promise<IDBDatabase | null> | undefined

function nonEmptyText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function parseWordsPackManifest(value: unknown): WordsPackManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Words pack manifest must be an object.')
  const source = value as Record<string, unknown>
  const id = source.id === 'words-full' ? 'words-full' : null
  const name = nonEmptyText(source.name)
  const version = nonEmptyText(source.version)
  const license = nonEmptyText(source.license)
  const attribution = nonEmptyText(source.attribution)
  const schemaVersion = Number(source.schemaVersion ?? 1)
  const stats = source.stats
  const entryCount =
    stats && typeof stats === 'object' && 'entryCount' in stats
      ? Number(stats.entryCount)
      : undefined
  if (
    !id ||
    !name ||
    !version ||
    !license ||
    !attribution ||
    !Number.isInteger(schemaVersion) ||
    schemaVersion !== 1
  )
    throw new Error(
      'Words pack manifest requires words-full id, schema version 1, license, and attribution.',
    )
  const validEntryCount =
    typeof entryCount === 'number' &&
    Number.isInteger(entryCount) &&
    entryCount >= 0
      ? entryCount
      : undefined
  return {
    id,
    name,
    version,
    schemaVersion,
    license,
    attribution,
    ...(validEntryCount === undefined ? {} : { entryCount: validEntryCount }),
  }
}

async function validateWordsDatabase(bytes: Uint8Array): Promise<void> {
  if (bytes.byteLength === 0)
    throw new Error('Words pack SQLite file is empty.')
  let closeDatabase: (() => void) | undefined
  try {
    const SQL = await initSqlJs()
    const database = new SQL.Database(bytes)
    closeDatabase = () => database.close()
    const statement = database.prepare(
      "SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name IN ('entries', 'forms', 'glosses_fts')",
    )
    const tables = new Set<string>()
    while (statement.step()) tables.add(String(statement.getAsObject().name))
    statement.free()
    if (
      ![...['entries', 'forms', 'glosses_fts']].every((name) =>
        tables.has(name),
      )
    )
      throw new Error('Words pack SQLite schema is incomplete.')
  } catch (reason: unknown) {
    if (
      reason instanceof Error &&
      reason.message.includes('schema is incomplete')
    )
      throw reason
    throw new Error('Words pack must be a valid SQLite database.')
  } finally {
    closeDatabase?.()
  }
}

export async function parseWordsPackArchive(bytes: Uint8Array): Promise<{
  readonly manifest: WordsPackManifest
  readonly bytes: Uint8Array
}> {
  let archive: Record<string, Uint8Array>
  try {
    archive = unzipSync(bytes)
  } catch {
    throw new Error('Could not read the words pack ZIP archive.')
  }
  const database =
    archive['words-full-v1.sqlite'] ?? archive['words-full.sqlite']
  if (!database)
    throw new Error('Words pack ZIP is missing words-full-v1.sqlite.')
  const manifestBytes = archive['manifest.json']
  let manifest = DEFAULT_WORDS_PACK_MANIFEST
  if (manifestBytes) {
    try {
      manifest = parseWordsPackManifest(
        JSON.parse(new TextDecoder().decode(manifestBytes)),
      )
    } catch (reason: unknown) {
      throw reason instanceof Error
        ? reason
        : new Error('Words pack manifest.json is not valid.')
    }
  }
  await validateWordsDatabase(database)
  return { manifest, bytes: database }
}

export async function installWordsPack(
  bytes: Uint8Array,
): Promise<WordsPackManifest> {
  let parsed: {
    readonly manifest: WordsPackManifest
    readonly bytes: Uint8Array
  }
  try {
    parsed = await parseWordsPackArchive(bytes)
  } catch (reason: unknown) {
    if (!(reason instanceof Error) || !reason.message.includes('ZIP archive'))
      throw reason
    await validateWordsDatabase(bytes)
    parsed = { manifest: DEFAULT_WORDS_PACK_MANIFEST, bytes }
  }
  const pack = {
    manifest: parsed.manifest,
    bytes: new Uint8Array(parsed.bytes),
  }
  memoryPack = pack
  const database = await openDatabase()
  if (!database) return pack.manifest
  await new Promise<void>((resolve, reject) => {
    const request = database
      .transaction(WORDS_PACK_STORE, 'readwrite')
      .objectStore(WORDS_PACK_STORE)
      .put(pack, WORDS_PACK_KEY)
    request.onsuccess = () => resolve()
    request.onerror = () =>
      reject(request.error ?? new Error('Could not save words pack.'))
  })
  return pack.manifest
}

export async function getInstalledWordsPack(): Promise<InstalledWordsPack | null> {
  if (memoryPack) return memoryPack
  const database = await openDatabase()
  if (!database) return null
  return await new Promise<InstalledWordsPack | null>((resolve) => {
    const request = database
      .transaction(WORDS_PACK_STORE, 'readonly')
      .objectStore(WORDS_PACK_STORE)
      .get(WORDS_PACK_KEY)
    request.onsuccess = () => {
      const value = request.result as InstalledWordsPack | undefined
      if (value?.manifest && value.bytes) memoryPack = value
      resolve(memoryPack)
    }
    request.onerror = () => resolve(null)
  })
}

export async function getInstalledWordsPackBytes(): Promise<Uint8Array | null> {
  const pack = await getInstalledWordsPack()
  return pack ? new Uint8Array(pack.bytes) : null
}

export async function listInstalledWordsPack(): Promise<
  readonly WordsPackManifest[]
> {
  const pack = await getInstalledWordsPack()
  return pack ? [pack.manifest] : []
}

export async function removeWordsPack(): Promise<void> {
  memoryPack = null
  const database = await openDatabase()
  if (!database) return
  await new Promise<void>((resolve, reject) => {
    const request = database
      .transaction(WORDS_PACK_STORE, 'readwrite')
      .objectStore(WORDS_PACK_STORE)
      .delete(WORDS_PACK_KEY)
    request.onsuccess = () => resolve()
    request.onerror = () =>
      reject(request.error ?? new Error('Could not remove words pack.'))
  })
}

function openDatabase(): Promise<IDBDatabase | null> {
  databasePromise ??= new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    const request = indexedDB.open(WORDS_PACK_DB, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(WORDS_PACK_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
  })
  return databasePromise
}

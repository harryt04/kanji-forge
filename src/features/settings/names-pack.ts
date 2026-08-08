import initSqlJs from 'sql.js'
import { unzipSync } from 'fflate'

export interface NamesPackManifest {
  readonly id: 'names'
  readonly name: string
  readonly version: string
  readonly schemaVersion: number
  readonly license: string
  readonly attribution: string
  readonly entryCount?: number
}

export interface InstalledNamesPack {
  readonly manifest: NamesPackManifest
  readonly bytes: Uint8Array
}

const NAMES_PACK_DB = 'kanjiforge-content-packs-v1'
const NAMES_PACK_STORE = 'optional'
const NAMES_PACK_KEY = 'names'

const DEFAULT_NAMES_PACK_MANIFEST: NamesPackManifest = {
  id: 'names',
  name: 'JMnedict names',
  version: 'v1',
  schemaVersion: 1,
  license: 'CC BY-SA 4.0',
  attribution:
    'JMnedict — © Electronic Dictionary Research and Development Group, Monash University. Used under CC BY-SA 4.0. Modified: converted to a SQLite database with English name descriptions.',
}

let memoryPack: InstalledNamesPack | null = null
let databasePromise: Promise<IDBDatabase | null> | undefined

function nonEmptyText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function parseNamesPackManifest(value: unknown): NamesPackManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Names pack manifest must be an object.')
  const source = value as Record<string, unknown>
  const id = source.id === 'names' ? 'names' : null
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
      'Names pack manifest requires names id, schema version 1, license, and attribution.',
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

async function validateNamesDatabase(bytes: Uint8Array): Promise<void> {
  if (bytes.byteLength === 0)
    throw new Error('Names pack SQLite file is empty.')
  let closeDatabase: (() => void) | undefined
  try {
    const SQL = await initSqlJs()
    const database = new SQL.Database(bytes)
    closeDatabase = () => database.close()
    const statement = database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('entries', 'forms', 'glosses_fts')",
    )
    const tables = new Set<string>()
    while (statement.step()) tables.add(String(statement.getAsObject().name))
    statement.free()
    if (
      ![...['entries', 'forms', 'glosses_fts']].every((name) =>
        tables.has(name),
      )
    )
      throw new Error('Names pack SQLite schema is incomplete.')
  } catch (reason: unknown) {
    if (
      reason instanceof Error &&
      reason.message.includes('schema is incomplete')
    )
      throw reason
    throw new Error('Names pack must be a valid SQLite database.')
  } finally {
    closeDatabase?.()
  }
}

function openDatabase(): Promise<IDBDatabase | null> {
  databasePromise ??= new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    const request = indexedDB.open(NAMES_PACK_DB, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(NAMES_PACK_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
  })
  return databasePromise
}

async function writePack(pack: InstalledNamesPack): Promise<void> {
  memoryPack = pack
  const database = await openDatabase()
  if (!database) return
  await new Promise<void>((resolve, reject) => {
    const request = database
      .transaction(NAMES_PACK_STORE, 'readwrite')
      .objectStore(NAMES_PACK_STORE)
      .put(pack, NAMES_PACK_KEY)
    request.onsuccess = () => resolve()
    request.onerror = () =>
      reject(request.error ?? new Error('Could not save names pack.'))
  })
}

export interface ParsedNamesPack {
  readonly manifest: NamesPackManifest
  readonly bytes: Uint8Array
}

export async function parseNamesPackArchive(
  bytes: Uint8Array,
): Promise<ParsedNamesPack> {
  let archive: Record<string, Uint8Array>
  try {
    archive = unzipSync(bytes)
  } catch {
    throw new Error('Could not read the names pack ZIP archive.')
  }
  const database = archive['names-v1.sqlite'] ?? archive['names.sqlite']
  if (!database) throw new Error('Names pack ZIP is missing names-v1.sqlite.')
  const manifestBytes = archive['manifest.json']
  let manifest = DEFAULT_NAMES_PACK_MANIFEST
  if (manifestBytes) {
    try {
      manifest = parseNamesPackManifest(
        JSON.parse(new TextDecoder().decode(manifestBytes)),
      )
    } catch (reason: unknown) {
      throw reason instanceof Error
        ? reason
        : new Error('Names pack manifest.json is not valid.')
    }
  }
  await validateNamesDatabase(database)
  return { manifest, bytes: database }
}

export async function installNamesPack(
  bytes: Uint8Array,
): Promise<NamesPackManifest> {
  let parsed: ParsedNamesPack
  try {
    parsed = await parseNamesPackArchive(bytes)
  } catch (reason: unknown) {
    if (!(reason instanceof Error) || !reason.message.includes('ZIP archive'))
      throw reason
    await validateNamesDatabase(bytes)
    parsed = { manifest: DEFAULT_NAMES_PACK_MANIFEST, bytes }
  }
  await writePack({
    manifest: parsed.manifest,
    bytes: new Uint8Array(parsed.bytes),
  })
  return parsed.manifest
}

export async function getInstalledNamesPack(): Promise<InstalledNamesPack | null> {
  if (memoryPack) return memoryPack
  const database = await openDatabase()
  if (!database) return null
  return await new Promise<InstalledNamesPack | null>((resolve) => {
    const request = database
      .transaction(NAMES_PACK_STORE, 'readonly')
      .objectStore(NAMES_PACK_STORE)
      .get(NAMES_PACK_KEY)
    request.onsuccess = () => {
      const value = request.result as InstalledNamesPack | undefined
      if (value?.manifest && value.bytes) memoryPack = value
      resolve(memoryPack)
    }
    request.onerror = () => resolve(null)
  })
}

export async function getInstalledNamesPackBytes(): Promise<Uint8Array | null> {
  const pack = await getInstalledNamesPack()
  return pack ? new Uint8Array(pack.bytes) : null
}

export async function getInstalledNamesPackManifest(): Promise<NamesPackManifest | null> {
  return (await getInstalledNamesPack())?.manifest ?? null
}

export async function listInstalledNamesPack(): Promise<
  readonly NamesPackManifest[]
> {
  const pack = await getInstalledNamesPack()
  return pack ? [pack.manifest] : []
}

export async function removeNamesPack(): Promise<void> {
  memoryPack = null
  const database = await openDatabase()
  if (!database) return
  await new Promise<void>((resolve, reject) => {
    const request = database
      .transaction(NAMES_PACK_STORE, 'readwrite')
      .objectStore(NAMES_PACK_STORE)
      .delete(NAMES_PACK_KEY)
    request.onsuccess = () => resolve()
    request.onerror = () =>
      reject(request.error ?? new Error('Could not remove names pack.'))
  })
}

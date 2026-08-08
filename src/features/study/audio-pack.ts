import { unzipSync } from 'fflate'

export interface AudioPackManifest {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly license: string
  readonly attribution: string
  /** Keys are `writing|reading`; values are paths inside the ZIP archive. */
  readonly files: Readonly<Record<string, string>>
}

export interface InstalledAudioPack {
  readonly manifest: AudioPackManifest
  readonly files: Readonly<Record<string, Uint8Array>>
}

export interface InstalledAudioRecording {
  readonly manifest: AudioPackManifest
  readonly path: string
  readonly bytes: Uint8Array
}

const AUDIO_PACK_DB = 'kanjiforge-audio-packs-v1'
const AUDIO_PACK_STORE = 'packs'
const memoryPacks = new Map<string, InstalledAudioPack>()
let databasePromise: Promise<IDBDatabase | null> | undefined

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isSafeArchivePath(value: string): boolean {
  return value.length > 0 && !value.startsWith('/') && !value.includes('..')
}

function normalizeFiles(value: unknown): Readonly<Record<string, string>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const files: Record<string, string> = {}
  for (const [key, path] of Object.entries(value)) {
    if (
      !key.includes('|') ||
      typeof path !== 'string' ||
      !isSafeArchivePath(path)
    )
      continue
    const [writing, reading] = key.split('|')
    if (!writing || !reading || files[key]) continue
    files[key] = path
  }
  return files
}

export function parseAudioPackManifest(value: unknown): AudioPackManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Audio pack manifest must be an object.')
  const source = value as Record<string, unknown>
  const id = text(source.id)
  const name = text(source.name)
  const version = text(source.version)
  const license = text(source.license)
  const attribution = text(source.attribution)
  const files = normalizeFiles(source.files)
  if (!id || !/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(id))
    throw new Error(
      'Audio pack id must use lowercase letters, numbers, dots, underscores, or hyphens.',
    )
  if (!name || !version || !license || !attribution)
    throw new Error(
      'Audio pack manifest requires name, version, license, and attribution.',
    )
  if (Object.keys(files).length === 0)
    throw new Error(
      'Audio pack manifest must contain at least one writing|reading file.',
    )
  return { id, name, version, license, attribution, files }
}

/** Returns the browser media type implied by a community recording path. */
export function audioMimeTypeForPath(path: string): string {
  const withoutQuery = path.toLowerCase().split('?').at(0) ?? ''
  const extension = withoutQuery.split('.').at(-1) ?? ''
  switch (extension) {
    case 'aac':
      return 'audio/aac'
    case 'flac':
      return 'audio/flac'
    case 'm4a':
    case 'mp4':
      return 'audio/mp4'
    case 'mp3':
      return 'audio/mpeg'
    case 'oga':
    case 'ogg':
    case 'opus':
      return 'audio/ogg'
    case 'wav':
      return 'audio/wav'
    case 'weba':
    case 'webm':
      return 'audio/webm'
    default:
      return 'application/octet-stream'
  }
}

export function parseAudioPackArchive(bytes: Uint8Array): InstalledAudioPack {
  let archive: Record<string, Uint8Array>
  try {
    archive = unzipSync(bytes)
  } catch {
    throw new Error('Could not read the audio pack ZIP archive.')
  }
  const manifestBytes = archive['manifest.json']
  if (!manifestBytes) throw new Error('Audio pack is missing manifest.json.')
  let manifestValue: unknown
  try {
    manifestValue = JSON.parse(new TextDecoder().decode(manifestBytes))
  } catch {
    throw new Error('Audio pack manifest.json is not valid JSON.')
  }
  const manifest = parseAudioPackManifest(manifestValue)
  const files: Record<string, Uint8Array> = {}
  for (const [key, path] of Object.entries(manifest.files)) {
    const audio = archive[path]
    if (!audio) throw new Error(`Audio pack is missing ${path}.`)
    if (audio.byteLength === 0)
      throw new Error(`Audio pack file ${path} is empty.`)
    files[key] = audio
  }
  return { manifest, files }
}

function openDatabase(): Promise<IDBDatabase | null> {
  databasePromise ??= new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    const request = indexedDB.open(AUDIO_PACK_DB, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(AUDIO_PACK_STORE, {
        keyPath: 'manifest.id',
      })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
  })
  return databasePromise
}

async function writePack(pack: InstalledAudioPack): Promise<void> {
  memoryPacks.set(pack.manifest.id, pack)
  const database = await openDatabase()
  if (!database) return
  await new Promise<void>((resolve, reject) => {
    const request = database
      .transaction(AUDIO_PACK_STORE, 'readwrite')
      .objectStore(AUDIO_PACK_STORE)
      .put(pack)
    request.onsuccess = () => resolve()
    request.onerror = () =>
      reject(request.error ?? new Error('Could not save audio pack.'))
  })
}

export async function installAudioPack(
  bytes: Uint8Array,
): Promise<AudioPackManifest> {
  const pack = parseAudioPackArchive(bytes)
  await writePack(pack)
  return pack.manifest
}

export async function listAudioPacks(): Promise<readonly AudioPackManifest[]> {
  const database = await openDatabase()
  if (database) {
    await new Promise<void>((resolve) => {
      const request = database
        .transaction(AUDIO_PACK_STORE, 'readonly')
        .objectStore(AUDIO_PACK_STORE)
        .getAll()
      request.onsuccess = () => {
        for (const value of request.result as InstalledAudioPack[]) {
          memoryPacks.set(value.manifest.id, value)
        }
        resolve()
      }
      request.onerror = () => resolve()
    })
  }
  return [...memoryPacks.values()]
    .map((pack) => pack.manifest)
    .sort((left, right) => left.name.localeCompare(right.name))
}

export async function removeAudioPack(id: string): Promise<void> {
  memoryPacks.delete(id)
  const database = await openDatabase()
  if (!database) return
  await new Promise<void>((resolve, reject) => {
    const request = database
      .transaction(AUDIO_PACK_STORE, 'readwrite')
      .objectStore(AUDIO_PACK_STORE)
      .delete(id)
    request.onsuccess = () => resolve()
    request.onerror = () =>
      reject(request.error ?? new Error('Could not remove audio pack.'))
  })
}

export async function getAudioPackFile(
  writing: string,
  reading: string,
): Promise<Blob | null> {
  const recording = await getAudioPackRecording(writing, reading)
  if (recording) {
    const copy = new ArrayBuffer(recording.bytes.byteLength)
    new Uint8Array(copy).set(recording.bytes)
    return new Blob([copy], { type: audioMimeTypeForPath(recording.path) })
  }
  return null
}

/** Returns the exact offline recording for a writing and reading, if installed. */
export async function getAudioPackRecording(
  writing: string,
  reading: string,
): Promise<InstalledAudioRecording | null> {
  const key = `${writing}|${reading}`
  await listAudioPacks()
  for (const pack of memoryPacks.values()) {
    const bytes = pack.files[key]
    const path = pack.manifest.files[key]
    if (bytes && path) return { manifest: pack.manifest, path, bytes }
  }
  return null
}

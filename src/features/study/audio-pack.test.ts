import { zipSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getAudioPackFile,
  getAudioPackRecording,
  countAudioPackRecordings,
  fetchAudioPack,
  installAudioPack,
  listAudioPacks,
  parseAudioPackArchive,
  parseAudioPackManifest,
  audioMimeTypeForPath,
  removeAudioPack,
} from './audio-pack'

function archive(id = `test-pack-${crypto.randomUUID()}`): Uint8Array {
  const manifest = {
    id,
    name: 'Community voice',
    version: '1.0.0',
    license: 'CC BY 4.0',
    attribution: 'A Japanese speaker',
    files: { '日|ひ': 'audio/hi.mp3' },
  }
  return zipSync({
    'manifest.json': new TextEncoder().encode(JSON.stringify(manifest)),
    'audio/hi.mp3': new Uint8Array([1, 2, 3]),
  })
}

describe('community audio packs', () => {
  const installed: string[] = []

  afterEach(async () => {
    for (const id of installed.splice(0)) await removeAudioPack(id)
    vi.unstubAllGlobals()
  })

  it('validates the licensed manifest and rejects unsafe or empty entries', () => {
    expect(() => parseAudioPackManifest({})).toThrow(/Audio pack id/)
    expect(() =>
      parseAudioPackManifest({
        id: 'bad',
        name: 'Bad',
        version: '1',
        license: 'CC',
        attribution: 'Someone',
        files: { '日|ひ': '../voice.mp3' },
      }),
    ).toThrow(/at least one/)
  })

  it('maps common community recording formats to browser media types', () => {
    expect(audioMimeTypeForPath('voice.mp3')).toBe('audio/mpeg')
    expect(audioMimeTypeForPath('voice.OGG')).toBe('audio/ogg')
    expect(audioMimeTypeForPath('voice.wav')).toBe('audio/wav')
    expect(audioMimeTypeForPath('voice.m4a')).toBe('audio/mp4')
    expect(audioMimeTypeForPath('voice.webm')).toBe('audio/webm')
    expect(audioMimeTypeForPath('voice.bin')).toBe('application/octet-stream')
  })

  it('extracts recordings from a ZIP and fails when a declared file is absent', () => {
    const pack = parseAudioPackArchive(archive())
    expect(pack.manifest.name).toBe('Community voice')
    expect(countAudioPackRecordings(pack.manifest)).toBe(1)
    expect(pack.files['日|ひ']).toEqual(new Uint8Array([1, 2, 3]))

    const missing = zipSync({
      'manifest.json': new TextEncoder().encode(
        JSON.stringify({
          id: 'missing',
          name: 'Missing',
          version: '1',
          license: 'CC',
          attribution: 'Someone',
          files: { '日|ひ': 'voice.mp3' },
        }),
      ),
    })
    expect(() => parseAudioPackArchive(missing)).toThrow(/missing voice.mp3/)
  })

  it('installs, resolves, lists, and removes a recording offline', async () => {
    const id = `installed-${crypto.randomUUID()}`
    installed.push(id)
    const manifest = await installAudioPack(archive(id))
    expect(manifest.id).toBe(id)
    expect((await listAudioPacks()).some((pack) => pack.id === id)).toBe(true)
    const file = await getAudioPackFile('日', 'ひ')
    expect(file).not.toBeNull()
    expect(file?.type).toBe('audio/mpeg')
    await expect(getAudioPackRecording('日', 'ひ')).resolves.toMatchObject({
      manifest: { id },
      bytes: new Uint8Array([1, 2, 3]),
    })
    expect((await getAudioPackRecording('日', 'ひ'))?.path).toBe('audio/hi.mp3')
    await expect(getAudioPackRecording('お金', 'おかね')).resolves.toBeNull()
    await removeAudioPack(id)
    expect((await listAudioPacks()).some((pack) => pack.id === id)).toBe(false)
    installed.splice(installed.indexOf(id), 1)
    expect(await getAudioPackFile('日', 'ひ')).toBeNull()
  })

  it('downloads and installs a pack from an HTTP(S) URL without credentials', async () => {
    const id = `remote-${crypto.randomUUID()}`
    installed.push(id)
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.credentials).toBe('omit')
        return new Response(archive(id), { status: 200 })
      },
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchAudioPack('https://cdn.example.test/voice.zip'),
    ).resolves.toMatchObject({ id })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://cdn.example.test/voice.zip',
      { credentials: 'omit' },
    )
  })

  it('rejects non-HTTP URLs before making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchAudioPack('data:application/zip;base64,abc'),
    ).rejects.toThrow(/HTTP\(S\)/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('preserves a non-MP3 recording type for browser playback', async () => {
    const id = `ogg-pack-${crypto.randomUUID()}`
    installed.push(id)
    const manifest = {
      id,
      name: 'Ogg voice',
      version: '1.0.0',
      license: 'CC BY 4.0',
      attribution: 'A Japanese speaker',
      files: { '日|ひ': 'audio/hi.ogg' },
    }
    await installAudioPack(
      zipSync({
        'manifest.json': new TextEncoder().encode(JSON.stringify(manifest)),
        'audio/hi.ogg': new Uint8Array([1, 2, 3]),
      }),
    )

    await expect(getAudioPackFile('日', 'ひ')).resolves.toMatchObject({
      type: 'audio/ogg',
    })
  })
})

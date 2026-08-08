import { zipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import {
  getAudioPackFile,
  getAudioPackRecording,
  installAudioPack,
  listAudioPacks,
  parseAudioPackArchive,
  parseAudioPackManifest,
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

  it('extracts recordings from a ZIP and fails when a declared file is absent', () => {
    const pack = parseAudioPackArchive(archive())
    expect(pack.manifest.name).toBe('Community voice')
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
    await expect(getAudioPackRecording('お金', 'おかね')).resolves.toBeNull()
    await removeAudioPack(id)
    expect((await listAudioPacks()).some((pack) => pack.id === id)).toBe(false)
    installed.splice(installed.indexOf(id), 1)
    expect(await getAudioPackFile('日', 'ひ')).toBeNull()
  })
})

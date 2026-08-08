import { zipSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installAudioPack, removeAudioPack } from './audio-pack'
import {
  findInstalledJapaneseAudioReading,
  hasInstalledJapaneseAudioFor,
  speakJapanese,
  supportsJapaneseSpeech,
  supportsStudyCardAudio,
} from './audio'

function archive(id: string): Uint8Array {
  const manifest = {
    id,
    name: 'Alternate reading voice',
    version: '1.0.0',
    license: 'CC BY 4.0',
    attribution: 'A Japanese speaker',
    files: { '生|しょう': 'audio/shou.mp3' },
  }
  return zipSync({
    'manifest.json': new TextEncoder().encode(JSON.stringify(manifest)),
    'audio/shou.mp3': new Uint8Array([1, 2, 3]),
  })
}

const installed: string[] = []

afterEach(async () => {
  for (const id of installed.splice(0)) await removeAudioPack(id)
  vi.unstubAllGlobals()
})

describe('study audio', () => {
  it('only enables study audio for dictionary-word cards', () => {
    expect(supportsStudyCardAudio('word')).toBe(true)
    expect(supportsStudyCardAudio('kanji')).toBe(false)
    expect(supportsStudyCardAudio(undefined)).toBe(false)
  })

  it('reports unsupported browsers without throwing', () => {
    expect(supportsJapaneseSpeech()).toBe(false)
    expect(speakJapanese('日')).toBe(false)
  })

  it('only reports an installed recording when the writing and reading match', async () => {
    expect(await hasInstalledJapaneseAudioFor('日', 'ひ')).toBe(false)
  })

  it('finds an installed recording on an alternate valid reading', async () => {
    const id = `alternate-${crypto.randomUUID()}`
    installed.push(id)
    await installAudioPack(archive(id))

    await expect(
      findInstalledJapaneseAudioReading('生', ['なま', 'しょう']),
    ).resolves.toBe('しょう')
  })

  it('speaks Japanese with a labeled, slower device voice', () => {
    const speak = vi.fn()
    const cancel = vi.fn()
    class FakeUtterance {
      lang = ''
      rate = 1
      constructor(readonly text: string) {}
    }
    vi.stubGlobal('speechSynthesis', { speak, cancel })
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)

    expect(supportsJapaneseSpeech()).toBe(true)
    expect(speakJapanese('ひ')).toBe(true)
    expect(cancel).toHaveBeenCalledOnce()
    expect(speak).toHaveBeenCalledOnce()
    expect(speak.mock.calls[0]?.[0]).toMatchObject({
      text: 'ひ',
      lang: 'ja-JP',
      rate: 0.85,
    })
  })
})

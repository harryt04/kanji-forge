import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  speakJapanese,
  supportsJapaneseSpeech,
  supportsStudyCardAudio,
} from './audio'

afterEach(() => {
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

import { getAudioPackFile, getAudioPackRecording } from './audio-pack'

export const STUDY_AUTO_PLAY_AUDIO_SETTING = 'study.autoPlayAudio'

/** StickyStudy's audio preference applies to word cards, not kanji-only decks. */
export function supportsStudyCardAudio(
  contentType: 'kanji' | 'word' | undefined,
): boolean {
  return contentType === 'word'
}

/** Returns whether this browser exposes a usable speech-synthesis runtime. */
export function supportsJapaneseSpeech(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis?.speak === 'function' &&
    typeof window.SpeechSynthesisUtterance === 'function'
  )
}

/** Returns whether the installed packs contain this exact word pronunciation. */
export async function hasInstalledJapaneseAudioFor(
  writing: string,
  reading: string,
): Promise<boolean> {
  try {
    return (await getAudioPackRecording(writing, reading)) !== null
  } catch {
    return false
  }
}

/** Speaks Japanese text using the device voice, if the browser supports it. */
export function speakJapanese(text: string): boolean {
  if (!text || !supportsJapaneseSpeech()) return false
  const utterance = new window.SpeechSynthesisUtterance(text)
  utterance.lang = 'ja-JP'
  utterance.rate = 0.85
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
  return true
}

/** Plays an installed community recording, falling back to device speech synthesis. */
export async function playJapaneseAudio(
  writing: string,
  reading: string,
): Promise<'pack' | 'synthesized' | 'unsupported'> {
  const packFile = await getAudioPackFile(writing, reading)
  if (
    packFile &&
    typeof window !== 'undefined' &&
    typeof Audio === 'function'
  ) {
    const url = URL.createObjectURL(packFile)
    const audio = new Audio(url)
    audio.addEventListener('ended', () => URL.revokeObjectURL(url), {
      once: true,
    })
    audio.addEventListener('error', () => URL.revokeObjectURL(url), {
      once: true,
    })
    try {
      await audio.play()
      return 'pack'
    } catch {
      URL.revokeObjectURL(url)
    }
  }
  return speakJapanese(reading) ? 'synthesized' : 'unsupported'
}

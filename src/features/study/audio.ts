import {
  getAudioPackFile,
  getAudioPackRecording,
  type InstalledAudioRecording,
} from './audio-pack'
import { getActiveUserRuntime } from '@/auth/runtime'
import { createUserRepositories } from '@/data/repo'

export const STUDY_AUTO_PLAY_AUDIO_SETTING = 'study.autoPlayAudio'
export const AUDIO_PACK_PREFERENCE_SETTING = 'study.audioPack'
export const AUDIO_PACK_PREFERENCE_AUTO = 'auto'

/** Reads the user's preferred recording pack, falling back to any match. */
export async function getPreferredAudioPackId(): Promise<string | undefined> {
  const runtime = getActiveUserRuntime()
  if (!runtime) return undefined
  try {
    await runtime.database.ready
    const saved = await createUserRepositories(runtime.database).settings.get(
      AUDIO_PACK_PREFERENCE_SETTING,
    )
    if (!saved?.value || saved.value === AUDIO_PACK_PREFERENCE_AUTO)
      return undefined
    return saved.value
  } catch {
    return undefined
  }
}

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
    return (
      (await getAudioPackRecording(
        writing,
        reading,
        await getPreferredAudioPackId(),
      )) !== null
    )
  } catch {
    return false
  }
}

/** Returns the first installed exact recording across a word's valid readings. */
export async function findInstalledJapaneseAudioReading(
  writing: string,
  readings: readonly string[],
): Promise<string | null> {
  const match = await findInstalledJapaneseAudioMatch(writing, readings)
  return match?.reading ?? null
}

/** Returns the first installed recording and its pack metadata across valid readings. */
export async function findInstalledJapaneseAudioMatch(
  writing: string,
  readings: readonly string[],
): Promise<{
  readonly reading: string
  readonly recording: InstalledAudioRecording
} | null> {
  const candidates = [...new Set([...readings, writing].filter(Boolean))]
  const preferredPackId = await getPreferredAudioPackId()
  for (const reading of candidates) {
    const recording = await getAudioPackRecording(
      writing,
      reading,
      preferredPackId,
    )
    if (recording) return { reading, recording }
  }
  return null
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
  const packFile = await getAudioPackFile(
    writing,
    reading,
    await getPreferredAudioPackId(),
  )
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

/** Plays the first installed exact recording across a word's valid readings. */
export async function playJapaneseAudioForReadings(
  writing: string,
  readings: readonly string[],
): Promise<'pack' | 'synthesized' | 'unsupported'> {
  const fallback = readings.find(Boolean) ?? writing
  const reading =
    (await findInstalledJapaneseAudioReading(writing, readings)) ?? fallback
  return playJapaneseAudio(writing, reading)
}

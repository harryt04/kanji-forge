export const STUDY_AUTO_PLAY_AUDIO_SETTING = 'study.autoPlayAudio'

/** Returns whether this browser exposes a usable speech-synthesis runtime. */
export function supportsJapaneseSpeech(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis?.speak === 'function' &&
    typeof window.SpeechSynthesisUtterance === 'function'
  )
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

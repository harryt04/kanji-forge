export const ANALYZER_HISTORY_SETTING = 'analyzer-history'
export const MAX_ANALYZER_HISTORY = 10

function cleanText(text: string): string {
  return text.trim().normalize('NFC')
}

/** Parses stored analyzer history while removing blanks, duplicates, and excess entries. */
export function parseAnalyzerHistory(
  value: string | undefined,
): readonly string[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    const history: string[] = []
    for (const item of parsed) {
      if (typeof item !== 'string') continue
      const text = cleanText(item)
      if (!text || seen.has(text)) continue
      seen.add(text)
      history.push(text)
      if (history.length >= MAX_ANALYZER_HISTORY) break
    }
    return history
  } catch {
    return []
  }
}

export function serializeAnalyzerHistory(history: readonly string[]): string {
  return JSON.stringify(parseAnalyzerHistory(JSON.stringify(history)))
}

/** Adds a successful analysis to the front of the bounded local history. */
export function recordAnalyzerText(
  history: readonly string[],
  text: string,
): readonly string[] {
  const nextText = cleanText(text)
  if (!nextText) return parseAnalyzerHistory(JSON.stringify(history))
  return parseAnalyzerHistory(
    JSON.stringify([
      nextText,
      ...history.filter((candidate) => cleanText(candidate) !== nextText),
    ]),
  )
}

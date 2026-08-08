/**
 * Parses the intentionally small v2 import surface: one kanji per line, or
 * KanjiForge's tab-separated text export. A line containing several kanji is
 * treated as a compact kanji list, which makes textbook lists convenient to
 * paste without a column-mapping step.
 */
export function parseKanjiImportText(input: string): readonly string[] {
  const values = input
    .split(/\r?\n/u)
    .map((line) => line.trim().split('\t', 1)[0]?.trim() ?? '')
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .flatMap((line) => [...line])

  return [...new Set(values.filter(isKanjiLiteral))]
}

export function isKanjiLiteral(value: string): boolean {
  if ([...value].length !== 1) return false
  const codePoint = value.codePointAt(0)
  return (
    codePoint !== undefined &&
    ((codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
      (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0x20000 && codePoint <= 0x2fa1f))
  )
}

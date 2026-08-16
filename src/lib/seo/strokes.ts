// Server-only, build-time reader for packs/strokes/*.json (KanjiVG stroke
// paths). Chunk-selection logic mirrors `strokeChunkFor` in
// `src/data/packs/index.ts` exactly — keep the two in sync if the pack's
// chunking ever changes.
import { readFileSync } from 'node:fs'
import path from 'node:path'

interface StrokeChunkRecord {
  readonly paths?: readonly string[]
}

function strokeChunkFor(literal: string): string | null {
  if ([...literal].length !== 1) return null
  const codePoint = literal.codePointAt(0)
  if (codePoint === undefined) return null
  if (codePoint >= 0x4e00 && codePoint <= 0x4fff) return '4E00-4FFF'
  if (codePoint >= 0x5000 && codePoint <= 0x5fff) return '5000-5FFF'
  if (codePoint >= 0x6000 && codePoint <= 0x6fff) return '6000-6FFF'
  if (codePoint >= 0x7000 && codePoint <= 0x7fff) return '7000-7FFF'
  if (codePoint >= 0x8000 && codePoint <= 0x9fff) return '8000-9FFF'
  if (codePoint > 0x20000 && codePoint <= 0x2ffff) return 'CJK_Extended'
  return null
}

const chunkCache = new Map<string, Record<string, StrokeChunkRecord>>()

function loadChunk(chunk: string): Record<string, StrokeChunkRecord> {
  let records = chunkCache.get(chunk)
  if (!records) {
    const filePath = path.join(
      process.cwd(),
      'packs',
      'strokes',
      `strokes-${chunk}.json`,
    )
    records = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<
      string,
      StrokeChunkRecord
    >
    chunkCache.set(chunk, records)
  }
  return records
}

/** KanjiVG stroke outline paths for a single kanji, in stroke order. Null if
 * the pack has no entry (rare CJK Extension kanji). */
export function getKanjiStrokes(literal: string): readonly string[] | null {
  const chunk = strokeChunkFor(literal)
  if (!chunk) return null
  const codePoint = literal.codePointAt(0)
  if (codePoint === undefined) return null
  const key = codePoint.toString(16).padStart(5, '0').toLowerCase()
  const paths = loadChunk(chunk)[key]?.paths
  return paths && paths.length > 0 ? paths : null
}

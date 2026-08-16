// Server-only, build-time reader for packs/similar.json (look-alike kanji).
// Mirrors the shape used by the client-side `getSimilarKanji` in
// `src/data/packs/index.ts`.
import { readFileSync } from 'node:fs'
import path from 'node:path'

let cache: Readonly<Record<string, readonly string[]>> | undefined

function load(): Readonly<Record<string, readonly string[]>> {
  if (!cache) {
    const filePath = path.join(process.cwd(), 'packs', 'similar.json')
    const body = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<
      string,
      unknown
    >
    const result: Record<string, readonly string[]> = {}
    for (const [literal, candidates] of Object.entries(body)) {
      if (!Array.isArray(candidates)) continue
      result[literal] = candidates.filter(
        (candidate): candidate is string => typeof candidate === 'string',
      )
    }
    cache = result
  }
  return cache
}

export function getSimilarKanji(literal: string): readonly string[] {
  return load()[literal] ?? []
}

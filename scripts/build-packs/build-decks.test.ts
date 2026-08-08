import * as fs from 'fs'
import * as path from 'path'
import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'

const root = process.cwd()
const deckDir = path.join(root, 'packs/decks')
const decks = fs
  .readdirSync(deckDir)
  .filter(
    (file) =>
      file.endsWith('.json') &&
      file !== 'manifest.json' &&
      file !== 'jlpt-coverage.json',
  )
  .map(
    (file) =>
      JSON.parse(fs.readFileSync(path.join(deckDir, file), 'utf8')) as {
        id: string
        description: string
        contentRefs: string[]
      },
  )
const manifest = JSON.parse(
  fs.readFileSync(path.join(deckDir, 'manifest.json'), 'utf8'),
) as {
  version: string
  schemaVersion: number
  license: string
  attribution: string
  catalogSha256: string
  catalogSizeBytes: number
  decks: Array<{ file: string; sha256: string; sizeBytes: number }>
  coverageReport: { file: string; sha256: string; sizeBytes: number }
  backingPacks: Record<
    string,
    {
      sha256: string
      sizeBytes: number
      version: string
      schemaVersion: number
    }
  >
  jlptSources: Record<
    string,
    { pinned: string; sha256: string; licenseHash: string }
  >
  kankenSource: {
    source: string
    pinned: string
    license: string
  }
}
const coverage = JSON.parse(
  fs.readFileSync(path.join(deckDir, 'jlpt-coverage.json'), 'utf8'),
) as {
  deferredReason: string
  sources: Record<
    string,
    Record<
      string,
      {
        sourceCount: number
        resolvedCount: number
        deferredUnresolvedCount: number
        deferredUnresolvedLiterals: string[]
      }
    >
  >
  kanken: Record<
    string,
    {
      sourceCount: number
      resolvedCount: number
      deferredUnresolvedCount: number
      deferredUnresolvedLiterals: string[]
    }
  >
}
describe('generated deck definitions', () => {
  it('ships the complete catalog with resolved references', () => {
    expect(decks).toHaveLength(37)
    const kdb = new Database(path.join(root, 'packs/kanji-v1.sqlite'), {
      readonly: true,
    })
    const wdb = new Database(path.join(root, 'packs/words-core-v1.sqlite'), {
      readonly: true,
    })
    try {
      for (const deck of decks)
        for (const ref of deck.contentRefs) {
          const [kind, id] = ref.split(':')
          const row =
            kind === 'kanji'
              ? kdb.prepare('SELECT 1 FROM kanji WHERE literal = ?').get(id)
              : wdb
                  .prepare('SELECT 1 FROM entries WHERE id = ?')
                  .get(Number(id))
          expect(row, `${deck.id}: ${ref}`).toBeTruthy()
        }
    } finally {
      kdb.close()
      wdb.close()
    }
  })
  it('preserves mandatory Jōyō counts, tiers, and JLPT caveat', () => {
    expect(
      decks.find((deck) => deck.id === 'joyo-2010')?.contentRefs,
    ).toHaveLength(2136)
    expect(
      decks.find((deck) => deck.id === 'joyo-1981')?.contentRefs,
    ).toHaveLength(1945)
    expect(
      [7, 8, 9].map(
        (grade) =>
          decks.find((deck) => deck.id === `school-grade-${grade}`)!.contentRefs
            .length,
      ),
    ).toEqual([370, 370, 370])
    for (const deck of decks.filter((deck) => deck.id.startsWith('jlpt-')))
      expect(deck.description).toContain('community estimate - not official')
  })
  it('ships every Kanji Kentei level with attributable coverage', () => {
    const ids = [
      '10',
      '9',
      '8',
      '7',
      '6',
      '5',
      '4',
      '3',
      'pre-2',
      '2',
      'pre-1',
      '1',
    ]
    for (const id of ids) {
      const deck = decks.find((candidate) => candidate.id === `kanken-${id}`)
      expect(deck?.contentRefs.length, id).toBeGreaterThan(0)
      expect(deck?.description).toContain('日本漢字能力検定級別漢字表')
    }
    expect(coverage.kanken['pre-1']).toMatchObject({
      sourceCount: 1036,
      resolvedCount: 1034,
      deferredUnresolvedCount: 2,
    })
  })
  it('records a complete, attributable catalog and validated input provenance', () => {
    expect(manifest).toMatchObject({
      version: 'v1',
      schemaVersion: 1,
      license: 'CC BY-SA 4.0',
    })
    expect(manifest.attribution).toContain('CC BY-SA 4.0')
    expect(manifest.catalogSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(manifest.catalogSizeBytes).toBeGreaterThan(0)
    expect(manifest.coverageReport).toMatchObject({
      file: 'jlpt-coverage.json',
    })
    expect(manifest.coverageReport.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(manifest.coverageReport.sizeBytes).toBeGreaterThan(0)
    expect(manifest.decks).toHaveLength(37)
    expect(Object.keys(manifest.backingPacks).sort()).toEqual([
      'kanji',
      'wordsCore',
    ])
    for (const pack of Object.values(manifest.backingPacks)) {
      expect(pack).toMatchObject({ version: 'v1', schemaVersion: 1 })
      expect(pack.sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(pack.sizeBytes).toBeGreaterThan(0)
    }
    expect(manifest.jlptSources.kanji.pinned).toMatch(/^[a-f0-9]{40}$/)
    expect(manifest.jlptSources.vocabulary.pinned).toBe('2025.08.01.0')
    expect(manifest.kankenSource).toMatchObject({
      source: 'kanji npm package',
      pinned: '0.9.1',
      license: 'CC BY 4.0',
    })
    for (const source of Object.values(manifest.jlptSources)) {
      expect(source.sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(source.licenseHash).toMatch(/^[a-f0-9]{64}$/)
    }
  })
  it('defers only unresolved pinned JLPT vocabulary entries until a full/JLPT word pack exists', () => {
    expect(coverage.deferredReason).toContain('later full/JLPT word pack')
    expect(coverage.sources['jlpt-kanji-data']).toEqual(
      expect.objectContaining({
        N5: expect.objectContaining({ deferredUnresolvedCount: 0 }),
        N4: expect.objectContaining({ deferredUnresolvedCount: 0 }),
        N3: expect.objectContaining({ deferredUnresolvedCount: 0 }),
        N2: expect.objectContaining({ deferredUnresolvedCount: 0 }),
        N1: expect.objectContaining({ deferredUnresolvedCount: 0 }),
      }),
    )
    expect(
      Object.fromEntries(
        Object.entries(coverage.sources['jlpt-vocab-yomitan']).map(
          ([level, report]) => [level, report.deferredUnresolvedCount],
        ),
      ),
    ).toEqual({ N5: 7, N4: 6, N3: 12, N2: 53, N1: 173 })
    for (const report of Object.values(coverage.sources['jlpt-vocab-yomitan']))
      expect(report.sourceCount - report.resolvedCount).toBe(
        report.deferredUnresolvedLiterals.length,
      )
  })
  it('orders Jōyō 2010 by grade then frequency', () => {
    const db = new Database(path.join(root, 'packs/kanji-v1.sqlite'), {
      readonly: true,
    })
    try {
      const rows = decks
        .find((deck) => deck.id === 'joyo-2010')!
        .contentRefs.map(
          (ref) =>
            db
              .prepare('SELECT grade, freq FROM kanji WHERE literal = ?')
              .get(ref.slice(6)) as { grade: number; freq: number | null },
        )
      for (let index = 1; index < rows.length; index++) {
        const previous = rows[index - 1]
        const current = rows[index]
        expect(current.grade).toBeGreaterThanOrEqual(previous.grade)
        if (current.grade === previous.grade)
          expect(
            current.freq ?? Number.MAX_SAFE_INTEGER,
          ).toBeGreaterThanOrEqual(previous.freq ?? Number.MAX_SAFE_INTEGER)
      }
    } finally {
      db.close()
    }
  })
})

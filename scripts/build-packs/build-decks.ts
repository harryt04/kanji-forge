#!/usr/bin/env node
/** Generate deterministic JSON deck definitions from verified, pinned input packs. */
import * as crypto from 'crypto'
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import Database from 'better-sqlite3'

const root = process.cwd()
const cache = path.join(root, 'scripts/build-packs/.cache')
const lockPath = path.join(root, 'scripts/build-packs/sources.lock.json')
const kanjiPath = path.join(root, 'packs/kanji-v1.sqlite')
const wordsPath = path.join(root, 'packs/words-core-v1.sqlite')
const outDir = path.join(root, 'packs/decks')
const coverageReportFile = 'jlpt-coverage.json'
const diffPath = path.join(
  root,
  'scripts/build-packs/data/joyo-1981-2010-diff.json',
)
const exclusionsPath = path.join(
  root,
  'scripts/build-packs/data/jlpt-reviewed-exclusions.json',
)
const levels = ['N5', 'N4', 'N3', 'N2', 'N1'] as const
type Level = (typeof levels)[number]
const kankenLevels = [
  { id: '10', label: '10', file: 'kanken.lv10.json' },
  { id: '9', label: '9', file: 'kanken.lv09.json' },
  { id: '8', label: '8', file: 'kanken.lv08.json' },
  { id: '7', label: '7', file: 'kanken.lv07.json' },
  { id: '6', label: '6', file: 'kanken.lv06.json' },
  { id: '5', label: '5', file: 'kanken.lv05.json' },
  { id: '4', label: '4', file: 'kanken.lv04.json' },
  { id: '3', label: '3', file: 'kanken.lv03.json' },
  { id: 'pre-2', label: 'Pre-2', file: 'kanken.lv02pre.json' },
  { id: '2', label: '2', file: 'kanken.lv02.json' },
  { id: 'pre-1', label: 'Pre-1', file: 'kanken.lv01pre.json' },
  { id: '1', label: '1', file: 'kanken.lv01.json' },
] as const
const kankenDataDir = path.join(root, 'node_modules/kanji/data')
/** Shelf taxonomy. Array order is the order the app renders category sections. */
const deckCategories = [
  'jlpt',
  'joyo',
  'school',
  'kanken',
  'frequency',
  'kana',
] as const
type DeckCategory = (typeof deckCategories)[number]
/**
 * Content types whose backing pack ships to production. Word decks resolve against
 * words-core-v1.sqlite (27 MB), which is not committed, so they are built and hashed
 * but withheld from catalog.json until that pack has a delivery path. Adding 'word'
 * here is the only change needed to ship them.
 */
const shippedContentTypes = new Set<Deck['contentType']>(['kanji'])
const catalogFile = 'catalog.json'
type Deck = {
  id: string
  schemaVersion: 1
  name: string
  description: string
  contentType: 'kanji' | 'word'
  category: DeckCategory
  sortOrder: number
  contentRefs: string[]
  provenance: Record<string, unknown>
}
type Kanji = { literal: string; grade: number | null; freq: number | null }
type Source = {
  id: string
  name: string
  url: string
  pinned: string
  license: string
  licenseHash: string
  sha256: string
  sizeBytes: number
  provenance: string
}
type Exclusion = {
  source: 'jlpt-kanji-data' | 'jlpt-vocab-yomitan'
  level: Level
  entry: string
  reason: string
  reviewedBy: string
  reviewedAt: string
}
type CoverageLevel = {
  sourceCount: number
  resolvedCount: number
  deferredUnresolvedCount: number
  deferredUnresolvedLiterals: string[]
  deferredReason?: string
}
type CoverageReport = {
  id: 'jlpt-coverage'
  schemaVersion: 1
  deferredReason: string
  sources: Record<
    'jlpt-kanji-data' | 'jlpt-vocab-yomitan',
    Record<Level, CoverageLevel>
  >
  kanken: Record<string, CoverageLevel>
}
const deferredVocabularyReason =
  'Entries require a later full/JLPT word pack; they are not represented by the bundled words-core pack.'

function fail(message: string): never {
  throw new Error(`Deck build failed: ${message}`)
}
function sha256(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}
function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    fail(`malformed JSON at ${file}: ${String(error)}`)
  }
}
/** Keep generated JSON byte-stable with the repository's Prettier formatting. */
function serializeJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(
    /(\n[ \t]*"[^"\n]+": )\[\n\s+((?:"(?:\\.|[^"])*"(?:,\n\s*)?)+)\n\s*\]/g,
    (match, prefix: string, values: string) => {
      const compact = values.replace(/,\n\s*/g, ', ')
      const lineLengthBeforeArray = prefix.length - 1
      return lineLengthBeforeArray + compact.length + 2 <= 80
        ? `${prefix}[${compact}]`
        : match
    },
  )
}
function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function isHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

function requireSource(
  lock: Record<string, any>,
  id: 'jlpt-kanji-data' | 'jlpt-vocab-yomitan',
  ext: '.tar.gz' | '.zip',
): { source: Source; archive: string } {
  const source = lock.sources?.[id]
  for (const field of [
    'id',
    'name',
    'url',
    'pinned',
    'license',
    'licenseHash',
    'sha256',
    'sizeBytes',
    'provenance',
  ])
    if (source?.[field] === undefined || source[field] === '')
      fail(`sources.lock.json ${id} is missing ${field}`)
  if (
    source.id !== id ||
    !isHash(source.sha256) ||
    !isHash(source.licenseHash) ||
    !Number.isSafeInteger(source.sizeBytes) ||
    source.sizeBytes <= 0
  )
    fail(`sources.lock.json ${id} has invalid integrity metadata`)
  if (
    id === 'jlpt-kanji-data' &&
    (!/^https:\/\/api\.github\.com\/repos\/davidluzgouveia\/kanji-data\/tarball\/[a-f0-9]{40}$/.test(
      source.url,
    ) ||
      !/^[a-f0-9]{40}$/.test(source.pinned) ||
      !source.url.endsWith(source.pinned))
  )
    fail(
      'JLPT kanji source must be the approved davidluzgouveia/kanji-data commit tarball',
    )
  if (
    id === 'jlpt-vocab-yomitan' &&
    (!/^https:\/\/github\.com\/stephenmk\/yomitan-jlpt-vocab\/releases\/download\/[^/]+\/jlpt\.zip$/.test(
      source.url,
    ) ||
      !/^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(source.pinned) ||
      !source.url.includes(`/download/${source.pinned}/`))
  )
    fail(
      'JLPT vocabulary source must be the approved stephenmk/yomitan-jlpt-vocab release',
    )
  const archive = path.join(cache, `${id}-${source.pinned}${ext}`)
  if (!fs.existsSync(archive))
    fail(
      `pinned ${id} source missing: ${archive}. Run fetch-sources before build:decks.`,
    )
  if (
    fs.statSync(archive).size !== source.sizeBytes ||
    sha256(archive) !== source.sha256
  )
    fail(`pinned ${id} archive size/checksum does not match sources.lock.json`)
  const licenseFile = path.join(cache, `${id}-license.txt`)
  if (!fs.existsSync(licenseFile) || sha256(licenseFile) !== source.licenseHash)
    fail(
      `pinned ${id} license text is missing or does not match sources.lock.json`,
    )
  return { source, archive }
}

function validatePack(
  manifestFile: string,
  databaseFile: string,
  expected: { id: string; tables: Record<string, string[]> },
) {
  const manifest = readJson(manifestFile)
  if (
    !isRecord(manifest) ||
    manifest.id !== expected.id ||
    manifest.version !== 'v1' ||
    manifest.schemaVersion !== 1 ||
    !isHash(manifest.sha256) ||
    !Number.isSafeInteger(manifest.sizeBytes) ||
    manifest.sizeBytes <= 0 ||
    manifest.license !== 'CC BY-SA 4.0' ||
    typeof manifest.attribution !== 'string' ||
    !Array.isArray(manifest.sources)
  )
    fail(`${path.basename(manifestFile)} is incompatible with deck builder`)
  if (!fs.existsSync(databaseFile))
    fail(`required content pack missing: ${databaseFile}`)
  if (
    fs.statSync(databaseFile).size !== manifest.sizeBytes ||
    sha256(databaseFile) !== manifest.sha256
  )
    fail(
      `${path.basename(databaseFile)} size/checksum does not match ${path.basename(manifestFile)}`,
    )
  const db = new Database(databaseFile, { readonly: true })
  try {
    for (const [table, columns] of Object.entries(expected.tables)) {
      const actual = new Set(
        (
          db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
            name: string
          }>
        ).map((row) => row.name),
      )
      if (!columns.every((column) => actual.has(column)))
        fail(
          `${path.basename(databaseFile)} schema lacks ${table}(${columns.join(', ')})`,
        )
    }
  } finally {
    db.close()
  }
  return manifest as Record<string, any>
}

function archiveText(
  archive: string,
  member: string,
  format: 'tar' | 'zip',
): string {
  try {
    return execFileSync(
      format === 'tar' ? 'tar' : 'unzip',
      format === 'tar' ? ['-xOzf', archive, member] : ['-p', archive, member],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    )
  } catch {
    fail(
      `cannot read ${member} from ${archive}; source format is malformed or changed`,
    )
  }
}
function archiveMembers(archive: string, format: 'tar' | 'zip'): string[] {
  try {
    return execFileSync(
      format === 'tar' ? 'tar' : 'unzip',
      format === 'tar' ? ['-tzf', archive] : ['-Z1', archive],
      { encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .filter(Boolean)
  } catch {
    fail(`cannot enumerate ${archive}; source format is malformed`)
  }
}
/** A deck before the shelf taxonomy is applied; see classify(). */
type DraftDeck = Omit<Deck, 'category' | 'sortOrder'>
function deck(
  id: string,
  name: string,
  description: string,
  contentType: Deck['contentType'],
  refs: string[],
  provenance: Record<string, unknown>,
): DraftDeck {
  if (!refs.length) fail(`${id} has no resolved content references`)
  if (new Set(refs).size !== refs.length)
    fail(`${id} contains duplicate content references`)
  return {
    id,
    schemaVersion: 1,
    name,
    description,
    contentType,
    contentRefs: refs,
    provenance,
  }
}
/**
 * Maps a deck id onto its shelf category and its position inside that category.
 * Keeping the taxonomy in one table — rather than threading two more arguments through
 * every deck() call — means an unclassified deck fails the build instead of appearing
 * unsorted in the app.
 */
function classify(id: string): { category: DeckCategory; sortOrder: number } {
  const jlptRank = (level: string) => levels.indexOf(level.toUpperCase() as Level)
  const jlptKanji = /^jlpt-kanji-(n[1-5])$/.exec(id)
  if (jlptKanji) return { category: 'jlpt', sortOrder: jlptRank(jlptKanji[1]) + 1 }
  const jlptVocabulary = /^jlpt-vocabulary-(n[1-5])$/.exec(id)
  if (jlptVocabulary)
    return { category: 'jlpt', sortOrder: jlptRank(jlptVocabulary[1]) + 11 }
  if (id === 'joyo-2010') return { category: 'joyo', sortOrder: 1 }
  if (id === 'joyo-1981') return { category: 'joyo', sortOrder: 2 }
  const school = /^school-grade-([1-9])$/.exec(id)
  if (school) return { category: 'school', sortOrder: Number(school[1]) }
  const kanken = /^kanken-(.+)$/.exec(id)
  if (kanken) {
    const index = kankenLevels.findIndex((level) => level.id === kanken[1])
    if (index >= 0) return { category: 'kanken', sortOrder: index + 1 }
  }
  if (id === 'top-500-kanji') return { category: 'frequency', sortOrder: 1 }
  const kana = ['hiragana', 'katakana', 'kana-words'].indexOf(id)
  if (kana >= 0) return { category: 'kana', sortOrder: kana + 1 }
  return fail(`deck ${id} has no shelf category; add one to classify()`)
}
function withTaxonomy(drafts: DraftDeck[]): Deck[] {
  const seen = new Set<string>()
  return drafts.map((draft) => {
    const { category, sortOrder } = classify(draft.id)
    const key = `${category} ${sortOrder}`
    if (seen.has(key))
      fail(`duplicate shelf position ${category}#${sortOrder} at deck ${draft.id}`)
    seen.add(key)
    return {
      id: draft.id,
      schemaVersion: draft.schemaVersion,
      name: draft.name,
      description: draft.description,
      contentType: draft.contentType,
      category,
      sortOrder,
      contentRefs: draft.contentRefs,
      provenance: draft.provenance,
    }
  })
}
function sortedKanji(rows: Kanji[]): Kanji[] {
  return [...rows].sort(
    (a, b) =>
      (a.freq ?? Number.MAX_SAFE_INTEGER) -
        (b.freq ?? Number.MAX_SAFE_INTEGER) ||
      a.literal.localeCompare(b.literal, 'ja'),
  )
}
function sortedJoyo(rows: Kanji[]): Kanji[] {
  return [...rows].sort(
    (a, b) =>
      a.grade! - b.grade! ||
      (a.freq ?? Number.MAX_SAFE_INTEGER) -
        (b.freq ?? Number.MAX_SAFE_INTEGER) ||
      a.literal.localeCompare(b.literal, 'ja'),
  )
}
function kankenMembers(file: string): string[] {
  const value = readJson(path.join(kankenDataDir, file))
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some(
      (literal) => typeof literal !== 'string' || [...literal].length !== 1,
    )
  )
    fail(`Kanji Kentei source ${file} is not a non-empty one-character array`)
  return [...new Set(value as string[])]
}
function exclusionKey(source: string, level: string, entry: string) {
  return `${source}\u0000${level}\u0000${entry}`
}
function reviewedExclusions(): Map<string, Exclusion> {
  const data = readJson(exclusionsPath)
  if (
    !isRecord(data) ||
    data.schemaVersion !== 1 ||
    !Array.isArray(data.exclusions)
  )
    fail(
      'JLPT exclusions must be a schemaVersion 1 document with an exclusions array',
    )
  const result = new Map<string, Exclusion>()
  for (const entry of data.exclusions) {
    if (
      !isRecord(entry) ||
      !['jlpt-kanji-data', 'jlpt-vocab-yomitan'].includes(entry.source) ||
      !levels.includes(entry.level) ||
      typeof entry.entry !== 'string' ||
      !entry.entry ||
      typeof entry.reason !== 'string' ||
      !entry.reason ||
      typeof entry.reviewedBy !== 'string' ||
      !entry.reviewedBy ||
      typeof entry.reviewedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedAt)
    )
      fail(
        'each JLPT exclusion requires source, level, entry, reason, reviewedBy, and reviewedAt',
      )
    const key = exclusionKey(entry.source, entry.level, entry.entry)
    if (result.has(key))
      fail(
        `duplicate reviewed JLPT exclusion: ${entry.source}/${entry.level}/${entry.entry}`,
      )
    result.set(key, entry as Exclusion)
  }
  return result
}
function requireCoverage(
  source: 'jlpt-kanji-data' | 'jlpt-vocab-yomitan',
  membership: Map<Level, Set<string>>,
  resolved: Map<Level, Set<string>>,
  exclusions: Map<string, Exclusion>,
  deferUnresolved = false,
): Record<Level, CoverageLevel> {
  const missing: string[] = []
  const used = new Set<string>()
  const report = {} as Record<Level, CoverageLevel>
  for (const level of levels)
    for (const entry of membership.get(level)!) {
      if (!resolved.get(level)!.has(entry)) {
        const key = exclusionKey(source, level, entry)
        if (exclusions.has(key)) used.add(key)
        else missing.push(`${level}:${entry}`)
      }
    }
  const unused = [...exclusions.keys()].filter(
    (key) => key.startsWith(`${source}\u0000`) && !used.has(key),
  )
  for (const level of levels) {
    const deferredUnresolvedLiterals = [...membership.get(level)!]
      .filter(
        (entry) =>
          !resolved.get(level)!.has(entry) &&
          !exclusions.has(exclusionKey(source, level, entry)),
      )
      .sort((a, b) => a.localeCompare(b, 'ja'))
    report[level] = {
      sourceCount: membership.get(level)!.size,
      resolvedCount: resolved.get(level)!.size,
      deferredUnresolvedCount: deferredUnresolvedLiterals.length,
      deferredUnresolvedLiterals,
      ...(deferredUnresolvedLiterals.length
        ? { deferredReason: deferredVocabularyReason }
        : {}),
    }
  }
  console.log(
    `JLPT coverage ${source}: ${levels.map((level) => `${level} ${resolved.get(level)!.size}/${membership.get(level)!.size}`).join(', ')}; reviewed exclusions ${used.size}; deferred ${missing.length}`,
  )
  if (unused.length)
    fail(
      `reviewed JLPT exclusions no longer needed for ${source}: ${unused.join(', ')}`,
    )
  if (missing.length && !deferUnresolved)
    fail(
      `unresolved JLPT ${source} entries (${missing.length}): ${missing.slice(0, 25).join(', ')}${missing.length > 25 ? ` … (+${missing.length - 25} more)` : ''}.`,
    )
  return report
}

function main() {
  const lock = readJson(lockPath) as Record<string, any>
  const kanjiInput = requireSource(lock, 'jlpt-kanji-data', '.tar.gz')
  const vocabInput = requireSource(lock, 'jlpt-vocab-yomitan', '.zip')
  const kanjiManifest = validatePack(
    path.join(root, 'packs/kanji-v1.manifest.json'),
    kanjiPath,
    { id: 'kanji', tables: { kanji: ['literal', 'grade', 'freq'] } },
  )
  const wordsManifest = validatePack(
    path.join(root, 'packs/words-core-v1.manifest.json'),
    wordsPath,
    {
      id: 'words-core',
      tables: { entries: ['id'], forms: ['entry_id', 'form'] },
    },
  )
  const exclusions = reviewedExclusions()
  const kdb = new Database(kanjiPath, { readonly: true })
  const wdb = new Database(wordsPath, { readonly: true })
  try {
    const kanji = kdb
      .prepare('SELECT literal, grade, freq FROM kanji')
      .all() as Kanji[]
    if (kanji.length < 2136)
      fail('kanji pack is malformed: fewer than 2,136 records')
    const kanjiSet = new Set(kanji.map((row) => row.literal))
    const kanjiByLiteral = new Map(kanji.map((row) => [row.literal, row]))
    const wordByForm = new Map<string, number>()
    for (const row of wdb
      .prepare('SELECT form, MIN(entry_id) AS id FROM forms GROUP BY form')
      .all() as Array<{ form: string; id: number }>)
      wordByForm.set(row.form, row.id)
    if (!wordByForm.size)
      fail('words-core pack is malformed: forms table is empty')

    const members = archiveMembers(kanjiInput.archive, 'tar')
    const kanjiMember = members.find((member) => member.endsWith('/kanji.json'))
    if (!kanjiMember) fail('JLPT kanji archive does not contain kanji.json')
    const jlptKanji = readJsonFromText(
      archiveText(kanjiInput.archive, kanjiMember, 'tar'),
      'JLPT kanji.json',
    )
    if (!isRecord(jlptKanji)) fail('JLPT kanji.json is not an object')
    const kanjiMembership = new Map<Level, Set<string>>()
    const kanjiResolved = new Map<Level, Set<string>>()
    const jlptKanjiRefs = new Map<Level, string[]>()
    for (const level of levels) {
      kanjiMembership.set(level, new Set())
      kanjiResolved.set(level, new Set())
      jlptKanjiRefs.set(level, [])
    }
    for (const [literal, data] of Object.entries(jlptKanji)) {
      if (
        !isRecord(data) ||
        (data.jlpt_new !== null &&
          data.jlpt_new !== undefined &&
          (!Number.isInteger(data.jlpt_new) ||
            !levels.includes(`N${data.jlpt_new}` as Level)))
      )
        fail(`JLPT kanji.json has invalid jlpt_new for ${literal}`)
      const level = data.jlpt_new ? (`N${data.jlpt_new}` as Level) : undefined
      if (level) {
        kanjiMembership.get(level)!.add(literal)
        if (kanjiSet.has(literal)) {
          kanjiResolved.get(level)!.add(literal)
          jlptKanjiRefs.get(level)!.push(`kanji:${literal}`)
        }
      }
    }
    const kanjiCoverage = requireCoverage(
      'jlpt-kanji-data',
      kanjiMembership,
      kanjiResolved,
      exclusions,
    )
    for (const [level, refs] of jlptKanjiRefs)
      refs.sort((a, b) => compareKanjiRefs(a, b, kanji))

    const vocabMembers = archiveMembers(vocabInput.archive, 'zip')
      .filter((member) => /^term_meta_bank_\d+\.json$/.test(member))
      .sort()
    if (!vocabMembers.length)
      fail('JLPT vocabulary archive has no term_meta_bank_N.json files')
    const wordMembership = new Map<Level, Set<string>>()
    const wordResolved = new Map<Level, Set<string>>()
    const jlptWordRefs = new Map<Level, Set<string>>()
    for (const level of levels) {
      wordMembership.set(level, new Set())
      wordResolved.set(level, new Set())
      jlptWordRefs.set(level, new Set())
    }
    for (const member of vocabMembers) {
      const rows = readJsonFromText(
        archiveText(vocabInput.archive, member, 'zip'),
        member,
      )
      if (!Array.isArray(rows)) fail(`${member} is not an array`)
      for (const row of rows) {
        if (
          !Array.isArray(row) ||
          typeof row[0] !== 'string' ||
          row[1] !== 'freq' ||
          !isRecord(row[2])
        )
          fail(`${member} contains an invalid Yomitan metadata record`)
        const level =
          row[2].frequency && isRecord(row[2].frequency)
            ? row[2].frequency.displayValue
            : undefined
        if (!levels.includes(level as Level)) continue
        wordMembership.get(level as Level)!.add(row[0])
        const id =
          wordByForm.get(row[0]) ??
          (typeof row[2].reading === 'string'
            ? wordByForm.get(row[2].reading)
            : undefined)
        if (id) {
          wordResolved.get(level as Level)!.add(row[0])
          jlptWordRefs.get(level as Level)!.add(`word:${id}`)
        }
      }
    }
    const vocabularyCoverage = requireCoverage(
      'jlpt-vocab-yomitan',
      wordMembership,
      wordResolved,
      exclusions,
      true,
    )

    const diff = readJson(diffPath) as {
      added?: unknown
      removed?: unknown
      citation?: unknown
    }
    if (
      !Array.isArray(diff.added) ||
      !Array.isArray(diff.removed) ||
      diff.added.length !== 196 ||
      diff.removed.length !== 5 ||
      !diff.citation
    )
      fail(
        'Jōyō diff must contain a citation, exactly 196 added, and exactly 5 removed characters',
      )
    const added = new Set(diff.added as string[])
    const removed = new Set(diff.removed as string[])
    for (const literal of [...added, ...removed])
      if (typeof literal !== 'string' || !kanjiSet.has(literal))
        fail(
          `Jōyō diff character ${String(literal)} is absent from the kanji pack`,
        )
    const joyo2010 = sortedJoyo(
      kanji.filter(
        (row) => row.grade !== null && row.grade >= 1 && row.grade <= 8,
      ),
    )
    if (joyo2010.length !== 2136)
      fail(`Jōyō 2010 must contain 2,136 entries; got ${joyo2010.length}`)
    const joyo1981 = joyo2010
      .filter((row) => !added.has(row.literal))
      .concat(kanji.filter((row) => removed.has(row.literal)))
    if (joyo1981.length !== 1945)
      fail(`Jōyō 1981 must contain 1,945 entries; got ${joyo1981.length}`)

    const provenance = (source: string) => ({
      license: 'CC BY-SA 4.0',
      source,
      generatedFrom: ['kanji-v1.sqlite', 'words-core-v1.sqlite'],
    })
    const kankenProvenance = {
      license: 'CC BY 4.0',
      source: 'kanji npm package',
      pinned: '0.9.1',
      url: 'https://github.com/echamudi/kanji',
      generatedFrom: ['日本漢字能力検定級別漢字表'],
    }
    const kankenCoverage: Record<string, CoverageLevel> = {}
    const decks: DraftDeck[] = []
    for (const level of levels) {
      decks.push(
        deck(
          `jlpt-kanji-${level.toLowerCase()}`,
          `JLPT Kanji ${level}`,
          `JLPT ${level} kanji — community estimate - not official. Source: ${kanjiInput.source.name}, pinned ${kanjiInput.source.pinned}; ${kanjiInput.source.provenance}.`,
          'kanji',
          jlptKanjiRefs.get(level)!,
          provenance('jlpt-kanji-data'),
        ),
      )
      decks.push(
        deck(
          `jlpt-vocabulary-${level.toLowerCase()}`,
          `JLPT Vocabulary ${level}`,
          `JLPT ${level} vocabulary — community estimate - not official. Source: ${vocabInput.source.name}, pinned ${vocabInput.source.pinned}; ${vocabInput.source.provenance}.`,
          'word',
          [...jlptWordRefs.get(level)!].sort(
            (a, b) => Number(a.slice(5)) - Number(b.slice(5)),
          ),
          provenance('jlpt-vocab-yomitan'),
        ),
      )
    }
    for (let grade = 1; grade <= 6; grade++)
      decks.push(
        deck(
          `school-grade-${grade}`,
          `School Grade ${grade}`,
          `KANJIDIC2 grade ${grade}, ordered by frequency.`,
          'kanji',
          sortedKanji(kanji.filter((row) => row.grade === grade)).map(
            (row) => `kanji:${row.literal}`,
          ),
          provenance('kanjidic2'),
        ),
      )
    for (const level of kankenLevels) {
      const members = kankenMembers(level.file)
      const missing = members.filter((literal) => !kanjiSet.has(literal))
      const resolved = members.filter((literal) => kanjiSet.has(literal))
      kankenCoverage[level.id] = {
        sourceCount: members.length,
        resolvedCount: resolved.length,
        deferredUnresolvedCount: missing.length,
        deferredUnresolvedLiterals: missing,
        ...(missing.length
          ? {
              deferredReason:
                'The KANJIDIC2 pack does not contain every rare character in the source level list.',
            }
          : {}),
      }
      decks.push(
        deck(
          `kanken-${level.id}`,
          `Kanji Kentei ${level.label}`,
          `Kanji Kentei ${level.label} level, ordered by KANJIDIC2 frequency. The level list is derived from the official 日本漢字能力検定級別漢字表 via the pinned kanji package.${missing.length ? ` ${missing.length} rare source character${missing.length === 1 ? '' : 's'} are unavailable in KANJIDIC2 and are recorded in the catalog coverage report.` : ''}`,
          'kanji',
          sortedKanji(
            resolved.flatMap((literal) => {
              const row = kanjiByLiteral.get(literal)
              return row ? [row] : []
            }),
          ).map((row) => `kanji:${row.literal}`),
          kankenProvenance,
        ),
      )
    }
    const secondary = sortedKanji(kanji.filter((row) => row.grade === 8))
    const tierSize = secondary.length / 3
    if (!Number.isInteger(tierSize))
      fail(
        'secondary-school kanji cannot be split into exactly three equal frequency tiers',
      )
    for (let tier = 0; tier < 3; tier++)
      decks.push(
        deck(
          `school-grade-${tier + 7}`,
          `School Grade ${tier + 7}`,
          `Secondary-school Jōyō kanji: frequency tier ${tier + 1} of 3 (KANJIDIC2 grade 8).`,
          'kanji',
          secondary
            .slice(tier * tierSize, (tier + 1) * tierSize)
            .map((row) => `kanji:${row.literal}`),
          provenance('kanjidic2'),
        ),
      )
    decks.push(
      deck(
        'joyo-1981',
        'Jōyō Kanji (1981)',
        'The 1981 Jōyō list reconstructed from the 2010 KANJIDIC2 list using the reviewed 196-added/5-removed revision diff.',
        'kanji',
        sortedKanji(joyo1981).map((row) => `kanji:${row.literal}`),
        {
          ...provenance('kanjidic2'),
          diffFile: 'scripts/build-packs/data/joyo-1981-2010-diff.json',
          citation: diff.citation,
        },
      ),
    )
    decks.push(
      deck(
        'joyo-2010',
        'Jōyō Kanji (2010)',
        'The 2,136-character 2010 Jōyō list from KANJIDIC2 grades 1–8, ordered by school grade then frequency.',
        'kanji',
        joyo2010.map((row) => `kanji:${row.literal}`),
        provenance('kanjidic2'),
      ),
    )
    decks.push(
      deck(
        'top-500-kanji',
        'Top 500 Kanji by Frequency',
        'KANJIDIC2 frequency ranks 1–500, in frequency order.',
        'kanji',
        sortedKanji(
          kanji.filter(
            (row) => row.freq !== null && row.freq >= 1 && row.freq <= 500,
          ),
        ).map((row) => `kanji:${row.literal}`),
        provenance('kanjidic2'),
      ),
    )
    decks.push(...kanaDecks(wordByForm, provenance))
    const classified = withTaxonomy(decks)
    validateRefs(classified, kanjiSet, new Set([...wordByForm.values()]))
    const coverageReport: CoverageReport = {
      id: 'jlpt-coverage',
      schemaVersion: 1,
      deferredReason: deferredVocabularyReason,
      sources: {
        'jlpt-kanji-data': kanjiCoverage,
        'jlpt-vocab-yomitan': vocabularyCoverage,
      },
      kanken: kankenCoverage,
    }
    const shipped = writeCatalogAtomically(
      classified,
      { kanji: kanjiManifest, words: wordsManifest },
      { kanji: kanjiInput.source, vocab: vocabInput.source },
      coverageReport,
      kankenProvenance,
    )
    console.log(
      `✓ Generated ${classified.length} deterministic deck definitions and manifest in packs/decks`,
    )
    console.log(
      `✓ Shipped catalog: ${shipped} deck${shipped === 1 ? '' : 's'} in packs/decks/${catalogFile}`,
    )
    console.log(
      `✓ Jōyō 2010: ${joyo2010.length}; Jōyō 1981: ${joyo1981.length}; secondary tiers: ${tierSize}/${tierSize}/${tierSize}`,
    )
  } finally {
    kdb.close()
    wdb.close()
  }
}
function writeCatalogAtomically(
  decks: Deck[],
  packs: Record<string, any>,
  sources: { kanji: Source; vocab: Source },
  coverageReport: CoverageReport,
  kankenProvenance: Record<string, unknown>,
): number {
  const stage = path.join(path.dirname(outDir), `.decks-staging-${process.pid}`)
  const backup = path.join(path.dirname(outDir), `.decks-backup-${process.pid}`)
  fs.rmSync(stage, { recursive: true, force: true })
  fs.mkdirSync(stage, { recursive: true })
  try {
    const files = decks
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((definition) => {
        const file = `${definition.id}.json`
        const bytes = Buffer.from(serializeJson(definition) + '\n')
        fs.writeFileSync(path.join(stage, file), bytes)
        return {
          file,
          sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
          sizeBytes: bytes.length,
        }
      })
    const coverageBytes = Buffer.from(serializeJson(coverageReport) + '\n')
    fs.writeFileSync(path.join(stage, coverageReportFile), coverageBytes)
    const coverage = {
      file: coverageReportFile,
      sha256: crypto.createHash('sha256').update(coverageBytes).digest('hex'),
      sizeBytes: coverageBytes.length,
    }
    // The single file the app fetches at runtime: every deck whose backing pack ships,
    // in shelf order. The per-deck JSON files above stay as the auditable catalog.
    const shippedDecks = decks.filter((definition) =>
      shippedContentTypes.has(definition.contentType),
    )
    if (!shippedDecks.length) fail('shipped catalog would be empty')
    const shippedBytes = Buffer.from(
      serializeJson({
        id: 'decks',
        schemaVersion: 1,
        license: 'CC BY-SA 4.0',
        attribution:
          'Deck definitions generated by KanjiForge from KANJIDIC2/JMdict backing packs, the pinned community JLPT sources, and the pinned Kanji Kentei level lists. Deck definitions are licensed CC BY-SA 4.0.',
        categories: deckCategories,
        decks: [...shippedDecks].sort(
          (a, b) =>
            deckCategories.indexOf(a.category) -
              deckCategories.indexOf(b.category) ||
            a.sortOrder - b.sortOrder,
        ),
      }) + '\n',
    )
    fs.writeFileSync(path.join(stage, catalogFile), shippedBytes)
    const shippedCatalog = {
      file: catalogFile,
      sha256: crypto.createHash('sha256').update(shippedBytes).digest('hex'),
      sizeBytes: shippedBytes.length,
      deckCount: shippedDecks.length,
    }
    const catalogBytes = Buffer.concat(
      [...files, coverage, shippedCatalog].map((file) =>
        Buffer.from(`${file.file}\n${file.sha256}\n${file.sizeBytes}\n`),
      ),
    )
    const sourceProvenance = (source: Source) => ({
      id: source.id,
      name: source.name,
      url: source.url,
      pinned: source.pinned,
      sha256: source.sha256,
      sizeBytes: source.sizeBytes,
      license: source.license,
      licenseHash: source.licenseHash,
      provenance: source.provenance,
    })
    const backingPack = (pack: Record<string, any>) => ({
      id: pack.id,
      version: pack.version,
      schemaVersion: pack.schemaVersion,
      sha256: pack.sha256,
      sizeBytes: pack.sizeBytes,
      license: pack.license,
      attribution: pack.attribution,
    })
    const manifest = {
      id: 'decks',
      version: 'v1',
      schemaVersion: 1,
      license: 'CC BY-SA 4.0',
      attribution:
        'Deck definitions generated by KanjiForge from KANJIDIC2/JMdict backing packs, the pinned community JLPT sources, and the pinned Kanji Kentei level lists. Deck definitions are licensed CC BY-SA 4.0.',
      catalogSha256: crypto
        .createHash('sha256')
        .update(catalogBytes)
        .digest('hex'),
      catalogSizeBytes: catalogBytes.length,
      decks: files,
      coverageReport: coverage,
      shippedCatalog,
      backingPacks: {
        kanji: backingPack(packs.kanji),
        wordsCore: backingPack(packs.words),
      },
      jlptSources: {
        kanji: sourceProvenance(sources.kanji),
        vocabulary: sourceProvenance(sources.vocab),
      },
      kankenSource: kankenProvenance,
    }
    fs.writeFileSync(
      path.join(stage, 'manifest.json'),
      serializeJson(manifest) + '\n',
    )
    fs.rmSync(backup, { recursive: true, force: true })
    if (fs.existsSync(outDir)) fs.renameSync(outDir, backup)
    fs.renameSync(stage, outDir)
    fs.rmSync(backup, { recursive: true, force: true })
    return shippedCatalog.deckCount
  } catch (error) {
    if (!fs.existsSync(outDir) && fs.existsSync(backup))
      fs.renameSync(backup, outDir)
    fs.rmSync(stage, { recursive: true, force: true })
    throw error
  }
}
function readJsonFromText(text: string, label: string): any {
  try {
    return JSON.parse(text)
  } catch {
    fail(`${label} is malformed JSON`)
  }
}
function compareKanjiRefs(a: string, b: string, rows: Kanji[]): number {
  const map = new Map(rows.map((row) => [row.literal, row]))
  const x = map.get(a.slice(6))!
  const y = map.get(b.slice(6))!
  return (
    (x.freq ?? Number.MAX_SAFE_INTEGER) - (y.freq ?? Number.MAX_SAFE_INTEGER) ||
    x.literal.localeCompare(y.literal, 'ja')
  )
}
function kanaDecks(
  words: Map<string, number>,
  provenance: (source: string) => Record<string, unknown>,
): DraftDeck[] {
  const select = (regex: RegExp, count: number) => {
    const refs: string[] = []
    const seen = new Set<number>()
    for (const [, id] of [...words.entries()]
      .filter(([form]) => regex.test(form))
      .sort(([a], [b]) => a.localeCompare(b, 'ja'))) {
      if (!seen.has(id)) {
        seen.add(id)
        refs.push(`word:${id}`)
      }
      if (refs.length === count) break
    }
    return refs
  }
  return [
    deck(
      'hiragana',
      'Hiragana',
      'Kana-only word references from words-core, alphabetically ordered for hiragana reading practice.',
      'word',
      select(/^[ぁ-ゖー]+$/, 46),
      provenance('jmdict'),
    ),
    deck(
      'katakana',
      'Katakana',
      'Kana-only word references from words-core, alphabetically ordered for katakana reading practice.',
      'word',
      select(/^[ァ-ヺー]+$/, 46),
      provenance('jmdict'),
    ),
    deck(
      'kana-words',
      'Kana Words',
      'Common kana-only words from words-core, alphabetically ordered.',
      'word',
      select(/^[ぁ-ゖァ-ヺー]+$/, 100),
      provenance('jmdict'),
    ),
  ]
}
function validateRefs(decks: Deck[], kanji: Set<string>, words: Set<number>) {
  for (const definition of decks)
    for (const ref of definition.contentRefs) {
      const [kind, value] = ref.split(':')
      if (
        (kind === 'kanji' && !kanji.has(value)) ||
        (kind === 'word' &&
          (!/^\d+$/.test(value) || !words.has(Number(value)))) ||
        !['kanji', 'word'].includes(kind)
      )
        fail(`${definition.id} has unresolved contentRef ${ref}`)
    }
}
main()

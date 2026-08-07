#!/usr/bin/env node
/**
 * Build the sentences pack: Japanese sentences with English translations
 * filtered and linked to JMdict entries via Tatoeba's WWWJDIC indices.
 * JmdictFurigana alignment applied for words in sentences.
 *
 * Filters:
 * - JA sentences length 6-30 chars
 * - >=1 EN translation
 * - sense-linked via indices (only those with wwwjdic annotations)
 * - <=5 per jmdict_sense_id , ranked by readability score
 *
 * Usage:
 *   npx tsx scripts/build-packs/build-sentences-pack.ts
 *
 * Outputs:
 *   - packs/sentences-v1.sqlite (the main pack)
 *   - packs/sentences-v1.manifest.json (metadata)
 *
 * MEMORY-EFFICIENT: Streams large CSVs (links, sentences) using readline.
 */
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import * as readline from 'readline'
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'

// TypeScript types
interface TatoebaIndicesEntry {
  sentenceId: number
  japaneseSentence: string
  englishTranslation: string
  words: Array<{
    headword: string
    reading: string
    entSeq?: string
    senseId: string
    surface: string
  }>
}

interface JmdictFuriganaEntry {
  text: string // kanji writing
  reading: string // kana reading
  furigana: Array<{ ruby: string; rt: string }>
}

interface OutputSentence {
  id: number
  ja: string
  jaAuthor: string
  enId: number
  en: string
  enAuthor: string
  furiganaJson: string // stringified array of {text, furigana}
  readabilityScore: number
}

interface SentenceWordLink {
  sentenceId: number
  jmdictSenseId: string
  wordStartChar: number
  wordEndChar: number
}

// Paths consistent with other builders (run from repo root via npx tsx scripts/...)
const CACHE_DIR = path.join(process.cwd(), 'scripts/build-packs/.cache')
const PACKS_DIR = path.join(process.cwd(), 'packs')
const OUTPUT_DB = path.join(PACKS_DIR, 'sentences-v1.sqlite')
const OUTPUT_MANIFEST = path.join(PACKS_DIR, 'sentences-v1.manifest.json')
const SOURCES_LOCK = path.join(
  process.cwd(),
  'scripts/build-packs/sources.lock.json',
)
const lockedInputs = new Map<string, string>()
function lockedInput(sourceId: string, componentId?: string): string {
  const key = `${sourceId}.${componentId ?? ''}`
  if (lockedInputs.has(key)) return lockedInputs.get(key)!
  const lock = JSON.parse(fs.readFileSync(SOURCES_LOCK, 'utf8'))
  const source = lock.sources?.[sourceId]
  const entry = componentId ? source?.components?.[componentId] : source
  const file = componentId ? entry?.file : (entry?.derivedFile ?? entry?.file)
  if (!entry?.sha256 || !entry?.file || !file || path.basename(file) !== file)
    throw new Error(`sources.lock.json lacks canonical ${key} input`)
  const archive = path.join(CACHE_DIR, entry.file)
  const resolved = path.join(CACHE_DIR, file)
  if (!fs.existsSync(archive) || !fs.existsSync(resolved))
    throw new Error(`Locked ${key} input is missing: ${file}`)
  if (
    crypto
      .createHash('sha256')
      .update(fs.readFileSync(archive))
      .digest('hex') !== entry.sha256
  )
    throw new Error(`Locked ${key} input hash mismatch`)
  lockedInputs.set(key, resolved)
  return resolved
}

// Simple profanity filter (basic, spot-check recommended per spec)
const INAPPROPRIATE_KEYWORDS = [
  'sex',
  'porn',
  'xxx',
  'nude',
  'naked',
  'fuck',
  'shit',
  'bitch',
]

async function sha256File(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256')
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

/**
 * Parse JmdictFurigana JSON and build a lookup map keyed by text|reading
 */
async function loadJmdictFurigana(): Promise<Map<string, JmdictFuriganaEntry>> {
  console.log('Loading JmdictFurigana...')
  const furiganaFile = lockedInput('jmdictfurigana')
  if (!fs.existsSync(furiganaFile)) {
    throw new Error(
      `JmdictFurigana.json not found at ${furiganaFile}. Run fetch or check cache.`,
    )
  }
  let data = fs.readFileSync(furiganaFile, 'utf-8')
  // Remove BOM if present
  if (data.charCodeAt(0) === 0xfeff) {
    data = data.slice(1)
  }
  const entries: JmdictFuriganaEntry[] = JSON.parse(data)

  const map = new Map<string, JmdictFuriganaEntry>()
  for (const entry of entries) {
    const key = `${entry.text}|${entry.reading}`
    map.set(key, entry)
    // Also index by text only as fallback for some cases
    if (!map.has(`${entry.text}|*`)) {
      map.set(`${entry.text}|*`, entry)
    }
  }

  console.log(`  Loaded ${map.size} JmdictFurigana entries (unique keys)`)
  return map
}

/**
 * Load the WWWJDIC indices file (tatoeba wwwjdic.csv)
 * Only entries with at least one word annotation.
 */
async function loadWWWJDICIndices(): Promise<Map<number, TatoebaIndicesEntry>> {
  console.log('Loading WWWJDIC indices...')
  const indicesFile = lockedInput('tatoeba', 'wwwjdic')
  if (!fs.existsSync(indicesFile)) {
    throw new Error(`wwwjdic.csv not found at ${indicesFile}`)
  }
  const indices = new Map<number, TatoebaIndicesEntry>()

  const rl = readline.createInterface({
    input: fs.createReadStream(indicesFile),
    crlfDelay: Infinity,
  })

  let lineCount = 0
  for await (const line of rl) {
    lineCount++
    if (lineCount % 50000 === 0) {
      console.log(`  Processed ${lineCount} wwwjdic lines...`)
    }

    const parts = line.split('\t')
    if (parts.length < 5) continue

    const sentenceId = parseInt(parts[0], 10)
    const japaneseSentence = parts[2]
    const englishTranslation = parts[3]
    const wordsStr = parts[4]

    const words: TatoebaIndicesEntry['words'] = []
    // Robust token parser per T0.6 correctness review:
    // - (#1234567) → entSeq (real JMdict id for join)
    // - (かな) → reading (kana, not #id)
    // - [02] → senseId
    // - {表層} → surface (what appears in ja)
    // - bare headword(reading) or head(#ent) still emit link (use headword or ent for key)
    // headword = lemma before annotations (for cap key + ent join when no #)
    const tokens = (wordsStr || '').split(/\s+/).filter(Boolean)
    for (const tok of tokens) {
      const entSeqMatch = tok.match(/\(#(\d+)\)/)
      const entSeq = entSeqMatch ? entSeqMatch[1] : undefined
      const parenMatch = tok.match(/\(([^)#][^)]*)\)/) // reading, exclude #ids
      const reading = parenMatch ? parenMatch[1] : ''
      const senseMatch = tok.match(/\[(\d{1,2})\]/)
      const senseId = senseMatch ? senseMatch[1].padStart(2, '0') : '01'
      const surfMatch = tok.match(/\{([^}]+)\}/)
      let surface = surfMatch ? surfMatch[1].replace(/~+$/, '') : ''
      // headword: strip all annotations
      let headword = tok
        .replace(/\{[^}]*\}/, '')
        .replace(/\[[^\]]*\]/g, '')
        .replace(/\(#\d+\)/g, '')
        .replace(/\([^)]*\)/g, '')
        .replace(/[~^]+/g, '')
        .trim()
      if (!surface && headword) {
        surface = headword
      }
      if (surface) {
        words.push({
          headword: headword || surface,
          reading,
          entSeq,
          senseId,
          surface,
        })
      }
    }

    if (words.length > 0) {
      indices.set(sentenceId, {
        sentenceId,
        japaneseSentence,
        englishTranslation,
        words,
      })
    }
  }

  console.log(`  Loaded ${indices.size} WWWJDIC indexed sentences`)
  return indices
}

/**
 * Load Japanese sentences that are in the length range 6-30 chars.
 * Streaming to keep mem low.
 */
async function loadJapaneseSentences(): Promise<Map<number, string>> {
  console.log('Loading Japanese sentences (length 6-30)...')
  const sentencesFile = lockedInput('tatoeba', 'sentences')
  if (!fs.existsSync(sentencesFile)) {
    throw new Error(`sentences.csv not found at ${sentencesFile}`)
  }
  const sentences = new Map<number, string>()

  const rl = readline.createInterface({
    input: fs.createReadStream(sentencesFile),
    crlfDelay: Infinity,
  })

  let jpnCount = 0
  for await (const line of rl) {
    const parts = line.split('\t')
    if (parts.length < 3) continue

    const id = parseInt(parts[0], 10)
    const lang = parts[1]
    if (lang !== 'jpn') continue

    const text = parts[2]
    if (text.length < 6 || text.length > 30) continue

    sentences.set(id, text)
    jpnCount++

    if (jpnCount % 20000 === 0) {
      console.log(`  Loaded ${jpnCount} filtered Japanese sentences...`)
    }
  }

  console.log(`  Loaded ${jpnCount} Japanese sentences (6-30 chars)`)
  return sentences
}

/**
 * Load English sentences (all, for pairing). Streaming.
 */
async function loadEnglishSentences(): Promise<Map<number, string>> {
  console.log('Loading English sentences...')
  const sentencesFile = lockedInput('tatoeba', 'sentences')
  const sentences = new Map<number, string>()

  const rl = readline.createInterface({
    input: fs.createReadStream(sentencesFile),
    crlfDelay: Infinity,
  })

  let engCount = 0
  for await (const line of rl) {
    const parts = line.split('\t')
    if (parts.length < 3) continue

    const id = parseInt(parts[0], 10)
    const lang = parts[1]
    if (lang !== 'eng') continue

    const text = parts[2]
    sentences.set(id, text)
    engCount++

    if (engCount % 100000 === 0) {
      console.log(`  Loaded ${engCount} English sentences...`)
    }
  }

  console.log(`  Loaded ${engCount} English sentences`)
  return sentences
}

/**
 * Tatoeba's compact sentences.csv export deliberately has no contributor field.
 * Read the pinned sentences_detailed.csv export after selection so every shipped
 * Japanese/English pair retains its upstream author and translation ID.
 */
async function attachTatoebaAuthors(
  sentences: Array<Omit<OutputSentence, 'jaAuthor' | 'enAuthor'>>,
): Promise<OutputSentence[]> {
  const detailedFile = lockedInput('tatoeba', 'sentencesDetailed')
  if (!fs.existsSync(detailedFile)) {
    throw new Error(
      `sentences_detailed.csv not found at ${detailedFile}; author attribution is required for shipped Tatoeba pairs.`,
    )
  }

  const lock = JSON.parse(fs.readFileSync(SOURCES_LOCK, 'utf-8'))
  const detailedSource = lock?.sources?.tatoeba?.components?.sentencesDetailed
  if (!detailedSource || detailedSource.file !== 'sentences_detailed.csv') {
    throw new Error(
      'sources.lock.json is missing pinned Tatoeba sentencesDetailed attribution metadata.',
    )
  }
  const actualHash = await sha256File(detailedFile)
  if (
    actualHash !== detailedSource.sha256 ||
    fs.statSync(detailedFile).size !== detailedSource.sizeBytes
  ) {
    throw new Error(
      'Pinned Tatoeba sentences_detailed.csv does not match sources.lock.json.',
    )
  }

  const wanted = new Map<number, { lang: 'jpn' | 'eng'; text: string }>()
  for (const sentence of sentences) {
    wanted.set(sentence.id, { lang: 'jpn', text: sentence.ja })
    wanted.set(sentence.enId, { lang: 'eng', text: sentence.en })
  }
  const authors = new Map<number, string>()
  const missingAuthorIds = new Set<number>()
  const rl = readline.createInterface({
    input: fs.createReadStream(detailedFile),
    crlfDelay: Infinity,
  })
  for await (const line of rl) {
    const parts = line.split('\t')
    if (parts.length < 6) continue
    const id = parseInt(parts[0], 10)
    const expected = wanted.get(id)
    if (!expected) continue
    if (parts[1] !== expected.lang || parts[2] !== expected.text) {
      throw new Error(
        `Pinned Tatoeba detailed metadata does not match retained ${expected.lang} sentence ${id}.`,
      )
    }
    const author = parts[3]
    if (!author || author === '\\N') {
      missingAuthorIds.add(id)
      continue
    }
    authors.set(id, author)
  }

  const attributed = sentences.flatMap((sentence) => {
    const jaAuthor = authors.get(sentence.id)
    const enAuthor = authors.get(sentence.enId)
    if (!jaAuthor || !enAuthor) {
      return []
    }
    return { ...sentence, jaAuthor, enAuthor }
  })
  const excluded = sentences.length - attributed.length
  if (excluded > 0) {
    console.log(
      `  Excluded ${excluded} pairs with unavailable Tatoeba author metadata (${missingAuthorIds.size} source sentence IDs).`,
    )
  }
  if (attributed.length === 0)
    throw new Error(
      'No sentence pairs have complete verified Tatoeba author attribution.',
    )
  return attributed
}

/**
 * Compute readability score (higher = better for our cap/rank)
 * Favors shorter, fewer-kanji, shorter EN.
 */
function computeReadabilityScore(ja: string, en: string): number {
  const lengthScore = Math.max(0, 30 - ja.length) / 30

  let kanjiCount = 0
  for (const char of ja) {
    const code = char.charCodeAt(0)
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0xf900 && code <= 0xfaff)
    ) {
      kanjiCount++
    }
  }

  const kanjiRatio = ja.length > 0 ? kanjiCount / ja.length : 0
  const kanjiScore = Math.max(0, 1 - kanjiRatio)

  const engLengthScore = Math.max(0, 100 - en.length) / 100

  return lengthScore * 0.4 + kanjiScore * 0.4 + engLengthScore * 0.2
}

/**
 * Basic inappropriate content filter.
 */
function isInappropriate(ja: string, en: string): boolean {
  const lowerEn = en.toLowerCase()
  for (const keyword of INAPPROPRIATE_KEYWORDS) {
    if (lowerEn.includes(keyword)) {
      return true
    }
  }
  return false
}

/**
 * Apply furigana alignment using JmdictFurigana for the linked words in sentence.
 * Falls back to char split with empty furigana for uncovered parts.
 * This makes target-word highlight + furigana plausible when combined with links.
 */
function applyFurigana(
  ja: string,
  indicesEntry: TatoebaIndicesEntry | undefined,
  furiganaMap: Map<string, JmdictFuriganaEntry>,
): Array<{ text: string; furigana: string }> {
  const segments: Array<{ text: string; furigana: string }> = []
  if (!indicesEntry || indicesEntry.words.length === 0) {
    // Fallback: per char, no furigana (better than nothing; app may enhance)
    return ja.split('').map((char) => ({ text: char, furigana: '' }))
  }

  let pos = 0
  const searchText = ja // use the filtered ja text
  for (const word of indicesEntry.words) {
    const wordSurface = word.surface
    const start = searchText.indexOf(wordSurface, pos)
    if (start > pos) {
      // prefix uncovered text
      const prefix = searchText.slice(pos, start)
      for (const ch of prefix) {
        segments.push({ text: ch, furigana: '' })
      }
    }
    if (start >= 0) {
      // Lookup prefers headword|reading_from_() per spec (not lemma on conj surface)
      let furiEntry: JmdictFuriganaEntry | undefined
      if (word.reading) {
        furiEntry = furiganaMap.get(`${word.headword}|${word.reading}`)
      }
      if (!furiEntry) {
        furiEntry = furiganaMap.get(`${word.headword}|*`)
      }
      if (!furiEntry && wordSurface !== word.reading) {
        furiEntry = furiganaMap.get(`${wordSurface}|*`)
      }

      if (furiEntry && furiEntry.furigana.length > 0) {
        const hasKanaInHead = /[\u3040-\u309f\u30a0-\u30ff]/.test(word.headword)
        if (wordSurface === word.headword) {
          // exact dict form: use per-char ruby groups
          for (const f of furiEntry.furigana) {
            segments.push({ text: f.ruby, furigana: f.rt })
          }
        } else if (word.reading && !hasKanaInHead) {
          // orthographic variant (e.g. ２０歳 for 二十歳), use provided reading on surface
          const joinedRt = furiEntry.furigana.map((f) => f.rt).join('')
          segments.push({
            text: wordSurface,
            furigana: joinedRt || word.reading,
          })
        } else {
          // conjugated / inflected: do not use dict lemma reading as ruby; map stem in theory
          // here emit surface with '' (tails plain); safe alignment only on exact
          segments.push({ text: wordSurface, furigana: '' })
        }
      } else {
        // fallback: only attach reading when it was explicitly for this surface (no conj)
        const furiText =
          word.reading && word.headword === wordSurface ? word.reading : ''
        segments.push({ text: wordSurface, furigana: furiText })
      }
      pos = start + wordSurface.length
    } else {
      // word surface not found at pos (drift, fullwidth, ~ etc): do NOT push or advance by surface len
      // real chars remain in searchText and will be emitted by prefix of next or final suffix.
      // This guarantees reconstructed === ja (see assert below).
    }
  }
  if (pos < searchText.length) {
    const suffix = searchText.slice(pos)
    for (const ch of suffix) {
      segments.push({ text: ch, furigana: '' })
    }
  }
  // Assert per T0.6 review: join of furigana texts must === original ja
  const reconstructed = segments.map((s) => s.text).join('')
  if (reconstructed !== ja) {
    console.warn(
      `[applyFurigana] reconstruct !== ja (len ${reconstructed.length} vs ${ja.length}); some tokens may have drifted`,
    )
  }
  return segments
}

/**
 * Main ETL: stream, filter, cap at 5 per sense, rank, write sqlite + manifest.
 */
async function buildSentencesPack() {
  console.log(
    'Starting Tatoeba sentences ETL (memory-efficient streaming + per-sense cap)...\n',
  )

  // Load reference data (smaller files)
  const furiganaMap = await loadJmdictFurigana()
  const wwwjdicIndices = await loadWWWJDICIndices()
  const japaneseSentences = await loadJapaneseSentences()
  const englishSentences = await loadEnglishSentences()

  console.log(
    '\nBuilding sentence pairs (streaming links.csv, enforcing sense cap)...',
  )

  const candidateSentences: Array<
    Omit<OutputSentence, 'jaAuthor' | 'enAuthor'>
  > = []
  const seenJpns = new Set<number>()
  const senseToCandidates: Map<
    string,
    Array<{ sentenceId: number; score: number }>
  > = new Map()

  const linksFile = lockedInput('tatoeba', 'links')
  if (!fs.existsSync(linksFile)) {
    throw new Error(`links.csv not found at ${linksFile}`)
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(linksFile),
    crlfDelay: Infinity,
  })

  let linkCount = 0
  let considered = 0

  for await (const line of rl) {
    linkCount++
    if (linkCount % 500000 === 0) {
      console.log(
        `  Processed ${linkCount} links, candidates so far: ${candidateSentences.length}...`,
      )
    }

    const parts = line.split('\t')
    if (parts.length < 2) continue

    const jpnId = parseInt(parts[0], 10)
    const engId = parseInt(parts[1], 10)

    if (seenJpns.has(jpnId)) continue
    if (!japaneseSentences.has(jpnId)) continue
    if (!englishSentences.has(engId)) continue

    const jpnText = japaneseSentences.get(jpnId)!
    const engText = englishSentences.get(engId)!

    if (isInappropriate(jpnText, engText)) continue

    const indicesEntry = wwwjdicIndices.get(jpnId)
    if (!indicesEntry) continue // require sense-linked via indices per spec

    const readabilityScore = computeReadabilityScore(jpnText, engText)
    const furiganaData = applyFurigana(jpnText, indicesEntry, furiganaMap)

    const outSentence: OutputSentence = {
      id: jpnId,
      ja: jpnText,
      enId: engId,
      en: engText,
      furiganaJson: JSON.stringify(furiganaData),
      readabilityScore,
    }

    candidateSentences.push(outSentence)
    seenJpns.add(jpnId)
    considered++

    // Record this sentence as candidate for each of its senses
    // Key by ent_seq:sense (or headword:sense) per dict word, NOT conjugated surface
    for (const word of indicesEntry.words) {
      const senseKey = word.entSeq
        ? `${word.entSeq}:${word.senseId}`
        : `${word.headword}:${word.senseId}`
      if (!senseToCandidates.has(senseKey)) {
        senseToCandidates.set(senseKey, [])
      }
      senseToCandidates
        .get(senseKey)!
        .push({ sentenceId: jpnId, score: readabilityScore })
    }
  }

  console.log(
    `  Considered ${considered} sense-linked sentence pairs after filters.`,
  )
  console.log(`  Unique senses with candidates: ${senseToCandidates.size}`)

  // Enforce <=5 per sense, ranked by readability desc. Collect union of kept ids.
  // CRITICAL: also track kept (senseKey, sentenceId) so final links table respects the cap
  // (not just which sentences to keep; a kept sent may contain other senses that exceed).
  const keptSentenceIds = new Set<number>()
  const keptLinks = new Set<string>() // `${senseKey}\t${sentenceId}`
  for (const [senseKey, cands] of senseToCandidates.entries()) {
    cands.sort((a, b) => b.score - a.score)
    const top5 = cands.slice(0, 5)
    for (const c of top5) {
      keptSentenceIds.add(c.sentenceId)
      keptLinks.add(`${senseKey}\t${c.sentenceId}`)
    }
  }

  // Filter to kept only (this also drops sentences not linked to any capped sense)
  let finalSentences = candidateSentences.filter((s) =>
    keptSentenceIds.has(s.id),
  )
  console.log('Loading Tatoeba authors from pinned sentences_detailed.csv...')
  const attributedSentences = await attachTatoebaAuthors(finalSentences)

  // Rebuild word links ONLY for kept sentences, and ONLY for the (sense,sent) pairs that were in top-5 for that sense
  const wordLinks: SentenceWordLink[] = []
  for (const sent of attributedSentences) {
    const indicesEntry = wwwjdicIndices.get(sent.id)
    if (!indicesEntry) continue
    let charPos = 0
    for (const word of indicesEntry.words) {
      const senseKey = word.entSeq
        ? `${word.entSeq}:${word.senseId}`
        : `${word.headword}:${word.senseId}`
      if (!keptLinks.has(`${senseKey}\t${sent.id}`)) continue
      const pos = sent.ja.indexOf(word.surface, charPos)
      if (pos >= 0) {
        wordLinks.push({
          sentenceId: sent.id,
          jmdictSenseId: senseKey,
          wordStartChar: pos,
          wordEndChar: pos + word.surface.length,
        })
        charPos = pos + word.surface.length
      }
    }
  }

  console.log(
    `  After cap <=5/sense (before author availability check): ${finalSentences.length} sentences selected.`,
  )
  console.log(
    `  Shipped with complete author attribution: ${attributedSentences.length} sentences.`,
  )
  console.log(`  Word-sense links for kept: ${wordLinks.length}`)

  // Ensure output dir
  if (!fs.existsSync(PACKS_DIR)) {
    fs.mkdirSync(PACKS_DIR, { recursive: true })
  }
  if (fs.existsSync(OUTPUT_DB)) {
    fs.unlinkSync(OUTPUT_DB)
  }

  // Create SQLite
  console.log('\nCreating SQLite database...')
  const SQL = await initSqlJs()
  const db: SqlJsDatabase = new SQL.Database()

  db.run(`
    CREATE TABLE sentences (
      id INTEGER PRIMARY KEY,
      ja TEXT NOT NULL,
      ja_author TEXT NOT NULL,
      en_sentence_id INTEGER NOT NULL,
      en TEXT NOT NULL,
      en_author TEXT NOT NULL,
      furigana_json TEXT NOT NULL,
      readability_score REAL NOT NULL
    );

    CREATE TABLE sentence_word_links (
      sentence_id INTEGER NOT NULL,
      jmdict_sense_id TEXT NOT NULL,
      word_start_char INTEGER,
      word_end_char INTEGER,
      FOREIGN KEY (sentence_id) REFERENCES sentences(id),
      PRIMARY KEY (sentence_id, jmdict_sense_id)
    );

    CREATE INDEX idx_sentences_readability ON sentences(readability_score DESC);
    CREATE INDEX idx_word_links_sense ON sentence_word_links(jmdict_sense_id);
  `)

  // Insert sentences (batch for speed)
  console.log('Inserting sentences...')
  const insertStmt = db.prepare(`
    INSERT INTO sentences (id, ja, ja_author, en_sentence_id, en, en_author, furigana_json, readability_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const BATCH = 5000
  for (let i = 0; i < attributedSentences.length; i += BATCH) {
    const batch = attributedSentences.slice(i, i + BATCH)
    for (const row of batch) {
      insertStmt.bind([
        row.id,
        row.ja,
        row.jaAuthor,
        row.enId,
        row.en,
        row.enAuthor,
        row.furiganaJson,
        row.readabilityScore,
      ])
      insertStmt.step()
      insertStmt.reset()
    }
    if (i % 20000 === 0) {
      console.log(
        `  Inserted ${Math.min(i + BATCH, attributedSentences.length)} / ${attributedSentences.length}`,
      )
    }
  }
  insertStmt.free()

  // Insert links
  console.log('Inserting word-sense links...')
  const insertLink = db.prepare(`
    INSERT OR IGNORE INTO sentence_word_links (sentence_id, jmdict_sense_id, word_start_char, word_end_char)
    VALUES (?, ?, ?, ?)
  `)
  for (let i = 0; i < wordLinks.length; i += BATCH) {
    const batch = wordLinks.slice(i, i + BATCH)
    for (const ln of batch) {
      insertLink.bind([
        ln.sentenceId,
        ln.jmdictSenseId,
        ln.wordStartChar,
        ln.wordEndChar,
      ])
      insertLink.step()
      insertLink.reset()
    }
  }
  insertLink.free()

  // Export
  const dbData = db.export()
  const dbBuffer = Buffer.from(dbData)
  fs.writeFileSync(OUTPUT_DB, dbBuffer)

  const sha256 = crypto.createHash('sha256').update(dbBuffer).digest('hex')
  const sizeBytes = dbBuffer.length

  // Manifest: component-wise obligations are retained in the mixed-source pack.
  const manifest = {
    id: 'sentences',
    version: 'v1',
    schemaVersion: 2,
    sha256,
    sizeBytes,
    license: 'CC BY 2.0 FR and CC BY-SA 4.0 (component-wise)',
    attribution:
      'Tatoeba Project — sentences used under CC BY 2.0 FR. Each shipped pair retains its Tatoeba Japanese sentence ID/author and English translation ID/author in the sentences table, sourced from the pinned sentences_detailed.csv export. Modified: filtered to length 6-30, ≥1 EN, ≤5 per sense (by ent_seq:sense or headword:sense) ranked by readability. JmdictFurigana alignment DATA is derived from JMdict and is used under CC BY-SA 4.0; any MIT repository code license does not replace these data obligations.',
    sources: [
      {
        id: 'tatoeba',
        name: 'Tatoeba (sentences + links + WWWJDIC indices)',
        pinned: '2026-07-25',
        license: 'CC BY 2.0 FR',
        provenance:
          'Includes Tanaka Corpus JA-EN example sentences; authors are preserved from pinned sentences_detailed.csv by retained sentence IDs',
        url: 'https://downloads.tatoeba.org/exports/',
      },
      {
        id: 'jmdictfurigana',
        name: 'JmdictFurigana',
        pinned: '2.3.1+2026-07-25',
        license: 'CC BY-SA 4.0',
        provenance:
          'Furigana alignment DATA for kanji readings (Doublevil), derived from JMdict under CC BY-SA 4.0; repository code may be MIT but does not govern the data',
        url: 'https://github.com/Doublevil/JmdictFurigana',
      },
    ],
    stats: {
      sentenceCount: attributedSentences.length,
      linkCount: wordLinks.length,
      uniqueSenses: new Set(wordLinks.map((link) => link.jmdictSenseId)).size,
    },
  }

  fs.writeFileSync(OUTPUT_MANIFEST, JSON.stringify(manifest, null, 2))

  console.log(`\n=== Build complete ===`)
  console.log(`Sentences: ${attributedSentences.length}`)
  console.log(`Word links: ${wordLinks.length}`)
  console.log(`DB: ${OUTPUT_DB} (${(sizeBytes / 1024 / 1024).toFixed(2)} MB)`)
  console.log(`SHA256: ${sha256}`)
  console.log(`Manifest: ${OUTPUT_MANIFEST}`)
  console.log(`License: ${manifest.license}`)
}

// Run
buildSentencesPack().catch((err) => {
  console.error('Build failed:', err)
  process.exit(1)
})

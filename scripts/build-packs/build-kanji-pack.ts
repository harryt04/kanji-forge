#!/usr/bin/env node
/**
 * Build kanji pack from KANJIDIC2 (T0.3)
 *
 * Transforms KANJIDIC2 → packs/kanji-v1.sqlite
 * Fields: literal, codepoint, radicals (classical+nelson), grade, stroke counts (primary+alt),
 *         freq, on/kun/nanori readings (okurigana markers preserved as '.' / '-'),
 *         EN meanings (m_lang="en" or unmarked).
 *
 * CRITICAL: qc_type="skip"/"misclass" (and Heisig/dic_ref etc) are omitted by non-extraction
 * (allowlist schema in parseKanjidic never reads <query_code> or <dic_ref>).
 * Primary defense: allowlist. Assertion: schema deny-list (no bad column names) + optional blob scan.
 * Build aborts if any disallowed column appears or markers leak. (Legit "skip" in meanings allowed.)
 *
 * Uses better-sqlite3 (preferred over sql.js per requirements).
 *
 * Usage:
 *   npx tsx scripts/build-packs/build-kanji-pack.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as crypto from 'crypto';
import Database from 'better-sqlite3';

const LOCK_FILE = path.join(process.cwd(), 'scripts/build-packs/sources.lock.json');
const lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
const kLock = lock.sources?.kanjidic2;
if (!kLock?.sha256) {
  throw new Error('sources.lock.json missing kanjidic2.sha256 entry');
}
const kFile = kLock.file || kLock.path || `kanjidic2-${kLock.pinned}.gz`;
const KANJIDIC_PATH = path.join(process.cwd(), 'scripts/build-packs/.cache', kFile);
const OUTPUT_DIR = path.join(process.cwd(), 'packs');
const OUTPUT_DB = path.join(OUTPUT_DIR, 'kanji-v1.sqlite');
const OUTPUT_MANIFEST = path.join(OUTPUT_DIR, 'kanji-v1.manifest.json');

interface KanjiEntry {
  literal: string;
  codepoint: string;
  radicalClassical: number | null;
  radicalNelson: number | null;
  grade: number | null;
  strokeCount: number[];
  freq: number | null;
  jlptLegacy: number | null;
  onReadings: string[];
  kunReadings: string[];
  meanings: string[];
  nanori: string[];
}

interface KanjiRow {
  literal: string;
  on_readings: string;
  kun_readings: string;
  meanings: string;
  nanori: string;
}

function parseKanjidic(gzPath: string): { entries: KanjiEntry[]; skippedBadQc: number } {
  if (!fs.existsSync(gzPath)) {
    throw new Error(`KANJIDIC2 source not found at ${gzPath}`);
  }

  const gzData = fs.readFileSync(gzPath);
  const xml = zlib.gunzipSync(gzData).toString('utf8');

  const entries: KanjiEntry[] = [];
  let skippedBadQc = 0;

  // Each <character> block (KANJIDIC2 is well-formed and pretty-printed)
  const charBlockRegex = /<character>([\s\S]*?)<\/character>/g;
  let charMatch: RegExpExecArray | null;

  while ((charMatch = charBlockRegex.exec(xml)) !== null) {
    const block = charMatch[1];

    const literalMatch = /<literal>([^<]+)<\/literal>/.exec(block);
    if (!literalMatch) continue;
    const literal = literalMatch[1];

    // codepoint (ucs hex, store lowercase)
    const cpMatch = /<cp_value cp_type="ucs">([0-9a-fA-F]+)<\/cp_value>/.exec(block);
    if (!cpMatch) continue;
    const codepoint = cpMatch[1].toLowerCase();

    // radicals
    let radicalClassical: number | null = null;
    let radicalNelson: number | null = null;
    const radRegex = /<rad_value rad_type="([^"]+)">(\d+)<\/rad_value>/g;
    let radMatch: RegExpExecArray | null;
    while ((radMatch = radRegex.exec(block)) !== null) {
      const val = parseInt(radMatch[2], 10);
      if (radMatch[1] === 'classical') radicalClassical = val;
      if (radMatch[1] === 'nelson_c') radicalNelson = val;
    }

    // misc/*
    const gradeMatch = /<grade>(\d+)<\/grade>/.exec(block);
    const grade = gradeMatch ? parseInt(gradeMatch[1], 10) : null;

    const strokeCount: number[] = [];
    const strokeRegex = /<stroke_count>(\d+)<\/stroke_count>/g;
    let sMatch: RegExpExecArray | null;
    while ((sMatch = strokeRegex.exec(block)) !== null) {
      const n = parseInt(sMatch[1], 10);
      if (!isNaN(n)) strokeCount.push(n);
    }

    const freqMatch = /<freq>(\d+)<\/freq>/.exec(block);
    const freq = freqMatch ? parseInt(freqMatch[1], 10) : null;

    const jlptMatch = /<jlpt>(\d+)<\/jlpt>/.exec(block);
    const jlptLegacy = jlptMatch ? parseInt(jlptMatch[1], 10) : null;

    // readings + meanings (under one or more <rmgroup>)
    const onReadings: string[] = [];
    const kunReadings: string[] = [];
    const meanings: string[] = [];
    const nanori: string[] = [];

    const rmgroupRegex = /<rmgroup>([\s\S]*?)<\/rmgroup>/g;
    let rmMatch: RegExpExecArray | null;
    while ((rmMatch = rmgroupRegex.exec(block)) !== null) {
      const rm = rmMatch[1];

      // <reading r_type="ja_on|ja_kun">
      const readRegex = /<reading r_type="([^"]+)">([^<]+)<\/reading>/g;
      let rMatch: RegExpExecArray | null;
      while ((rMatch = readRegex.exec(rm)) !== null) {
        const rtype = rMatch[1];
        const text = rMatch[2];
        if (rtype === 'ja_on') onReadings.push(text);
        else if (rtype === 'ja_kun') kunReadings.push(text);
      }

      // <meaning> or <meaning m_lang="en">  (ignore other langs)
      const meanRegex = /<meaning(?:\s+m_lang="([^"]*)")?>([^<]+)<\/meaning>/g;
      let mMatch: RegExpExecArray | null;
      while ((mMatch = meanRegex.exec(rm)) !== null) {
        const lang = mMatch[1];
        const text = mMatch[2];
        if (!lang || lang === 'en') {
          meanings.push(text);
        }
      }
    }

    // <nanori> (direct children of reading_meaning, may repeat)
    const nanoRegex = /<nanori>([^<]+)<\/nanori>/g;
    let nMatch: RegExpExecArray | null;
    while ((nMatch = nanoRegex.exec(block)) !== null) {
      nanori.push(nMatch[1]);
    }

    // === COUNT SKIP/misclass for audit (omitted entirely by non-extraction; never copied to entry) ===
    // Primary defense is the allowlist parse (no <q_code> fields are read into KanjiEntry at all).
    const qcRegex = /<q_code qc_type="([^"]+)"[^>]*>[^<]*<\/q_code>/g;
    let qMatch: RegExpExecArray | null;
    while ((qMatch = qcRegex.exec(block)) !== null) {
      const qcType = qMatch[1];
      if (qcType === 'skip' || qcType === 'misclass') {
        skippedBadQc++;
      }
      // All other qc_type values (four_corner, etc.) are also omitted from this pack.
    }

    entries.push({
      literal,
      codepoint,
      radicalClassical,
      radicalNelson,
      grade,
      strokeCount,
      freq,
      jlptLegacy,
      onReadings,
      kunReadings,
      meanings,
      nanori,
    });
  }

  return { entries, skippedBadQc };
}

function buildKanjiDb(entries: KanjiEntry[]): { kanjiCount: number } {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  if (fs.existsSync(OUTPUT_DB)) {
    fs.unlinkSync(OUTPUT_DB);
  }

  const db = new Database(OUTPUT_DB);

  try {
    db.pragma('journal_mode = DELETE');

    db.exec(`
      CREATE TABLE kanji (
        id INTEGER PRIMARY KEY,
        literal TEXT NOT NULL UNIQUE,
        codepoint TEXT NOT NULL,
        radical_classical INTEGER,
        radical_nelson INTEGER,
        grade INTEGER,
        stroke_count INTEGER,
        stroke_count_alt TEXT,
        freq INTEGER,
        jlpt_legacy INTEGER,
        on_readings TEXT NOT NULL,
        kun_readings TEXT NOT NULL,
        meanings TEXT NOT NULL,
        nanori TEXT NOT NULL
      );
    `);

    db.exec('CREATE INDEX idx_kanji_literal ON kanji(literal);');
    db.exec('CREATE INDEX idx_kanji_codepoint ON kanji(codepoint);');
    db.exec('CREATE INDEX idx_kanji_grade ON kanji(grade);');
    db.exec('CREATE INDEX idx_kanji_freq ON kanji(freq);');

    const insert = db.prepare(`
      INSERT INTO kanji (
        literal, codepoint, radical_classical, radical_nelson,
        grade, stroke_count, stroke_count_alt, freq, jlpt_legacy,
        on_readings, kun_readings, meanings, nanori
      ) VALUES (
        @literal, @codepoint, @radicalClassical, @radicalNelson,
        @grade, @strokeCount, @strokeCountAlt, @freq, @jlptLegacy,
        @onReadings, @kunReadings, @meanings, @nanori
      )
    `);

    const insertTx = db.transaction((list: KanjiEntry[]) => {
      for (const e of list) {
        const primary = e.strokeCount.length > 0 ? e.strokeCount[0] : null;
        const alt = e.strokeCount.length > 1 ? JSON.stringify(e.strokeCount.slice(1)) : null;
        insert.run({
          literal: e.literal,
          codepoint: e.codepoint,
          radicalClassical: e.radicalClassical,
          radicalNelson: e.radicalNelson,
          grade: e.grade,
          strokeCount: primary,
          strokeCountAlt: alt,
          freq: e.freq,
          jlptLegacy: e.jlptLegacy,
          onReadings: JSON.stringify(e.onReadings),
          kunReadings: JSON.stringify(e.kunReadings),
          meanings: JSON.stringify(e.meanings),
          nanori: JSON.stringify(e.nanori),
        });
      }
    });

    insertTx(entries);

    // === CRITICAL PIPELINE ASSERTION (DATA-SOURCES §6, T0.3) ===
    // Primary defense remains allowlist schema (never extract q_code / query_code / dic_ref).
    // Assertion: schema deny-list — fail if any column name matches /skip|misclass|heisig|query_code|dic_ref|qc_type/i
    // Binary/string scan of DB for `qc_type=` is optional extra defense.
    // Documented: SKIP is omitted by non-extraction (count is source audit only).
    const cols: Array<{ name: string }> = db.prepare(`PRAGMA table_info(kanji)`).all() as any;
    for (const c of cols) {
      if (/skip|misclass|heisig|query_code|dic_ref|qc_type/i.test(c.name)) {
        throw new Error(`ASSERTION FAILED: disallowed column name in schema: ${c.name}`);
      }
    }

    // Optional extra: binary/string scan of the DB file bytes for qc_type markers (would catch value leaks)
    const dbBytes = fs.readFileSync(OUTPUT_DB);
    const dbStr = dbBytes.toString('utf8');
    if (
      dbStr.includes('qc_type="skip"') ||
      dbStr.includes('qc_type="misclass"') ||
      dbStr.includes('qc_type=') ||
      dbStr.includes('skip_misclass')
    ) {
      throw new Error('ASSERTION FAILED: qc_type= or skip marker found in DB bytes');
    }

    const countRow = db.prepare('SELECT COUNT(*) as count FROM kanji').get() as {
      count: number;
    };
    const kanjiCount = countRow.count;

    console.log(
      `✓ Assertion passed: schema deny-list + no qc_type markers (checked ${cols.length} columns)`
    );

    db.close();

    // Remove any journal/sidecar files so we ship a single clean .sqlite
    for (const side of [
      OUTPUT_DB + '-wal',
      OUTPUT_DB + '-shm',
      OUTPUT_DB + '-journal',
    ]) {
      try {
        fs.unlinkSync(side);
      } catch {
        /* no sidecar */
      }
    }

    return { kanjiCount };
  } catch (err) {
    db.close();
    // On assertion (or other) failure after DB creation, delete partial sqlite (don't leave bad pack)
    try {
      if (fs.existsSync(OUTPUT_DB)) {
        fs.unlinkSync(OUTPUT_DB);
      }
    } catch {
      /* ignore */
    }
    throw err;
  }
}

function writeManifest(kanjiCount: number): string {
  const dbStats = fs.statSync(OUTPUT_DB);
  const dbContent = fs.readFileSync(OUTPUT_DB);
  const sha256 = crypto
    .createHash('sha256')
    .update(dbContent)
    .digest('hex');

  const manifest = {
    id: 'kanji',
    version: 'v1',
    schemaVersion: 1,
    sha256,
    sizeBytes: dbStats.size,
    license: 'CC BY-SA 4.0',
    attribution:
      'KANJIDIC2 — © Electronic Dictionary Research and Development Group, Monash University. Used under CC BY-SA 4.0. Modified: converted to a database format, some fields omitted (including all qc_type="skip" and qc_type="misclass" entries).',
    sources: [
      {
        id: 'kanjidic2',
        name: 'KANJIDIC2',
        license: 'CC BY-SA 4.0',
        url: 'http://ftp.edrdg.org/pub/Nihongo/kanjidic2.xml.gz',
        sha256: kLock.sha256,
      },
    ],
    stats: {
      kanjiCount,
    },
  };

  fs.writeFileSync(OUTPUT_MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  return sha256;
}

async function main() {
  console.log('Building KANJIDIC2 → kanji pack...\n');

  if (!fs.existsSync(KANJIDIC_PATH)) {
    console.error(`KANJIDIC2 source not found at ${KANJIDIC_PATH}`);
    console.error('Run: npx tsx scripts/build-packs/fetch-sources.ts');
    process.exit(1);
  }

  // Verify against sources.lock.json (fail closed on mismatch)
  const inputData = fs.readFileSync(KANJIDIC_PATH);
  const actualSha = crypto.createHash('sha256').update(inputData).digest('hex');
  if (actualSha !== kLock.sha256) {
    console.error(`SHA256 mismatch for kanjidic2 input:`);
    console.error(`  expected (lock): ${kLock.sha256}`);
    console.error(`  actual (file):   ${actualSha}`);
    console.error('Refusing to parse (fail-closed per T0.3 review).');
    process.exit(1);
  }
  console.log(`✓ Input SHA256 verified against lock: ${actualSha.slice(0, 16)}...`);

  try {
    const { entries, skippedBadQc } = parseKanjidic(KANJIDIC_PATH);
    console.log(
      `Parsed ${entries.length} kanji entries (encountered+omitted ${skippedBadQc} skip/misclass q_codes — omitted by non-extraction)`
    );

    const { kanjiCount } = buildKanjiDb(entries);  // note: build now also asserts
    // re-obtain skipped? but parse already logged; assertion inside build
    const sha256 = writeManifest(kanjiCount);

    const sizeMB = (fs.statSync(OUTPUT_DB).size / (1024 * 1024)).toFixed(2);

    console.log(`\n✓ Created ${OUTPUT_DB}`);
    console.log(`✓ SHA256: ${sha256}`);
    console.log(`✓ Size: ${sizeMB} MB`);
    console.log(`✓ Manifest: ${OUTPUT_MANIFEST}`);
    console.log(`✓ Kanji count: ${kanjiCount}`);

    // Spot-check required literals (plausible readings/meanings)
    console.log('\nSpot-check (日 本 語 未 末):');
    const spotDb = new Database(OUTPUT_DB, { readonly: true });
    const spotStmt = spotDb.prepare('SELECT * FROM kanji WHERE literal = ?');
    for (const lit of ['日', '本', '語', '未', '末'] as const) {
      const row = spotStmt.get(lit) as KanjiRow & {
        codepoint: string;
        grade: number | null;
        stroke_count: number | null;
        freq: number | null;
        on_readings: string;
        kun_readings: string;
        meanings: string;
      } | undefined;
      if (row) {
        const on = JSON.parse(row.on_readings) as string[];
        const kun = JSON.parse(row.kun_readings) as string[];
        const mean = JSON.parse(row.meanings) as string[];
        console.log(
          `  ${lit}: code=U+${row.codepoint.toUpperCase()} grade=${row.grade} strokes=${row.stroke_count} freq=${row.freq}`
        );
        console.log(`    on: ${on.join(', ')}`);
        console.log(`    kun: ${kun.join(', ')}`);
        console.log(`    meanings: ${mean.slice(0, 3).join('; ')}`);
      } else {
        console.log(`  ${lit}: NOT FOUND`);
      }
    }
    spotDb.close();

    console.log('\n✓ Build complete.');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

main();

#!/usr/bin/env node
/**
 * Build words-core pack from JMdict_e
 *
 * Filters to entries with *_pri tags (news1/news2/ichi1/ichi2/spec1/spec2/gai1/gai2)
 * Creates SQLite database with:
 *   - entries table: id, common_score, data (JSON blob)
 *   - forms table: entry_id, form, kind ('kanji' | 'kana'), is_common
 *   - glosses table: entry_id, gloss (simple table for searching)
 *
 * Note: FTS5 virtual tables aren't available in sql.js, so we use a simpler
 * glosses table that can still be queried with LIKE patterns.
 *
 * Usage:
 *   npx tsx scripts/build-packs/build-words-core-pack.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as crypto from 'crypto';
import { createReadStream } from 'fs';
import initSqlJs from 'sql.js';

// Minimal XML parser using streaming/regex
interface JmdictEntry {
  ent_seq: number;
  kEle: Array<{ keb: string; keInf?: string[]; kePri?: string[] }>;
  rEle: Array<{
    reb: string;
    reNokanji?: boolean;
    reRestr?: string[];
    rePri?: string[];
  }>;
  sense: Array<{
    stagk?: string[];
    stagr?: string[];
    pos?: string[];
    xref?: string[];
    ant?: string[];
    field?: string[];
    misc?: string[];
    dial?: string[];
    gloss: Array<{ text: string; lang?: string }>;
  }>;
}

const JMDICT_PATH = path.join(
  process.cwd(),
  'scripts/build-packs/.cache/jmdict-2026-07-25.gz'
);
const OUTPUT_DIR = path.join(process.cwd(), 'packs');
const OUTPUT_DB = path.join(OUTPUT_DIR, 'words-core-v1.sqlite');
const OUTPUT_MANIFEST = path.join(OUTPUT_DIR, 'words-core-v1.manifest.json');

// Priority scoring for *_pri tags
const PRI_SCORE: Record<string, number> = {
  news1: 100,
  ichi1: 90,
  spec1: 80,
  news2: 70,
  ichi2: 60,
  spec2: 50,
  gai1: 40,
  gai2: 30,
};

interface ParseState {
  inEntry: boolean;
  inKEle: boolean;
  inREle: boolean;
  inSense: boolean;
  currentEntry: JmdictEntry | null;
  currentKEle: JmdictEntry['kEle'][0] | null;
  currentREle: JmdictEntry['rEle'][0] | null;
  currentSense: JmdictEntry['sense'][0] | null;
}

function parseJmdictLine(line: string, state: ParseState): JmdictEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Opening tags
  if (trimmed.startsWith('<entry>')) {
    state.inEntry = true;
    state.currentEntry = {
      ent_seq: 0,
      kEle: [],
      rEle: [],
      sense: [],
    };
  } else if (trimmed.startsWith('</entry>')) {
    state.inEntry = false;
    const result = state.currentEntry;
    state.currentEntry = null;
    return result;
  } else if (state.inEntry && trimmed.startsWith('<ent_seq>')) {
    const match = trimmed.match(/<ent_seq>(\d+)<\/ent_seq>/);
    if (match && state.currentEntry) {
      state.currentEntry.ent_seq = parseInt(match[1], 10);
    }
  } else if (state.inEntry && trimmed.startsWith('<k_ele>')) {
    state.inKEle = true;
    state.currentKEle = { keb: '', keInf: [], kePri: [] };
  } else if (state.inKEle && trimmed.startsWith('</k_ele>')) {
    state.inKEle = false;
    if (state.currentKEle && state.currentEntry) {
      state.currentEntry.kEle.push(state.currentKEle);
    }
    state.currentKEle = null;
  } else if (state.inKEle && trimmed.startsWith('<keb>')) {
    const match = trimmed.match(/<keb>(.*?)<\/keb>/);
    if (match && state.currentKEle) {
      state.currentKEle.keb = match[1];
    }
  } else if (state.inKEle && trimmed.startsWith('<ke_inf>')) {
    const match = trimmed.match(/<ke_inf>(.*?)<\/ke_inf>/);
    if (match && state.currentKEle) {
      state.currentKEle.keInf!.push(match[1]);
    }
  } else if (state.inKEle && trimmed.startsWith('<ke_pri>')) {
    const match = trimmed.match(/<ke_pri>(.*?)<\/ke_pri>/);
    if (match && state.currentKEle) {
      state.currentKEle.kePri!.push(match[1]);
    }
  } else if (state.inEntry && trimmed.startsWith('<r_ele>')) {
    state.inREle = true;
    state.currentREle = { reb: '', reNokanji: false, reRestr: [], rePri: [] };
  } else if (state.inREle && trimmed.startsWith('</r_ele>')) {
    state.inREle = false;
    if (state.currentREle && state.currentEntry) {
      state.currentEntry.rEle.push(state.currentREle);
    }
    state.currentREle = null;
  } else if (state.inREle && trimmed.startsWith('<reb>')) {
    const match = trimmed.match(/<reb>(.*?)<\/reb>/);
    if (match && state.currentREle) {
      state.currentREle.reb = match[1];
    }
  } else if (state.inREle && trimmed.includes('<re_nokanji/>')) {
    if (state.currentREle) {
      state.currentREle.reNokanji = true;
    }
  } else if (state.inREle && trimmed.startsWith('<re_restr>')) {
    const match = trimmed.match(/<re_restr>(.*?)<\/re_restr>/);
    if (match && state.currentREle) {
      state.currentREle.reRestr!.push(match[1]);
    }
  } else if (state.inREle && trimmed.startsWith('<re_pri>')) {
    const match = trimmed.match(/<re_pri>(.*?)<\/re_pri>/);
    if (match && state.currentREle) {
      state.currentREle.rePri!.push(match[1]);
    }
  } else if (state.inEntry && trimmed.startsWith('<sense>')) {
    state.inSense = true;
    state.currentSense = {
      stagk: [],
      stagr: [],
      pos: [],
      xref: [],
      ant: [],
      field: [],
      misc: [],
      dial: [],
      gloss: [],
    };
  } else if (state.inSense && trimmed.startsWith('</sense>')) {
    state.inSense = false;
    if (state.currentSense && state.currentEntry) {
      state.currentEntry.sense.push(state.currentSense);
    }
    state.currentSense = null;
  } else if (state.inSense && trimmed.startsWith('<pos>')) {
    const match = trimmed.match(/<pos>(.*?)<\/pos>/);
    if (match && state.currentSense) {
      state.currentSense.pos!.push(match[1]);
    }
  } else if (state.inSense && trimmed.startsWith('<misc>')) {
    const match = trimmed.match(/<misc>(.*?)<\/misc>/);
    if (match && state.currentSense) {
      state.currentSense.misc!.push(match[1]);
    }
  } else if (state.inSense && trimmed.startsWith('<field>')) {
    const match = trimmed.match(/<field>(.*?)<\/field>/);
    if (match && state.currentSense) {
      state.currentSense.field!.push(match[1]);
    }
  } else if (state.inSense && trimmed.startsWith('<dial>')) {
    const match = trimmed.match(/<dial>(.*?)<\/dial>/);
    if (match && state.currentSense) {
      state.currentSense.dial!.push(match[1]);
    }
  } else if (state.inSense && trimmed.startsWith('<stagk>')) {
    const match = trimmed.match(/<stagk>(.*?)<\/stagk>/);
    if (match && state.currentSense) {
      state.currentSense.stagk!.push(match[1]);
    }
  } else if (state.inSense && trimmed.startsWith('<stagr>')) {
    const match = trimmed.match(/<stagr>(.*?)<\/stagr>/);
    if (match && state.currentSense) {
      state.currentSense.stagr!.push(match[1]);
    }
  } else if (
    state.inSense &&
    (trimmed.startsWith('<gloss') || trimmed.startsWith('<gloss>'))
  ) {
    // Extract gloss with optional xml:lang attribute
    const langMatch = trimmed.match(/xml:lang="([^"]*)"/);
    const textMatch = trimmed.match(/>([^<]*)</);
    if (state.currentSense) {
      state.currentSense.gloss.push({
        text: textMatch ? textMatch[1] : '',
        lang: langMatch ? langMatch[1] : 'eng', // Default to English
      });
    }
  }

  return null;
}

async function* parseJmdictStream(
  inputPath: string
): AsyncGenerator<JmdictEntry> {
  const state: ParseState = {
    inEntry: false,
    inKEle: false,
    inREle: false,
    inSense: false,
    currentEntry: null,
    currentKEle: null,
    currentREle: null,
    currentSense: null,
  };

  // Read gzip file and parse line by line
  const gunzip = zlib.createGunzip();
  const readStream = createReadStream(inputPath).pipe(gunzip);
  let lineBuffer = '';

  for await (const chunk of readStream) {
    const str = chunk.toString('utf8');
    lineBuffer += str;

    const lines = lineBuffer.split('\n');
    lineBuffer = lines[lines.length - 1]; // Keep incomplete line

    for (let i = 0; i < lines.length - 1; i++) {
      const entry = parseJmdictLine(lines[i], state);
      if (entry) {
        yield entry;
      }
    }
  }

  // Process any remaining data
  if (lineBuffer) {
    const entry = parseJmdictLine(lineBuffer, state);
    if (entry) {
      yield entry;
    }
  }
}

function hasCommonScore(entry: JmdictEntry): number {
  let maxScore = 0;

  // Check k_ele pri tags
  for (const kEle of entry.kEle) {
    if (kEle.kePri) {
      for (const pri of kEle.kePri) {
        if (pri in PRI_SCORE) {
          maxScore = Math.max(maxScore, PRI_SCORE[pri]);
        }
      }
    }
  }

  // Check r_ele pri tags
  for (const rEle of entry.rEle) {
    if (rEle.rePri) {
      for (const pri of rEle.rePri) {
        if (pri in PRI_SCORE) {
          maxScore = Math.max(maxScore, PRI_SCORE[pri]);
        }
      }
    }
  }

  return maxScore;
}

async function buildWordsCoreDB(): Promise<{
  entryCount: number;
  formCount: number;
  glossCount: number;
}> {
  // Initialize SQL.js
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  // Create schema
  db.run(`
    CREATE TABLE entries (
      id INTEGER PRIMARY KEY,
      common_score INTEGER NOT NULL,
      data BLOB NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE forms (
      entry_id INTEGER NOT NULL,
      form TEXT NOT NULL,
      kind TEXT NOT NULL,
      is_common INTEGER NOT NULL,
      FOREIGN KEY (entry_id) REFERENCES entries(id)
    );
  `);

  db.run(`CREATE INDEX idx_forms_form ON forms(form);`);

  // Simple glosses table for searching (no FTS5 in sql.js)
  db.run(`
    CREATE TABLE glosses (
      entry_id INTEGER NOT NULL,
      gloss TEXT NOT NULL,
      FOREIGN KEY (entry_id) REFERENCES entries(id)
    );
  `);

  let entryCount = 0;
  let formCount = 0;
  let glossCount = 0;
  let filteredCount = 0;

  const insertEntry = db.prepare(
    'INSERT INTO entries (id, common_score, data) VALUES (?, ?, ?)'
  );
  const insertForm = db.prepare(
    'INSERT INTO forms (entry_id, form, kind, is_common) VALUES (?, ?, ?, ?)'
  );
  const insertGloss = db.prepare(
    'INSERT INTO glosses (entry_id, gloss) VALUES (?, ?)'
  );

  // Parse and insert entries
  for await (const entry of parseJmdictStream(JMDICT_PATH)) {
    const score = hasCommonScore(entry);

    // Only include entries with pri tags
    if (score === 0) {
      continue;
    }

    filteredCount++;

    // Use entry sequence as ID
    const entryId = entry.ent_seq;

    // Insert entry with full data as JSON
    const entryData = JSON.stringify({
      seq: entry.ent_seq,
      kanji: entry.kEle.map((k) => ({
        text: k.keb,
        info: k.keInf || [],
        pri: k.kePri || [],
      })),
      kana: entry.rEle.map((r) => ({
        text: r.reb,
        nokanji: r.reNokanji || false,
        restr: r.reRestr || [],
        pri: r.rePri || [],
      })),
      senses: entry.sense,
    });

    insertEntry.bind([entryId, score, entryData]).step();
    insertEntry.reset();
    entryCount++;

    // Insert kanji forms
    for (const kEle of entry.kEle) {
      const isCommon = kEle.kePri && kEle.kePri.length > 0 ? 1 : 0;
      insertForm.bind([entryId, kEle.keb, 'kanji', isCommon]).step();
      insertForm.reset();
      formCount++;
    }

    // Insert kana forms
    for (const rEle of entry.rEle) {
      const isCommon = rEle.rePri && rEle.rePri.length > 0 ? 1 : 0;
      insertForm.bind([entryId, rEle.reb, 'kana', isCommon]).step();
      insertForm.reset();
      formCount++;
    }

    // Insert glosses for searching
    for (const sense of entry.sense) {
      for (const gloss of sense.gloss) {
        // Only include English glosses (lang is 'eng' or undefined, which defaults to eng)
        if (!gloss.lang || gloss.lang === 'eng') {
          insertGloss.bind([entryId, gloss.text]).step();
          insertGloss.reset();
          glossCount++;
        }
      }
    }

    if (filteredCount % 1000 === 0) {
      console.log(`Processed ${filteredCount} entries...`);
    }
  }

  // Export database to binary
  const data = db.export();
  const buffer = Buffer.from(data);

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Write database file
  fs.writeFileSync(OUTPUT_DB, buffer);

  console.log(
    `Built words-core: ${entryCount} entries, ${formCount} forms, ${glossCount} glosses`
  );

  return { entryCount, formCount, glossCount };
}

async function writeManifest(stats: {
  entryCount: number;
  formCount: number;
  glossCount: number;
}): Promise<string> {
  const dbStats = fs.statSync(OUTPUT_DB);
  const dbContent = fs.readFileSync(OUTPUT_DB);
  const sha256 = crypto
    .createHash('sha256')
    .update(dbContent)
    .digest('hex');

  const manifest = {
    id: 'words-core',
    version: 'v1',
    schemaVersion: 1,
    sha256,
    sizeBytes: dbStats.size,
    license: 'CC BY-SA 4.0',
    attribution:
      'JMdict — © Electronic Dictionary Research and Development Group, Monash University. Used under CC BY-SA 4.0. Modified: converted to a database format, some fields omitted, filtered to common-tagged entries.',
    sources: [
      {
        id: 'jmdict',
        name: 'JMdict_e (English only)',
        license: 'CC BY-SA 4.0',
        url: 'http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz',
      },
    ],
    stats,
  };

  fs.writeFileSync(OUTPUT_MANIFEST, JSON.stringify(manifest, null, 2));

  return sha256;
}

async function main() {
  console.log('Building words-core pack from JMdict...');

  if (!fs.existsSync(JMDICT_PATH)) {
    console.error(`JMdict source not found at ${JMDICT_PATH}`);
    console.error('Run: npx tsx scripts/build-packs/fetch-sources.ts');
    process.exit(1);
  }

  try {
    const stats = await buildWordsCoreDB();
    const sha256 = await writeManifest(stats);

    console.log(`✓ Created ${OUTPUT_DB}`);
    console.log(`✓ SHA256: ${sha256}`);
    console.log(
      `✓ Size: ${(fs.statSync(OUTPUT_DB).size / 1024 / 1024).toFixed(2)} MB`
    );
    console.log(`✓ Manifest: ${OUTPUT_MANIFEST}`);
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

main();

#!/usr/bin/env node
/**
 * Phase-0 pack pipeline assertions.  CI uses only committed fixtures; --mode
 * full validates cached, locked inputs and production packs after the source
 * refresh job has downloaded them.  Compression is intentionally done here,
 * rather than in each builder, so all current and future builders share one
 * deterministic publishing rule.
 */
import { brotliCompressSync, constants as zlibConstants } from 'node:zlib';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const brotliOptions = { params: {
  [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
  [zlibConstants.BROTLI_PARAM_LGWIN]: 22,
  [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_GENERIC,
} };

export function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function sourceEntries(sources) {
  const entries = [];
  for (const [id, source] of Object.entries(sources)) {
    if (source.sha256) entries.push([id, source]);
    for (const [componentId, component] of Object.entries(source.components ?? {})) {
      entries.push([`${id}.${componentId}`, component]);
    }
  }
  return entries;
}

/** Validates lock syntax always and cached source/license bytes when present/required. */
export function assertSourceIntegrity(lockPath, cacheDir, { requireCached = false } = {}) {
  const lock = readJson(lockPath);
  assert(lock.sources && typeof lock.sources === 'object', 'sources.lock.json has no sources');
  for (const [id, source] of Object.entries(lock.sources)) {
    // Generator-only assets (for example the checked-in pinned font) are not
    // cache artifacts and are verified by their consuming builder instead.
    if (source.cacheRequired === false) continue;
    assert(isHash(source.licenseHash), `${id} has no valid licenseHash`);
    const licenseFile = source.licenseFile;
    const explicit = licenseFile && join(cacheDir, licenseFile);
    const candidates = explicit ? [explicit] : readdirSync(cacheDir, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.includes(id) && entry.name.includes('license'))
      .map(entry => join(cacheDir, entry.name));
    const matching = candidates.some(filePath => sha256(readFileSync(filePath)) === source.licenseHash);
    if (candidates.length > 0 || requireCached) assert(matching, `${id} license hash changed`);
  }
  for (const [id, source] of sourceEntries(lock.sources)) {
    if (source.cacheRequired === false) continue;
    assert(isHash(source.sha256), `${id} has no valid source sha256`);
    const file = source.file ?? (!id.includes('.') ? `${source.id}-${source.pinned}${extname(new URL(source.url).pathname) || '.bin'}` : undefined);
    if (file && existsSync(join(cacheDir, file))) {
      assert(sha256(readFileSync(join(cacheDir, file))) === source.sha256, `${id} source hash changed`);
    } else if (requireCached && file) {
      throw new Error(`ASSERTION FAILED: ${id} cached source missing: ${file}`);
    }
  }
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

export function manifestFiles(packDir) {
  return walk(packDir).filter(file => basename(file) === 'manifest.json' || file.endsWith('.manifest.json'));
}

function claimedCount(manifest) {
  const stats = manifest.stats ?? {};
  return stats.kanjiCount ?? stats.entryCount ?? stats.sentenceCount;
}

function derivedCount(manifestFile, manifest) {
  const dir = join(manifestFile, '..');
  if (['kanji', 'words-core', 'sentences'].includes(manifest.id)) {
    const table = { kanji: 'kanji', 'words-core': 'entries', sentences: 'sentences' }[manifest.id];
    const stem = basename(manifestFile).replace('.manifest.json', '');
    const database = new Database(join(dir, `${stem}.sqlite`), { readonly: true });
    try { return database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count; } finally { database.close(); }
  }
  if (manifest.id === 'similar') return Object.keys(readJson(join(dir, 'similar.json'))).length;
  if (manifest.id === 'decks') return Array.isArray(manifest.decks) ? manifest.decks.length : undefined;
  if (Array.isArray(manifest.chunks)) return manifest.chunks.reduce((total, chunk) => total + Object.keys(readJson(join(dir, chunk.filename))).length, 0);
  return undefined;
}

export function assertPackManifests(packDir, baselines, budgets, fixture = false) {
  const manifests = manifestFiles(packDir);
  assert(manifests.length > 0, `no pack manifests found in ${packDir}`);
  for (const file of manifests) {
    const manifest = readJson(file);
    assert(typeof manifest.id === 'string' && manifest.id.length > 0, `${file} lacks id`);
    assert(typeof manifest.license === 'string' && manifest.license.trim(), `${manifest.id} manifest lacks license`);
    assert(typeof manifest.attribution === 'string' && manifest.attribution.trim(), `${manifest.id} manifest lacks attribution`);
    const count = derivedCount(file, manifest);
    const claim = claimedCount(manifest);
    const baseline = (fixture ? baselines.fixtureCounts : baselines.counts)[manifest.id];
    if (baseline !== undefined) {
      assert(typeof count === 'number', `${manifest.id} has no derivable artifact count`);
      assert(claim === count, `${manifest.id} manifest count ${claim} does not match derived artifact count ${count}`);
      const drift = Math.abs(count - baseline) / baseline * 100;
      assert(drift <= baselines.maxDriftPercent, `${manifest.id} count drift ${drift.toFixed(2)}% exceeds ${baselines.maxDriftPercent}%`);
    }
    const budget = (fixture ? budgets.fixtureMaxBytes : budgets.maxBytes)[manifest.id];
    if (budget !== undefined) {
      const size = Array.isArray(manifest.brotli)
        ? manifest.brotli.reduce((total, artifact) => total + artifact.sizeBytes, 0)
        : (manifest.sizeBytes ?? manifest.catalogSizeBytes);
      assert(typeof size === 'number' && size <= budget, `${manifest.id} exceeds declared pack budget`);
    }
  }
  return manifests;
}

export function assertNoSkipFields(packDir) {
  // Look for serialized query-code data, not ordinary English prose containing "skip".
  const forbidden = /(?:qc_type["']?\s*[=:]\s*["']?(?:skip|misclass)|skip_misclass|"(?:skip|misclass)"\s*:)/i;
  for (const file of walk(packDir).filter(file => !file.endsWith('.manifest.json') && basename(file) !== 'manifest.json' && !file.endsWith('.br'))) {
    assert(!forbidden.test(readFileSync(file).toString('utf8')), `surviving SKIP/misclassification field in ${file}`);
  }
}

function artifactsForManifest(manifestFile, manifest) {
  const dir = join(manifestFile, '..');
  if (Array.isArray(manifest.chunks)) return manifest.chunks.map(chunk => join(dir, chunk.filename));
  if (Array.isArray(manifest.decks)) return manifest.decks.map(deck => join(dir, deck.file));
  if (manifest.id === 'similar') return [join(dir, 'similar.json')];
  const stem = basename(manifestFile).replace('.manifest.json', '');
  return ['.sqlite', '.json'].map(extension => join(dir, `${stem}${extension}`)).filter(existsSync);
}

export function assertAndWriteDeterministicBrotli(packDir, { write = false } = {}) {
  const result = [];
  for (const manifestFile of manifestFiles(packDir)) {
    const manifest = readJson(manifestFile);
    const compressed = [];
    for (const artifact of artifactsForManifest(manifestFile, manifest)) {
      assert(existsSync(artifact), `${manifest.id} artifact missing: ${artifact}`);
      const input = readFileSync(artifact);
      const first = brotliCompressSync(input, brotliOptions);
      const second = brotliCompressSync(input, brotliOptions);
      assert(first.equals(second), `${manifest.id} Brotli output is not deterministic`);
      const record = { file: `${basename(artifact)}.br`, sha256: sha256(first), sizeBytes: first.length };
      compressed.push(record);
      if (write) writeFileSync(`${artifact}.br`, first);
    }
    assert(compressed.length > 0, `${manifest.id} has no publishable artifact to Brotli-compress`);
    if (write) {
      manifest.brotli = compressed;
      writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    }
    result.push(...compressed);
  }
  return result;
}

export function runAssertions({ packDir, lockPath, cacheDir, fixture = false, requireCached = false, writeBrotli = false }) {
  assertSourceIntegrity(lockPath, cacheDir, { requireCached });
  const baselines = readJson(join(root, 'scripts/build-packs/pack-baselines.json'));
  const budgets = readJson(join(root, 'scripts/build-packs/pack-budgets.json'));
  assertNoSkipFields(packDir);
  const compressed = assertAndWriteDeterministicBrotli(packDir, { write: writeBrotli });
  assertPackManifests(packDir, baselines, budgets, fixture);
  return compressed;
}

function usage() {
  console.error('Usage: node scripts/build-packs/pipeline.mjs --mode ci|full');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[process.argv.indexOf('--mode') + 1] ?? 'ci';
  if (!['ci', 'full'].includes(mode)) { usage(); process.exit(2); }
  try {
    const fixture = mode === 'ci';
    const base = fixture ? join(root, 'scripts/build-packs/fixtures') : join(root, 'scripts/build-packs/.cache');
    const records = runAssertions({
      packDir: fixture ? join(root, 'packs-dev') : join(root, 'packs'),
      lockPath: fixture ? join(base, 'sources.lock.json') : join(root, 'scripts/build-packs/sources.lock.json'),
      cacheDir: base,
      fixture,
      requireCached: !fixture,
      writeBrotli: mode === 'full',
    });
    console.log(`✓ Phase 0 ${mode} pipeline passed (${records.length} deterministic Brotli artifacts checked)`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

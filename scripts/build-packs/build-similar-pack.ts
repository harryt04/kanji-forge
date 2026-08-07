#!/usr/bin/env node
/** Build packs/similar.json from validated KanjiVG and KANJIDIC2 packs. */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const ROOT = process.cwd();
const PACKS = path.join(ROOT, 'packs');
const STROKES_DIR = path.join(PACKS, 'strokes');
const KANJI_DB = path.join(PACKS, 'kanji-v1.sqlite');
const KANJI_MANIFEST = path.join(PACKS, 'kanji-v1.manifest.json');
const STROKES_MANIFEST = path.join(STROKES_DIR, 'manifest.json');
const SOURCES_LOCK = path.join(ROOT, 'scripts/build-packs/sources.lock.json');
const FONT_PATH = path.join(ROOT, 'scripts/build-packs/assets/NotoSerifJP-Regular.otf');
const OUTPUT = path.join(PACKS, 'similar.json');
const MANIFEST = path.join(PACKS, 'similar.manifest.json');
const CHECKLIST = path.join(PACKS, 'similar-curation-checklist.md');
const SIZE = 64;
const WORDS = (SIZE * SIZE) / 32;
const THRESHOLD = 0.48;
const FONT_ID = 'noto-serif-jp';
type SharpFactory = typeof import('sharp');
let rasterizer: SharpFactory | undefined;

interface ComponentNode { element: string; children?: ComponentNode[] }
interface StrokeEntry { character: string; paths: string[]; components: ComponentNode }
interface KanjiRow { literal: string; radical_classical: number | null; stroke_count: number | null; freq: number | null }
interface Entry extends KanjiRow { components: string[]; pixels: Uint32Array }
interface Source { id: string; url: string; pinned: string; sha256: string; license: string; licenseHash?: string; fontFile?: { path: string; sha256: string } }
interface PackInput { id: string; sha256: string; manifestSha256: string; chunks?: Array<{ filename: string; sha256: string }> }

/** Single-stroke KanjiVG elements are too broad to be useful candidate evidence. */
export const TRIVIAL_COMPONENTS = new Set(['一', '丨', '丿', '丶', '乙', '亅']);

function sha256File(file: string): string { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function sha256Text(text: string): string { return crypto.createHash('sha256').update(text).digest('hex'); }
async function getRasterizer(): Promise<SharpFactory> {
  if (rasterizer) return rasterizer;
  try { const loaded = await import('sharp') as SharpFactory & { default?: SharpFactory }; rasterizer = loaded.default ?? loaded; return rasterizer; }
  catch { throw new Error('Missing required sharp dependency for pinned-font glyph rasterization; run pnpm install.'); }
}
function readJson(file: string): unknown { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}: expected an object`);
  return value as Record<string, unknown>;
}
function stringField(value: Record<string, unknown>, field: string, label: string): string {
  if (typeof value[field] !== 'string' || !value[field]) throw new Error(`Invalid ${label}: missing ${field}`);
  return value[field] as string;
}
function sourceFromLock(lock: Record<string, unknown>, id: string): Source {
  const source = object(object(lock.sources, 'sources.lock.json.sources')[id], `sources.lock.json ${id}`);
  const result: Source = { id: stringField(source, 'id', id), url: stringField(source, 'url', id), pinned: stringField(source, 'pinned', id), sha256: stringField(source, 'sha256', id), license: stringField(source, 'license', id) };
  if (result.id !== id || !/^[a-f0-9]{64}$/.test(result.sha256)) throw new Error(`Invalid source identity for ${id} in sources.lock.json`);
  if (typeof source.licenseHash === 'string') result.licenseHash = source.licenseHash;
  if (source.fontFile) {
    const fontFile = object(source.fontFile, `${id}.fontFile`);
    result.fontFile = { path: stringField(fontFile, 'path', `${id}.fontFile`), sha256: stringField(fontFile, 'sha256', `${id}.fontFile`) };
  }
  return result;
}

function assertSourceIdentity(manifestSource: unknown, source: Source, label: string): void {
  const actual = object(manifestSource, `${label} source`);
  if (stringField(actual, 'id', label) !== source.id || stringField(actual, 'url', label) !== source.url) throw new Error(`Invalid ${label} source identity; it does not match sources.lock.json`);
  if ('pinned' in actual && actual.pinned !== source.pinned) throw new Error(`Invalid ${label} source pin; it does not match sources.lock.json`);
  if (stringField(actual, 'sha256', `${label} source`) !== source.sha256) throw new Error(`Invalid ${label} source hash; it does not match sources.lock.json`);
}

function validateInputs(): { kanjidic2: Source; kanjivg: Source; font: Source; inputs: PackInput[] } {
  for (const file of [KANJI_DB, KANJI_MANIFEST, STROKES_MANIFEST, SOURCES_LOCK, FONT_PATH]) {
    if (!fs.existsSync(file)) throw new Error(`Missing required similar-pack input: ${file}`);
  }
  const lock = object(readJson(SOURCES_LOCK), 'sources.lock.json');
  const kanjidic2 = sourceFromLock(lock, 'kanjidic2');
  const kanjivg = sourceFromLock(lock, 'kanjivg');
  const font = sourceFromLock(lock, FONT_ID);
  if (!font.fontFile || font.fontFile.path !== 'scripts/build-packs/assets/NotoSerifJP-Regular.otf') throw new Error('sources.lock.json has no valid pinned Noto Serif JP font file');
  const fontHash = sha256File(FONT_PATH);
  if (fontHash !== font.fontFile.sha256) throw new Error(`Pinned font SHA256 mismatch: expected ${font.fontFile.sha256}, got ${fontHash}`);

  const kanjiManifestText = fs.readFileSync(KANJI_MANIFEST, 'utf8');
  const kanjiManifest = object(JSON.parse(kanjiManifestText), 'kanji-v1.manifest.json');
  if (stringField(kanjiManifest, 'id', 'kanji-v1.manifest.json') !== 'kanji' || kanjiManifest.version !== 'v1') throw new Error('Invalid kanji-v1 manifest identity');
  const kanjiHash = sha256File(KANJI_DB);
  if (kanjiHash !== stringField(kanjiManifest, 'sha256', 'kanji-v1.manifest.json')) throw new Error(`kanji-v1.sqlite SHA256 mismatch: expected ${kanjiManifest.sha256}, got ${kanjiHash}`);
  const kanjiSources = kanjiManifest.sources;
  if (!Array.isArray(kanjiSources) || kanjiSources.length !== 1) throw new Error('Invalid kanji-v1 manifest sources');
  assertSourceIdentity(kanjiSources[0], kanjidic2, 'kanji-v1');

  const strokesManifestText = fs.readFileSync(STROKES_MANIFEST, 'utf8');
  const strokesManifest = object(JSON.parse(strokesManifestText), 'strokes/manifest.json');
  if (stringField(strokesManifest, 'id', 'strokes/manifest.json') !== 'strokes-v1') throw new Error('Invalid strokes manifest identity');
  const strokesSources = strokesManifest.sources;
  if (!Array.isArray(strokesSources) || strokesSources.length !== 1) throw new Error('Invalid strokes manifest sources');
  assertSourceIdentity(strokesSources[0], kanjivg, 'strokes');
  if (!Array.isArray(strokesManifest.chunks) || !strokesManifest.chunks.length) throw new Error('Invalid strokes manifest chunks');
  const chunks = strokesManifest.chunks.map((value) => {
    const chunk = object(value, 'strokes manifest chunk');
    const filename = stringField(chunk, 'filename', 'strokes manifest chunk');
    const expectedHash = stringField(chunk, 'sha256', 'strokes manifest chunk');
    if (!/^strokes-[A-Za-z0-9_-]+\.json$/.test(filename) || path.basename(filename) !== filename) throw new Error(`Invalid strokes chunk filename: ${filename}`);
    const file = path.join(STROKES_DIR, filename);
    if (!fs.existsSync(file)) throw new Error(`Missing strokes chunk listed in manifest: ${filename}`);
    const actualHash = sha256File(file);
    if (actualHash !== expectedHash) throw new Error(`Strokes chunk SHA256 mismatch for ${filename}: expected ${expectedHash}, got ${actualHash}`);
    return { filename, sha256: actualHash };
  });
  if (new Set(chunks.map((chunk) => chunk.filename)).size !== chunks.length) throw new Error('Invalid strokes manifest: duplicate chunk filename');
  const combinedHash = sha256Text(chunks.map((chunk) => chunk.sha256).join(''));
  if (combinedHash !== stringField(strokesManifest, 'sha256', 'strokes/manifest.json')) throw new Error(`Strokes pack SHA256 mismatch: expected ${strokesManifest.sha256}, got ${combinedHash}`);
  return { kanjidic2, kanjivg, font, inputs: [{ id: 'kanji-v1.sqlite', sha256: kanjiHash, manifestSha256: sha256Text(kanjiManifestText) }, { id: 'strokes-v1', sha256: combinedHash, manifestSha256: sha256Text(strokesManifestText), chunks }] };
}

function setPixel(pixels: Uint32Array, x: number, y: number): void { const index = (y * SIZE + x) >>> 5; pixels[index] = pixels[index]! | (1 << ((y * SIZE + x) & 31)); }

/** Rasterize one glyph through pinned Noto Serif JP using sharp/libvips (no DOM or canvas). */
export async function rasterizeGlyph(literal: string): Promise<Uint32Array> {
  if ([...literal].length !== 1) throw new Error(`Expected one glyph, got ${literal}`);
  const sharp = await getRasterizer();
  const rendered = await sharp({ text: { text: literal, font: 'Noto Serif JP', fontfile: FONT_PATH, width: SIZE, height: SIZE, align: 'centre', rgba: true } }).raw().toBuffer({ resolveWithObject: true });
  if (rendered.info.width > SIZE || rendered.info.height > SIZE || rendered.info.channels !== 4) throw new Error(`Glyph rasterizer returned invalid ${rendered.info.width}x${rendered.info.height}x${rendered.info.channels} image`);
  const { data, info } = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: rendered.data, raw: rendered.info, left: Math.floor((SIZE - rendered.info.width) / 2), top: Math.floor((SIZE - rendered.info.height) / 2) }]).raw().toBuffer({ resolveWithObject: true });
  if (info.width !== SIZE || info.height !== SIZE || info.channels !== 4) throw new Error(`Glyph rasterizer canvas returned ${info.width}x${info.height}x${info.channels}, expected 64x64 RGBA`);
  const pixels = new Uint32Array(WORDS);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (data[(y * SIZE + x) * 4 + 3]! > 0) setPixel(pixels, x, y);
  return pixels;
}

function popcount(n: number): number { n -= (n >>> 1) & 0x55555555; n = (n & 0x33333333) + ((n >>> 2) & 0x33333333); return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; }
export function pixelDice(left: Uint32Array, right: Uint32Array): number { let leftCount = 0; let rightCount = 0; let intersection = 0; for (let i = 0; i < WORDS; i++) { leftCount += popcount(left[i]!); rightCount += popcount(right[i]!); intersection += popcount(left[i]! & right[i]!); } return leftCount + rightCount === 0 ? 0 : (2 * intersection) / (leftCount + rightCount); }

export function eligibleComponent(component: string): boolean { return !TRIVIAL_COMPONENTS.has(component); }
function components(node: ComponentNode, root: string, output = new Set<string>()): Set<string> { if (node.element !== root && /^[\u2e80-\u2eff\u3400-\u9fff\uf900-\ufaff]$/u.test(node.element) && eligibleComponent(node.element)) output.add(node.element); for (const child of node.children ?? []) components(child, root, output); return output; }
function intersectionSize(left: string[], right: string[]): number { const rightSet = new Set(right); return left.filter((item) => rightSet.has(item)).length; }
function compareStrings(left: string, right: string): number { return left.codePointAt(0)! - right.codePointAt(0)!; }
export function similarityScore(left: Pick<Entry, 'components' | 'stroke_count' | 'radical_classical' | 'pixels'>, right: Pick<Entry, 'components' | 'stroke_count' | 'radical_classical' | 'pixels'>): number { const overlap = intersectionSize(left.components, right.components); const component = overlap === 0 ? 0 : overlap / (left.components.length + right.components.length - overlap); const distance = left.stroke_count === null || right.stroke_count === null ? 2 : Math.abs(left.stroke_count - right.stroke_count); const stroke = distance === 0 ? 1 : distance === 1 ? 0.5 : 0; const radical = left.radical_classical !== null && left.radical_classical === right.radical_classical ? 1 : 0; return 0.35 * component + 0.15 * stroke + 0.15 * radical + 0.35 * pixelDice(left.pixels, right.pixels); }

async function loadEntries(chunks: Array<{ filename: string }>): Promise<Entry[]> {
  const strokeByCharacter = new Map<string, StrokeEntry>();
  for (const { filename } of chunks) for (const value of Object.values(readJson(path.join(STROKES_DIR, filename)) as Record<string, StrokeEntry>)) strokeByCharacter.set(value.character, value);
  const db = new Database(KANJI_DB, { readonly: true });
  const rows = db.prepare('SELECT literal, radical_classical, stroke_count, freq FROM kanji ORDER BY literal').all() as KanjiRow[];
  db.close();
  const entries: Entry[] = [];
  for (const row of rows) { const stroke = strokeByCharacter.get(row.literal); if (stroke && row.stroke_count !== null && row.radical_classical !== null) entries.push({ ...row, components: [...components(stroke.components, row.literal)].sort(compareStrings), pixels: await rasterizeGlyph(row.literal) }); }
  return entries.sort((a, b) => compareStrings(a.literal, b.literal));
}

function generate(entries: Entry[]): Record<string, string[]> {
  const byComponent = new Map<string, Set<number>>(); const byStrokeRadical = new Map<string, Set<number>>();
  entries.forEach((entry, index) => { for (const component of entry.components) { const values = byComponent.get(component) ?? new Set<number>(); values.add(index); byComponent.set(component, values); } for (let stroke = entry.stroke_count! - 1; stroke <= entry.stroke_count! + 1; stroke++) { const key = `${stroke}/${entry.radical_classical}`; const values = byStrokeRadical.get(key) ?? new Set<number>(); values.add(index); byStrokeRadical.set(key, values); } });
  const output: Record<string, string[]> = {};
  entries.forEach((entry, index) => { const candidates = new Set<number>(); for (const component of entry.components) for (const candidate of byComponent.get(component) ?? []) candidates.add(candidate); for (const candidate of byStrokeRadical.get(`${entry.stroke_count}/${entry.radical_classical}`) ?? []) candidates.add(candidate); candidates.delete(index); const matches = [...candidates].map((candidate) => { const other = entries[candidate]!; return { literal: other.literal, score: similarityScore(entry, other) }; }).filter((match) => match.score >= THRESHOLD).sort((a, b) => b.score - a.score || compareStrings(a.literal, b.literal)).slice(0, 6).map((match) => match.literal); if (matches.length) output[entry.literal] = matches; });
  return Object.fromEntries(Object.entries(output).sort(([a], [b]) => compareStrings(a, b)));
}
function assertKnownPairs(similar: Record<string, string[]>): void { for (const [left, right] of [['未', '末'], ['己', '已'], ['己', '巳'], ['已', '巳']] as const) if (!similar[left]?.includes(right) || !similar[right]?.includes(left)) throw new Error(`ASSERTION FAILED: expected known pair ${left}/${right} in both lookup lists`); }
function writeChecklist(entries: Entry[], similar: Record<string, string[]>): void { const frequent = entries.filter((entry) => entry.freq !== null).sort((a, b) => a.freq! - b.freq! || compareStrings(a.literal, b.literal)).slice(0, 200); const lines = ['# Similar-kanji manual curation checklist', '', 'Review the generated candidates for each of the 200 most frequent KANJIDIC2 kanji. Check useful confusions, remove false positives, and record any desired additions in the future curated override file.', '', `Generated deterministically from validated kanji-v1.sqlite, KanjiVG, and pinned Noto Serif JP; threshold ${THRESHOLD}, maximum six candidates.`, '']; for (const entry of frequent) lines.push(`- [ ] ${entry.literal} (freq ${entry.freq}): ${similar[entry.literal]?.join(', ') || 'no generated matches'}`); fs.writeFileSync(CHECKLIST, `${lines.join('\n')}\n`); }

async function main(): Promise<void> {
  const validated = validateInputs();
  const strokes = validated.inputs.find((input) => input.id === 'strokes-v1')!.chunks!;
  const entries = await loadEntries(strokes);
  const similar = generate(entries); assertKnownPairs(similar);
  const json = `${JSON.stringify(similar, null, 2)}\n`; JSON.parse(json); fs.writeFileSync(OUTPUT, json); writeChecklist(entries, similar);
  const sha256 = sha256Text(json);
  const source = (value: Source) => ({ id: value.id, url: value.url, pinned: value.pinned, sha256: value.sha256, license: value.license, ...(value.licenseHash ? { licenseHash: value.licenseHash } : {}) });
  fs.writeFileSync(MANIFEST, `${JSON.stringify({ id: 'similar', version: 'v1', schemaVersion: 1, sha256, sizeBytes: Buffer.byteLength(json), license: 'CC BY-SA 4.0', attribution: 'KanjiForge similar-kanji lookup, generated from KANJIDIC2, KanjiVG, and Noto Serif JP. Derived dataset released under CC BY-SA 4.0; KanjiVG source © Ulrich Apel, CC BY-SA 3.0; Noto Serif JP © The Noto Project Authors, SIL OFL 1.1.', sources: [source(validated.kanjidic2), source(validated.kanjivg), source(validated.font)], inputPacks: validated.inputs, rasterizer: { method: 'deterministic 64x64 pinned-font glyph rasterization via sharp/libvips (no browser DOM/canvas)', font: { family: 'Noto Serif JP', path: validated.font.fontFile!.path, sha256: validated.font.fontFile!.sha256, renderer: 'sharp@0.34.5' } }, scoring: '0.35 component Jaccard (excluding trivial KanjiVG stroke elements) + 0.15 stroke proximity + 0.15 radical identity + 0.35 64x64 common-font glyph raster Dice', threshold: THRESHOLD, maxMatches: 6 }, null, 2)}\n`);
  console.log(`✓ Validated kanji-v1.sqlite and ${strokes.length} consumed strokes chunks against manifests and sources.lock.json`); console.log(`✓ Generated ${Object.keys(similar).length} similar-kanji lists from ${entries.length} kanji`); console.log('✓ Assertion passed: known pairs 未/末 and 己/已/巳 are present bidirectionally'); console.log(`✓ SHA256: ${sha256}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });

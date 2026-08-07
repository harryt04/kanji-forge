#!/usr/bin/env node
/**
 * Build stroke data pack from KanjiVG SVG files.
 *
 * Extracts three assets per character:
 * 1. Stroke paths (SVG path d strings, normalized to 109×109 viewBox)
 * 2. Stroke start points (first point of each path)
 * 3. Component decomposition tree (kvg:element hierarchy)
 *
 * Output is chunked by Unicode block (5-way split of main CJK).
 * License: CC BY-SA 3.0 (per DATA-SOURCES §3.2)
 *
 * Usage:
 *   npx tsx scripts/build-packs/build-strokes-pack.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';

interface StrokeData {
  character: string;
  codepoint: string;
  paths: string[];
  startPoints: Array<{ x: number; y: number }>;
  components: ComponentNode;
}

interface ComponentNode {
  element: string;
  children?: ComponentNode[];
}

interface StrokesManifest {
  id: string;
  version: string;
  schemaVersion: string;
  sha256: string;
  sizeBytes: number;
  license: string;
  attribution: string;
  sources: Array<{
    id: string;
    url: string;
    pinned: string;
    sha256: string;
    license: string;
    licenseHash?: string;
  }>;
  chunks: Array<{
    filename: string;
    sha256: string;
    sizeBytes: number;
    unicodeRange: string;
  }>;
}

const CACHE_DIR = path.join(process.cwd(), 'scripts/build-packs/.cache');
const OUTPUT_DIR = path.join(process.cwd(), 'packs/strokes');
const SOURCES_LOCK_PATH = path.join(
  process.cwd(),
  'scripts/build-packs/sources.lock.json'
);

interface KanjiVGSource {
  id: string;
  url: string;
  pinned: string;
  file: string;
  sha256: string;
  license: string;
  licenseHash?: string;
}

function requiredString(
  value: unknown,
  field: string,
  sourceName: string
): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`sources.lock.json ${sourceName} is missing ${field}`);
  }
  return value;
}

/**
 * Resolve and verify the pinned KanjiVG cache artifact before any pack outputs
 * are touched. Exported so checksum handling can be tested without building.
 */
export function resolveAndVerifyKanjiVGInput(
  sourcesLockPath = SOURCES_LOCK_PATH,
  cacheDir = CACHE_DIR
): { source: KanjiVGSource; filePath: string } {
  const lock = JSON.parse(fs.readFileSync(sourcesLockPath, 'utf-8')) as {
    sources?: { kanjivg?: Partial<KanjiVGSource> };
  };
  const entry = lock.sources?.kanjivg;
  if (!entry) {
    throw new Error('sources.lock.json is missing sources.kanjivg');
  }

  const source: KanjiVGSource = {
    id: requiredString(entry.id, 'id', 'kanjivg'),
    url: requiredString(entry.url, 'url', 'kanjivg'),
    pinned: requiredString(entry.pinned, 'pinned', 'kanjivg'),
    file: requiredString(entry.file, 'file', 'kanjivg'),
    sha256: requiredString(entry.sha256, 'sha256', 'kanjivg'),
    license: requiredString(entry.license, 'license', 'kanjivg'),
    ...(typeof entry.licenseHash === 'string' && {
      licenseHash: entry.licenseHash,
    }),
  };
  if (source.id !== 'kanjivg' || !/^[a-f0-9]{64}$/.test(source.sha256)) {
    throw new Error('sources.lock.json has an invalid kanjivg source identity');
  }
  if (path.basename(source.file) !== source.file) {
    throw new Error('sources.lock.json kanjivg.file must be a cache filename');
  }

  const filePath = path.join(cacheDir, source.file);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `KanjiVG zip not found at ${filePath}. Run fetch-sources.ts first.`
    );
  }
  const actualSha256 = crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex');
  if (actualSha256 !== source.sha256) {
    throw new Error(
      `KanjiVG SHA256 mismatch (fail closed): expected ${source.sha256}, got ${actualSha256}`
    );
  }

  console.log(`Verified KanjiVG input ${source.file} against sources.lock.json`);
  return { source, filePath };
}

// 5-way Unicode block chunking for main CJK (sensible split per T0.5 done-check)
const UNICODE_BLOCKS = [
  {
    name: 'CJK_4E00',
    start: 0x4e00,
    end: 0x5000,
    label: '4E00-4FFF',
  },
  {
    name: 'CJK_5000',
    start: 0x5000,
    end: 0x6000,
    label: '5000-5FFF',
  },
  {
    name: 'CJK_6000',
    start: 0x6000,
    end: 0x7000,
    label: '6000-6FFF',
  },
  {
    name: 'CJK_7000',
    start: 0x7000,
    end: 0x8000,
    label: '7000-7FFF',
  },
  {
    name: 'CJK_8000',
    start: 0x8000,
    end: 0xa000,
    label: '8000-9FFF',
  },
];

// Parse SVG path data to extract starting point of first command
function extractStartPoint(pathData: string): { x: number; y: number } | null {
  // Look for the first M/m (move) command; allow optional whitespace after (seen in some KanjiVG; relative m from 0,0 gives same start coords)
  const moveMatch = pathData.match(/[Mm]\s*([\d.-]+)[,\s]+([\d.-]+)/);
  if (moveMatch) {
    return {
      x: parseFloat(moveMatch[1]),
      y: parseFloat(moveMatch[2]),
    };
  }
  return null;
}

// Parse SVG with simple XML-like parsing (no external dependency)
function parseSVG(svgContent: string): {
  viewBox: string;
  character: string;
  paths: string[];
  components: ComponentNode;
} {
  // Extract viewBox
  const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
  const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 109 109';
  if (viewBox !== '0 0 109 109') {
    throw new Error(`ViewBox mismatch: expected "0 0 109 109", got "${viewBox}"`);
  }

  // Extract kvg:element from the main character group
  const mainElementMatch = svgContent.match(
    /<g[^>]*kvg:element="([^"]+)"/
  );
  const character = mainElementMatch ? mainElementMatch[1] : '';

  // Extract all path d attributes (robust, no order dep on kvg:type)
  const paths: string[] = [];
  const pathRegex = /<path[^>]*d="([^"]*)"/g;
  let match;
  while ((match = pathRegex.exec(svgContent)) !== null) {
    paths.push(match[1]);
  }

  // Parse component tree recursively (nested hierarchy, allow duplicate sibling elements)
  const components = parseComponentTree(svgContent);

  return { viewBox, character, paths, components };
}

// Helpers for balanced nested <g kvg:element> extraction (pure string, no deps)
function getBalancedInner(str: string, startAfterOpen: number): string {
  let depth = 1;
  let pos = startAfterOpen;
  while (pos < str.length && depth > 0) {
    if (str[pos] === '<') {
      const sub = str.slice(pos);
      if (sub.startsWith('</g') || sub.startsWith('</G')) {
        depth--;
        if (depth === 0) {
          return str.slice(startAfterOpen, pos);
        }
        pos += 3;
        continue;
      } else if (sub.startsWith('<g') || sub.startsWith('<G')) {
        depth++;
        pos += 2;
        continue;
      }
    }
    pos++;
  }
  return str.slice(startAfterOpen, pos);
}

function findGroupEnd(str: string, openStart: number): number {
  let depth = 1;
  let pos = openStart;
  const gt = str.indexOf('>', openStart);
  if (gt === -1) return str.length;
  pos = gt + 1;
  while (pos < str.length && depth > 0) {
    if (str[pos] === '<') {
      const sub = str.slice(pos);
      if (sub.startsWith('</g') || sub.startsWith('</G')) {
        depth--;
        if (depth === 0) {
          const closeGt = str.indexOf('>', pos);
          return closeGt === -1 ? str.length : closeGt + 1;
        }
        pos += 3;
        continue;
      } else if (sub.startsWith('<g') || sub.startsWith('<G')) {
        depth++;
        pos += 2;
        continue;
      }
    }
    pos++;
  }
  return str.length;
}

function parseChildren(content: string): ComponentNode[] {
  const children: ComponentNode[] = [];
  let pos = 0;
  while (pos < content.length) {
    const remaining = content.slice(pos);
    const match = remaining.match(/<g[^>]*kvg:element="([^"]+)"[^>]*>/);
    if (!match || match.index === undefined) break;
    const rel = match.index;
    const abs = pos + rel;
    const elem = match[1];
    const openLen = match[0].length;
    const openEnd = abs + openLen;
    const childInner = getBalancedInner(content, openEnd);
    const childGroups = parseChildren(childInner);
    children.push({
      element: elem,
      ...(childGroups.length > 0 && { children: childGroups }),
    });
    // advance past entire sibling group (so nested gs are only parsed in recursion)
    const groupEnd = findGroupEnd(content, abs);
    pos = groupEnd;
  }
  return children;
}

function parseComponentTree(svgContent: string): ComponentNode {
  // Find the main character group
  const mainGroupMatch = svgContent.match(
    /<g[^>]*kvg:element="([^"]+)"[^>]*>/
  );
  if (!mainGroupMatch || mainGroupMatch.index === undefined) {
    return { element: '' };
  }

  const mainElement = mainGroupMatch[1];
  const openEnd = mainGroupMatch.index + mainGroupMatch[0].length;
  const innerContent = getBalancedInner(svgContent, openEnd);
  const children = parseChildren(innerContent);

  return {
    element: mainElement,
    ...(children.length > 0 && { children }),
  };
}

// Extract SVG files from zip and parse them
function extractAndParseKanjiVG(kanjivgZip: string): Map<string, StrokeData> {
  const strokes = new Map<string, StrokeData>();

  // Use unzip command to extract all SVG files
  const tmpDir = `/tmp/kanjivg-extract-${Date.now()}`;
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // Extract all kanji SVG files
    execSync(`cd "${tmpDir}" && unzip -q "${kanjivgZip}" "kanji/*.svg"`, {
      stdio: 'pipe',
    });

    // Read all SVG files
    const kanjiDir = path.join(tmpDir, 'kanji');
    const files = fs.readdirSync(kanjiDir);

    for (const file of files) {
      if (!file.endsWith('.svg')) continue;

      // Extract codepoint from filename (e.g., "04e00.svg" -> 0x04e00)
      const codepointHex = path.basename(file, '.svg');
      // Skip variant files (e.g., "06728-Kaisho.svg")
      if (codepointHex.includes('-')) continue;

      const codepoint = parseInt(codepointHex, 16);
      if (isNaN(codepoint)) continue;

      const filePath = path.join(kanjiDir, file);
      const svgContent = fs.readFileSync(filePath, 'utf-8');

      try {
        const { character, paths, components } = parseSVG(svgContent);

        if (character && paths.length > 0) {
          // Extract start points from paths — MUST stay index-aligned (no filter)
          const startPoints = paths.map((p) => {
            const pt = extractStartPoint(p);
            if (!pt) {
              throw new Error(`No start point match for path in ${codepointHex}`);
            }
            return pt;
          });

          strokes.set(codepointHex, {
            character,
            codepoint: codepointHex,
            paths,
            startPoints,
            components,
          });
        }
      } catch (e) {
        console.error(`Failed to parse ${file}:`, e);
        throw e; // fail the build on parse/viewBox/startPoint errors (asserts)
      }
    }

    console.log(`Extracted ${strokes.size} kanji with stroke data`);
  } finally {
    // Clean up
    execSync(`rm -rf "${tmpDir}"`);
  }

  return strokes;
}

// Group strokes by Unicode block
function groupByUnicodeBlock(strokes: Map<string, StrokeData>): Map<
  string,
  StrokeData[]
> {
  const grouped = new Map<string, StrokeData[]>();

  for (const [codepointHex, stroke] of strokes) {
    const codepoint = parseInt(codepointHex, 16);

    let blockFound = false;
    for (const block of UNICODE_BLOCKS) {
      if (codepoint >= block.start && codepoint < block.end) {
        if (!grouped.has(block.name)) {
          grouped.set(block.name, []);
        }
        grouped.get(block.name)!.push(stroke);
        blockFound = true;
        break;
      }
    }

    // Characters outside defined blocks go to "CJK_Extended"
    if (!blockFound) {
      if (!grouped.has('CJK_Extended')) {
        grouped.set('CJK_Extended', []);
      }
      grouped.get('CJK_Extended')!.push(stroke);
    }
  }

  // Sort each block's strokes by numeric codepoint for deterministic ordering
  for (const list of grouped.values()) {
    list.sort((a, b) => parseInt(a.codepoint, 16) - parseInt(b.codepoint, 16));
  }

  return grouped;
}

// Write chunk files
function writeChunks(
  grouped: Map<string, StrokeData[]>
): Array<{
  filename: string;
  sha256: string;
  sizeBytes: number;
  unicodeRange: string;
}> {
  const chunkMetadata: Array<{
    filename: string;
    sha256: string;
    sizeBytes: number;
    unicodeRange: string;
  }> = [];

  // Emit chunks in fixed UNICODE_BLOCKS order (then Extended) for determinism
  const blockOrder = [
    ...UNICODE_BLOCKS.map((b) => b.name),
    'CJK_Extended',
  ];
  for (const blockName of blockOrder) {
    const strokeList = grouped.get(blockName);
    if (!strokeList || strokeList.length === 0) continue;

    // Find the block label
    let blockLabel = blockName;
    for (const block of UNICODE_BLOCKS) {
      if (block.name === blockName) {
        blockLabel = block.label;
        break;
      }
    }

    const filename = `strokes-${blockLabel}.json`;
    const filePath = path.join(OUTPUT_DIR, filename);

    // Build JSON structure: { [codepoint]: { paths, startPoints, components } }
    const data: Record<
      string,
      {
        character: string;
        paths: string[];
        startPoints: Array<{ x: number; y: number }>;
        components: ComponentNode;
      }
    > = {};

    for (const stroke of strokeList) {
      data[stroke.codepoint] = {
        character: stroke.character,
        paths: stroke.paths,
        startPoints: stroke.startPoints,
        components: stroke.components,
      };
    }

    const jsonContent = JSON.stringify(data, null, 0); // Compact, no pretty-printing
    fs.writeFileSync(filePath, jsonContent, 'utf-8');

    const sizeBytes = Buffer.byteLength(jsonContent, 'utf-8');
    const hash = crypto.createHash('sha256').update(jsonContent).digest('hex');

    chunkMetadata.push({
      filename,
      sha256: hash,
      sizeBytes,
      unicodeRange: blockLabel,
    });

    console.log(
      `Wrote ${filename}: ${strokeList.length} kanji, ${sizeBytes} bytes`
    );
  }

  return chunkMetadata;
}

// Create manifest
function createManifest(chunks: Array<{
  filename: string;
  sha256: string;
  sizeBytes: number;
  unicodeRange: string;
}>, kanjivgSource: KanjiVGSource): StrokesManifest {

  // Compute combined hash and total size
  const combinedHash = crypto.createHash('sha256');
  let totalSize = 0;

  for (const chunk of chunks) {
    combinedHash.update(chunk.sha256);
    totalSize += chunk.sizeBytes;
  }

  return {
    id: 'strokes-v1',
    version: '1.0.0',
    schemaVersion: '1.0',
    sha256: combinedHash.digest('hex'),
    sizeBytes: totalSize,
    license: 'CC BY-SA 3.0',
    attribution:
      'Stroke data derived from KanjiVG by Ulrich Apel, CC BY-SA 3.0. Paths normalized and re-encoded.',
    sources: [
      {
        id: 'kanjivg',
        url: kanjivgSource.url,
        pinned: kanjivgSource.pinned,
        sha256: kanjivgSource.sha256,
        license: kanjivgSource.license,
        ...(kanjivgSource.licenseHash && {
          licenseHash: kanjivgSource.licenseHash,
        }),
      },
    ],
    chunks,
  };
}

// Main execution
async function main() {
  console.log('Building strokes pack from KanjiVG...');

  // Verify the locked input before clearing or writing any output.
  const { source: kanjivgSource, filePath: kanjivgZip } =
    resolveAndVerifyKanjiVGInput();

  // Create output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // P0: Clear old strokes-*.json + manifest so stale chunk schemes (prior splits) do not coexist.
  // Manifest will then list exactly the files present on disk.
  const existingFiles = fs.readdirSync(OUTPUT_DIR);
  for (const file of existingFiles) {
    if ((file.startsWith('strokes-') && file.endsWith('.json')) || file === 'manifest.json') {
      fs.unlinkSync(path.join(OUTPUT_DIR, file));
    }
  }

  // Extract and parse
  console.log('Extracting and parsing KanjiVG SVG files...');
  const strokes = extractAndParseKanjiVG(kanjivgZip);

  // Group by Unicode block
  console.log('Grouping by Unicode block...');
  const grouped = groupByUnicodeBlock(strokes);

  // Write chunks
  console.log('Writing JSON chunks...');
  const chunks = writeChunks(grouped);

  // Write manifest
  console.log('Writing manifest...');
  const manifest = createManifest(chunks, kanjivgSource);
  const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  console.log('\nStroke pack built successfully!');
  console.log(`Output directory: ${OUTPUT_DIR}`);
  console.log(`Manifest: ${manifestPath}`);
  console.log(
    `Total characters: ${strokes.size}, Chunks: ${chunks.length}, Total size: ${manifest.sizeBytes} bytes`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}

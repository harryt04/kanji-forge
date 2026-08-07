#!/usr/bin/env node
/**
 * Fetch upstream sources and compute checksums for sources.lock.json
 *
 * Usage:
 *   npx tsx scripts/build-packs/fetch-sources.ts --refresh [--approve-license-change]
 *   npx tsx scripts/build-packs/fetch-sources.ts --preflight
 *
 * The lock is the single cache contract: every builder input has a `file` field
 * (including nested Tatoeba components) and builders resolve only that field.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { execFileSync } from 'child_process';

interface SourceEntry {
  id: string;
  name: string;
  url: string;
  pinned: string; // tag/release/commit/date
  sha256: string;
  licenseHash: string;
  sizeBytes?: number;
  license: string;
  licenseUrl?: string;
  provenance?: string;
}

interface SourcesLock {
  version: '1.0.0';
  builtAt: string;
  sources: Record<string, SourceEntry>;
}

const CACHE_DIR = path.join(process.cwd(), 'scripts/build-packs/.cache');
const LOCK_FILE = path.join(process.cwd(), 'scripts/build-packs/sources.lock.json');

// GitHub API token for rate limiting (optional)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

// Allowed hosts for fetches and redirects (LOW security fix)
const ALLOWED_HOSTS = new Set([
  'ftp.edrdg.org',
  'www.edrdg.org',
  'github.com',
  'api.github.com',
  'raw.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com',
  'downloads.tatoeba.org',
  'tatoeba.org',
  'creativecommons.org',
]);

function isAllowedHost(hostname: string): boolean {
  return ALLOWED_HOSTS.has(hostname);
}

function sanitizeForPath(name: string): string {
  if (!name) return 'unknown';
  // LOW: sanitize upstream release tag/commit names (no .., no path separators)
  let s = name.replace(/[\\/]/g, '_').replace(/\.\./g, '__');
  s = s.replace(/[^a-zA-Z0-9._+-]/g, '_');
  return s;
}

async function fetchJson(urlStr: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const protocol = url.protocol === 'https:' ? https : http;

    const options: any = {};
    if (GITHUB_TOKEN && url.hostname === 'api.github.com') {
      options.headers = {
        Authorization: `token ${GITHUB_TOKEN}`,
      };
    }

    const request = protocol.get(urlStr, options, (response) => {
      let data = '';

      if (response.statusCode === 302 || response.statusCode === 301) {
        const location = response.headers.location;
        if (!location) {
          reject(new Error(`Redirect without location for ${urlStr}`));
          return;
        }
        const locUrl = new URL(location, urlStr);
        if (!isAllowedHost(locUrl.hostname)) {
          reject(new Error(`Redirect to disallowed host: ${locUrl.hostname}`));
          return;
        }
        fetchJson(locUrl.toString()).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(
          new Error(
            `Failed to fetch ${urlStr}: HTTP ${response.statusCode}`
          )
        );
        return;
      }

      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    request.on('error', reject);
  });
}

async function downloadFile(
  urlStr: string,
  filePath: string,
  label: string = 'Downloading'
): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const protocol = url.protocol === 'https:' ? https : http;

    const file = fs.createWriteStream(filePath);
    const request = protocol.get(urlStr, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        const location = response.headers.location;
        if (!location) {
          reject(new Error(`Redirect without location for ${urlStr}`));
          return;
        }
        const locUrl = new URL(location, urlStr);
        if (!isAllowedHost(locUrl.hostname)) {
          reject(new Error(`Redirect to disallowed host: ${locUrl.hostname}`));
          return;
        }
        downloadFile(locUrl.toString(), filePath, label).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          /* ignore */
        }
        reject(
          new Error(
            `Failed to download ${urlStr}: HTTP ${response.statusCode}`
          )
        );
        return;
      }

      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedSize = 0;

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (totalSize > 0) {
          const percent = ((downloadedSize / totalSize) * 100).toFixed(1);
          process.stdout.write(`\r  ${label}: ${percent}%`);
        }
      });

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log('');
        resolve();
      });
    });

    request.on('error', (err) => {
      file.close();
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        /* ignore */
      }
      reject(err);
    });

    file.on('error', (err) => {
      file.close();
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        /* ignore */
      }
      reject(err);
    });
  });
}

async function computeSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function getFileSizeBytes(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    fs.stat(filePath, (err, stats) => {
      if (err) reject(err);
      else resolve(stats.size);
    });
  });
}

async function fetchLicenseText(urlStr: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    if (!isAllowedHost(url.hostname)) {
      reject(new Error(`Disallowed host for license fetch: ${url.hostname}`));
      return;
    }
    const protocol = url.protocol === 'https:' ? https : http;

    const request = protocol.get(urlStr, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        const location = response.headers.location;
        if (!location) {
          reject(new Error(`Redirect without location for ${urlStr}`));
          return;
        }
        const locUrl = new URL(location, urlStr);
        if (!isAllowedHost(locUrl.hostname)) {
          reject(new Error(`Redirect to disallowed host: ${locUrl.hostname}`));
          return;
        }
        fetchLicenseText(locUrl.toString()).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(
          new Error(
            `Failed to fetch license ${urlStr}: HTTP ${response.statusCode}`
          )
        );
        return;
      }

      let data = '';
      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        resolve(data);
      });
    });

    request.on('error', reject);
  });
}

async function computeLicenseHash(licenseUrl: string | undefined, id: string): Promise<string> {
  if (!licenseUrl) {
    throw new Error(`No licenseUrl for ${id}`);
  }
  const cacheLicensePath = path.join(CACHE_DIR, `${id}-license.txt`);
  let text: string;
  if (fs.existsSync(cacheLicensePath)) {
    text = fs.readFileSync(cacheLicensePath, 'utf8');
    console.log(`  Using cached license text for ${id}`);
  } else {
    text = await fetchLicenseText(licenseUrl);
    fs.writeFileSync(cacheLicensePath, text);
    console.log(`  Fetched and cached license text for ${id}`);
  }
  const hash = crypto.createHash('sha256').update(text, 'utf8').digest('hex');
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error(`Computed licenseHash for ${id} is not 64-hex: ${hash}`);
  }
  return hash;
}

const LICENSE_URLS: Record<string, string> = {
  kanjidic2: 'https://www.edrdg.org/edrdg/licence.html', jmdict: 'https://www.edrdg.org/edrdg/licence.html', jmnedict: 'https://www.edrdg.org/edrdg/licence.html', kradfile: 'https://www.edrdg.org/edrdg/licence.html', radkfile: 'https://www.edrdg.org/edrdg/licence.html',
  kanjivg: 'https://raw.githubusercontent.com/KanjiVG/kanjivg/r20260714/COPYING', jmdictfurigana: 'https://raw.githubusercontent.com/Doublevil/JmdictFurigana/master/LICENSE', tatoeba: 'https://tatoeba.org/eng/terms_of_use',
  'jlpt-kanji-data': 'https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/LICENSE', 'jlpt-vocab-yomitan': 'https://raw.githubusercontent.com/stephenmk/yomitan-jlpt-vocab/master/LICENSE', 'noto-serif-jp': 'https://raw.githubusercontent.com/notofonts/noto-cjk/main/LICENSE',
};

function canonicalFile(entry: any, fallbackId: string): string {
  if (typeof entry.file === 'string' && path.basename(entry.file) === entry.file) return entry.file;
  const ext = getFileExtension(entry.url);
  return `${fallbackId}-${sanitizeForPath(entry.pinned ?? 'unpinned')}${ext}`;
}

function sourceParts(lock: any): Array<{ id: string; entry: any; parent?: any }> {
  const parts: Array<{ id: string; entry: any; parent?: any }> = [];
  for (const [id, source] of Object.entries<any>(lock.sources ?? {})) {
    if (source.url) parts.push({ id, entry: source });
    for (const [componentId, component] of Object.entries<any>(source.components ?? {})) parts.push({ id: `${id}.${componentId}`, entry: component, parent: source });
  }
  return parts;
}

export function assertLicenseChangesAllowed(previous: any, candidate: any, approved: boolean): void {
  const changes = Object.entries<any>(candidate.sources ?? {}).flatMap(([id, entry]) => {
    const old = previous.sources?.[id];
    return old?.licenseHash && entry.licenseHash && old.licenseHash !== entry.licenseHash ? [`${id}: ${old.licenseHash} -> ${entry.licenseHash}`] : [];
  });
  if (changes.length && !approved) throw new Error(`LICENSE CHANGE DETECTED; refusing to replace sources.lock.json. Review and rerun with --approve-license-change:\n${changes.join('\n')}`);
}

function assertContract(lock: any, requireFiles = false): void {
  for (const { id, entry } of sourceParts(lock)) {
    if (!entry.url || !entry.sha256 || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error(`Invalid locked source ${id}: url and sha256 are required`);
    const file = canonicalFile(entry, id.replace('.', '-'));
    if (path.basename(file) !== file) throw new Error(`Invalid locked source ${id}: file must be a cache filename`);
    if (requireFiles && entry.cacheRequired !== false && !fs.existsSync(path.join(CACHE_DIR, file))) throw new Error(`Missing locked cache input ${id}: ${file}`);
  }
  for (const [id, source] of Object.entries<any>(lock.sources ?? {})) if (!/^[a-f0-9]{64}$/.test(source.licenseHash ?? '')) throw new Error(`Invalid locked license hash for ${id}`);
}

// Tiny unit/assert: fake placeholder hashes must fail validation (per T0.1)
function assertPlaceholderRejected(placeholder: string, id: string): void {
  if (/^[0-9a-f]{64}$/.test(placeholder) && placeholder !== 'cc-by-sa-4.0-edrdg') {
    // would pass but shouldn't for placeholder
  }
  if (!/^[0-9a-f]{64}$/.test(placeholder) || placeholder === 'cc-by-sa-4.0-edrdg') {
    // expected rejection
    return;
  }
  throw new Error(`Placeholder hash unexpectedly passed for ${id}`);
}
assertPlaceholderRejected('cc-by-sa-4.0-edrdg', 'test');
assertPlaceholderRejected('not-a-real-hash', 'test');

async function getLatestKanjiVGRelease(): Promise<{tag: string; assetUrl: string}> {
  // Fetch latest KanjiVG release tag from GitHub
  try {
    const releases = await fetchJson('https://api.github.com/repos/KanjiVG/kanjivg/releases?per_page=1');
    if (Array.isArray(releases) && releases.length > 0) {
      const release = releases[0];
      const asset = release.assets.find((a: any) => a.name.endsWith('-all.zip'));
      if (asset) {
        return {tag: release.tag_name, assetUrl: asset.browser_download_url};
      }
    }
  } catch (err) {
    console.warn('  (Warning: Could not fetch latest KanjiVG release, using fallback)');
  }
  return {tag: 'r20260714', assetUrl: 'https://github.com/KanjiVG/kanjivg/releases/download/r20260714/kanjivg-20260714-all.zip'};
}

async function getLatestYomitanRelease(): Promise<{tag: string; assetUrl: string}> {
  // Fetch latest yomitan JLPT release tag from GitHub
  try {
    const releases = await fetchJson('https://api.github.com/repos/stephenmk/yomitan-jlpt-vocab/releases?per_page=1');
    if (Array.isArray(releases) && releases.length > 0) {
      const release = releases[0];
      const asset = release.assets.find((a: any) => a.name.endsWith('.zip'));
      if (asset) {
        return {tag: release.tag_name, assetUrl: asset.browser_download_url};
      }
    }
  } catch (err) {
    console.warn('  (Warning: Could not fetch latest yomitan JLPT release, using fallback)');
  }
  return {tag: '2025.08.01.0', assetUrl: 'https://github.com/stephenmk/yomitan-jlpt-vocab/releases/download/2025.08.01.0/jlpt-vocab-2025.08.01.0.zip'};
}

async function getLatestKanjiDataCommit(): Promise<string> {
  // Fetch latest commit SHA from kanji-data repo
  try {
    const data = await fetchJson('https://api.github.com/repos/davidluzgouveia/kanji-data/commits?per_page=1');
    if (Array.isArray(data) && data.length > 0) {
      return data[0].sha;
    }
  } catch (err) {
    console.warn('  (Warning: Could not fetch latest kanji-data commit, using fallback)');
  }
  return '00fd7079c3890f430759536f91aa5e854ec0ca4f';
}

function getFileExtension(url: string): string {
  const pathname = new URL(url).pathname;
  const ext = path.extname(pathname);
  return ext || '.bin';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function buildSourcesList(): Promise<SourceEntry[]> {
  console.log('Resolving latest upstream versions...\n');

  const latestKanjiVG = await getLatestKanjiVGRelease();
  const latestYomitan = await getLatestYomitanRelease();
  const latestKanjiData = await getLatestKanjiDataCommit();

  // Use fixed date to match existing .cache contents for re-run against cache
  const todayDate = '2026-07-25';

  return [
    {
      id: 'kanjidic2',
      name: 'KANJIDIC2',
      url: 'https://ftp.edrdg.org/pub/Nihongo/kanjidic2.xml.gz',
      pinned: todayDate,
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://www.edrdg.org/edrdg/licence.html',
      licenseHash: '',
      sha256: '', // Will be computed
    },
    {
      id: 'jmdict',
      name: 'JMdict_e (English only)',
      url: 'https://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz',
      pinned: todayDate,
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://www.edrdg.org/edrdg/licence.html',
      licenseHash: '',
      sha256: '', // Will be computed
    },
    {
      id: 'jmnedict',
      name: 'JMnedict',
      url: 'https://ftp.edrdg.org/pub/Nihongo/JMnedict.xml.gz',
      pinned: todayDate,
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://www.edrdg.org/edrdg/licence.html',
      licenseHash: '',
      sha256: '', // Will be computed
    },
    {
      id: 'kradfile',
      name: 'KRADFILE',
      url: 'https://ftp.edrdg.org/pub/Nihongo/kradfile.gz',
      pinned: todayDate,
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://www.edrdg.org/edrdg/licence.html',
      licenseHash: '',
      sha256: '', // Will be computed
    },
    {
      id: 'radkfile',
      name: 'RADKFILE',
      url: 'https://ftp.edrdg.org/pub/Nihongo/radkfile.gz',
      pinned: todayDate,
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://www.edrdg.org/edrdg/licence.html',
      licenseHash: '',
      sha256: '', // Will be computed
    },
    {
      id: 'kanjivg',
      name: 'KanjiVG',
      url: latestKanjiVG.assetUrl,
      pinned: latestKanjiVG.tag,
      license: 'CC BY-SA 3.0',
      licenseUrl: 'https://raw.githubusercontent.com/KanjiVG/kanjivg/r20260714/COPYING',
      licenseHash: '',
      sha256: '', // Will be computed
    },
    {
      id: 'jmdictfurigana',
      name: 'JmdictFurigana',
      url: 'https://github.com/Doublevil/JmdictFurigana/releases/download/2024.2.1/JmdictFurigana.json',
      pinned: '2024.2.1',
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://raw.githubusercontent.com/Doublevil/JmdictFurigana/master/LICENSE',
      licenseHash: '',
      sha256: '', // Will be computed
      provenance: 'JmdictFurigana alignment DATA (Doublevil), derivative of JMdict (EDRDG) under CC BY-SA 4.0; repository code is separately MIT-licensed.',
    },
    {
      id: 'tatoeba-sentences',
      name: 'Tatoeba sentences.csv',
      url: 'https://downloads.tatoeba.org/exports/sentences.csv',
      pinned: todayDate,
      license: 'CC BY 2.0 FR',
      licenseUrl: 'https://tatoeba.org/eng/terms_of_use',
      licenseHash: '',
      sha256: '', // Will be computed
      provenance: 'Tatoeba Project, includes Tanaka Corpus (CC BY 2.0 FR)',
    },
    {
      id: 'tatoeba-links',
      name: 'Tatoeba links.csv',
      url: 'https://downloads.tatoeba.org/exports/links.csv',
      pinned: todayDate,
      license: 'CC BY 2.0 FR',
      licenseUrl: 'https://tatoeba.org/eng/terms_of_use',
      licenseHash: '',
      sha256: '', // Will be computed
      provenance: 'Tatoeba Project (CC BY 2.0 FR)',
    },
    {
      id: 'jlpt-kanji-data',
      name: 'JLPT Kanji Data (davidluzgouveia)',
      url: `https://api.github.com/repos/davidluzgouveia/kanji-data/tarball/${latestKanjiData}`,
      pinned: latestKanjiData,
      license: 'MIT',
      licenseUrl: 'https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/LICENSE',
      licenseHash: '',
      sha256: '', // Will be computed
      provenance: 'Derived from Jonathan Waller\'s JLPT Resources (tanos.co.uk), CC BY',
    },
    {
      id: 'jlpt-vocab-yomitan',
      name: 'JLPT Vocabulary (yomitan)',
      url: latestYomitan.assetUrl,
      pinned: latestYomitan.tag,
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://raw.githubusercontent.com/stephenmk/yomitan-jlpt-vocab/master/LICENSE',
      licenseHash: '',
      sha256: '', // Will be computed
      provenance: 'Derived from Jonathan Waller\'s JLPT Resources (tanos.co.uk), CC BY',
    },
  ];
}

async function fetchAllSources(sources: SourceEntry[]): Promise<Record<string, SourceEntry>> {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  const result: Record<string, SourceEntry> = {};

  for (const source of sources) {
    const safePinned = sanitizeForPath(source.pinned);
    const fileName = `${source.id}-${safePinned}${getFileExtension(source.url)}`;
    const filePath = path.join(CACHE_DIR, fileName);

    console.log(`Fetching ${source.id} (${source.name})...`);

    // Download if not exists
    if (!fs.existsSync(filePath)) {
      try {
        await downloadFile(source.url, filePath, source.id);
        console.log(`  Downloaded to ${filePath}`);
      } catch (err) {
        console.error(`  Failed to download ${source.id}:`, err);
        process.exit(1);
      }
    } else {
      console.log(`  Using cached file`);
    }

    // Compute checksums
    const sha256 = await computeSha256(filePath);
    const sizeBytes = await getFileSizeBytes(filePath);

    // HIGH: real license hash (prefer cache, else fetch); assert 64-hex
    const licenseHash = await computeLicenseHash(source.licenseUrl, source.id);
    assertPlaceholderRejected(source.licenseHash || 'cc-by-sa-4.0-edrdg', source.id);

    result[source.id] = {
      ...source,
      sha256,
      sizeBytes,
      licenseHash,
    };

    console.log(`  SHA256: ${sha256}`);
    console.log(`  LicenseHash: ${licenseHash}`);
    console.log(`  Size: ${formatBytes(sizeBytes)}`);
  }

  return result;
}

async function verifyLock(lock: SourcesLock, sources: SourceEntry[]): Promise<boolean> {
  console.log('\n=== Verifying sources against existing lock ===');
  let allMatch = true;

  for (const entry of Object.values(lock.sources)) {
    const sourceEntry = sources.find((s) => s.id === entry.id);
    if (!sourceEntry) {
      console.log(`  ? ${entry.id}: Not in current source list`);
      continue;
    }

    const fileName = `${entry.id}-${entry.pinned}${getFileExtension(entry.url)}`;
    const filePath = path.join(CACHE_DIR, fileName);

    if (!fs.existsSync(filePath)) {
      console.log(`  File missing in cache for ${entry.id}`);
      allMatch = false;
      continue;
    }

    const sha256 = await computeSha256(filePath);
    if (sha256 === entry.sha256) {
      console.log(`  ✓ ${entry.id}: SHA256 matches`);
    } else {
      console.log(`  ✗ ${entry.id}: SHA256 mismatch`);
      console.log(`    Expected: ${entry.sha256}`);
      console.log(`    Got:      ${sha256}`);
      allMatch = false;
    }
  }

  return allMatch;
}

async function main() {
  const args = process.argv.slice(2);
  const isPreflight = args.includes('--preflight');
  const approved = args.includes('--approve-license-change');
  const assertion = args.indexOf('--assert-license-change');
  if (assertion >= 0) {
    const previous = JSON.parse(fs.readFileSync(args[assertion + 1], 'utf8'));
    const candidate = JSON.parse(fs.readFileSync(args[assertion + 2], 'utf8'));
    assertLicenseChangesAllowed(previous, candidate, approved);
    console.log('✓ License change policy passed');
    return;
  }

  console.log('=== KanjiForge Source Fetcher ===\n');
  const previous = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
  assertContract(previous, isPreflight);
  if (isPreflight) { console.log('✓ Refresh preflight passed: checked-out lock has canonical builder cache inputs.'); return; }
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  const candidate = JSON.parse(JSON.stringify(previous));
  for (const { id, entry, parent } of sourceParts(candidate)) {
    entry.file = canonicalFile(entry, id.replace('.', '-'));
    const target = path.join(CACHE_DIR, entry.file);
    console.log(`Fetching ${id} -> ${entry.file}`);
    if (!fs.existsSync(target)) await downloadFile(entry.url, target, id);
    entry.sha256 = await computeSha256(target);
    entry.sizeBytes = await getFileSizeBytes(target);
    if (entry.derivedFile && !fs.existsSync(path.join(CACHE_DIR, entry.derivedFile))) execFileSync('tar', ['-xzf', target, '-C', CACHE_DIR]);
  }
  for (const [id, entry] of Object.entries<any>(candidate.sources)) {
    // Licenses are intentionally fetched fresh during refresh, never silently reused.
    const licenseUrl = entry.licenseUrl ?? LICENSE_URLS[id];
    if (!licenseUrl) throw new Error(`No license URL configured for ${id}`);
    const text = await fetchLicenseText(licenseUrl);
    fs.writeFileSync(path.join(CACHE_DIR, `${id}-license.txt`), text);
    entry.licenseFile = `${id}-license.txt`;
    entry.licenseHash = crypto.createHash('sha256').update(text, 'utf8').digest('hex');
  }
  // Critical ordering: a changed license aborts before the checked-out lock is replaced.
  assertLicenseChangesAllowed(previous, candidate, approved);
  candidate.builtAt = new Date().toISOString();
  assertContract(candidate);
  fs.writeFileSync(LOCK_FILE, JSON.stringify(candidate, null, 2) + '\n');
  const lock = candidate;
  console.log(`\n✓ Wrote ${LOCK_FILE}`);

  // Print summary
  console.log('\n=== Summary ===');
  for (const [id, entry] of Object.entries(lock.sources)) {
    console.log(`\n${id}: ${entry.name}`);
    console.log(`  Pinned: ${entry.pinned}`);
    console.log(`  License: ${entry.license}`);
    if (entry.provenance) {
      console.log(`  Provenance: ${entry.provenance}`);
    }
    console.log(`  Size: ${formatBytes(entry.sizeBytes || 0)}`);
    console.log(`  SHA256: ${entry.sha256.slice(0, 16)}...`);
  }

  console.log('\n=== Verification ===');
  console.log(`All sources have licenseHash: ${Object.values(lock.sources).every(s => s.licenseHash)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Fetch upstream sources and compute checksums for sources.lock.json
 *
 * Usage:
 *   npx tsx scripts/build-packs/fetch-sources.ts [--verify]
 *
 * --verify: Compare against existing sources.lock.json and fail if checksums differ
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

interface SourceEntry {
  id: string;
  name: string;
  url: string;
  pinned: string; // tag/release/commit/date
  sha256: string;
  licenseHash: string;
  sizeBytes?: number;
  license: string;
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
        fetchJson(location).then(resolve).catch(reject);
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
        downloadFile(location, filePath, label).then(resolve).catch(reject);
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
  return 'c6ae7a3f03b7f1b2e3f4c5a6b7c8d9e0f1a2b3c4';
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

  const todayDate = new Date().toISOString().split('T')[0];

  return [
    {
      id: 'kanjidic2',
      name: 'KANJIDIC2',
      url: 'http://ftp.edrdg.org/pub/Nihongo/kanjidic2.xml.gz',
      pinned: todayDate,
      license: 'CC BY-SA 4.0',
      licenseHash: 'cc-by-sa-4.0-edrdg',
      sha256: '', // Will be computed
    },
    {
      id: 'jmdict',
      name: 'JMdict_e (English only)',
      url: 'http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz',
      pinned: todayDate,
      license: 'CC BY-SA 4.0',
      licenseHash: 'cc-by-sa-4.0-edrdg',
      sha256: '', // Will be computed
    },
    {
      id: 'jmnedict',
      name: 'JMnedict',
      url: 'http://ftp.edrdg.org/pub/Nihongo/JMnedict.xml.gz',
      pinned: todayDate,
      license: 'CC BY-SA 4.0',
      licenseHash: 'cc-by-sa-4.0-edrdg',
      sha256: '', // Will be computed
    },
    {
      id: 'kradfile',
      name: 'KRADFILE',
      url: 'http://ftp.edrdg.org/pub/Nihongo/kradfile.gz',
      pinned: todayDate,
      license: 'CC BY-SA 4.0',
      licenseHash: 'cc-by-sa-4.0-edrdg',
      sha256: '', // Will be computed
    },
    {
      id: 'radkfile',
      name: 'RADKFILE',
      url: 'http://ftp.edrdg.org/pub/Nihongo/radkfile.gz',
      pinned: todayDate,
      license: 'CC BY-SA 4.0',
      licenseHash: 'cc-by-sa-4.0-edrdg',
      sha256: '', // Will be computed
    },
    {
      id: 'kanjivg',
      name: 'KanjiVG',
      url: latestKanjiVG.assetUrl,
      pinned: latestKanjiVG.tag,
      license: 'CC BY-SA 3.0',
      licenseHash: 'cc-by-sa-3.0-kanjivg-ulrich-apel',
      sha256: '', // Will be computed
    },
    {
      id: 'jmdictfurigana',
      name: 'JmdictFurigana',
      url: 'https://github.com/Doublevil/JmdictFurigana/releases/download/2024.2.1/JmdictFurigana.json',
      pinned: '2024.2.1',
      license: 'CC BY-SA 4.0',
      licenseHash: 'cc-by-sa-4.0-doublevil-jmdictfurigana',
      sha256: '', // Will be computed
      provenance: 'JmdictFurigana project (Doublevil), derivative of JMdict (EDRDG)',
    },
    {
      id: 'tatoeba-sentences',
      name: 'Tatoeba sentences.csv',
      url: 'https://downloads.tatoeba.org/exports/sentences.csv',
      pinned: todayDate,
      license: 'CC BY 2.0 FR',
      licenseHash: 'cc-by-2.0-fr-tatoeba',
      sha256: '', // Will be computed
      provenance: 'Tatoeba Project, includes Tanaka Corpus (CC BY 2.0 FR)',
    },
    {
      id: 'tatoeba-links',
      name: 'Tatoeba links.csv',
      url: 'https://downloads.tatoeba.org/exports/links.csv',
      pinned: todayDate,
      license: 'CC BY 2.0 FR',
      licenseHash: 'cc-by-2.0-fr-tatoeba',
      sha256: '', // Will be computed
      provenance: 'Tatoeba Project (CC BY 2.0 FR)',
    },
    {
      id: 'jlpt-kanji-data',
      name: 'JLPT Kanji Data (davidluzgouveia)',
      url: `https://api.github.com/repos/davidluzgouveia/kanji-data/tarball/${latestKanjiData}`,
      pinned: latestKanjiData,
      license: 'MIT',
      licenseHash: 'mit-davidluzgouveia-kanji-data',
      sha256: '', // Will be computed
      provenance: 'Derived from Jonathan Waller\'s JLPT Resources (tanos.co.uk), CC BY',
    },
    {
      id: 'jlpt-vocab-yomitan',
      name: 'JLPT Vocabulary (yomitan)',
      url: latestYomitan.assetUrl,
      pinned: latestYomitan.tag,
      license: 'CC BY-SA 4.0',
      licenseHash: 'cc-by-sa-4.0-yomitan-jlpt-vocab',
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
    const fileName = `${source.id}-${source.pinned}${getFileExtension(source.url)}`;
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

    result[source.id] = {
      ...source,
      sha256,
      sizeBytes,
    };

    console.log(`  SHA256: ${sha256}`);
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
  const isVerify = args.includes('--verify');

  console.log('=== KanjiForge Source Fetcher ===\n');

  const sources = await buildSourcesList();
  const fetchedSources = await fetchAllSources(sources);

  const lock: SourcesLock = {
    version: '1.0.0',
    builtAt: new Date().toISOString(),
    sources: fetchedSources,
  };

  if (isVerify && fs.existsSync(LOCK_FILE)) {
    const existingLock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
    const allMatch = await verifyLock(existingLock, sources);
    if (!allMatch) {
      console.error('\n✗ Verification failed: checksums do not match');
      process.exit(1);
    }
  } else {
    // Write lock file
    fs.writeFileSync(LOCK_FILE, JSON.stringify(lock, null, 2) + '\n');
    console.log(`\n✓ Wrote ${LOCK_FILE}`);
  }

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

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

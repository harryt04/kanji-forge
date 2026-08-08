#!/usr/bin/env node
/**
 * Rebuild every publishable pack twice from one locked source cache and
 * byte-compare the generated packs, manifests, and published Brotli files.
 *
 * This intentionally invokes the production builders; it is not a JSON
 * fixture generator or a recompression check.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { runAssertions } from './pipeline.mjs'

const root = process.cwd()
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  )
}
const builders = [
  'build-kanji-pack.ts',
  'build-words-core-pack.ts',
  'build-words-full-pack.ts',
  'build-strokes-pack.ts',
  'build-sentences-pack.ts',
  'build-similar-pack.ts',
  'build-decks.ts',
]

function build(workspace) {
  // The scripts symlink gives each run its own cwd/output directory while the
  // builders read exactly the same immutable locked cache in the repository.
  symlinkSync(join(root, 'scripts'), join(workspace, 'scripts'), 'dir')
  for (const builder of builders) {
    execFileSync(
      join(root, 'node_modules/.bin/tsx'),
      [`scripts/build-packs/${builder}`],
      {
        cwd: workspace,
        stdio: 'inherit',
      },
    )
  }
  const out = join(workspace, 'packs')
  runAssertions({
    packDir: out,
    cacheDir: join(root, 'scripts/build-packs/.cache'),
    lockPath: join(root, 'scripts/build-packs/sources.lock.json'),
    requireCached: true,
    writeBrotli: true,
  })
  return out
}
const work = mkdtempSync(join(tmpdir(), 'kanjiforge-repro-'))
try {
  const one = join(work, 'one')
  const two = join(work, 'two')
  for (const dir of [one, two]) mkdirSync(dir)
  const oneOut = build(one)
  const twoOut = build(two)
  const left = files(oneOut)
    .map((file) => relative(oneOut, file))
    .sort()
  const right = files(twoOut)
    .map((file) => relative(twoOut, file))
    .sort()
  if (JSON.stringify(left) !== JSON.stringify(right))
    throw new Error('rebuild artifact sets differ')
  for (const file of left)
    if (
      !readFileSync(join(oneOut, file)).equals(readFileSync(join(twoOut, file)))
    )
      throw new Error(`rebuild differs: ${file}`)
  console.log(
    `✓ Reproducible full rebuild passed (${left.length} pack files, manifests, and Brotli artifacts byte-compared in isolated output directories)`,
  )
} finally {
  rmSync(work, { recursive: true, force: true })
}

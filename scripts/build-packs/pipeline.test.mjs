import { afterEach, describe, expect, it } from 'vitest'
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runAssertions } from './pipeline.mjs'
const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

const roots = []
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'kanjiforge-pipeline-'))
  roots.push(root)
  const packs = join(root, 'packs')
  const cache = join(root, 'cache')
  cpSync('packs-dev', packs, { recursive: true })
  cpSync('scripts/build-packs/fixtures', cache, { recursive: true })
  return { root, packs, cache, lock: join(cache, 'sources.lock.json') }
}
function options(f) {
  return {
    packDir: f.packs,
    cacheDir: f.cache,
    lockPath: f.lock,
    fixture: true,
  }
}
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true })),
)

describe('Phase 0 pipeline negative assertions', () => {
  it('fails when a source hash changes', () => {
    const f = fixture()
    writeFileSync(join(f.cache, 'source.bin'), 'tampered')
    expect(() => runAssertions(options(f))).toThrow(/source hash changed/)
  })
  it('fails when a license hash changes', () => {
    const f = fixture()
    writeFileSync(join(f.cache, 'LICENSE.txt'), 'changed license')
    expect(() => runAssertions(options(f))).toThrow(/license hash changed/)
  })
  it('fails on a surviving SKIP field', () => {
    const f = fixture()
    writeFileSync(join(f.packs, 'forbidden.json'), '{"qc_type":"skip"}')
    expect(() => runAssertions(options(f))).toThrow(/SKIP/)
  })
  it('fails when a produced artifact count drifts above five percent', () => {
    const f = fixture()
    const db = new Database(join(f.packs, 'kanji-v1.sqlite'))
    db.prepare(
      'DELETE FROM kanji WHERE literal IN (SELECT literal FROM kanji LIMIT 11)',
    ).run()
    db.close()
    expect(() => runAssertions(options(f))).toThrow(
      /derived artifact count|count drift/,
    )
  })
  it('fails on a declared pack-budget violation', () => {
    const f = fixture()
    const manifest = join(f.packs, 'kanji-v1.manifest.json')
    const json = JSON.parse(readFileSync(manifest))
    json.sizeBytes = 1048577
    writeFileSync(manifest, JSON.stringify(json))
    expect(() => runAssertions(options(f))).toThrow(/budget/)
  })
  it('fails when shipped metadata lacks attribution', () => {
    const f = fixture()
    const manifest = join(f.packs, 'kanji-v1.manifest.json')
    const json = JSON.parse(readFileSync(manifest))
    delete json.attribution
    writeFileSync(manifest, JSON.stringify(json))
    expect(() => runAssertions(options(f))).toThrow(/attribution/)
  })
  it('emits stable Brotli checksums', () => {
    const f = fixture()
    const one = runAssertions(options(f))
    const two = runAssertions(options(f))
    expect(one).toEqual(two)
    expect(one.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256))).toBe(true)
  })
})

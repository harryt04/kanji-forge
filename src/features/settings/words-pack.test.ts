import initSqlJs from 'sql.js'
import { zipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import {
  getInstalledWordsPack,
  installWordsPack,
  listInstalledWordsPack,
  parseWordsPackArchive,
  parseWordsPackManifest,
  removeWordsPack,
} from './words-pack'

async function sqliteBytes(): Promise<Uint8Array> {
  const SQL = await initSqlJs()
  const database = new SQL.Database()
  database.run(`
    CREATE TABLE entries (id INTEGER PRIMARY KEY, common_score INTEGER NOT NULL, data BLOB NOT NULL);
    CREATE TABLE forms (entry_id INTEGER NOT NULL, form TEXT NOT NULL, kind TEXT NOT NULL, is_common INTEGER NOT NULL);
    CREATE TABLE glosses_fts (entry_id INTEGER NOT NULL, gloss TEXT NOT NULL);
  `)
  const bytes = database.export()
  database.close()
  return bytes
}

describe('optional full words pack', () => {
  afterEach(async () => {
    await removeWordsPack()
  })

  it('requires the full JMdict schema and licensed manifest fields', () => {
    expect(() => parseWordsPackManifest({})).toThrow(/words-full id/)
    expect(() =>
      parseWordsPackManifest({
        id: 'words-full',
        name: 'Full words',
        version: 'v1',
        schemaVersion: 2,
        license: 'CC BY-SA 4.0',
        attribution: 'JMdict',
      }),
    ).toThrow(/schema version 1/)
  })

  it('installs and removes a generated-style SQLite or ZIP pack offline', async () => {
    const bytes = await sqliteBytes()
    const archive = zipSync({
      'words-full-v1.sqlite': bytes,
      'manifest.json': new TextEncoder().encode(
        JSON.stringify({
          id: 'words-full',
          name: 'Full JMdict dictionary',
          version: 'v1',
          schemaVersion: 1,
          license: 'CC BY-SA 4.0',
          attribution: 'JMdict contributors',
          stats: { entryCount: 200000 },
        }),
      ),
    })

    await expect(parseWordsPackArchive(archive)).resolves.toMatchObject({
      manifest: { entryCount: 200000 },
    })
    await expect(installWordsPack(archive)).resolves.toMatchObject({
      id: 'words-full',
    })
    await expect(getInstalledWordsPack()).resolves.toMatchObject({
      manifest: { name: 'Full JMdict dictionary' },
    })
    await expect(listInstalledWordsPack()).resolves.toHaveLength(1)
    await removeWordsPack()
    await expect(getInstalledWordsPack()).resolves.toBeNull()
  })

  it('accepts a raw SQLite file with built-in attribution', async () => {
    await expect(installWordsPack(await sqliteBytes())).resolves.toMatchObject({
      id: 'words-full',
      license: 'CC BY-SA 4.0',
    })
  })
})

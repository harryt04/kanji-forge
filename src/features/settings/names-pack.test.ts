import initSqlJs from 'sql.js'
import { zipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import {
  getInstalledNamesPack,
  installNamesPack,
  listInstalledNamesPack,
  parseNamesPackArchive,
  parseNamesPackManifest,
  removeNamesPack,
} from './names-pack'

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

describe('optional names pack', () => {
  afterEach(async () => {
    await removeNamesPack()
  })

  it('requires the names schema and licensed manifest fields', () => {
    expect(() => parseNamesPackManifest({})).toThrow(/names id/)
    expect(() =>
      parseNamesPackManifest({
        id: 'names',
        name: 'Names',
        version: 'v1',
        schemaVersion: 2,
        license: 'CC BY-SA 4.0',
        attribution: 'JMnedict',
      }),
    ).toThrow(/schema version 1/)
  })

  it('reads a generated-style ZIP and installs it for offline use', async () => {
    const bytes = await sqliteBytes()
    const archive = zipSync({
      'names-v1.sqlite': bytes,
      'manifest.json': new TextEncoder().encode(
        JSON.stringify({
          id: 'names',
          name: 'JMnedict names',
          version: 'v1',
          schemaVersion: 1,
          license: 'CC BY-SA 4.0',
          attribution: 'JMnedict contributors',
          stats: { entryCount: 743538 },
        }),
      ),
    })

    const parsed = await parseNamesPackArchive(archive)
    expect(parsed.manifest.entryCount).toBe(743538)
    await expect(installNamesPack(archive)).resolves.toMatchObject({
      id: 'names',
      name: 'JMnedict names',
    })
    await expect(getInstalledNamesPack()).resolves.toMatchObject({
      manifest: { entryCount: 743538 },
    })
    await expect(listInstalledNamesPack()).resolves.toHaveLength(1)
    await removeNamesPack()
    await expect(getInstalledNamesPack()).resolves.toBeNull()
  })

  it('accepts a raw SQLite file with built-in attribution', async () => {
    await expect(installNamesPack(await sqliteBytes())).resolves.toMatchObject({
      id: 'names',
      license: 'CC BY-SA 4.0',
    })
  })
})

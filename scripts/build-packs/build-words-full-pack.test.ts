import { gzipSync } from 'node:zlib'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { buildWordsPack } from './build-words-core-pack'

const sampleJmdict = `<?xml version="1.0"?>
<JMdict>
<entry>
<ent_seq>1000001</ent_seq>
<k_ele>
<keb>試験</keb>
<ke_pri>news1</ke_pri>
</k_ele>
<r_ele>
<reb>しけん</reb>
<re_pri>news1</re_pri>
</r_ele>
<sense>
<pos>n</pos>
<gloss>test</gloss>
</sense>
</entry>
<entry>
<ent_seq>1000002</ent_seq>
<k_ele>
<keb>珍語</keb>
</k_ele>
<r_ele>
<reb>ちんご</reb>
</r_ele>
<sense>
<pos>n</pos>
<gloss>rare word</gloss>
</sense>
</entry>
</JMdict>
`

describe('full JMdict pack builder', () => {
  it('retains untagged entries while the core filter still excludes them', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'kanjiforge-words-'))
    const input = join(directory, 'jmdict.xml.gz')
    const coreOutput = join(directory, 'words-core.sqlite')
    const fullOutput = join(directory, 'words-full.sqlite')
    writeFileSync(input, gzipSync(sampleJmdict))

    const coreStats = await buildWordsPack(input, {
      outputDb: coreOutput,
      packId: 'words-core',
      includeEntry: (_entry, commonScore) => commonScore > 0,
    })
    const fullStats = await buildWordsPack(input, {
      outputDb: fullOutput,
      packId: 'words-full',
      includeEntry: () => true,
    })

    expect(coreStats.entryCount).toBe(1)
    expect(fullStats.entryCount).toBe(2)

    const database = new Database(fullOutput, { readonly: true })
    expect(
      database.prepare('SELECT COUNT(*) AS count FROM entries').get() as {
        count: number
      },
    ).toEqual({ count: 2 })
    expect(
      database.prepare('SELECT data FROM entries WHERE id = 1000002').get() as {
        data: Buffer
      },
    ).toMatchObject({ data: expect.any(Buffer) })
    database.close()
    expect(readFileSync(coreOutput).byteLength).toBeGreaterThan(0)
  })
})

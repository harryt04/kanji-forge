#!/usr/bin/env node
/** Build the optional full JMdict pack from every JMdict_e entry. */

import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  buildWordsPack,
  resolveAndVerifyJmdictPath,
  writeWordsManifest,
} from './build-words-core-pack'

const outputDb = path.join(process.cwd(), 'packs/words-full-v1.sqlite')
const outputManifest = path.join(
  process.cwd(),
  'packs/words-full-v1.manifest.json',
)

async function main() {
  console.log('Building words-full pack from JMdict...')
  const jmdictPath = resolveAndVerifyJmdictPath()
  const stats = await buildWordsPack(jmdictPath, {
    outputDb,
    packId: 'words-full',
    includeEntry: () => true,
  })
  const sha256 = await writeWordsManifest(stats, {
    outputDb,
    outputManifest,
    packId: 'words-full',
    filterDescription: 'retained all JMdict entries',
  })
  console.log(`✓ Created ${outputDb}`)
  console.log(`✓ SHA256: ${sha256}`)
  console.log(`✓ Manifest: ${outputManifest}`)
}

main().catch((error: unknown) => {
  const temporary = `${outputDb}.tmp`
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
  console.error('Build failed:', error)
  process.exit(1)
})

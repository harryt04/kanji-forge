import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

interface StrokeChunk {
  filename: string
  sha256: string
  sizeBytes: number
}

interface StrokeManifest {
  sha256: string
  sizeBytes: number
  chunks: StrokeChunk[]
}

const strokesDirectory = join(process.cwd(), 'packs/strokes')

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex')
}

function readManifest(): StrokeManifest {
  return JSON.parse(
    readFileSync(join(strokesDirectory, 'manifest.json'), 'utf8'),
  ) as StrokeManifest
}

describe('committed stroke pack', () => {
  it('matches every manifest chunk checksum and byte count', () => {
    const manifest = readManifest()
    const listedFiles = new Set(manifest.chunks.map((chunk) => chunk.filename))
    const actualFiles = new Set(
      readdirSync(strokesDirectory).filter(
        (filename) =>
          filename.startsWith('strokes-') && filename.endsWith('.json'),
      ),
    )

    expect(actualFiles).toEqual(listedFiles)

    const hashes = manifest.chunks.map((chunk) => {
      const bytes = readFileSync(join(strokesDirectory, chunk.filename))
      expect(bytes.byteLength).toBe(chunk.sizeBytes)
      expect(sha256(bytes)).toBe(chunk.sha256)
      return chunk.sha256
    })

    expect(manifest.sizeBytes).toBe(
      manifest.chunks.reduce((total, chunk) => total + chunk.sizeBytes, 0),
    )
    expect(manifest.sha256).toBe(sha256(hashes.join('')))
  })
})

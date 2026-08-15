import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { flattenSvgPath, resamplePolyline } from './resample'

const PACK_DIR = path.join(process.cwd(), 'packs', 'strokes')

function everyPackedPath(): string[] {
  return fs
    .readdirSync(PACK_DIR)
    .filter((file) => file.startsWith('strokes-') && file.endsWith('.json'))
    .flatMap((file) => {
      const pack = JSON.parse(
        fs.readFileSync(path.join(PACK_DIR, file), 'utf8'),
      ) as Record<string, { paths: string[] }>
      return Object.values(pack).flatMap((record) => record.paths)
    })
}

describe('resamplePolyline', () => {
  it('returns the requested number of samples', () => {
    const points = flattenSvgPath('M10,20 L90,80')
    expect(resamplePolyline(points, 8)).toHaveLength(8)
    expect(resamplePolyline(points, 32)).toHaveLength(32)
  })

  it('keeps the endpoints of the original polyline', () => {
    const points = [
      { x: 3, y: 4 },
      { x: 20, y: 40 },
      { x: 61, y: 7 },
    ]
    const sampled = resamplePolyline(points, 16)
    expect(sampled[0]).toEqual(points[0])
    expect(sampled.at(-1)!.x).toBeCloseTo(61, 6)
    expect(sampled.at(-1)!.y).toBeCloseTo(7, 6)
  })

  // Rounding once pushed the final target past the total arc length, which ran
  // the segment walk off the end of the table and produced NaN coordinates.
  // Those strokes could never be matched, at any leniency.
  it('produces only finite points for every stroke in the packs', () => {
    const paths = everyPackedPath()
    expect(paths.length).toBeGreaterThan(1000)

    const broken = paths.filter((strokePath) => {
      const sampled = resamplePolyline(flattenSvgPath(strokePath), 32)
      return (
        sampled.length !== 32 ||
        sampled.some(
          (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y),
        )
      )
    })
    expect(broken).toEqual([])
  })
})

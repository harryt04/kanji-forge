import { describe, expect, it } from 'vitest'
import { matchStroke } from './match'
import { flattenSvgPath, resamplePolyline, type StrokePoint } from './resample'

/** Real KanjiVG paths, in the 109x109 space the writing canvas uses. */
const PATHS = {
  /** 一 — a single near-flat horizontal stroke. */
  horizontal:
    'M11,54.25c3.19,0.62,6.25,0.75,9.73,0.5c20.64-1.5,50.39-5.12,68.58-5.24c3.6-0.02,5.77,0.24,7.57,0.49',
  /** 主 stroke 3 — a near-flat vertical stroke. */
  vertical:
    'M52.75,39.83c1.27,1.27,1.75,2.83,1.75,3.75c0,6.41,0.25,38.3,0.25,45.17',
  /** 擦 stroke 9 — a dot, too short for a meaningful direction signal. */
  dot: 'M51.38,42.75c0.64,0.25,2.41,1.73,3.68,3.21',
  /** 事 — every stroke resampled to NaN before the resample fix. */
  ji: [
    'M14.25,24.95c1.84,0.54,5.23,0.68,7.07,0.54c16.77-1.24,46.39-4.24,66.97-4.23c3.08,0,4.92,0.26,6.46,0.53',
    'M30.51,34.23c0.35,0.23,0.71,0.42,0.86,0.7c1.04,1.95,1.9,6.86,2.64,10.78c0.17,0.88,0.23,1.21,0.35,1.78',
    'M32.94,35.01c8.31-1.01,32.5-2.95,41.08-3.59c2.43-0.18,3.81,1.33,3.04,3.59c-0.73,2.14-1.52,4.57-2.48,7.24',
    'M35.28,45.51c4.21-0.3,27.12-1.93,37.35-2.68c1.45-0.11,3-0.34,4.19-0.01',
    'M27.5,55.89c2.5,0.74,4.2,1.01,6.5,0.87c13.49-0.84,28.51-2.14,39.74-2.92c3.72-0.26,5.96,0.81,4.99,4.79c-1.21,4.97-2.6,7.76-4.24,16.86',
    'M14.75,68c2.75,0.75,4.74,0.65,7.68,0.43c22.94-1.69,43.44-3.19,64.43-4.17c3.26-0.15,5.91,0.18,7.39,0.4',
    'M27.5,79.85c2,0.4,3.51,0.52,5,0.4c13.75-1.08,26.5-2.82,39-3.25c2-0.07,3.25,0,4.75,0.22',
    'M52.77,10.08c1.45,1.45,2.01,2.67,2.01,5.02c0,14.56-0.01,72.41-0.01,77.37c0,9.66-4.91,3.42-8.71,0.25',
  ],
} as const

/** A trace of the reference stroke, displaced by a constant offset. */
function trace(path: string, dx = 0, dy = 0): StrokePoint[] {
  return resamplePolyline(flattenSvgPath(path), 24).map((point) => ({
    x: point.x + dx,
    y: point.y + dy,
  }))
}

describe('stroke matching', () => {
  it('resamples and accepts a correctly ordered straight stroke', () => {
    const path = 'M10,20 L90,80'
    const points = flattenSvgPath(path)
    expect(resamplePolyline(points, 8)).toHaveLength(8)
    expect(matchStroke(points, path).accepted).toBe(true)
  })

  it('rejects the same stroke drawn in reverse', () => {
    expect(
      matchStroke(
        [
          { x: 90, y: 80 },
          { x: 10, y: 20 },
        ],
        'M10,20 L90,80',
      ).accepted,
    ).toBe(false)
  })

  it('accepts a close curve with forgiving leniency and rejects a wrong shape or position', () => {
    const path = 'M10,10 C30,10 70,90 90,90'
    const close = [
      { x: 12, y: 11 },
      { x: 35, y: 18 },
      { x: 65, y: 82 },
      { x: 88, y: 89 },
    ]
    expect(matchStroke(close, path, 'forgiving').accepted).toBe(true)
    expect(
      matchStroke(
        [
          { x: 10, y: 90 },
          { x: 30, y: 10 },
          { x: 70, y: 90 },
          { x: 90, y: 10 },
        ],
        path,
      ).accepted,
    ).toBe(false)
    expect(
      matchStroke(
        close.map((point) => ({ x: point.x + 40, y: point.y })),
        path,
      ).accepted,
    ).toBe(false)
  })

  // A single stroke's own per-axis bounding box used to be the normalization
  // basis, which left flat strokes with sub-unit tolerance on the thin axis.
  it('accepts a flat horizontal stroke drawn a few units off', () => {
    for (const offset of [0, 2, 4]) {
      expect(
        matchStroke(trace(PATHS.horizontal, 0, offset), PATHS.horizontal)
          .accepted,
      ).toBe(true)
    }
  })

  it('accepts a flat vertical stroke drawn a few units off', () => {
    for (const offset of [0, 2, 4]) {
      expect(
        matchStroke(trace(PATHS.vertical, offset, 0), PATHS.vertical).accepted,
      ).toBe(true)
    }
  })

  it('accepts a dot without relying on its direction', () => {
    expect(matchStroke(trace(PATHS.dot, 1.5, -1), PATHS.dot).accepted).toBe(
      true,
    )
  })

  it('accepts every stroke of 事, which was previously unmatchable', () => {
    for (const path of PATHS.ji) {
      expect(matchStroke(trace(path, 1, 1), path).accepted).toBe(true)
    }
  })

  it('scores a near-perfect trace close to 1', () => {
    const match = matchStroke(trace(PATHS.horizontal), PATHS.horizontal)
    expect(match.score).toBeGreaterThan(0.99)
    expect(match.accepted).toBe(true)
  })

  it('still rejects wrong strokes at the most forgiving setting', () => {
    const path = PATHS.vertical
    const reference = resamplePolyline(flattenSvgPath(path), 24)
    const first = reference[0]!

    // Drawn backwards.
    expect(
      matchStroke([...reference].reverse(), path, 'forgiving').accepted,
    ).toBe(false)
    // Right shape, clearly wrong place.
    expect(matchStroke(trace(path, 25, 0), path, 'forgiving').accepted).toBe(
      false,
    )
    // Stops halfway.
    expect(
      matchStroke(reference.slice(0, 12), path, 'forgiving').accepted,
    ).toBe(false)
    // Runs half again as far as it should.
    expect(
      matchStroke(
        reference.map((point) => ({
          x: first.x + (point.x - first.x) * 1.5,
          y: first.y + (point.y - first.y) * 1.5,
        })),
        path,
        'forgiving',
      ).accepted,
    ).toBe(false)
  })

  it('reports a lower score for a worse trace', () => {
    const near = matchStroke(trace(PATHS.horizontal, 0, 1), PATHS.horizontal)
    const far = matchStroke(trace(PATHS.horizontal, 0, 8), PATHS.horizontal)
    expect(near.score).toBeGreaterThan(far.score)
  })

  it('tightens as leniency increases', () => {
    const drawn = trace(PATHS.horizontal, 0, 7)
    expect(matchStroke(drawn, PATHS.horizontal, 'forgiving').accepted).toBe(
      true,
    )
    expect(matchStroke(drawn, PATHS.horizontal, 'strict').accepted).toBe(false)
  })
})

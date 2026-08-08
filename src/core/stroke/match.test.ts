import { describe, expect, it } from 'vitest'
import { matchStroke } from './match'
import { flattenSvgPath, resamplePolyline } from './resample'

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
})

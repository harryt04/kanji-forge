import { describe, expect, it } from 'vitest'
import { getFoldSize } from '@/prototype/tile-wall/canvas-renderer'

describe('fold overlay sizing', () => {
  it('keeps canvas folds proportional on small tiles and capped on large tiles', () => {
    expect(getFoldSize(12, 4)).toBeCloseTo(4.2)
    expect(getFoldSize(32, 4)).toBeCloseTo(11.2)
    expect(getFoldSize(60, 4)).toBe(16)
    expect(getFoldSize(12, 0)).toBe(0)
  })

  it('keeps the visible triangle below half of a square tile', () => {
    for (const tileSize of [12, 16, 32, 60, 140]) {
      const foldSize = getFoldSize(tileSize, 4)
      const foldArea = (foldSize * foldSize) / 2
      expect(foldArea).toBeLessThan(tileSize * tileSize * 0.5)
    }
  })
})

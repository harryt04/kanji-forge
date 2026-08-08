import { describe, expect, it } from 'vitest'
import { nextStrokeIndexes, STROKE_ORDER_EXCEPTIONS } from './order'

describe('stroke-order exceptions', () => {
  it('allows the first interchangeable strokes in either order', () => {
    expect(nextStrokeIndexes('上', [], 3)).toEqual([0, 1])
    expect(nextStrokeIndexes('上', [1], 3)).toEqual([0])
    expect(nextStrokeIndexes('上', [0], 3)).toEqual([1])
    expect(nextStrokeIndexes('上', [0, 1], 3)).toEqual([2])
  })

  it('keeps ordinary characters strictly sequential', () => {
    expect(nextStrokeIndexes('日', [], 4)).toEqual([0, 1])
    expect(nextStrokeIndexes('日', [0, 1], 4)).toEqual([2])
    expect(nextStrokeIndexes('日', [0, 2], 4)).toEqual([1])
    expect(nextStrokeIndexes('漢', [], 3)).toEqual([0])
    expect(nextStrokeIndexes('漢', [0], 3)).toEqual([1])
  })

  it('only exposes exception indexes that exist in the loaded path set', () => {
    expect(nextStrokeIndexes('上', [], 1)).toEqual([0])
    expect(nextStrokeIndexes('上', [0], 1)).toEqual([])
    expect(Object.keys(STROKE_ORDER_EXCEPTIONS)).toContain('田')
  })
})

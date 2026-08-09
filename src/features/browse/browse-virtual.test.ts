import { describe, expect, it } from 'vitest'
import {
  BROWSE_LIST_OVERSCAN,
  BROWSE_LIST_ROW_HEIGHT,
  BROWSE_LIST_VIEWPORT_HEIGHT,
  getBrowseVirtualRange,
} from './browse-virtual'

describe('Browse list virtualization', () => {
  it('renders a bounded overscanned range at the top of a large list', () => {
    expect(getBrowseVirtualRange(2500, 0)).toEqual({
      start: 0,
      end:
        Math.ceil(BROWSE_LIST_VIEWPORT_HEIGHT / BROWSE_LIST_ROW_HEIGHT) +
        BROWSE_LIST_OVERSCAN,
    })
  })

  it('keeps the range inside the list near the bottom', () => {
    const itemCount = 2500
    const scrollTop = itemCount * BROWSE_LIST_ROW_HEIGHT
    const range = getBrowseVirtualRange(itemCount, scrollTop)

    expect(range.end).toBe(itemCount)
    expect(range.start).toBeLessThan(range.end)
    expect(range.end - range.start).toBeLessThan(30)
  })

  it('clamps invalid scroll and sizing inputs', () => {
    expect(getBrowseVirtualRange(10, -100, 0, 0, -3)).toEqual({
      start: 0,
      end: 1,
    })
    expect(getBrowseVirtualRange(0, 0)).toEqual({ start: 0, end: 0 })
  })
})

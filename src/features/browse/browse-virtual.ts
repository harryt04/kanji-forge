export const BROWSE_LIST_VIRTUALIZATION_THRESHOLD = 500
export const BROWSE_LIST_ROW_HEIGHT = 132
export const BROWSE_LIST_VIEWPORT_HEIGHT = 640
export const BROWSE_LIST_OVERSCAN = 6

export interface BrowseVirtualRange {
  readonly start: number
  readonly end: number
}

/** Returns the rows that need DOM nodes for a fixed-height Browse list. */
export function getBrowseVirtualRange(
  itemCount: number,
  scrollTop: number,
  viewportHeight = BROWSE_LIST_VIEWPORT_HEIGHT,
  rowHeight = BROWSE_LIST_ROW_HEIGHT,
  overscan = BROWSE_LIST_OVERSCAN,
): BrowseVirtualRange {
  if (itemCount <= 0) return { start: 0, end: 0 }

  const safeScrollTop = Math.max(0, scrollTop)
  const safeViewportHeight = Math.max(1, viewportHeight)
  const safeRowHeight = Math.max(1, rowHeight)
  const safeOverscan = Math.max(0, Math.floor(overscan))
  const firstVisible = Math.floor(safeScrollTop / safeRowHeight)
  const first = Math.max(0, firstVisible - safeOverscan)
  const lastVisible = Math.ceil(
    (safeScrollTop + safeViewportHeight) / safeRowHeight,
  )
  const last = Math.min(itemCount, lastVisible + safeOverscan)

  return { start: first, end: Math.max(first, last) }
}

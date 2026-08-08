/**
 * A small compatibility table for common Japanese stroke-order variants.
 *
 * KanjiVG gives us one canonical order, but learners may use an accepted
 * alternate order for a few ambiguous characters. Each group contains stroke
 * indexes that may be completed in either order; all other strokes remain
 * sequential. Indexes are zero-based to match the KanjiVG path array.
 */
export const STROKE_ORDER_EXCEPTIONS: Readonly<
  Record<string, readonly (readonly number[])[]>
> = {
  上: [[0, 1]],
  必: [[0, 1]],
  日: [[0, 1]],
  田: [[0, 1]],
  由: [[0, 1]],
  甲: [[0, 1]],
  申: [[0, 1]],
  目: [[0, 1]],
  里: [[0, 1]],
}

/** Returns the valid KanjiVG stroke indexes for the next stroke. */
export function nextStrokeIndexes(
  character: string,
  completedIndexes: readonly number[],
  strokeCount: number,
): readonly number[] {
  const completed = new Set(completedIndexes)
  const groups = STROKE_ORDER_EXCEPTIONS[character] ?? []

  for (const group of groups) {
    const available = group.filter(
      (index) => index >= 0 && index < strokeCount && !completed.has(index),
    )
    if (available.length > 0) return available
  }

  for (let index = 0; index < strokeCount; index += 1) {
    if (!completed.has(index)) return [index]
  }
  return []
}

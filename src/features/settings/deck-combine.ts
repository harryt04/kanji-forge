/** A read-only source used when composing a user-owned deck. */
export interface DeckCombineSource {
  readonly deckId: string
  readonly contentRefs: readonly string[]
}

/**
 * Combines deck content in source order, removing duplicate cards while
 * keeping the first occurrence. StickyStudy's first-N option applies to the
 * resulting combined deck, not independently to each source deck.
 */
export function combineDeckContent(
  sources: readonly DeckCombineSource[],
  firstN?: number,
): readonly string[] {
  if (firstN !== undefined && (!Number.isInteger(firstN) || firstN < 1)) {
    throw new Error('The first-card limit must be a positive whole number.')
  }

  const seen = new Set<string>()
  const combined: string[] = []
  for (const source of sources) {
    for (const contentRef of source.contentRefs) {
      if (seen.has(contentRef)) continue
      seen.add(contentRef)
      combined.push(contentRef)
      if (firstN !== undefined && combined.length >= firstN) return combined
    }
  }
  return combined
}

/** A read-only source used when composing a user-owned deck. */
export interface DeckCombineSource {
  readonly deckId: string
  readonly contentRefs: readonly string[]
  /**
   * Optional identity keyed by contentRef. When present, equivalent cards
   * with different dictionary ids can be collapsed during composition.
   */
  readonly cardIdentities?: ReadonlyMap<string, string>
}

export interface DeckCardIdentityInput {
  readonly question: string
  readonly readings: readonly string[]
}

/** Returns the visible question/reading identity used for duplicate removal. */
export function cardIdentity(input: DeckCardIdentityInput): string {
  const question = input.question.trim().normalize('NFC')
  const readings = [
    ...new Set(
      input.readings
        .map((reading) => reading.trim().normalize('NFC'))
        .filter(Boolean),
    ),
  ].sort()
  return `${question}\u0000${readings.join('\u0001')}`
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
      const identity = source.cardIdentities?.get(contentRef) ?? contentRef
      if (seen.has(identity)) continue
      seen.add(identity)
      combined.push(contentRef)
      if (firstN !== undefined && combined.length >= firstN) return combined
    }
  }
  return combined
}

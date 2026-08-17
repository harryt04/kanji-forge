/** Human labels for the built-in deck shelf taxonomy defined by
 * `scripts/build-packs/build-decks.ts`'s `deckCategories`. */
const DECK_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  jlpt: 'JLPT',
  joyo: 'Jōyō',
  school: 'School grades',
  kanken: 'Kanji Kentei',
  frequency: 'Frequency',
  kana: 'Kana',
}

export function deckCategoryLabel(category: string): string {
  return DECK_CATEGORY_LABELS[category] ?? category
}

/** Groups items by `category`, preserving first-seen order. The catalog is
 * already sorted by category then `sortOrder`, so first-seen order matches
 * the pipeline's shelf order without needing a separately maintained list. */
export function groupByCategory<T extends { readonly category: string }>(
  items: readonly T[],
): readonly { readonly category: string; readonly items: readonly T[] }[] {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const bucket = map.get(item.category)
    if (bucket) bucket.push(item)
    else map.set(item.category, [item])
  }
  return [...map.entries()].map(([category, groupItems]) => ({
    category,
    items: groupItems,
  }))
}

import type { LoadedDeck } from '@/features/study/deck-loader'

/**
 * Produces a simple tab-separated text export that can be pasted into a
 * spreadsheet or a future deck importer without losing the core card fields.
 * Cards missing from the installed content pack are omitted.
 */
export function formatDeckAsText(deck: LoadedDeck): string {
  return deck.cards
    .flatMap((card) => {
      const content = deck.content.get(card.contentRef)
      if (!content) return []
      const readings = [...content.onReadings, ...content.kunReadings].join(
        '、',
      )
      return [
        [content.literal, readings, content.meanings.join('; ')].join('\t'),
      ]
    })
    .join('\n')
}

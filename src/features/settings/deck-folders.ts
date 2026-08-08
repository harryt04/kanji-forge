import type { Deck } from '@/data/repo'

export const DECK_FOLDER_SETTING_PREFIX = 'deck-folder:'

export function deckFolderSettingKey(deckId: string): string {
  return `${DECK_FOLDER_SETTING_PREFIX}${deckId}`
}

export function normalizeDeckFolder(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/gu, ' ').slice(0, 40)
}

export interface DeckFolderGroup {
  readonly name: string
  readonly decks: readonly Deck[]
}

/** Groups deck metadata for the deck shelf; unnamed decks remain in Unfiled. */
export function groupDecksByFolder(
  decks: readonly Deck[],
  folders: Readonly<Record<string, string | undefined>>,
): readonly DeckFolderGroup[] {
  const groups = new Map<string, Deck[]>()
  for (const deck of decks) {
    const folder = normalizeDeckFolder(folders[deck.id]) || 'Unfiled'
    const group = groups.get(folder) ?? []
    group.push(deck)
    groups.set(folder, group)
  }

  return [...groups.entries()]
    .sort(([left], [right]) => {
      if (left === 'Unfiled') return -1
      if (right === 'Unfiled') return 1
      return left.localeCompare(right)
    })
    .map(([name, groupedDecks]) => ({
      name,
      decks: groupedDecks.sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
    }))
}

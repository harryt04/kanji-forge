import Link from 'next/link'
import type { DeckSummary } from '@/features/decks/deck-summary'
import {
  deckCategoryLabel,
  groupByCategory,
} from '@/features/decks/deck-categories'
import { groupDecksByFolder } from '@/features/settings/deck-folders'
import { LevelRamp } from './level-ramp'

function DeckButton({
  deck,
  selected,
  onSelectDeck,
}: {
  readonly deck: DeckSummary
  readonly selected: boolean
  readonly onSelectDeck: (deckId: string) => void
}): React.ReactElement {
  const dueText =
    deck.dueCount > 0 ? `${deck.dueCount} due today` : 'Nothing due today'

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${deck.name}, ${deck.cardCount} cards, ${deck.progressPercent}% complete, ${dueText}`}
      onClick={() => onSelectDeck(deck.id)}
      className={`border-border h-auto min-h-14 w-full min-w-0 rounded-md border p-3 text-left ${selected ? 'bg-secondary' : 'bg-card'}`}
    >
      <span className="block truncate text-sm font-medium">{deck.name}</span>
      <span className="text-muted-foreground block text-xs">
        {deck.cardCount} {deck.cardCount === 1 ? 'card' : 'cards'} · {dueText}
      </span>
      <span className="mt-1.5 block" aria-hidden="true">
        <LevelRamp counts={deck.levelCounts} total={deck.cardCount} />
      </span>
    </button>
  )
}

/**
 * The in-page deck picker: a rail when a deck is selected, a gallery grid
 * when nothing is (`gallery`). Built-in and custom decks are grouped
 * separately, with custom decks further grouped by folder — mirroring
 * Home's deck shelf.
 */
export function DeckRail({
  builtIn,
  custom,
  selectedDeckId,
  onSelectDeck,
  gallery = false,
}: {
  readonly builtIn: readonly DeckSummary[]
  readonly custom: readonly DeckSummary[]
  readonly selectedDeckId: string | null
  readonly onSelectDeck: (deckId: string) => void
  readonly gallery?: boolean
}): React.ReactElement {
  const folderByDeckId = Object.fromEntries(
    custom.map((deck) => [deck.id, deck.folder]),
  )
  const customGroups = groupDecksByFolder(custom, folderByDeckId)
  const builtInGroups = groupByCategory(builtIn)
  const listClassName = gallery
    ? 'grid gap-2 sm:grid-cols-2'
    : 'flex gap-2 overflow-x-auto pb-2 lg:grid lg:gap-2 lg:overflow-visible'
  const itemClassName = gallery ? 'min-w-0' : 'w-40 shrink-0 lg:w-auto'

  return (
    <nav
      aria-label="Decks"
      data-testid="browse-deck-rail"
      className="grid min-w-0 gap-4"
    >
      {custom.length > 0 && (
        <div className="grid min-w-0 gap-3">
          {customGroups.map((group) => (
            <div key={group.name} className="grid min-w-0 gap-2">
              <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {group.name}
              </h2>
              <div className={listClassName}>
                {group.decks.map((deck) => (
                  <div key={deck.id} className={itemClassName}>
                    <DeckButton
                      deck={deck}
                      selected={deck.id === selectedDeckId}
                      onSelectDeck={onSelectDeck}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid min-w-0 gap-3">
        {builtInGroups.map((group) => (
          <div key={group.category} className="grid min-w-0 gap-2">
            <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              {deckCategoryLabel(group.category)}
            </h2>
            <div className={listClassName}>
              {group.items.map((deck) => (
                <div key={deck.id} className={itemClassName}>
                  <DeckButton
                    deck={deck}
                    selected={deck.id === selectedDeckId}
                    onSelectDeck={onSelectDeck}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {gallery && (
        <p className="text-muted-foreground text-sm">
          Choose a deck to browse it as a wall, or{' '}
          <Link href="/settings" className="underline">
            build a custom deck
          </Link>
          .
        </p>
      )}
    </nav>
  )
}

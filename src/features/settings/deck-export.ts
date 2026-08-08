import type { LoadedDeck } from '@/features/study/deck-loader'

export const DECK_EXPORT_FORMAT = 'kanjiforge-deck-export'
export const DECK_EXPORT_VERSION = 1

interface DeckExportRow {
  readonly contentRef: string
  readonly kanji: string
  readonly readings: string
  readonly meanings: string
  readonly nanori: string
  readonly strokeCount: number
  readonly frequency: number | null
  readonly jlpt: number | null
  readonly grade: number | null
  readonly level: number
  readonly dueAt: number | null
  readonly lastReviewedAt: number | null
  readonly totalReviews: number
  readonly totalCorrect: number
  readonly lapses: number
  readonly flagged: boolean
}

function exportRows(deck: LoadedDeck): readonly DeckExportRow[] {
  return deck.cards.flatMap((card) => {
    const content = deck.content.get(card.contentRef)
    if (!content) return []
    const state = card.state
    return [
      {
        contentRef: card.contentRef,
        kanji: content.literal,
        readings: [...content.onReadings, ...content.kunReadings].join('、'),
        meanings: content.meanings.join('; '),
        nanori: content.nanori.join('、'),
        strokeCount: content.strokeCount,
        frequency: content.frequency,
        jlpt: content.jlptLegacy,
        grade: content.grade,
        level: state?.level ?? 0,
        dueAt: state?.dueAt ?? null,
        lastReviewedAt: state?.lastReviewedAt ?? null,
        totalReviews: state?.totalReviews ?? 0,
        totalCorrect: state?.totalCorrect ?? 0,
        lapses: state?.lapses ?? 0,
        flagged: state?.flagged ?? false,
      },
    ]
  })
}

/**
 * Produces a simple tab-separated text export that can be pasted into a
 * spreadsheet or a future deck importer without losing the core card fields.
 * Cards missing from the installed content pack are omitted.
 */
export function formatDeckAsText(deck: LoadedDeck): string {
  return exportRows(deck)
    .map((row) => [row.kanji, row.readings, row.meanings].join('\t'))
    .join('\n')
}

function escapeCsv(value: string | number | boolean | null): string {
  const text = value === null ? '' : String(value)
  return /[",\n\r]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text
}

export function formatDeckAsCsv(deck: LoadedDeck): string {
  const columns = [
    'content_ref',
    'kanji',
    'readings',
    'meanings',
    'nanori',
    'stroke_count',
    'frequency',
    'jlpt',
    'grade',
    'level',
    'due_at',
    'last_reviewed_at',
    'total_reviews',
    'total_correct',
    'lapses',
    'flagged',
  ] as const
  const rows = exportRows(deck).map((row) =>
    [
      row.contentRef,
      row.kanji,
      row.readings,
      row.meanings,
      row.nanori,
      row.strokeCount,
      row.frequency,
      row.jlpt,
      row.grade,
      row.level,
      row.dueAt,
      row.lastReviewedAt,
      row.totalReviews,
      row.totalCorrect,
      row.lapses,
      row.flagged,
    ]
      .map((value) => escapeCsv(value))
      .join(','),
  )
  return [columns.join(','), ...rows].join('\n')
}

export function formatDeckAsJson(deck: LoadedDeck): string {
  return JSON.stringify(
    {
      format: DECK_EXPORT_FORMAT,
      version: DECK_EXPORT_VERSION,
      deck: { id: deck.deckId, name: deck.name },
      cards: exportRows(deck),
    },
    null,
    2,
  )
}

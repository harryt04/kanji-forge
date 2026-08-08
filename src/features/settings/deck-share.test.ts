import { describe, expect, it } from 'vitest'
import type { LoadedDeck } from '@/features/study/deck-loader'
import {
  createDeckShareUrl,
  formatDeckShareFile,
  formatDeckSharePayload,
  parseDeckSharePayload,
} from './deck-share'

function deck(): LoadedDeck {
  return {
    deckId: 'dev-kanji',
    name: 'Travel kanji',
    cards: [
      { deckId: 'dev-kanji', contentRef: 'kanji:日', state: undefined },
      { deckId: 'dev-kanji', contentRef: 'kanji:本', state: undefined },
      { deckId: 'dev-kanji', contentRef: 'kanji:日', state: undefined },
    ],
    content: new Map([
      [
        'kanji:日',
        {
          contentRef: 'kanji:日',
          literal: '日',
          strokeCount: 4,
          frequency: 1,
          jlptLegacy: 5,
          grade: 1,
          nanori: [],
          meanings: ['day'],
          onReadings: ['ニチ'],
          kunReadings: ['ひ'],
        },
      ],
      [
        'kanji:本',
        {
          contentRef: 'kanji:本',
          literal: '本',
          strokeCount: 5,
          frequency: 2,
          jlptLegacy: 5,
          grade: 1,
          nanori: [],
          meanings: ['book'],
          onReadings: ['ホン'],
          kunReadings: ['もと'],
        },
      ],
    ]),
  }
}

describe('deck sharing', () => {
  it('creates a compact content-only payload and URL', () => {
    const shared = formatDeckSharePayload(deck())
    expect(JSON.parse(shared)).toEqual({
      format: 'kanjiforge-deck-share',
      version: 1,
      name: 'Travel kanji',
      kanji: ['日', '本'],
    })
    const url = createDeckShareUrl('https://study.example', deck())
    expect(url.startsWith('https://study.example/analyze?deck=')).toBe(true)
    expect(url).not.toContain('totalReviews')
  })

  it('creates a readable content-only share file without study progress', () => {
    expect(JSON.parse(formatDeckShareFile(deck()))).toEqual({
      format: 'kanjiforge-deck-share',
      version: 1,
      name: 'Travel kanji',
      kanji: ['日', '本'],
    })
    expect(formatDeckShareFile(deck())).toContain('\n  "kanji"')
    expect(formatDeckShareFile(deck())).not.toContain('totalReviews')
  })

  it('rejects unsupported or empty share payloads', () => {
    expect(() => parseDeckSharePayload('{}')).toThrow(/unsupported version/u)
    expect(() =>
      parseDeckSharePayload(
        JSON.stringify({
          format: 'kanjiforge-deck-share',
          version: 1,
          name: 'Empty',
          kanji: ['english'],
        }),
      ),
    ).toThrow(/no kanji/u)
  })

  it('round-trips dictionary-word cards without study progress', () => {
    const parsed = parseDeckSharePayload(formatDeckSharePayload(deckWithWord()))
    expect(parsed.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contentRef: 'word:1',
          kind: 'word',
          label: '日本',
        }),
      ]),
    )
    expect(formatDeckSharePayload(deckWithWord())).not.toContain('totalReviews')
  })
})

function deckWithWord(): LoadedDeck {
  const base = deck()
  return {
    ...base,
    cards: [
      ...base.cards,
      { deckId: base.deckId, contentRef: 'word:1', state: undefined },
    ],
    content: new Map([
      ...base.content,
      [
        'word:1',
        {
          contentRef: 'word:1',
          contentType: 'word',
          literal: '日本',
          readings: ['にほん'],
          strokeCount: 0,
          frequency: 1,
          jlptLegacy: null,
          grade: null,
          nanori: [],
          meanings: ['Japan'],
          onReadings: [],
          kunReadings: [],
        },
      ],
    ]),
  }
}

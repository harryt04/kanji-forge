import { describe, expect, it } from 'vitest'
import {
  deckFolderSettingKey,
  groupDecksByFolder,
  normalizeDeckFolder,
} from './deck-folders'

const decks = [
  {
    id: 'saved',
    name: 'Saved',
    kind: 'saved' as const,
    definitionId: null,
    updatedAt: 0,
  },
  {
    id: 'dev-kanji',
    name: 'Development Kanji',
    kind: 'derived' as const,
    definitionId: 'dev-kanji',
    updatedAt: 0,
  },
]

describe('deck folders', () => {
  it('normalizes labels and creates stable setting keys', () => {
    expect(normalizeDeckFolder('  JLPT   N5  ')).toBe('JLPT N5')
    expect(normalizeDeckFolder('')).toBe('')
    expect(deckFolderSettingKey('saved')).toBe('deck-folder:saved')
  })

  it('groups decks with Unfiled first and sorts folders and decks', () => {
    expect(
      groupDecksByFolder(decks, {
        saved: 'Personal',
        'dev-kanji': 'Core',
      }),
    ).toEqual([
      { name: 'Core', decks: [decks[1]] },
      { name: 'Personal', decks: [decks[0]] },
    ])

    expect(groupDecksByFolder(decks, { saved: 'Personal' })).toEqual([
      { name: 'Unfiled', decks: [decks[1]] },
      { name: 'Personal', decks: [decks[0]] },
    ])
  })
})

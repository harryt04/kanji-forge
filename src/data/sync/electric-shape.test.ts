import { describe, expect, it } from 'vitest'
import {
  applyElectricShapeMessages,
  createElectricShapeState,
  electricSnapshot,
  parseElectricShapeMessages,
} from './electric-shape'

describe('Electric shape adapter', () => {
  it('parses JSON, NDJSON, and SSE responses while ignoring keep-alives', () => {
    expect(
      parseElectricShapeMessages(
        JSON.stringify([
          { key: 'r1', value: { id: 'r1' }, headers: { operation: 'insert' } },
          { headers: { control: 'up-to-date' } },
        ]),
      ),
    ).toHaveLength(2)
    expect(
      parseElectricShapeMessages(
        ': keepalive\ndata: {"headers":{"control":"up-to-date"}}\n\n',
      ),
    ).toEqual([{ headers: { control: 'up-to-date' } }])
    expect(
      parseElectricShapeMessages(
        'not-json\ndata: {"headers":{"operation":"invalid"}}\n',
      ),
    ).toEqual([])
    expect(
      parseElectricShapeMessages(
        JSON.stringify({ headers: { control: 'snapshot-end' } }),
      ),
    ).toEqual([{ headers: { control: 'snapshot-end' } }])
    expect(parseElectricShapeMessages('')).toEqual([])
    expect(parseElectricShapeMessages(JSON.stringify([null, {}]))).toEqual([{}])
  })

  it('materializes inserts, partial updates, deletes, and protocol refetches', () => {
    const state = createElectricShapeState()
    applyElectricShapeMessages(state, 'decks', [
      {
        key: 'deck-1',
        value: { id: 'deck-1', name: 'Old' },
        headers: { operation: 'insert' },
      },
      {
        key: 'deck-1',
        value: { name: 'New' },
        headers: { operation: 'update' },
      },
    ])
    expect(state.rows.get('decks')?.get('deck-1')).toEqual({
      id: 'deck-1',
      name: 'New',
    })
    applyElectricShapeMessages(state, 'decks', [
      { key: 'deck-1', headers: { operation: 'delete' } },
    ])
    expect(state.rows.get('decks')).toEqual(new Map())
    applyElectricShapeMessages(state, 'decks', [
      { headers: { control: 'must-refetch' } },
      {
        key: 'deck-2',
        value: {
          id: 'deck-2',
          name: 'Fresh',
          kind: 'custom',
          updated_at: 10,
        },
        headers: { operation: 'insert' },
      },
    ])
    expect(electricSnapshot(state).decks).toEqual([
      {
        id: 'deck-2',
        name: 'Fresh',
        kind: 'custom',
        definitionId: null,
        updatedAt: 10,
      },
    ])
  })

  it('maps snake-case sync rows to the local snapshot contract', () => {
    const state = createElectricShapeState()
    applyElectricShapeMessages(state, 'reviews', [
      {
        key: 'review-1',
        value: {
          id: 'review-1',
          deck_id: 'dev-kanji',
          content_ref: 'kanji:日',
          at: 10,
          grade: 'good',
          level_before: 0,
          level_after: 1,
          interval_before: 0,
          elapsed_days: 0,
          response_ms: 500,
          source: 'study',
          device_id: 'device-1',
        },
        headers: { operation: 'insert' },
      },
    ])
    applyElectricShapeMessages(state, 'decks', [
      {
        key: 'saved',
        value: {
          id: 'saved',
          name: 'Saved',
          kind: 'saved',
          definition_id: null,
          updated_at: 20,
        },
        headers: { operation: 'insert' },
      },
      {
        key: 'ignored',
        value: {
          id: 'ignored',
          name: 'Ignored',
          kind: 'unknown',
          updated_at: 20,
        },
        headers: { operation: 'insert' },
      },
    ])
    applyElectricShapeMessages(state, 'settings', [
      {
        key: 'theme',
        value: { key: 'theme', value: 'dark', updated_at: '20' },
        headers: { operation: 'insert' },
      },
    ])
    applyElectricShapeMessages(state, 'deck_membership', [
      {
        key: 'saved:kanji:日',
        value: {
          deck_id: 'saved',
          content_ref: 'kanji:日',
          sort_order: 0,
          added_at: 10,
          updated_at: 20,
        },
        headers: { operation: 'insert' },
      },
    ])
    applyElectricShapeMessages(state, 'sticky_annotations', [
      {
        key: 'saved:kanji:日',
        value: {
          deck_id: 'saved',
          content_ref: 'kanji:日',
          note: 'sun',
          tags_json: '["day"]',
          updated_at: 20,
          updated_by: 'device-1',
        },
        headers: { operation: 'insert' },
      },
    ])
    expect(electricSnapshot(state)).toMatchObject({
      reviews: [{ id: 'review-1', grade: 'good' }],
      decks: [{ id: 'saved', kind: 'saved' }],
      settings: [{ key: 'theme', value: 'dark', updatedAt: 20 }],
      deckMembership: [{ deckId: 'saved', contentRef: 'kanji:日' }],
      annotations: [{ deckId: 'saved', tags: ['day'] }],
    })
  })

  it('skips malformed rows instead of poisoning the sync projection', () => {
    const state = createElectricShapeState()
    applyElectricShapeMessages(state, 'reviews', [
      {
        key: 'bad-review',
        value: { id: 'bad-review', grade: 'unknown' },
        headers: { operation: 'insert' },
      },
    ])
    applyElectricShapeMessages(state, 'sticky_annotations', [
      {
        key: 'bad-annotation',
        value: {
          deck_id: 'saved',
          content_ref: 'kanji:日',
          note: 'bad tags',
          tags_json: '{not-json',
          updated_at: 20,
          updated_by: 'device-1',
        },
        headers: { operation: 'insert' },
      },
    ])
    expect(electricSnapshot(state)).toEqual({
      reviews: [],
      decks: [],
      settings: [],
      deckMembership: [],
      annotations: [],
    })
  })

  it('handles alternate keys and incomplete metadata defensively', () => {
    const state = createElectricShapeState()
    applyElectricShapeMessages(state, 'settings', [
      {
        value: { key: 'language', value: 'ja', updatedAt: 20 },
        headers: { operation: 'insert' },
      },
      {
        key: 'incomplete',
        value: { key: 'incomplete', value: 'missing timestamp' },
        headers: { operation: 'insert' },
      },
    ])
    applyElectricShapeMessages(state, 'deck_membership', [
      {
        value: {
          deckId: 'saved',
          contentRef: 'kanji:月',
          sortOrder: '1',
          addedAt: '20',
          updatedAt: '20',
        },
        headers: { operation: 'insert' },
      },
      {
        key: 'incomplete-membership',
        value: { deck_id: 'saved', content_ref: 'kanji:日' },
        headers: { operation: 'insert' },
      },
    ])
    applyElectricShapeMessages(state, 'sticky_annotations', [
      {
        value: {
          deckId: 'saved',
          contentRef: 'kanji:月',
          note: 'moon',
          updatedAt: 20,
          updatedBy: 'device-1',
        },
        headers: { operation: 'insert' },
      },
      {
        key: 'array-tags',
        value: {
          deck_id: 'saved',
          content_ref: 'kanji:火',
          note: 'fire',
          tags_json: '{}',
          updated_at: 20,
          updated_by: 'device-1',
        },
        headers: { operation: 'insert' },
      },
      {
        key: 'incomplete-annotation',
        value: { deck_id: 'saved', content_ref: 'kanji:水', tags_json: '[]' },
        headers: { operation: 'insert' },
      },
    ])
    applyElectricShapeMessages(state, 'reviews', [
      {
        key: 'bad-level',
        value: {
          id: 'bad-level',
          deckId: 'dev-kanji',
          contentRef: 'kanji:日',
          at: 20,
          grade: 'good',
          levelBefore: 9,
          levelAfter: 1,
          intervalBefore: 0,
          elapsedDays: 0,
          responseMs: 1,
          source: 'study',
          deviceId: 'device-1',
        },
        headers: { operation: 'insert' },
      },
    ])
    expect(electricSnapshot(state)).toMatchObject({
      settings: [{ key: 'language', value: 'ja', updatedAt: 20 }],
      deckMembership: [{ contentRef: 'kanji:月', sortOrder: 1 }],
      annotations: [
        { contentRef: 'kanji:月', tags: [] },
        { contentRef: 'kanji:火', tags: [] },
      ],
      reviews: [],
    })
  })
})

import { readFileSync } from 'fs'
import { join } from 'path'
import initSqlJs from 'sql.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const FIXTURE_ROOT = join(process.cwd(), 'public', 'packs-dev')
const REPO_PACK_ROOT = join(process.cwd(), 'packs')

function fixtureFetch(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('/packs/decks/')) {
      try {
        return new Response(
          readFileSync(join(process.cwd(), url.slice(1)), 'utf8'),
          { status: 200 },
        )
      } catch {
        return new Response('not found', { status: 404 })
      }
    }
    const path = url.replace(/^\/packs-dev\//, '')
    try {
      const buffer = readFileSync(
        join(
          path === 'similar.json' || path.startsWith('strokes/')
            ? REPO_PACK_ROOT
            : FIXTURE_ROOT,
          path,
        ),
      )
      const body = path.endsWith('.json')
        ? buffer.toString('utf8')
        : new Uint8Array(buffer)
      return new Response(body as BodyInit, { status: 200 })
    } catch {
      return new Response('not found', { status: 404 })
    }
  }) as unknown as typeof fetch
}

async function freshPacks(): Promise<typeof import('./index')> {
  vi.resetModules()
  return import('./index')
}

describe('data/packs', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fixtureFetch())
  })

  describe('parseContentRef', () => {
    it('splits a type:key contentRef', async () => {
      const { parseContentRef } = await freshPacks()
      expect(parseContentRef('kanji:日')).toEqual({ type: 'kanji', key: '日' })
    })

    it('throws on malformed input with no separator', async () => {
      const { parseContentRef } = await freshPacks()
      expect(() => parseContentRef('kanji')).toThrow('Malformed contentRef')
    })
  })

  describe('loadDeckDefinitions', () => {
    it('loads the built-in deck catalog', async () => {
      const { loadDeckDefinitions } = await freshPacks()
      const decks = await loadDeckDefinitions()
      expect(decks.length).toBeGreaterThan(0)
      for (const level of ['n5', 'n4', 'n3', 'n2', 'n1']) {
        expect(
          decks.find((deck) => deck.id === `jlpt-kanji-${level}`),
        ).toMatchObject({ contentType: 'kanji', category: 'jlpt' })
      }
      expect(decks.find((deck) => deck.id === 'kanken-10')).toMatchObject({
        name: 'Kanji Kentei 10',
        contentType: 'kanji',
        category: 'kanken',
        contentRefs: expect.arrayContaining(['kanji:一']),
      })
    })

    it('returns decks sorted by category', async () => {
      const { loadDeckDefinitions } = await freshPacks()
      const decks = await loadDeckDefinitions()
      const categories = decks.map((deck) => deck.category)
      const firstSeen = [...new Set(categories)]
      const sortedCopy = [...categories].sort(
        (a, b) => firstSeen.indexOf(a) - firstSeen.indexOf(b),
      )
      expect(categories).toEqual(sortedCopy)
    })

    it('caches the deck definitions across calls', async () => {
      const { loadDeckDefinitions } = await freshPacks()
      const first = await loadDeckDefinitions()
      const second = await loadDeckDefinitions()
      expect(first).toBe(second)
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('reports a failed deck-definition response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('unavailable', { status: 503 })),
      )
      const { loadDeckDefinitions } = await freshPacks()

      await expect(loadDeckDefinitions()).rejects.toThrow(
        'Failed to load deck definitions (503)',
      )
    })
  })

  describe('getKanjiByLiterals', () => {
    it('resolves known kanji against the packs-dev fixture', async () => {
      const { getKanjiByLiterals } = await freshPacks()
      const result = await getKanjiByLiterals(['日', '一'])
      expect(result.get('日')).toMatchObject({ literal: '日' })
      expect(result.get('一')).toMatchObject({ literal: '一' })
    })

    it('omits literals that are not present in the pack', async () => {
      const { getKanjiByLiterals } = await freshPacks()
      const result = await getKanjiByLiterals(['あ'])
      expect(result.has('あ')).toBe(false)
    })

    it('caches the pack handle across lookups', async () => {
      const { getKanjiByLiterals } = await freshPacks()
      await getKanjiByLiterals(['日'])
      await getKanjiByLiterals(['一'])
      const packFetches = vi
        .mocked(fetch)
        .mock.calls.filter(([url]) => String(url).includes('kanji-v1.sqlite'))
      expect(packFetches).toHaveLength(1)
    })
  })

  describe('getKanjiComponents', () => {
    it('loads the nested offline component tree for a kanji', async () => {
      const { getKanjiComponents } = await freshPacks()
      await expect(getKanjiComponents('国')).resolves.toEqual({
        element: '国',
        children: [
          { element: '囗', children: [] },
          {
            element: '玉',
            children: [
              { element: '王', children: [] },
              { element: '丶', children: [] },
            ],
          },
          { element: '囗', children: [] },
        ],
      })
    })

    it('returns null for a non-kanji or missing stroke entry', async () => {
      const { getKanjiComponents } = await freshPacks()
      await expect(getKanjiComponents('あ')).resolves.toBeNull()
      await expect(getKanjiComponents('𠀀')).resolves.toBeNull()
      await expect(getKanjiComponents('𠀁')).resolves.toBeNull()
      await expect(getKanjiComponents('鿿')).resolves.toBeNull()
    })

    it('returns a leaf component for a kanji without children', async () => {
      const { getKanjiComponents } = await freshPacks()
      await expect(getKanjiComponents('日')).resolves.toEqual({
        element: '日',
        children: [],
      })
    })

    it('reports an unavailable stroke component pack', async () => {
      const fixture = fixtureFetch()
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          if (String(input).includes('/strokes/'))
            return new Response('unavailable', { status: 503 })
          return fixture(input)
        }),
      )
      const { getKanjiComponents } = await freshPacks()
      await expect(getKanjiComponents('国')).rejects.toThrow(
        'Failed to load stroke component pack (503)',
      )
    })
  })

  describe('getKanjiStrokes', () => {
    it('loads ordered offline KanjiVG paths for a kanji', async () => {
      const { getKanjiStrokes } = await freshPacks()
      await expect(getKanjiStrokes('日')).resolves.toEqual([
        expect.stringContaining('M31.5,24.5'),
        expect.stringContaining('M33.48,26'),
        expect.stringContaining('M34.22,55.25'),
        expect.stringContaining('M34.23,86.5'),
      ])
    })

    it('returns null for content without an available stroke path pack', async () => {
      const { getKanjiStrokes } = await freshPacks()
      await expect(getKanjiStrokes('あ')).resolves.toBeNull()
    })
  })

  describe('getSimilarKanji', () => {
    it('loads ranked similar-looking kanji from the offline derived pack', async () => {
      const { getSimilarKanji } = await freshPacks()
      const result = await getSimilarKanji('国')
      expect(result.length).toBeGreaterThan(0)
      expect(result).toEqual(expect.arrayContaining(['固']))
    })

    it('returns an empty list for a literal without generated matches', async () => {
      const { getSimilarKanji } = await freshPacks()
      expect(await getSimilarKanji('あ')).toEqual([])
    })
  })

  describe('searchDictionaryByRadical', () => {
    it('returns frequency-ranked kanji for a classical radical', async () => {
      const { searchDictionaryByRadical } = await freshPacks()
      const result = await searchDictionaryByRadical(75)

      expect(result.length).toBeGreaterThan(0)
      expect(result.every((entry) => entry.type === 'kanji')).toBe(true)
      expect(
        result.every(
          (entry) =>
            entry.type === 'kanji' && entry.record.radicalClassical === 75,
        ),
      ).toBe(true)
      expect(result[0]).toMatchObject({ type: 'kanji' })
    })

    it('rejects invalid radical numbers without loading a pack', async () => {
      const { searchDictionaryByRadical } = await freshPacks()

      await expect(searchDictionaryByRadical(0)).resolves.toEqual([])
      await expect(searchDictionaryByRadical(75, 0)).resolves.toEqual([])
    })
  })

  describe('searchDictionaryByStrokeCount', () => {
    it('returns frequency-ranked kanji with the requested stroke count', async () => {
      const { searchDictionaryByStrokeCount } = await freshPacks()
      const result = await searchDictionaryByStrokeCount(4)

      expect(result.length).toBeGreaterThan(0)
      expect(result.every((entry) => entry.type === 'kanji')).toBe(true)
      expect(
        result.every(
          (entry) => entry.type === 'kanji' && entry.record.strokeCount === 4,
        ),
      ).toBe(true)
      expect(
        result.some(
          (entry) => entry.type === 'kanji' && entry.record.literal === '日',
        ),
      ).toBe(true)
    })

    it('rejects invalid stroke counts without loading a pack', async () => {
      const { searchDictionaryByStrokeCount } = await freshPacks()

      await expect(searchDictionaryByStrokeCount(0)).resolves.toEqual([])
      await expect(searchDictionaryByStrokeCount(4, 0)).resolves.toEqual([])
    })
  })

  describe('getExampleWords', () => {
    it('returns ranked words whose kanji form contains the requested literal', async () => {
      const { getExampleWords } = await freshPacks()
      const result = await getExampleWords('国')

      expect(result.length).toBeGreaterThan(0)
      expect(result[0]).toMatchObject({
        forms: ['愛国'],
        readings: ['あいこく'],
      })
      expect(
        result.every((word) => word.forms.some((form) => form.includes('国'))),
      ).toBe(true)
    })

    it('returns no examples for an empty literal or exhausted limit', async () => {
      const { getExampleWords } = await freshPacks()

      await expect(getExampleWords('国', 0)).resolves.toEqual([])
      await expect(getExampleWords('')).resolves.toEqual([])
    })
  })

  describe('getWordById', () => {
    it('resolves an analyzed word by its stable dictionary id', async () => {
      const { getWordById, searchDictionary } = await freshPacks()
      const result = (await searchDictionary('お金')).find(
        (entry) => entry.type === 'word',
      )
      if (!result || result.type !== 'word')
        throw new Error('Word fixture missing')

      await expect(getWordById(result.record.id)).resolves.toEqual(
        result.record,
      )
      await expect(getWordById(-1)).resolves.toBeNull()
    })
  })

  describe('getExampleSentences', () => {
    it('returns ranked offline sentences with furigana and attribution', async () => {
      const { getExampleSentences } = await freshPacks()
      const result = await getExampleSentences('僕')

      expect(result[0]).toMatchObject({
        japanese: '僕がやります。',
        english: 'I will.',
        japaneseAuthor: 'tommy_san',
        englishAuthor: 'magnificentgoddess',
      })
      expect(result[0]?.furigana).toEqual([
        { text: '僕', furigana: 'ぼく' },
        { text: 'が', furigana: '' },
        { text: 'やります', furigana: '' },
        { text: '。', furigana: '' },
      ])
      expect(result.every((sentence) => sentence.japanese.includes('僕'))).toBe(
        true,
      )

      const missingFurigana = await getExampleSentences('悲', 1)
      expect(missingFurigana[0]?.furigana[0]).toEqual({
        text: '悲',
        furigana: 'かな',
      })
      expect(missingFurigana[0]?.furigana[1]).toEqual({
        text: 'しい',
        furigana: '',
      })
    })

    it('returns no examples for an empty literal or exhausted limit', async () => {
      const { getExampleSentences } = await freshPacks()

      await expect(getExampleSentences('僕', 0)).resolves.toEqual([])
      await expect(getExampleSentences('')).resolves.toEqual([])
    })
  })

  describe('parseSentenceTokens', () => {
    it('falls back to a plain sentence for malformed or empty alignment data', async () => {
      const { parseSentenceTokens } = await freshPacks()

      expect(parseSentenceTokens('not-json', '安全')).toEqual([
        { text: '安全', furigana: '' },
      ])
      expect(parseSentenceTokens('{}', '安全')).toEqual([
        { text: '安全', furigana: '' },
      ])
      expect(
        parseSentenceTokens('[null,{"text":1},{"furigana":"あ"}]', '安全'),
      ).toEqual([{ text: '安全', furigana: '' }])
    })

    it('normalizes non-string furigana values while retaining valid text', async () => {
      const { parseSentenceTokens } = await freshPacks()

      expect(parseSentenceTokens('[{"text":"学","furigana":4}]', '学')).toEqual(
        [{ text: '学', furigana: '' }],
      )
    })
  })

  describe('searchDictionary', () => {
    it('searches kanji and words by Japanese text, romaji, and English', async () => {
      const { searchDictionary } = await freshPacks()

      const kanjiResults = await searchDictionary('日')
      expect(
        kanjiResults.some(
          (result) => result.type === 'kanji' && result.record.literal === '日',
        ),
      ).toBe(true)

      const romajiResults = await searchDictionary('okane')
      expect(
        romajiResults.some(
          (result) =>
            result.type === 'word' && result.record.forms.includes('お金'),
        ),
      ).toBe(true)

      const englishResults = await searchDictionary('money')
      expect(
        englishResults.some(
          (result) =>
            result.type === 'word' && result.record.forms.includes('お金'),
        ),
      ).toBe(true)

      expect((await searchDictionary('明')).length).toBeGreaterThan(0)
      expect((await searchDictionary('vious')).length).toBeGreaterThan(0)
      expect(await searchDictionary('money', 0)).toEqual([])
    })

    it('supports * and ? wildcards across normalized dictionary values', async () => {
      const { searchDictionary } = await freshPacks()

      const prefixResults = await searchDictionary('お*')
      expect(
        prefixResults.some(
          (result) =>
            result.type === 'word' && result.record.forms.includes('お金'),
        ),
      ).toBe(true)

      const singleCharacterResults = await searchDictionary('?金')
      expect(
        singleCharacterResults.some(
          (result) =>
            result.type === 'word' && result.record.forms.includes('お金'),
        ),
      ).toBe(true)

      const englishResults = await searchDictionary('*money*')
      expect(
        englishResults.some(
          (result) =>
            result.type === 'word' && result.record.forms.includes('お金'),
        ),
      ).toBe(true)
    })

    it('requires wildcard patterns to match the complete value', async () => {
      const { searchDictionary } = await freshPacks()

      const results = await searchDictionary('?金')
      expect(
        results.every(
          (result) =>
            result.type !== 'word' || result.record.forms.includes('お金'),
        ),
      ).toBe(true)
    })

    it('returns no results for a blank query and caches dictionary packs', async () => {
      const { searchDictionary } = await freshPacks()
      expect(await searchDictionary('   ')).toEqual([])
      await searchDictionary('money')
      await searchDictionary('okane')
      const packFetches = vi
        .mocked(fetch)
        .mock.calls.map(([url]) => String(url))
      expect(
        packFetches.filter((url) => url.includes('kanji-v1.sqlite')),
      ).toHaveLength(1)
      expect(
        packFetches.filter((url) => url.includes('words-core-v1.sqlite')),
      ).toHaveLength(1)
    })

    it('searches an optional JMnedict pack without requiring it for core search', async () => {
      const SQL = await initSqlJs()
      const names = new SQL.Database()
      names.run(`
        CREATE TABLE entries (id INTEGER PRIMARY KEY, common_score INTEGER NOT NULL, data BLOB NOT NULL);
        CREATE TABLE forms (entry_id INTEGER NOT NULL, form TEXT NOT NULL, kind TEXT NOT NULL, is_common INTEGER NOT NULL);
        CREATE TABLE glosses_fts (entry_id INTEGER NOT NULL, gloss TEXT NOT NULL);
      `)
      names.run('INSERT INTO entries VALUES (?, ?, ?)', [
        5000000,
        80,
        new TextEncoder().encode(
          JSON.stringify({
            kanji: [{ text: '山田' }],
            kana: [{ text: 'やまだ' }],
            translations: [{ nameTypes: ['surname'], details: ['Yamada'] }],
          }),
        ),
      ])
      names.run('INSERT INTO glosses_fts VALUES (?, ?)', [5000000, 'Yamada'])
      names.run('INSERT INTO entries VALUES (?, ?, ?)', [
        5000001,
        0,
        new TextEncoder().encode(
          JSON.stringify({
            kanji: [{}, null],
            kana: [{}, null],
            translations: [{ nameTypes: 'not-an-array' }, null],
          }),
        ),
      ])

      const namesBytes = names.export()
      names.close()
      const coreFetch = fixtureFetch()
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) =>
          String(input).includes('names-v1.sqlite')
            ? new Response(new Uint8Array(namesBytes), { status: 200 })
            : coreFetch(input),
        ),
      )

      const { findDictionaryEntry, getNameById, searchDictionary } =
        await freshPacks()
      await expect(searchDictionary('Yamada')).resolves.toEqual([
        {
          type: 'name',
          record: {
            id: 5000000,
            commonScore: 80,
            forms: ['山田'],
            readings: ['やまだ'],
            nameTypes: ['surname'],
            partsOfSpeech: [],
            meanings: ['Yamada'],
          },
        },
      ])
      await expect(getNameById(5000000)).resolves.toMatchObject({
        forms: ['山田'],
        meanings: ['Yamada'],
      })
      await expect(getNameById(5000001)).resolves.toMatchObject({
        forms: [],
        readings: [],
        nameTypes: [],
        meanings: [],
      })
      await expect(findDictionaryEntry('Yamada')).resolves.toMatchObject({
        type: 'name',
        record: { id: 5000000 },
      })
    })
  })

  describe('analyzeJapaneseText', () => {
    it('uses the longest offline dictionary match and preserves unknown text', async () => {
      const { analyzeJapaneseText } = await freshPacks()
      const result = await analyzeJapaneseText('お金を𠀁')

      expect(result[0]).toMatchObject({
        text: 'お金',
        type: 'word',
        reading: 'おかね',
        contentRef: expect.stringMatching(/^word:\d+$/u),
      })
      expect(result.at(-1)).toEqual({
        text: '𠀁',
        reading: null,
        meanings: [],
        type: 'unknown',
      })
    })

    it('returns no tokens for blank input or a non-positive token limit', async () => {
      const { analyzeJapaneseText } = await freshPacks()

      await expect(analyzeJapaneseText('  ')).resolves.toEqual([])
      await expect(analyzeJapaneseText('日本', 0)).resolves.toEqual([])
    })
  })

  describe('findDictionaryEntriesInText', () => {
    it('resolves unique dictionary cards from a phrase with no exact entry', async () => {
      const { findDictionaryEntriesInText } = await freshPacks()
      const result = await findDictionaryEntriesInText('お金を本')

      expect(result.map(({ text }) => text)).toEqual(['お金', '本'])
      expect(result.map(({ result: entry }) => entry.type)).toEqual([
        'word',
        'kanji',
      ])
    })

    it('ignores grammar and unknown tokens while preserving dictionary order', async () => {
      const { findDictionaryEntriesInText } = await freshPacks()
      const result = await findDictionaryEntriesInText('お金を𠀁')

      expect(result.map(({ text }) => text)).toEqual(['お金'])
    })

    it('deduplicates repeated dictionary cards from a phrase', async () => {
      const { findDictionaryEntriesInText } = await freshPacks()
      const result = await findDictionaryEntriesInText('お金お金')

      expect(result.map(({ text }) => text)).toEqual(['お金'])
    })
  })

  it('finds exact kanji and word entries for offline imports', async () => {
    const { findDictionaryEntry } = await freshPacks()

    await expect(findDictionaryEntry('日')).resolves.toMatchObject({
      type: 'kanji',
      record: { literal: '日' },
    })
    await expect(findDictionaryEntry('お金')).resolves.toMatchObject({
      type: 'word',
      record: {
        forms: expect.arrayContaining(['お金']),
        readings: expect.arrayContaining(['おかね']),
      },
    })
    await expect(
      findDictionaryEntry('not-a-dictionary-entry'),
    ).resolves.toBeNull()
  })
})

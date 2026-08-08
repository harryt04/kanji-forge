import { readFileSync } from 'fs'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const FIXTURE_ROOT = join(process.cwd(), 'public', 'packs-dev')
const REPO_PACK_ROOT = join(process.cwd(), 'packs')

function fixtureFetch(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
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
    it('loads deck definitions from the packs-dev fixture', async () => {
      const { loadDeckDefinitions } = await freshPacks()
      const decks = await loadDeckDefinitions()
      expect(decks.length).toBeGreaterThan(0)
      expect(decks.find((deck) => deck.id === 'dev-kanji')).toMatchObject({
        contentType: 'kanji',
      })
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
  })
})

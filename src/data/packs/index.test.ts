import { readFileSync } from 'fs'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const FIXTURE_ROOT = join(process.cwd(), 'public', 'packs-dev')

function fixtureFetch(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const path = url.replace(/^\/packs-dev\//, '')
    try {
      const buffer = readFileSync(join(FIXTURE_ROOT, path))
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

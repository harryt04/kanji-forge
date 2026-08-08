import { describe, expect, it } from 'vitest'
import { parseFuriganaTokens } from './furigana'

describe('parseFuriganaTokens', () => {
  it('parses JSON alignment data and removes a UTF-8 BOM', () => {
    expect(
      parseFuriganaTokens(
        '\uFEFF[{"text":"僕","furigana":"ぼく"},{"text":"が"}]',
        '僕が',
      ),
    ).toEqual([
      { text: '僕', furigana: 'ぼく' },
      { text: 'が', furigana: '' },
    ])
  })

  it('accepts decoded alignment arrays', () => {
    expect(
      parseFuriganaTokens(
        [{ text: '悲', furigana: 'かな' }, { text: 'しい' }],
        '悲しい',
      ),
    ).toEqual([
      { text: '悲', furigana: 'かな' },
      { text: 'しい', furigana: '' },
    ])
  })

  it('falls back to the original sentence for malformed or empty data', () => {
    expect(parseFuriganaTokens('not-json', '安全')).toEqual([
      { text: '安全', furigana: '' },
    ])
    expect(parseFuriganaTokens('{}', '安全')).toEqual([
      { text: '安全', furigana: '' },
    ])
    expect(parseFuriganaTokens('[null,{"text":1}]', '安全')).toEqual([
      { text: '安全', furigana: '' },
    ])
  })

  it('keeps valid text while normalizing invalid furigana values', () => {
    expect(parseFuriganaTokens('[{"text":"学","furigana":4}]', '学')).toEqual([
      { text: '学', furigana: '' },
    ])
  })
})

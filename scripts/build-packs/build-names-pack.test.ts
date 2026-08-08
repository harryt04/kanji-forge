import { describe, expect, it } from 'vitest'
import { createJmnedictParseState, parseJmnedictLine } from './build-names-pack'

describe('JMnedict parser', () => {
  it('retains Japanese forms, restrictions, name types, and translations', () => {
    const state = createJmnedictParseState()
    const lines = [
      '<entry>',
      '<ent_seq>1234567</ent_seq>',
      '<k_ele>',
      '<keb>山田</keb>',
      '<ke_pri>ichi1</ke_pri>',
      '</k_ele>',
      '<r_ele>',
      '<reb>やまだ</reb>',
      '<re_restr>山田</re_restr>',
      '</r_ele>',
      '<trans>',
      '<name_type>&surname;</name_type>',
      '<trans_det xml:lang="eng">Yamada</trans_det>',
      '</trans>',
      '</entry>',
    ]

    const entry = lines.flatMap((line) => {
      const parsed = parseJmnedictLine(line, state)
      return parsed ? [parsed] : []
    })[0]

    expect(entry).toEqual({
      entSeq: 1234567,
      kanji: [{ text: '山田', info: [], pri: ['ichi1'] }],
      kana: [{ text: 'やまだ', restrictions: ['山田'], pri: [] }],
      translations: [{ nameTypes: ['surname'], details: ['Yamada'] }],
    })
  })

  it('decodes numeric XML entities and supports kana-only names', () => {
    const state = createJmnedictParseState()
    const lines = [
      '<entry>',
      '<ent_seq>42</ent_seq>',
      '<r_ele>',
      '<reb>&#x30A2;&#12452;</reb>',
      '</r_ele>',
      '<trans>',
      '<name_type>&company;</name_type>',
      '<trans_det>Acme &amp; Co.</trans_det>',
      '</trans>',
      '</entry>',
    ]

    const entry = lines.flatMap((line) => {
      const parsed = parseJmnedictLine(line, state)
      return parsed ? [parsed] : []
    })[0]

    expect(entry).toMatchObject({
      entSeq: 42,
      kana: [{ text: 'アイ' }],
      translations: [{ nameTypes: ['company'], details: ['Acme & Co.'] }],
    })
  })
})

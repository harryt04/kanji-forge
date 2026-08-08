import { describe, expect, it } from 'vitest'
import { inflectedSurfaces } from './inflect'

describe('inflectedSurfaces', () => {
  it('covers common ichidan polite and te-form surfaces', () => {
    expect(inflectedSurfaces('食べる', 'たべる')).toEqual(
      expect.arrayContaining([
        { text: '食べました', reading: 'たべました' },
        { text: '食べて', reading: 'たべて' },
      ]),
    )
  })

  it('covers common godan stem changes', () => {
    expect(inflectedSurfaces('読む', 'よむ')).toEqual(
      expect.arrayContaining([
        { text: '読みます', reading: 'よみます' },
        { text: '読んで', reading: 'よんで' },
        { text: '読みませんでした', reading: 'よみませんでした' },
        { text: '読まなかった', reading: 'よまなかった' },
        { text: '読めば', reading: 'よめば' },
        { text: '読もう', reading: 'よもう' },
      ]),
    )
  })

  it('does not invent godan forms for ordinary ichidan verbs', () => {
    expect(inflectedSurfaces('食べる', 'たべる')).not.toContainEqual({
      text: '食べりました',
      reading: 'たべりました',
    })
    expect(inflectedSurfaces('帰る', 'かえる')).toContainEqual({
      text: '帰りました',
      reading: 'かえりました',
    })
  })

  it('covers i-adjective forms without changing the lemma', () => {
    expect(inflectedSurfaces('高い', 'たかい')).toEqual(
      expect.arrayContaining([
        { text: '高かった', reading: 'たかかった' },
        { text: '高くなかった', reading: 'たかくなかった' },
        { text: '高ければ', reading: 'たかければ' },
      ]),
    )
  })
})

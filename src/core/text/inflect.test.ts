import { describe, expect, it } from 'vitest'
import { inflectedSurfaces } from './inflect'

describe('inflectedSurfaces', () => {
  it('covers common ichidan polite and te-form surfaces', () => {
    expect(inflectedSurfaces('食べる', 'たべる')).toEqual(
      expect.arrayContaining([
        { text: '食べました', reading: 'たべました' },
        { text: '食べて', reading: 'たべて' },
        { text: '食べています', reading: 'たべています' },
        { text: '食べていなかった', reading: 'たべていなかった' },
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
        { text: '読んでいる', reading: 'よんでいる' },
        { text: '読んでいました', reading: 'よんでいました' },
        { text: '読んでいませんでした', reading: 'よんでいませんでした' },
      ]),
    )
  })

  it('covers plain imperative and prohibitive forms', () => {
    expect(inflectedSurfaces('食べる', 'たべる')).toEqual(
      expect.arrayContaining([
        { text: '食べろ', reading: 'たべろ' },
        { text: '食べるな', reading: 'たべるな' },
      ]),
    )
    expect(inflectedSurfaces('読む', 'よむ')).toEqual(
      expect.arrayContaining([
        { text: '読め', reading: 'よめ' },
        { text: '読むな', reading: 'よむな' },
      ]),
    )
  })

  it('covers common ichidan and godan potential forms', () => {
    expect(inflectedSurfaces('食べる', 'たべる')).toEqual(
      expect.arrayContaining([
        { text: '食べられる', reading: 'たべられる' },
        { text: '食べられなかった', reading: 'たべられなかった' },
      ]),
    )
    expect(inflectedSurfaces('読む', 'よむ')).toEqual(
      expect.arrayContaining([
        { text: '読める', reading: 'よめる' },
        { text: '読めなかった', reading: 'よめなかった' },
      ]),
    )
  })

  it('covers passive and causative forms with auxiliary inflections', () => {
    expect(inflectedSurfaces('食べる', 'たべる')).toEqual(
      expect.arrayContaining([
        { text: '食べさせる', reading: 'たべさせる' },
        { text: '食べさせなかった', reading: 'たべさせなかった' },
        { text: '食べさせています', reading: 'たべさせています' },
        { text: '食べられている', reading: 'たべられている' },
      ]),
    )
    expect(inflectedSurfaces('読む', 'よむ')).toEqual(
      expect.arrayContaining([
        { text: '読まれる', reading: 'よまれる' },
        { text: '読まれました', reading: 'よまれました' },
        { text: '読ませている', reading: 'よませている' },
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

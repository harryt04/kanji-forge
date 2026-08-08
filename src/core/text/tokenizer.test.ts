import { describe, expect, it } from 'vitest'
import { coalesceTokenizerTokens } from './tokenizer'

describe('coalesceTokenizerTokens', () => {
  it('keeps verb and adjective auxiliary chains together', () => {
    expect(
      coalesceTokenizerTokens([
        { surface_form: '読ん', basic_form: '読む', pos: '動詞' },
        { surface_form: 'で', basic_form: 'で', pos: '助詞' },
        { surface_form: 'い', basic_form: 'いる', pos: '動詞' },
        { surface_form: 'ます', basic_form: 'ます', pos: '助動詞' },
        { surface_form: '。', basic_form: '。', pos: '記号' },
      ]),
    ).toEqual(['読んでいます', '。'])
  })

  it('does not absorb a following noun into a verb phrase', () => {
    expect(
      coalesceTokenizerTokens([
        { surface_form: '読む', basic_form: '読む', pos: '動詞' },
        { surface_form: '本', basic_form: '本', pos: '名詞' },
        { surface_form: 'を', basic_form: 'を', pos: '助詞' },
      ]),
    ).toEqual(['読む', '本', 'を'])
  })

  it('keeps passive and causative auxiliaries with their stems', () => {
    expect(
      coalesceTokenizerTokens([
        { surface_form: '読ま', basic_form: '読む', pos: '動詞' },
        { surface_form: 'れ', basic_form: 'れる', pos: '動詞' },
        { surface_form: 'まし', basic_form: 'ます', pos: '助動詞' },
        { surface_form: 'た', basic_form: 'た', pos: '助動詞' },
      ]),
    ).toEqual(['読まれました'])
  })
})

import type { KuromojiToken } from 'kuromoji'

const TOKENIZER_DICT_PATH = '/packs/tokenizer/dict/'

type Tokenizer = {
  tokenize(text: string): KuromojiToken[]
}

let tokenizerPromise: Promise<Tokenizer | null> | undefined

function buildTokenizer(): Promise<Tokenizer | null> {
  return import('kuromoji')
    .then(
      ({ default: kuromoji }) =>
        new Promise<Tokenizer | null>((resolve, reject) => {
          kuromoji
            .builder({ dicPath: TOKENIZER_DICT_PATH })
            .build((error, tokenizer) => {
              if (error) reject(error)
              else resolve(tokenizer)
            })
        }),
    )
    .catch(() => null)
}

/** Keeps inflected verb/adjective stems with their auxiliary chain. */
export function coalesceTokenizerTokens(
  tokens: readonly KuromojiToken[],
): readonly string[] {
  const surfaces: string[] = []
  let verbPhrase: string | null = null
  for (const token of tokens) {
    const surface = token.surface_form
    if (!surface) continue
    const isAuxiliaryVerb =
      token.pos === '動詞' &&
      [
        'いる',
        'ある',
        'くる',
        'いく',
        'おく',
        'みる',
        'しまう',
        'させる',
        'せる',
        'れる',
        'られる',
      ].includes(token.basic_form)
    const isWordContinuation =
      token.pos === '助詞' || token.pos === '助動詞' || isAuxiliaryVerb
    if (verbPhrase !== null && isWordContinuation) {
      verbPhrase += surface
      continue
    }
    if (verbPhrase !== null) {
      surfaces.push(verbPhrase)
      verbPhrase = null
    }
    if (token.pos === '動詞' || token.pos === '形容詞') {
      verbPhrase = surface
    } else {
      surfaces.push(surface)
    }
  }
  if (verbPhrase !== null) surfaces.push(verbPhrase)
  return surfaces
}

/**
 * Loads the optional IPADIC tokenizer once. A missing or failed optional pack
 * never breaks analysis: the dictionary-only segmenter remains the fallback.
 */
export async function tokenizeJapaneseText(
  text: string,
): Promise<readonly string[] | null> {
  tokenizerPromise ??= buildTokenizer()
  const tokenizer = await tokenizerPromise
  if (!tokenizer) return null
  return coalesceTokenizerTokens(tokenizer.tokenize(text.normalize('NFC')))
}

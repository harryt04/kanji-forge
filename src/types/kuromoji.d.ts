declare module 'kuromoji' {
  export interface KuromojiToken {
    readonly surface_form: string
    readonly basic_form: string
    readonly reading?: string
    readonly pos?: string
  }

  export interface KuromojiTokenizer {
    tokenize(text: string): KuromojiToken[]
  }

  export interface KuromojiBuilder {
    build(
      callback: (
        error: Error | null,
        tokenizer: KuromojiTokenizer | null,
      ) => void,
    ): void
  }

  export interface Kuromoji {
    builder(options: { readonly dicPath: string }): KuromojiBuilder
  }

  const kuromoji: Kuromoji
  export default kuromoji
}

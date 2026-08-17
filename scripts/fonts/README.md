# Japanese font subsets

`build-japanese-subsets.mjs` derives the character set from source UI text, bundled
decks, and the production/dev kanji and words-core packs. It fetches pinned Google
Fonts CSS API subsets, stores the WOFF2 files under `public/fonts/japanese/`, and
generates the unicode-range declarations imported by the root layout.

The dev fixture and static UI characters are emitted into the first hot chunks so
the common `/browse` wall does not fetch cold long-tail ranges merely because its
kanji are spread across the Unicode plane.

Run `npm run build:fonts` after changing bundled Japanese content or the font
families. The generated manifest records every subset hash and the exact character
set used for the build. Noto Sans JP is emitted at weight 400 and Klee One at 600;
the browser synthesizes the other UI weights from the single Noto face, while the
Browse card face remains `font-display: block` so a fallback kanji never flashes.

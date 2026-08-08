# KanjiForge development packs

This directory is the committed, offline development fixture for `pnpm dev`.
It contains 200 KANJIDIC2 kanji records, 500 JMdict entries, 100 Tatoeba
Japanese–English sentence pairs, and eight small deck definitions, including
development subsets of the Kanji Kentei 10–5 levels. The SQLite
schemas and `kanji:...` / `word:...` references match the full packs.

## Provenance and licensing

These are small, mechanically filtered derivatives of the generated packs:

- `kanji-v1.sqlite`: KANJIDIC2, © Electronic Dictionary Research and
  Development Group, Monash University, CC BY-SA 4.0.
- `words-core-v1.sqlite`: JMdict, © Electronic Dictionary Research and
  Development Group, Monash University, CC BY-SA 4.0.
- `sentences-v1.sqlite`: Tatoeba sentence pairs (CC BY 2.0 FR), with
  JmdictFurigana alignment data (CC BY-SA 4.0).
- The fixture selection, manifests, and deck definitions are KanjiForge
  derived data released under CC BY-SA 4.0.

The full per-source notices are in the repository `ATTRIBUTION.md`. Each
manifest records its schema, checksum, size, license, attribution, source,
and retained-record counts. No network access is needed to use this fixture.

Run the self-contained structural check with:

```sh
node packs-dev/verify.mjs
```

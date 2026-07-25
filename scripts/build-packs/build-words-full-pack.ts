#!/usr/bin/env node
/**
 * Build words-full pack from JMdict_e (all ~200k entries)
 *
 * TODO: Not fully implemented in T0.4. This is a stub.
 *
 * Full JMdict tiering (all entries, not just *_pri-tagged ones) is a post-MVP
 * feature per DATA-SOURCES.md §2.3. This builder is stubbed for later completion.
 *
 * When implemented, this should:
 * - Parse all JMdict entries (not filtered by *_pri)
 * - Create a SQLite database with similar schema to words-core
 * - Compress to ~25 MB per the DATA-SOURCES budget
 * - Be marked as optional in the app
 *
 * Usage (when implemented):
 *   npx tsx scripts/build-packs/build-words-full-pack.ts
 */

console.log('words-full builder stub — not implemented in T0.4');
console.log(
  'Full JMdict pack is a later feature per DATA-SOURCES.md §2.3'
);
console.log('To implement: extract all ~200k entries, tier by frequency/grade');
process.exit(0);

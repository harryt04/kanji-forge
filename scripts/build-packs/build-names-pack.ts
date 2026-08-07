#!/usr/bin/env node
/**
 * Build names pack from JMnedict (~700k entries)
 *
 * TODO: Not fully implemented in T0.4. This is a stub.
 *
 * Proper names (JMnedict) is an optional post-MVP pack per DATA-SOURCES.md §2.3.
 * This builder is stubbed for later completion.
 *
 * When implemented, this should:
 * - Parse JMnedict entries
 * - Extract name_elem (name text), r_ele (readings), name_type (person/place/org/etc)
 * - Create a SQLite database with similar schema to words-core
 * - Compress to ~15 MB per the DATA-SOURCES budget
 * - Be marked as optional in the app
 *
 * Usage (when implemented):
 *   npx tsx scripts/build-packs/build-names-pack.ts
 */

console.log('names builder stub — not implemented in T0.4')
console.log('JMnedict pack is optional per DATA-SOURCES.md §2.3')
console.log('To implement: parse name_elem/readings, tier by frequency')
process.exit(0)

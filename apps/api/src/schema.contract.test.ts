import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(import.meta.dirname, '../drizzle/0000_young_wraith.sql'), 'utf8');

describe('backend schema contract', () => {
  it('contains better-auth tables and only the syncable app projections', () => {
    for (const table of ['user', 'session', 'account', 'verification', 'reviews', 'decks', 'settings', 'deck_membership']) {
      expect(migration).toContain(`CREATE TABLE "${table}"`);
    }
    expect(migration).not.toContain('CREATE TABLE "card_states"');
    expect(migration).not.toContain('CREATE TABLE "outbox"');
  });
});

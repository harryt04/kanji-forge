/** SQLite-WASM schema for one authenticated user's local database. */
export const USER_DATABASE_SCHEMA_VERSION = 3

export const USER_DATABASE_MIGRATIONS: readonly {
  readonly version: number
  readonly sql: readonly string[]
}[] = [
  {
    version: 1,
    sql: [
      'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)',
      "CREATE TABLE IF NOT EXISTS decks (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('saved', 'derived')), definition_id TEXT, updated_at INTEGER NOT NULL)",
      "CREATE TABLE IF NOT EXISTS deck_membership (user_id TEXT NOT NULL, deck_id TEXT NOT NULL CHECK(deck_id = 'saved'), content_ref TEXT NOT NULL, sort_order INTEGER NOT NULL, added_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (deck_id, content_ref))",
      'CREATE TABLE IF NOT EXISTS card_states (deck_id TEXT NOT NULL, content_ref TEXT NOT NULL, level INTEGER NOT NULL CHECK(level BETWEEN 0 AND 4), due_at INTEGER, last_reviewed_at INTEGER, correct_streak INTEGER NOT NULL, total_reviews INTEGER NOT NULL, total_correct INTEGER NOT NULL, lapses INTEGER NOT NULL, flagged INTEGER NOT NULL, manual_override INTEGER NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT NOT NULL, PRIMARY KEY (deck_id, content_ref))',
      "CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, deck_id TEXT NOT NULL, content_ref TEXT NOT NULL, at INTEGER NOT NULL, grade TEXT NOT NULL CHECK(grade IN ('again', 'good', 'easy')), level_before INTEGER NOT NULL, level_after INTEGER NOT NULL, interval_before INTEGER NOT NULL, elapsed_days INTEGER NOT NULL, response_ms INTEGER NOT NULL, source TEXT NOT NULL, device_id TEXT NOT NULL)",
      'CREATE INDEX IF NOT EXISTS reviews_by_card ON reviews(deck_id, content_ref, at)',
      'CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, deck_id TEXT NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER)',
      'CREATE TABLE IF NOT EXISTS settings (user_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, key))',
      'CREATE TABLE IF NOT EXISTS daily_stats (user_id TEXT NOT NULL, day TEXT NOT NULL, reviews INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0, again INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, day))',
      'CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, mut_type TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0)',
      'CREATE INDEX IF NOT EXISTS outbox_pending ON outbox(created_at)',
    ],
  },
  {
    version: 2,
    sql: [
      '-- migration 2: per-sticky notes and tags',
      "CREATE TABLE IF NOT EXISTS sticky_annotations (user_id TEXT NOT NULL, deck_id TEXT NOT NULL, content_ref TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', tags_json TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL, updated_by TEXT NOT NULL, PRIMARY KEY (deck_id, content_ref))",
      'CREATE INDEX IF NOT EXISTS sticky_annotations_by_user ON sticky_annotations(user_id, deck_id)',
    ],
  },
  {
    version: 3,
    sql: [
      '-- migration 3: user-created custom decks',
      'ALTER TABLE decks RENAME TO decks_v2',
      "CREATE TABLE decks (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('saved', 'custom', 'derived')), definition_id TEXT, updated_at INTEGER NOT NULL)",
      'INSERT INTO decks(id, user_id, name, kind, definition_id, updated_at) SELECT id, user_id, name, kind, definition_id, updated_at FROM decks_v2',
      'DROP TABLE decks_v2',
      'ALTER TABLE deck_membership RENAME TO deck_membership_v2',
      'CREATE TABLE deck_membership (user_id TEXT NOT NULL, deck_id TEXT NOT NULL, content_ref TEXT NOT NULL, sort_order INTEGER NOT NULL, added_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (deck_id, content_ref))',
      'INSERT INTO deck_membership(user_id, deck_id, content_ref, sort_order, added_at, updated_at) SELECT user_id, deck_id, content_ref, sort_order, added_at, updated_at FROM deck_membership_v2',
      'DROP TABLE deck_membership_v2',
    ],
  },
]

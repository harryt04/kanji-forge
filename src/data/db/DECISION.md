# T1.2 user-database engine decision

**Chosen: SQLite-WASM (`sql.js`), with an OPFS persistence adapter.**

The project already ships SQLite artifacts and has `sql.js` in its dependency graph, while PGlite
is not installed and would introduce a second SQL dialect/runtime for a small, SQLite-shaped local
projection. SQLite-WASM keeps pack and user-data access on the same SQL model and supports the
required local transaction/write-outbox path. The browser adapter persists its database snapshot in
the user-scoped OPFS file; environments without OPFS retain an in-memory database for the current
session rather than sharing data across accounts. `card_states` remains a local materialized
projection and is never placed in the sync outbox.

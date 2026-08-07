/** SQLite-WASM content access layer for pre-built decks (dev fixture for now; see T2.2 for the
 * full download/update/delete pack manager). Packs are read-only and shared across users, so a
 * pack handle is cached process-wide once opened. */
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';

export interface DeckDefinition {
  readonly id: string;
  readonly schemaVersion: number;
  readonly name: string;
  readonly description: string;
  readonly contentType: 'kanji' | 'word' | 'sentence';
  readonly contentRefs: readonly string[];
}

export interface KanjiRecord {
  readonly literal: string;
  readonly strokeCount: number;
  readonly grade: number | null;
  readonly onReadings: readonly string[];
  readonly kunReadings: readonly string[];
  readonly meanings: readonly string[];
}

let sqlJsPromise: ReturnType<typeof initSqlJs> | undefined;
function loadSqlJs(): ReturnType<typeof initSqlJs> {
  sqlJsPromise ??= initSqlJs();
  return sqlJsPromise;
}

let deckDefinitionsPromise: Promise<readonly DeckDefinition[]> | undefined;
export function loadDeckDefinitions(): Promise<readonly DeckDefinition[]> {
  deckDefinitionsPromise ??= fetch('/packs-dev/decks.json')
    .then((response) => {
      if (!response.ok) throw new Error(`Failed to load deck definitions (${response.status}).`);
      return response.json() as Promise<{ decks: readonly DeckDefinition[] }>;
    })
    .then((body) => body.decks);
  return deckDefinitionsPromise;
}

const packHandles = new Map<string, Promise<SqlJsDatabase>>();
function openPack(fileName: string): Promise<SqlJsDatabase> {
  let handle = packHandles.get(fileName);
  if (!handle) {
    handle = Promise.all([loadSqlJs(), fetch(`/packs-dev/${fileName}`).then((response) => {
      if (!response.ok) throw new Error(`Failed to load content pack ${fileName} (${response.status}).`);
      return response.arrayBuffer();
    })]).then(([SQL, buffer]) => new SQL.Database(new Uint8Array(buffer)));
    packHandles.set(fileName, handle);
  }
  return handle;
}

function jsonArray(raw: unknown): readonly string[] {
  if (typeof raw !== 'string') return [];
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed.map(String) : [];
}

/** Looks up kanji by their bare literal (a `contentRef` of the form `kanji:<literal>`). */
export async function getKanjiByLiterals(literals: readonly string[]): Promise<ReadonlyMap<string, KanjiRecord>> {
  const database = await openPack('kanji-v1.sqlite');
  const result = new Map<string, KanjiRecord>();
  for (const literal of literals) {
    const statement = database.prepare(
      'SELECT literal, stroke_count, grade, on_readings, kun_readings, meanings FROM kanji WHERE literal = ?',
      [literal],
    );
    if (statement.step()) {
      const row = statement.getAsObject();
      result.set(literal, {
        literal: String(row.literal),
        strokeCount: Number(row.stroke_count),
        grade: row.grade === null ? null : Number(row.grade),
        onReadings: jsonArray(row.on_readings),
        kunReadings: jsonArray(row.kun_readings),
        meanings: jsonArray(row.meanings),
      });
    }
    statement.free();
  }
  return result;
}

/** Splits a `kanji:日` style contentRef into its pack type and lookup key. */
export function parseContentRef(contentRef: string): { readonly type: string; readonly key: string } {
  const separatorIndex = contentRef.indexOf(':');
  if (separatorIndex < 0) throw new Error(`Malformed contentRef: ${contentRef}`);
  return { type: contentRef.slice(0, separatorIndex), key: contentRef.slice(separatorIndex + 1) };
}

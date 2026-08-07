declare module 'sql.js' {
  export interface Statement {
    step(): boolean
    getAsObject(): Record<string, string | number | null | Uint8Array>
    free(): void
  }

  export interface Database {
    run(
      sql: string,
      parameters?: readonly (string | number | null | Uint8Array)[],
    ): void
    prepare(
      sql: string,
      parameters?: readonly (string | number | null | Uint8Array)[],
    ): Statement
    export(): Uint8Array
    close(): void
  }

  export interface SqlJsStatic {
    Database: new (data?: Uint8Array) => Database
  }

  export default function initSqlJs(): Promise<SqlJsStatic>
}

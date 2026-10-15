import { Pool } from "pg";

// Jedna pula na proces (w dev moduły są przeładowywane, stąd global).
const g = globalThis as unknown as { __pgPool?: Pool };

export function getPool(): Pool {
  if (!g.__pgPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("Brak zmiennej środowiskowej DATABASE_URL");
    g.__pgPool = new Pool({ connectionString });
  }
  return g.__pgPool;
}

/** Do czasu wprowadzenia logowania — jeden, stały użytkownik. */
export const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001";

let schemaReady: Promise<void> | null = null;

/** Dodaje kolumny wprowadzone po pierwszej wersji (idempotentne), żeby stare bazy działały bez ręcznej migracji. */
export function ensureSchema(): Promise<void> {
  schemaReady ??= getPool()
    .query("ALTER TABLE user_trail_progress ADD COLUMN IF NOT EXISTS verified_year int")
    .then(() => undefined)
    .catch((e) => {
      schemaReady = null;
      throw e;
    });
  return schemaReady;
}

// Minimal DB interface shared by the real Supabase connection and the in-process test database.
// Server-side only: DATABASE_URL carries full database credentials and must never reach the browser.
import postgres from "postgres";

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export function connect(url = process.env.DATABASE_URL): Db {
  if (!url) throw new Error("DATABASE_URL is required (Supabase dashboard -> Connect -> Session pooler). Put it in web/.env.local.");
  const sql = postgres(url, { max: 4, prepare: false, idle_timeout: 20 });
  return {
    query: async <T>(text: string, params: unknown[] = []) =>
      (await sql.unsafe(text, params as postgres.ParameterOrJSON<never>[])) as unknown as T[],
    close: () => sql.end(),
  };
}

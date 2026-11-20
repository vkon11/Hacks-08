// Minimal DB interface shared by the real Supabase connection and a local Postgres (PGlite) for development/tests.
// Server-side only: DATABASE_URL carries full database credentials and must never reach the browser.
//   DATABASE_URL=postgresql://...        -> Supabase (Dashboard -> Connect -> Session pooler)
//   DATABASE_URL=pglite:../work/localdb  -> local file-backed Postgres, no network
import postgres from "postgres";

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export async function connect(url = process.env.DATABASE_URL): Promise<Db> {
  if (!url) throw new Error("DATABASE_URL is required (Supabase dashboard -> Connect -> Session pooler). Put it in web/.env.local.");
  if (url.startsWith("pglite:")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite(url.slice("pglite:".length));
    return {
      // exec handles multi-statement scripts (migrations); query handles parameterized statements.
      query: async (s, p = []) => (p.length ? (await pg.query(s, p as unknown[])).rows : (await pg.exec(s)).at(-1)?.rows ?? []) as never,
      close: () => pg.close(),
    };
  }
  const sql = postgres(url, { max: 4, prepare: false, idle_timeout: 20, onnotice: () => {} });
  return {
    query: async <T>(text: string, params: unknown[] = []) =>
      (await sql.unsafe(text, params as postgres.ParameterOrJSON<never>[])) as unknown as T[],
    close: () => sql.end(),
  };
}

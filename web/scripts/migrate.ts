// Applies supabase/migrations/*.sql in name order, once each (tracked in public._migrations).
// Usage (from web/): node --env-file=.env.local scripts/migrate.ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { connect } from "./lib/db.ts";

const dir = join(import.meta.dirname, "../supabase/migrations");
const db = await connect();
if (process.env.DATABASE_URL?.startsWith("pglite:"))   // local stand-in for Supabase's built-in roles
  await db.query(`do $$ begin create role anon; create role authenticated; create role service_role; exception when duplicate_object then null; end $$`);
await db.query(`create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())`);
const applied = new Set((await db.query<{ name: string }>(`select name from public._migrations`)).map((r) => r.name));
for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (applied.has(file)) { console.log(`skip    ${file}`); continue; }
  await db.query(readFileSync(join(dir, file), "utf8"));
  await db.query(`insert into public._migrations (name) values ($1)`, [file]);
  console.log(`applied ${file}`);
}
await db.close();

// Copies the housing tables from a local build (PGlite) to Supabase in bulk, preserving ids.
// Building locally then copying is ~100x faster than running the pipeline over the network.
// Replaces the housing tables on the target (never touches profiles or auth).
// Usage (from web/): node --env-file=.env.local scripts/sync-to-supabase.ts [--from pglite:../work/localdb]
import { connect } from "./lib/db.ts";

// Parent tables first so foreign keys resolve.
const TABLES = ["factor_catalog", "properties", "property_aliases", "scraping_jobs", "scraped_sources", "floor_plans", "listings",
  "extracted_attributes", "verification_queue", "external_locations", "transit_stops", "transit_routes", "transit_route_stops",
  "route_calculations"];
const CHUNK = 1000;

const fromArg = process.argv.indexOf("--from");
const src = await connect(fromArg > 0 ? process.argv[fromArg + 1] : "pglite:../work/localdb");
const dst = await connect(process.env.DATABASE_URL);
if (process.env.DATABASE_URL?.startsWith("pglite:")) throw new Error("DATABASE_URL must point at Supabase for a sync");

const t0 = performance.now();
await dst.query(`truncate ${[...TABLES].reverse().map((t) => `public.${t}`).join(", ")} cascade`);
for (const t of TABLES) {
  const rows = await src.query<Record<string, unknown>>(`select * from public.${t}`);
  for (let i = 0; i < rows.length; i += CHUNK)
    await dst.query(`insert into public.${t} select * from jsonb_populate_recordset(null::public.${t}, ($1::jsonb #>> '{}')::jsonb)`,
      [JSON.stringify(rows.slice(i, i + CHUNK))]);
  const [{ n }] = await dst.query<{ n: number }>(`select count(*)::int n from public.${t}`);
  if (n !== rows.length) throw new Error(`${t}: copied ${n} of ${rows.length}`);
  console.log(`${t.padEnd(22)} ${String(n).padStart(6)} rows`);
}
console.log(`synced in ${Math.round((performance.now() - t0) / 1000)} s`);
await src.close();
await dst.close();

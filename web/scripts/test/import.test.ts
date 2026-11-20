// Runs the real importer against in-process Postgres twice; checks counts, idempotency, and evidence rules.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { importAll } from "../import-existing.ts";
import type { Db } from "../lib/db.ts";

const pg = new PGlite();
await pg.exec(`create role anon; create role authenticated; create role service_role;`);
await pg.exec(readFileSync("supabase/migrations/20261120_housing_data.sql", "utf8"));
const db: Db = { query: async (s, p = []) => (await pg.query(s, p as unknown[])).rows as never, close: () => pg.close() };
const one = async (sql: string) => Object.values((await db.query(sql))[0])[0];

const t0 = performance.now();
const first = await importAll(db, "../data");
console.log("first run", JSON.stringify(first.summary), `${Math.round(performance.now() - t0)} ms`);
if (first.errors.length) console.log("errors:", first.errors.slice(0, 5));
const counts = async () => ({
  properties: await one(`select count(*)::int from properties`), floor_plans: await one(`select count(*)::int from floor_plans`),
  listings: await one(`select count(*)::int from listings`), attrs: await one(`select count(*)::int from extracted_attributes`),
});
const c1 = await counts();
const second = await importAll(db, "../data");
const c2 = await counts();
assert.deepEqual(c2, c1, "re-import must not add rows");
assert.equal(second.summary.listings_inserted, 0); assert.equal(second.summary.attributes_inserted, 0);
console.log("✓ idempotent:", JSON.stringify(c1));

assert.equal(await one(`select count(*)::int from extracted_attributes where value_state='false' and factor_key='furnished'`), 0);
console.log("✓ unchecked 'furnished' boxes produced no FALSE values");
assert.equal(await one(`select count(*)::int from property_factor_status where factor_key='roll_in_shower' and state<>'unknown'`), 0);
console.log("✓ roll-in shower: all unknown (no unit-level evidence exists)");
const ac = (await db.query<{ state: string; n: number }>(`select state, count(*)::int n from property_factor_status where factor_key='air_conditioning' group by state order by state`));
console.log("  air_conditioning states:", JSON.stringify(ac));
const stepFree = await one(`select count(*)::int from property_factor_status where factor_key='step_free_to_unit' and state in ('true','false')`);
assert.equal(stepFree, 0, "building-level stair counts must not confirm unit access");
console.log("✓ step-free-to-unit: HAWC building claims stored but none confirmed");
console.log("  queue:", JSON.stringify(await db.query(`select reason, count(*)::int n from verification_queue group by reason order by n desc`)));
console.log("  dedupe: U-M listings at same address merged ->", await one(`select count(*)::int from property_aliases where source='umich_offcampus'`), "aliases into",
  await one(`select count(distinct property_id)::int from property_aliases where source='umich_offcampus'`), "properties");

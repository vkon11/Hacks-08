// Applies the housing migration to an in-process Postgres and checks dedupe, history, and factor resolution.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { FACTORS } from "../../src/lib/housing/factors.ts";

const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;`);
await db.exec(readFileSync("supabase/migrations/20261120_housing_data.sql", "utf8"));
await db.exec(readFileSync("supabase/migrations/20261120_housing_data.sql", "utf8")); // idempotent re-run
console.log("✓ migration applies twice");

for (const x of FACTORS)
  await db.query(`insert into factor_catalog (key, number, label, category, value_kind, acquisition, confirm_scopes) values ($1,$2,$3,$4,$5,$6,$7)`,
    [x.key, x.number, x.label, x.category, x.valueKind, x.acquisition, x.confirmScopes]);
assert.equal((await db.query<{ n: number }>(`select count(*)::int n from factor_catalog`)).rows[0].n, 61);
console.log("✓ 61 factors seeded");

const pid = (await db.query<{ id: string }>(`insert into properties (name, normalized_address) values ('Test Tower','100 main st ann arbor mi 48104') returning id`)).rows[0].id;
await assert.rejects(db.query(`insert into properties (name, normalized_address) values ('Dup','100 main st ann arbor mi 48104')`));
console.log("✓ duplicate property rejected");

await db.query(`insert into floor_plans (property_id, name, normalized_name, bedrooms, bathrooms) values ($1,'2BR A','2br a',2,2)`, [pid]);
await assert.rejects(db.query(`insert into floor_plans (property_id, name, normalized_name, bedrooms, bathrooms) values ($1,'2BR  A','2br a',2,2)`, [pid]));
console.log("✓ duplicate floor plan rejected");

const src = (await db.query<{ id: string }>(`insert into scraped_sources (url, source_kind, source_tier, content_hash) values ('https://t.example/a','official_property',1,'h1') returning id`)).rows[0].id;
const src2 = (await db.query<{ id: string }>(`insert into scraped_sources (url, source_kind, source_tier, content_hash) values ('https://t.example/a','official_property',1,'h2') returning id`)).rows[0].id;
await db.query(`insert into listings (property_id, rent_min, source_id) values ($1, 1200, $2)`, [pid, src]);
await db.query(`insert into listings (property_id, rent_min, source_id) values ($1, 1250, $2)`, [pid, src2]);
assert.equal((await db.query<{ n: number }>(`select count(*)::int n from listings where property_id=$1`, [pid])).rows[0].n, 2);
console.log("✓ price history preserved (2 observations)");

const attr = (k: string, scope: string, state: string, url: string) =>
  db.query(`insert into extracted_attributes (property_id, attribute_key, factor_key, scope, value_state, source_url, extraction_method, confidence, raw_text)
            values ($1,$2,$2,$3,$4,$5,'manual',0.9,$4)`, [pid, k, scope, state, url]);
await attr("air_conditioning", "building", "true", "https://t.example/amenities");   // building claim only
await attr("gym", "building", "true", "https://t.example/amenities");
await attr("pets_allowed", "building", "true", "https://t.example/a");
await attr("pets_allowed", "building", "false", "https://t.example/faq");             // conflict
await assert.rejects(attr("gym", "building", "true", "https://t.example/amenities"));
console.log("✓ duplicate evidence rejected");

const status = Object.fromEntries((await db.query<{ factor_key: string; state: string; building_claim: boolean }>(
  `select factor_key, state, building_claim from property_factor_status where property_id=$1`, [pid])).rows.map((r) => [r.factor_key, r]));
assert.equal(status.air_conditioning.state, "unknown"); assert.equal(status.air_conditioning.building_claim, true);
assert.equal(status.gym.state, "true");
assert.equal(status.pets_allowed.state, "conflict");
assert.equal(status.roll_in_shower.state, "unknown");
console.log("✓ resolution: building A/C claim stays unknown, gym true, pets conflict, missing = unknown");

const d = (await db.query<{ m: number }>(`select haversine_m(42.2780,-83.7382,42.2918,-83.7158) m`)).rows[0].m;
assert.ok(d > 2000 && d < 2600, `haversine ${d}`);
console.log(`✓ haversine Central->North ≈ ${Math.round(d)} m`);

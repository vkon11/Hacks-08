// Coverage report for the 61 factors: TRUE / FALSE / UNKNOWN / conflict counts per factor, for all properties and
// for the Firecrawl-scraped set. Writes docs/coverage-report.md. Usage: node --env-file=.env.local scripts/coverage-report.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { connect } from "./lib/db.ts";

const db = await connect();
type Row = { number: number; label: string; acquisition: string; t: number; f: number; k: number; u: number; c: number; claim: number };

const scrapedIds = `(select distinct a.property_id from extracted_attributes a where a.extraction_method = 'firecrawl_json')`;
const table = async (where: string) => db.query<Row>(`
  select fc.number, fc.label, fc.acquisition,
    count(*) filter (where s.state = 'true')::int t, count(*) filter (where s.state = 'false')::int f, count(*) filter (where s.state = 'known')::int k,
    count(*) filter (where s.state = 'unknown')::int u, count(*) filter (where s.state = 'conflict')::int c,
    count(*) filter (where s.state = 'unknown' and s.building_claim)::int claim
  from property_factor_status s join factor_catalog fc on fc.key = s.factor_key
  where ${where} group by fc.number, fc.label, fc.acquisition order by fc.number`);

const all = await table("true");
const scraped = await table(`s.property_id in ${scrapedIds}`);
const n = async (sql: string) => Number(Object.values((await db.query(sql))[0])[0]);
const totals = {
  properties: await n(`select count(*) from properties`),
  scraped: await n(`select count(*) from ${scrapedIds} x`),
  floorPlans: await n(`select count(*) from floor_plans`),
  listings: await n(`select count(*) from listings`),
  evidence: await n(`select count(*) from extracted_attributes where verification_status <> 'rejected'`),
  rejected: await n(`select count(*) from extracted_attributes where verification_status = 'rejected'`),
  pages: await n(`select count(*) from scraped_sources where source_kind = 'official_property' and markdown is not null`),
  queue: await n(`select count(*) from verification_queue where status = 'open'`),
};
const rejectReasons = await db.query<{ r: string; n: number }>(
  `select value_json->>'reject_reason' r, count(*)::int n from extracted_attributes where verification_status='rejected' group by 1 order by 2 desc`);
const queue = await db.query<{ reason: string; n: number }>(`select reason, count(*)::int n from verification_queue where status='open' group by 1 order by 2 desc`);
const jobs = await db.query<{ name: string; status: string; p: Record<string, number> }>(
  `select input->>'name' name, status, progress p from scraping_jobs where kind = 'scrape_property' order by created_at`);

const pct = (x: number, d: number) => (d ? `${Math.round((100 * x) / d)}%` : "–");
const rows = (rs: Row[], d: number) => rs.map((r) =>
  `| ${r.number} | ${r.label} | ${r.acquisition} | ${r.t} | ${r.f} | ${r.k} | ${r.u} | ${r.c} | ${r.claim} | ${pct(r.t + r.f + r.k, d)} |`).join("\n");
const byAcq = (rs: Row[]) => Object.entries(rs.reduce<Record<string, number[]>>((m, r) => {
  (m[r.acquisition] ??= []).push(r.number); return m; }, {})).map(([k, v]) => `| ${k} | ${v.length} | ${v.join(", ")} |`).join("\n");
const header = "| # | Factor | Acquisition | TRUE | FALSE | Known value | UNKNOWN | Conflict | Building claim only | Resolved |\n|---|---|---|---|---|---|---|---|---|---|";

const md = `# 61-factor coverage report

Generated ${new Date().toISOString()} from the housing database. Counts are properties per resolved state
(\`property_factor_status\` view). **Resolved** = TRUE, FALSE, or a known value (numeric/category) from evidence at a scope allowed to confirm the factor.
**Building claim only** = a building-level TRUE exists, but the factor needs unit-level evidence, so it stays UNKNOWN.

## Totals

| Metric | Value |
|---|---|
| Properties | ${totals.properties} |
| Properties scraped with Firecrawl | ${totals.scraped} |
| Official pages scraped | ${totals.pages} |
| Floor plans | ${totals.floorPlans} |
| Price observations | ${totals.listings} |
| Evidence rows kept | ${totals.evidence} |
| Extractor items rejected by validation | ${totals.rejected} |
| Open verification-queue items | ${totals.queue} |

## How each factor is acquired

| Acquisition | Count | Factors |
|---|---|---|
${byAcq(all)}

## Firecrawl-scraped properties (${totals.scraped})

${header}
${rows(scraped, totals.scraped)}

## All properties (${totals.properties})

${header}
${rows(all, totals.properties)}

## Extractor rejections (why AI output was discarded)

| Reason | Count |
|---|---|
${rejectReasons.map((r) => `| ${r.r} | ${r.n} |`).join("\n")}

## Verification queue

| Reason | Open |
|---|---|
${queue.map((q) => `| ${q.reason} | ${q.n} |`).join("\n")}

## Scrape jobs

| Property | Status | Pages | Credits | Accepted | Review | Rejected | Floor plans | Prices | Fees |
|---|---|---|---|---|---|---|---|---|---|
${jobs.map((j) => `| ${j.name} | ${j.status} | ${j.p.pages ?? 0} | ${j.p.credits ?? 0} | ${j.p.accepted ?? 0} | ${j.p.review ?? 0} | ${j.p.rejected ?? 0} | ${j.p.floorPlans ?? 0} | ${j.p.prices ?? 0} | ${j.p.fees ?? 0} |`).join("\n")}

Factors 1 (commute) and 55 (one-seat ride) depend on each user's pin, so they are computed per request (commute_estimates, one_seat_routes) and show UNKNOWN here. Factors 54 and 56–58 are precomputed for properties with coordinates. None are scraped.
`;
mkdirSync(join(import.meta.dirname, "../../docs"), { recursive: true });
writeFileSync(join(import.meta.dirname, "../../docs/coverage-report.md"), md);
console.log(md.split("\n").slice(0, 20).join("\n"));
await db.close();

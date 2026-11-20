// Firecrawl scraping worker: map site -> pick relevant pages -> structured extraction -> validate -> store.
// Usage (from web/):
//   node --env-file=.env.local scripts/scrape.ts                       # all targets in data/scrape_targets.json
//   node --env-file=.env.local scripts/scrape.ts --only foundry-lofts   # one target by id
//   node --env-file=.env.local scripts/scrape.ts --resume <job_id>      # continue a partial job
// Raw Firecrawl responses are cached in work/firecrawl-cache, so re-runs and re-processing cost no credits.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { connect, type Db } from "./lib/db.ts";
import { Importer } from "./import-existing.ts";
import { EXTRACTION_PROMPT, EXTRACTION_SCHEMA } from "../src/lib/housing/extraction-schema.ts";
import { checkEvidence, choosePages, normText, type PageType, type RawEvidence } from "../src/lib/housing/validate.ts";
import { normalizeAddress, parseAddress } from "../src/lib/housing/normalize.ts";
import type { Scope } from "../src/lib/housing/factors.ts";

export interface Target { id: string; name: string; website: string; address?: string; source_note?: string }
type Row = Record<string, unknown>;
interface Stats { pages: number; credits: number; cached: number; accepted: number; review: number; rejected: number; floorPlans: number; prices: number; fees: number; errors: string[]; rejectReasons: Record<string, number> }

const API = "https://api.firecrawl.dev/v2";
const CACHE = join(import.meta.dirname, "../../work/firecrawl-cache");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Fetcher { map(url: string): Promise<string[]>; scrape(url: string): Promise<{ markdown: string; json: Row; title: string; credits: number; cached: boolean }> }

/** Firecrawl client with disk cache, retries on 429/5xx, and a timeout. */
export function firecrawl(apiKey = process.env.FIRECRAWL_API_KEY): Fetcher {
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is required in web/.env.local");
  mkdirSync(CACHE, { recursive: true });
  const call = async (path: string, body: Row) => {
    const key = join(CACHE, createHash("sha256").update(path + JSON.stringify(body)).digest("hex") + ".json");
    if (existsSync(key)) return { ...JSON.parse(readFileSync(key, "utf8")), cached: true };
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(`${API}/${path}`, {
          method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify(body), signal: AbortSignal.timeout(120_000),
        });
        const data = await res.json();
        if (res.ok && data.success !== false) { writeFileSync(key, JSON.stringify(data)); return { ...data, cached: false }; }
        if ((res.status === 429 || res.status >= 500) && attempt < 3) { await sleep(2000 * attempt ** 2); continue; }
        throw new Error(`${path} ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
      } catch (err) {
        if (attempt >= 3 || (err as Error).message.includes(" 4")) throw err;
        await sleep(2000 * attempt ** 2);
      }
    }
  };
  return {
    async map(url) {
      const d = await call("map", { url, limit: 300 });
      return (d.links ?? []).map((l: string | { url: string }) => (typeof l === "string" ? l : l.url));
    },
    async scrape(url) {
      const d = await call("scrape", { url, onlyMainContent: false, formats: ["markdown", { type: "json", schema: EXTRACTION_SCHEMA, prompt: EXTRACTION_PROMPT }] });
      return { markdown: d.data?.markdown ?? "", json: d.data?.json ?? {}, title: d.data?.metadata?.title ?? url,
        credits: d.cached ? 0 : (d.data?.metadata?.creditsUsed ?? 0), cached: d.cached };
    },
  };
}

const FEE_KEY: Record<string, string> = {
  application: "application_fee", security_deposit: "security_deposit", administrative: "administrative_fee", amenity: "amenity_fee",
  utility: "utility_fee", parking: "parking_fee", pet_deposit: "pet_deposit", pet_rent: "pet_rent", pet_fee: "pet_fee",
  furniture: "furniture_fee", sublet: "sublet_fee", other: "other_fee",
};

/** Find the property this site describes: by extracted address, else the only property using this domain, else create. */
async function resolveProperty(imp: Importer, db: Db, t: Target, extracted: Row | undefined): Promise<string> {
  const addr = (extracted?.street_address as string) || t.address;
  const domain = new URL(t.website).hostname.replace(/^www\./, "");
  if (addr) {
    const norm = normalizeAddress(addr.includes("Ann Arbor") ? addr : `${addr}, Ann Arbor, MI`);
    const hit = await db.query<{ id: string }>(`select id from properties where normalized_address = $1`, [norm]);
    if (hit.length) return hit[0].id;
  }
  const byDomain = await db.query<{ id: string }>(`select id from properties where official_website ilike $1`, [`%${domain}%`]);
  if (byDomain.length === 1) return byDomain[0].id;
  if (!addr) throw new Error(`no address found for ${t.name}; add "address" to the target`);
  const { street, zip } = parseAddress(addr.includes("Ann Arbor") ? addr : `${addr}, Ann Arbor, MI`);
  return imp.property({
    name: (extracted?.name as string) || t.name, normalized_address: normalizeAddress(addr.includes("Ann Arbor") ? addr : `${addr}, Ann Arbor, MI`),
    street, zip, official_website: t.website, property_type: (extracted?.property_type as string) ?? "apartment",
    phone: extracted?.phone,
  }, ["website", domain]);
}

export async function scrapeTarget(db: Db, fc: Fetcher, t: Target, opts: { maxPages: number; resumeJob?: string }) {
  const [{ id: jobId }] = opts.resumeJob
    ? [{ id: opts.resumeJob }]
    : await db.query<{ id: string }>(`insert into scraping_jobs (kind, status, input, started_at) values ('scrape_property','running',$1,now()) returning id`, [JSON.stringify(t)]);
  const [job] = await db.query<{ progress: Row }>(`select progress from scraping_jobs where id = $1`, [jobId]);
  const done = new Set<string>((job?.progress?.urls_done as string[]) ?? []);
  const imp = new Importer(db, jobId);
  const stats: Stats = { pages: 0, credits: 0, cached: 0, accepted: 0, review: 0, rejected: 0, floorPlans: 0, prices: 0, fees: 0, errors: [], rejectReasons: {} };
  const save = (status: string) => db.query(`update scraping_jobs set status=$2, progress=$3, error=$4, finished_at=case when $2 in ('completed','partially_completed','failed') then now() end where id=$1`,
    [jobId, status, JSON.stringify({ urls_done: [...done], ...stats }), stats.errors.join("\n").slice(0, 4000) || null]);

  try {
    let links = await fc.map(t.website);
    let pages = choosePages(links, t.website, opts.maxPages);
    // Sites without a sitemap map to ~1 URL. Fall back to same-site links in the homepage (scraped anyway, so free).
    if (pages.length < 3) {
      const home = await fc.scrape(t.website);
      const host = new URL(t.website).hostname;
      const found = [...home.markdown.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1].split("#")[0])
        .filter((u) => { try { return new URL(u).hostname === host; } catch { return false; } });
      links = [...new Set([...links, ...found])];
      pages = choosePages(links, t.website, opts.maxPages);
    }
    let propertyId: string | undefined;

    for (const page of pages) {
      if (done.has(page.url)) continue;
      try {
        const r = await fc.scrape(page.url);
        stats.pages++; stats.credits += r.credits; if (r.cached) stats.cached++;
        if (!r.markdown) throw new Error("empty page");
        // Access controls are respected, never bypassed: a challenge page ends this target.
        // Match real challenge pages only; a "protected by reCAPTCHA" footer on a normal page is not a block.
        if (/challenges\.cloudflare\.com|verify you are human|checking your browser|^\s*just a moment/i.test(r.markdown)) {
          stats.errors.push(`${page.url}: blocked by bot protection (not bypassed)`);
          break;
        }
        propertyId ??= await resolveProperty(imp, db, t, r.json.property as Row);
        await storePage(imp, propertyId, t, page.type, page.url, r, stats);
        done.add(page.url);
        await save("running");
      } catch (err) {
        stats.errors.push(`${page.url}: ${(err as Error).message}`);
      }
    }
    await imp.queueConflicts();
    const status = stats.errors.length === 0 ? "completed" : done.size > 0 ? "partially_completed" : "failed";
    await save(status);
    return { jobId, status, propertyId, ...stats };
  } catch (err) {
    stats.errors.push((err as Error).message);
    await save("failed");
    return { jobId, status: "failed", ...stats };
  }
}

async function storePage(imp: Importer, pid: string, t: Target, pageType: PageType, url: string,
  r: { markdown: string; json: Row; title: string }, stats: Stats) {
  const sid = await imp.source({ url, title: r.title, kind: "official_property", tier: 1, content: r.markdown, pageType });
  await imp.db.query(`update scraped_sources set markdown = $2 where id = $1 and markdown is null`, [sid, r.markdown]);
  const base = { propertyId: pid, sourceId: sid, sourceUrl: url, sourceTitle: r.title, method: "firecrawl_json" };
  const md = r.markdown, onPage = (q: string) => normText(md).includes(normText(q ?? ""));

  // Floor plans first, so evidence can link to them by name.
  const fpIds = new Map<string, string>();
  for (const fp of (r.json.floor_plans as Row[]) ?? []) {
    if (!fp.name) continue;
    const id = await imp.floorPlan(pid, String(fp.name), (fp.bedrooms as number) ?? null, (fp.bathrooms as number) ?? null, (fp.square_feet as number) ?? null);
    fpIds.set(normText(String(fp.name)), id); stats.floorPlans++;
    if (fp.floor_plan_url) await imp.db.query(`update floor_plans set floor_plan_url = coalesce(floor_plan_url, $2) where id = $1`, [id, fp.floor_plan_url]);
    for (const p of (fp.prices as Row[]) ?? []) {
      if (!p.rent_min && !p.rent_max) continue;
      if (!onPage(String(p.quote))) { stats.rejected++; continue; }       // unsourced price: never stored
      const q = String(p.quote).toLowerCase();
      const priceType = /starting|from\b|as low as/.test(q) ? "advertised_starting" : String(p.price_type ?? "unknown");
      await imp.listing({ property_id: pid, floor_plan_id: id, rent_min: p.rent_min ?? p.rent_max, rent_max: p.rent_max ?? p.rent_min,
        pricing_basis: p.pricing_basis, pricing_frequency: p.pricing_frequency, price_type: priceType,
        available_date: /^\d{4}-\d{2}-\d{2}$/.test(String(p.available_date)) ? p.available_date : null,
        raw_text: p.quote, source_id: sid });
      stats.prices++;
    }
    const fpBase = { ...base, scope: "floor_plan" as Scope, floorPlanId: id, confidence: 0.85 };
    if (fp.bedrooms != null) await imp.attr({ ...fpBase, key: "bedroom_count", numeric: fp.bedrooms as number, raw: `${fp.name}: ${fp.bedrooms} bedrooms` });
    if (fp.square_feet) await imp.attr({ ...fpBase, key: "apartment_size", numeric: fp.square_feet as number, unit: "sqft", raw: `${fp.name}: ${fp.square_feet} sq ft` });
  }

  for (const raw of (r.json.evidence as RawEvidence[]) ?? []) {
    const c = checkEvidence(raw, md, 0.8);
    if (c.status === "rejected") {
      stats.rejected++; stats.rejectReasons[c.reason!] = (stats.rejectReasons[c.reason!] ?? 0) + 1;
      // Rejected items are kept (status rejected) so model errors are auditable; the factor view ignores them.
      if (c.reason !== "unknown_factor" && c.reason !== "unknown_is_not_evidence")
        await imp.db.query(`insert into extracted_attributes (property_id, attribute_key, scope, value_state, raw_text, evidence_text, source_id, source_url,
            source_title, extraction_method, confidence, verification_status, value_json)
          values ($1,$2,$3,$4,$5,$5,$6,$7,$8,'firecrawl_json',0,'rejected',$9) on conflict do nothing`,
          [pid, c.factor_key, ["building", "unit", "floor_plan", "bedroom", "listing", "house"].includes(c.scope) ? c.scope : "building",
            ["true", "false", "unknown"].includes(c.value) ? c.value : null, c.quote ?? "", sid, url, r.title, JSON.stringify({ reject_reason: c.reason })]);
      continue;
    }
    if (c.status === "needs_review") stats.review++; else stats.accepted++;
    await imp.attr({ ...base, key: c.factor_key, scope: c.scope as Scope, state: c.value, text: c.category_value ?? undefined,
      numeric: c.numeric_value ?? null, confidence: c.confidence, raw: c.quote,
      floorPlanId: c.floor_plan_name ? fpIds.get(normText(c.floor_plan_name)) : undefined,
      review: c.status === "needs_review" ? (c.reason === "accessibility_claim" ? "accessibility_claim" : "ambiguous_text") : undefined });
  }

  for (const f of (r.json.fees as Row[]) ?? []) {
    if (!onPage(String(f.quote))) { stats.rejected++; continue; }
    await imp.attr({ ...base, scope: "building", key: FEE_KEY[String(f.fee_type)] ?? "other_fee", numeric: (f.amount as number) ?? null,
      unit: "usd", text: [f.frequency, f.required === true ? "required" : f.required === false ? "optional" : null].filter(Boolean).join(", ") || undefined,
      raw: String(f.quote), confidence: 0.8 });
    stats.fees++;
  }
  for (const l of (r.json.lease_terms as Row[]) ?? [])
    if (onPage(String(l.quote)))
      await imp.attr({ ...base, scope: "building", key: "lease_term", text: String(l.term_text), numeric: (l.months as number) ?? null, unit: "months", raw: String(l.quote), confidence: 0.8 });
}

if (process.argv[1]?.endsWith("scrape.ts")) {
  const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
  const targets: Target[] = JSON.parse(readFileSync(join(import.meta.dirname, "../../data/scrape_targets.json"), "utf8")).targets;
  const only = arg("--only");
  const selected = only ? targets.filter((t) => t.id === only) : targets;
  const maxPages = Number(arg("--max-pages") ?? 8);
  const db = await connect(), fc = firecrawl();
  let total = 0;
  for (const t of selected) {
    const r = await scrapeTarget(db, fc, t, { maxPages, resumeJob: arg("--resume") });
    total += r.credits;
    console.log(`${t.id}: ${r.status} | pages ${r.pages} (cached ${r.cached}) | credits ${r.credits} | accepted ${r.accepted} review ${r.review} rejected ${r.rejected} | floor plans ${r.floorPlans} prices ${r.prices} fees ${r.fees}${r.errors.length ? " | errors: " + r.errors.join("; ").slice(0, 200) : ""}`);
  }
  console.log(`total credits this run: ${total}`);
  await db.close();
}

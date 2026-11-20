// Imports the research datasets already in data/ into the Supabase housing schema. Uses no Firecrawl credits.
// Idempotent: re-running inserts nothing new (dedupe by address, source hash, and evidence keys).
// Usage (from web/): node --env-file=.env.local scripts/import-existing.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { connect, type Db } from "./lib/db.ts";
import { FACTORS, FACTOR_BY_KEY, type Scope } from "../src/lib/housing/factors.ts";
import {
  evidenceFromTags, hash, hawcField, isHouseLike, normalizeAddress, parseAddress, parseHawcStairs, parseMoney,
  PROPERTY_TYPE, resolveScope, type Evidence,
} from "../src/lib/housing/normalize.ts";

type Row = Record<string, unknown>;
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : v && typeof v === "object" ? Object.values(v).map(String) : [];

export class Importer {
  stats = { properties: new Set<string>(), floorPlans: 0, listings: 0, attributes: 0, queued: 0, errors: [] as string[] };
  db: Db;
  jobId: string | null;
  constructor(db: Db, jobId: string | null = null) {
    this.db = db;
    this.jobId = jobId;
  }

  async seedFactors() {
    for (const x of FACTORS)
      await this.db.query(
        `insert into factor_catalog (key, number, label, category, value_kind, acquisition, confirm_scopes, freshness_days, notes)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict (key) do update set number=excluded.number, label=excluded.label, category=excluded.category,
           value_kind=excluded.value_kind, acquisition=excluded.acquisition, confirm_scopes=excluded.confirm_scopes,
           freshness_days=excluded.freshness_days, notes=excluded.notes`,
        [x.key, x.number, x.label, x.category, x.valueKind, x.acquisition, x.confirmScopes, x.freshnessDays ?? 180, x.notes ?? null]);
  }

  async property(p: Row, alias: [string, string]): Promise<string> {
    const cols = ["name", "normalized_address", "street", "zip", "latitude", "longitude", "official_website",
      "property_type", "management_company", "phone"];
    const vals = cols.map((c) => p[c] ?? null);
    // Keep existing values; only fill gaps. Never overwrite a known field with a later source's null.
    const [{ id }] = await this.db.query<{ id: string }>(
      `insert into properties (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})
       on conflict (normalized_address) do update set
         ${cols.filter((c) => c !== "normalized_address").map((c) => `${c} = coalesce(properties.${c}, excluded.${c})`).join(", ")}
       returning id`, vals);
    await this.db.query(`insert into property_aliases (property_id, source, external_id) values ($1,$2,$3) on conflict do nothing`,
      [id, alias[0], alias[1]]);
    this.stats.properties.add(id);
    return id;
  }

  async source(s: { url: string; title: string; kind: string; tier: number; content: string; pageType: string; fetchedAt?: string | null }) {
    const [{ id }] = await this.db.query<{ id: string }>(
      `insert into scraped_sources (url, page_title, source_kind, source_tier, content_hash, page_type, job_id, fetched_at)
       values ($1,$2,$3,$4,$5,$6,$7,coalesce($8::timestamptz, now()))
       on conflict (url, content_hash) do update set page_title = excluded.page_title returning id`,
      [s.url, s.title, s.kind, s.tier, hash(s.content), s.pageType, this.jobId, s.fetchedAt ?? null]);
    return id;
  }

  async floorPlan(propertyId: string, name: string, bedrooms: number | null, bathrooms: number | null, sqft: number | null) {
    const [{ id }] = await this.db.query<{ id: string }>(
      `insert into floor_plans (property_id, name, normalized_name, bedrooms, bathrooms, square_feet) values ($1,$2,$3,$4,$5,$6)
       on conflict (property_id, normalized_name, coalesce(bedrooms, -1), coalesce(bathrooms, -1))
       do update set square_feet = coalesce(floor_plans.square_feet, excluded.square_feet) returning id`,
      [propertyId, name, name.toLowerCase().replace(/\s+/g, " ").trim(), bedrooms, bathrooms, sqft]);
    this.stats.floorPlans++;
    return id;
  }

  async listing(l: Row) {
    const cols = ["property_id", "floor_plan_id", "rent_min", "rent_max", "pricing_basis", "pricing_frequency", "price_type",
      "available_date", "status", "raw_text", "source_id", "observed_at"];
    const rows = await this.db.query(
      `insert into listings (${cols.join(",")}) values (${cols.map((c, i) => c === "observed_at" ? `coalesce($${i + 1}::timestamptz, now())` : `$${i + 1}`).join(",")})
       on conflict do nothing returning id`, cols.map((c) => l[c] ?? null));
    this.stats.listings += rows.length;
  }

  async attr(a: {
    propertyId: string; key: string; scope: Scope; sourceId: string; sourceUrl: string; sourceTitle: string; method: string;
    confidence: number; raw: string; state?: string; text?: string; numeric?: number | null; floorPlanId?: string; unit?: string;
    review?: Evidence["review"];
  }) {
    const factorKey = FACTOR_BY_KEY.has(a.key) ? a.key : null;
    const rows = await this.db.query<{ id: string }>(
      `insert into extracted_attributes (property_id, floor_plan_id, attribute_key, factor_key, scope, value_state, value_text,
         value_numeric, unit_of_measure, raw_text, evidence_text, source_id, source_url, source_title, extraction_method, confidence,
         verification_status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,$12,$13,$14,$15,$16) on conflict do nothing returning id`,
      [a.propertyId, a.floorPlanId ?? null, a.key, factorKey, a.scope, a.state ?? null, a.text ?? null, a.numeric ?? null,
        a.unit ?? null, a.raw, a.sourceId, a.sourceUrl, a.sourceTitle, a.method, a.confidence,
        a.review ? "needs_review" : "unverified"]);
    this.stats.attributes += rows.length;
    if (a.review && rows.length) await this.queue(a.propertyId, a.key, a.review, [rows[0].id], { raw: a.raw, source_url: a.sourceUrl });
  }

  async queue(propertyId: string, key: string, reason: string, attributeIds: string[], details: Row) {
    const rows = await this.db.query(
      `insert into verification_queue (property_id, attribute_key, reason, attribute_ids, details) values ($1,$2,$3,$4,$5)
       on conflict (property_id, attribute_key, reason) where status = 'open'
       do update set attribute_ids = array(select distinct unnest(verification_queue.attribute_ids || excluded.attribute_ids))
       returning id`,
      [propertyId, key, reason, attributeIds, JSON.stringify(details)]);
    this.stats.queued += rows.length;
  }

  // ---------- Sources ----------

  async umich(records: Row[]) {
    for (const x of records) {
      try {
        const ptype = PROPERTY_TYPE[String(x.property_type)] ?? "unknown";
        const { street, zip } = parseAddress(String(x.address));
        const pid = await this.property({
          name: street, normalized_address: normalizeAddress(String(x.address)), street, zip,
          latitude: x.latitude, longitude: x.longitude, official_website: x.landlord_website,
          property_type: ptype, management_company: x.landlord_company,
        }, ["umich_offcampus", String(x.id)]);
        const sourceUrl = String(x.listing_url), sourceTitle = `U-M Off-Campus Housing: ${street}`;
        const sid = await this.source({ url: sourceUrl, title: sourceTitle, kind: "aggregator", tier: 3,
          content: JSON.stringify(x), pageType: "listing", fetchedAt: x.extracted_at as string });
        const base = { propertyId: pid, sourceId: sid, sourceUrl, sourceTitle, method: "import_umich" };
        const basis = x.rent_style === "person" ? "per_person" : x.rent_style === "unit" ? "per_unit" : "unknown";

        const fps = list(x.floorplans).length ? (x.floorplans as Row[]) : [];
        for (const fp of fps) {
          const beds = fp.bedrooms as number | null, baths = fp.bathrooms as number | null;
          const name = String(fp.title || `${beds ?? "?"}BR/${baths ?? "?"}BA`);
          const fpid = await this.floorPlan(pid, name, beds, baths, (fp.square_feet as number) || null);
          if (!x.hide_pricing && (fp.min_rent || fp.max_rent))
            await this.listing({ property_id: pid, floor_plan_id: fpid, rent_min: fp.min_rent, rent_max: fp.max_rent,
              pricing_basis: basis, pricing_frequency: "monthly", price_type: "range", available_date: fp.available_date,
              status: fp.status, raw_text: `${name}: $${fp.min_rent}-$${fp.max_rent} (${x.rent_style})`, source_id: sid,
              observed_at: x.extracted_at });
          const fpBase = { ...base, scope: "floor_plan" as Scope, floorPlanId: fpid, confidence: 0.8 };
          if (beds != null) await this.attr({ ...fpBase, key: "bedroom_count", numeric: beds, raw: `${name}: ${beds} bedrooms` });
          if (fp.square_feet) await this.attr({ ...fpBase, key: "apartment_size", numeric: fp.square_feet as number, unit: "sqft", raw: `${name}: ${fp.square_feet} sq ft` });
          if (beds != null && beds <= 1 && basis === "per_unit")
            await this.attr({ ...fpBase, key: "whole_place", state: "true", raw: `${name}: ${beds === 0 ? "studio" : "1 bedroom"} priced per unit` });
        }

        const tags = [...list(x.unit_features), ...list(x.property_features), ...list(x.utilities), ...list(x.lease_lengths)];
        if (x.pet_policy) tags.push(String(x.pet_policy));
        for (const e of evidenceFromTags(tags, ptype))
          await this.attr({ ...base, key: e.factor, scope: resolveScope(e.scopeKind, ptype), state: e.state, text: e.text,
            confidence: e.confidence, raw: e.raw, review: e.review });
        if (ptype !== "unknown")
          await this.attr({ ...base, key: "home_type", scope: isHouseLike(ptype) ? "house" : "building", text: ptype,
            confidence: 0.8, raw: String(x.property_type) });
      } catch (err) {
        this.stats.errors.push(`umich ${x.id}: ${(err as Error).message}`);
      }
    }
  }

  async hawc(records: Row[], sourceUrlFallback: string) {
    for (const x of records) {
      try {
        const address = String(x.address);
        const { street, zip } = parseAddress(address);
        const pid = await this.property({ name: x.property_name, normalized_address: normalizeAddress(address), street, zip,
          property_type: "apartment", phone: x.phone, official_website: x.source_url }, ["hawc", String(x.property_name)]);
        const evidence = String(x.evidence_text ?? "");
        const sourceUrl = String(x.source_url ?? sourceUrlFallback), sourceTitle = `HAWC housing resource list: ${x.property_name}`;
        const sid = await this.source({ url: sourceUrl, title: sourceTitle, kind: "government", tier: 2, content: evidence,
          pageType: "dataset", fetchedAt: x.source_as_of as string });
        const base = { propertyId: pid, sourceId: sid, sourceUrl, sourceTitle, method: "import_hawc", scope: "building" as Scope };

        for (const lay of (x.layouts as Row[]) ?? []) {
          const label = String(lay.layout);
          const beds = /studio|efficiency/i.test(label) ? 0 : Number(label.match(/(\d+)\s*BR/i)?.[1] ?? NaN);
          const fpid = await this.floorPlan(pid, label, Number.isNaN(beds) ? null : beds, null, null);
          const range = lay.price_range as { min?: number; max?: number } | null;
          if (range?.min) await this.listing({ property_id: pid, floor_plan_id: fpid, rent_min: range.min, rent_max: range.max,
            pricing_basis: "per_unit", pricing_frequency: "monthly", price_type: "advertised_starting",
            raw_text: `${label}: ${lay.published_value}`, source_id: sid, observed_at: x.source_as_of });
        }
        if (typeof x.accepts_pets === "boolean")
          await this.attr({ ...base, key: "pets_allowed", state: String(x.accepts_pets), confidence: 0.8,
            raw: `Accepts Pets: ${hawcField(evidence, "Accepts Pets") ?? (x.accepts_pets ? "Yes" : "No")}` });

        // Stair counts are property-level, so they stay non-confirming for unit access and go to review.
        const stairs = parseHawcStairs(evidence);
        if (stairs.toUnit != null && stairs.toLobby != null)
          await this.attr({ ...base, key: "step_free_to_unit", state: stairs.toUnit === 0 && stairs.toLobby === 0 ? "true" : "false",
            confidence: 0.6, raw: `Stairs to Unit: ${stairs.toUnit}; Stairs to Lobby: ${stairs.toLobby}; Stairs within Unit: ${stairs.withinUnit ?? "?"}`,
            review: "accessibility_claim" });

        const supporting: [string, string | null, number | null, string | undefined][] = [
          ["application_fee", hawcField(evidence, "Application Fee"), null, "usd"],
          ["security_deposit", hawcField(evidence, "Security Deposit"), null, "usd"],
          ["pet_fee", hawcField(evidence, "Pet Fee"), null, "usd"],
          ["income_requirement", hawcField(evidence, "Income Requirement"), null, undefined],
          ["closest_bus_stop", x.closest_bus_stop_miles != null ? `${x.closest_bus_stop_miles} miles` : null, x.closest_bus_stop_miles as number, "mi"],
          ["utilities_listed", x.utilities ? String(x.utilities) : null, null, undefined],
        ];
        for (const [key, raw, num, unit] of supporting)
          if (raw) await this.attr({ ...base, key, raw, text: raw, numeric: num ?? (unit === "usd" ? parseMoney(raw) : null), unit, confidence: 0.8 });
        await this.attr({ ...base, key: "section_504", state: String(Boolean(x.section_504)), confidence: 0.8, raw: `Section 504: ${x.section_504 ? "covered" : "not covered"}` });
        if (typeof x.accessible_parking === "boolean")
          await this.attr({ ...base, key: "accessible_parking", state: String(x.accessible_parking), confidence: 0.8, raw: `Accessible Parking: ${x.accessible_parking ? "Yes" : "No"}` });
      } catch (err) {
        this.stats.errors.push(`hawc ${x.property_name}: ${(err as Error).message}`);
      }
    }
  }

  async seed(records: Row[], observedAt: string) {
    const tier: Record<string, [string, number]> = {
      property_official: ["official_property", 1], listing_aggregator: ["aggregator", 3],
      student_housing_aggregator: ["aggregator", 3], local_journalism: ["journalism", 4],
    };
    const basis: Record<string, string> = { per_person_per_month: "per_person", per_bedroom_per_month: "per_bed", whole_unit_per_month: "per_unit" };
    // "-options" tokens mean some units have it, so they confirm nothing and are skipped.
    const amenity: Record<string, Partial<Evidence> & { factor: string }> = {
      furnished: { factor: "furnished", state: "true" }, "in-unit-laundry": { factor: "laundry", text: "in_unit", confidence: 0.6 },
      "private-bathrooms": { factor: "private_bathroom", state: "true" }, "individual-leases": { factor: "individual_lease", state: "true" },
      "roommate-matching": { factor: "roommate_matching", state: "true" }, pool: { factor: "pool", state: "true" },
      "pet-friendly": { factor: "pets_allowed", state: "true" }, parking: { factor: "parking_space", state: "true" },
      storage: { factor: "storage_locker", state: "true", confidence: 0.6 },
    };
    for (const x of records) {
      try {
        const address = String(x.address);
        const { street, zip } = parseAddress(address);
        const [kind, t] = tier[String(x.source_tier)] ?? ["aggregator", 3];
        const pid = await this.property({ name: x.property_name, normalized_address: normalizeAddress(address), street, zip,
          property_type: "apartment", official_website: kind === "official_property" ? x.source_url : null }, ["seed", String(x.id)]);
        const sourceUrl = String(x.source_url), sourceTitle = String(x.property_name);
        const sid = await this.source({ url: sourceUrl, title: sourceTitle, kind, tier: t, content: JSON.stringify(x), pageType: "pricing", fetchedAt: observedAt });
        if (x.monthly_min) await this.listing({ property_id: pid, rent_min: x.monthly_min, rent_max: x.monthly_max ?? x.monthly_min,
          pricing_basis: basis[String(x.price_basis)] ?? "unknown", pricing_frequency: "monthly", price_type: "range",
          raw_text: [x.price_note, x.lease_note].filter(Boolean).join(" "), source_id: sid, observed_at: observedAt });
        for (const token of list(x.amenities)) {
          const m = amenity[token];
          if (m) await this.attr({ propertyId: pid, sourceId: sid, sourceUrl, sourceTitle, method: "import_seed", scope: "building",
            key: m.factor, state: m.state, text: m.text, confidence: m.confidence ?? Number(x.confidence ?? 0.7), raw: token });
        }
      } catch (err) {
        this.stats.errors.push(`seed ${x.id}: ${(err as Error).message}`);
      }
    }
  }

  async special(d: Row) {
    const observedAt = String(d.observed_at);
    const add = async (name: string, synthetic: string, ptype: string, url: string, kind: string, tierN: number, raw: Row) => {
      const pid = await this.property({ name, normalized_address: synthetic, property_type: ptype }, [`special_${ptype}`, name]);
      const sid = await this.source({ url, title: name, kind, tier: tierN, content: JSON.stringify(raw), pageType: "dataset", fetchedAt: observedAt });
      return { pid, sid, base: { propertyId: pid, sourceId: sid, sourceUrl: url, sourceTitle: name, method: "import_special", scope: "building" as Scope } };
    };
    for (const x of (d.university_housing as Row[]) ?? []) {
      const { pid, sid, base } = await add(String(x.property_name), `synthetic: umich housing ${String(x.property_name).toLowerCase()}`,
        "university", String(x.source_url), "university", 1, x);
      await this.listing({ property_id: pid, rent_min: x.monthly_min, rent_max: x.monthly_max, pricing_basis: "per_person",
        pricing_frequency: "monthly", price_type: "range", raw_text: String(x.price_basis), source_id: sid, observed_at: observedAt });
      if (String(x.price_basis).includes("including_utilities"))
        await this.attr({ ...base, key: "heat_included", state: "true", confidence: 0.7, raw: String(x.price_basis) });
    }
    for (const x of (d.cooperatives as Row[]) ?? []) {
      const { base } = await add(String(x.property_name), `synthetic: icc co-op ${String(x.property_name).toLowerCase()}`,
        "co_op", String(d.cooperative_source_url), "official_property", 1, x);
      if (typeof x.pet_friendly === "boolean")
        await this.attr({ ...base, key: "pets_allowed", state: String(x.pet_friendly), confidence: 0.8, raw: `pet_friendly: ${x.pet_friendly}` });
      if (x.food) await this.attr({ ...base, key: "coop_meals", state: "true", text: String(x.food).toLowerCase(), confidence: 0.8, raw: `Food: ${x.food}` });
    }
    for (const x of (d.affordable_housing as Row[]) ?? []) {
      const address = `${x.address}, Ann Arbor, MI`;
      const { base } = await add(String(x.property_name), normalizeAddress(address), "apartment",
        String(d.affordable_housing_source_url), "government", 2, x);
      await this.attr({ ...base, key: "income_restricted", state: "true", confidence: 0.9, raw: "Ann Arbor Housing Commission property" });
    }
  }

  /** Queue every property x factor whose confirming evidence disagrees. */
  async queueConflicts() {
    await this.db.query(
      `insert into verification_queue (property_id, attribute_key, reason, attribute_ids, details)
       select s.property_id, s.factor_key, 'conflict',
              array(select a.id from extracted_attributes a where a.property_id = s.property_id and a.factor_key = s.factor_key),
              '{}'::jsonb
       from property_factor_status s where s.state = 'conflict'
       on conflict (property_id, attribute_key, reason) where status = 'open' do nothing`);
  }
}

export async function importAll(db: Db, dataDir: string) {
  const read = (p: string) => JSON.parse(readFileSync(join(dataDir, p), "utf8"));
  const [{ id: jobId }] = await db.query<{ id: string }>(
    `insert into scraping_jobs (kind, status, input, started_at) values ('import','running',$1,now()) returning id`,
    [JSON.stringify({ dataDir })]);
  const imp = new Importer(db, jobId);
  await imp.seedFactors();
  await imp.umich(read("inventory/umich-offcampus-listings.json").records);
  const hawc = read("inventory/hawc-properties.json");
  await imp.hawc(hawc.records, hawc.source_url);
  const seed = read("housing_seed.json");
  await imp.seed(seed.records, seed.observed_at);
  await imp.special(read("inventory/special_housing.json"));
  await imp.queueConflicts();
  const s = imp.stats;
  const summary = { properties_touched: s.properties.size, floor_plans_upserted: s.floorPlans, listings_inserted: s.listings,
    attributes_inserted: s.attributes, queue_entries: s.queued, errors: s.errors.length };
  await db.query(`update scraping_jobs set status=$2, progress=$3, error=$4, finished_at=now() where id=$1`,
    [jobId, s.errors.length ? "partially_completed" : "completed", JSON.stringify(summary), s.errors.slice(0, 50).join("\n") || null]);
  return { jobId, summary, errors: s.errors };
}

if (process.argv[1]?.endsWith("import-existing.ts")) {
  const db = connect();
  const result = await importAll(db, join(import.meta.dirname, "../../data"));
  console.log(JSON.stringify(result.summary, null, 2));
  if (result.errors.length) console.error(result.errors.slice(0, 10).join("\n"));
  await db.close();
}

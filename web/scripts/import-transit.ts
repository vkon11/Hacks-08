// Loads TheRide GTFS (stops, routes, which routes serve which stops) and OpenStreetMap places (full grocery stores,
// libraries, campus recreation) into the location tables.
// Inputs (downloaded, not committed):
//   work/gtfs-theride/  <- unzip https://www.theride.org/sites/default/files/google/google_transit.zip
//   work/osm.json       <- Overpass API result (see README)
// Usage (from web/): node --env-file=.env.local scripts/import-transit.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { connect, type Db } from "./lib/db.ts";

const WORK = join(import.meta.dirname, "../../work");
const GTFS_URL = "https://www.theride.org/sites/default/files/google/google_transit.zip";

/** Minimal CSV parser for GTFS (quoted fields, no embedded newlines). */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  const split = (l: string) => {
    const out: string[] = []; let cur = "", q = false;
    for (const ch of l) {
      if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch;
    }
    return [...out, cur];
  };
  const head = split(lines[0]);
  return lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [head[i], v])));
}

export async function importGtfs(db: Db, dir: string) {
  const read = (f: string) => parseCsv(readFileSync(join(dir, f), "utf8"));
  const stopIds = new Map<string, string>(), routeIds = new Map<string, string>();
  for (const s of read("stops.txt")) {
    if (s.location_type && s.location_type !== "0") continue;
    const [{ id }] = await db.query<{ id: string }>(
      `insert into transit_stops (agency, stop_code, name, latitude, longitude, source_url) values ('theride',$1,$2,$3,$4,$5)
       on conflict (agency, stop_code) do update set name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude returning id`,
      [s.stop_id, s.stop_name, Number(s.stop_lat), Number(s.stop_lon), GTFS_URL]);
    stopIds.set(s.stop_id, id);
  }
  for (const r of read("routes.txt")) {
    const [{ id }] = await db.query<{ id: string }>(
      `insert into transit_routes (agency, route_code, short_name, long_name, source_url) values ('theride',$1,$2,$3,$4)
       on conflict (agency, route_code) do update set short_name = excluded.short_name, long_name = excluded.long_name returning id`,
      [r.route_id, r.route_short_name, r.route_long_name, GTFS_URL]);
    routeIds.set(r.route_id, id);
  }
  const tripRoute = new Map(read("trips.txt").map((t) => [t.trip_id, t.route_id]));
  const pairs = new Set<string>();
  for (const st of read("stop_times.txt")) {
    const route = tripRoute.get(st.trip_id);
    if (route && stopIds.has(st.stop_id)) pairs.add(`${routeIds.get(route)}|${stopIds.get(st.stop_id)}`);
  }
  const list = [...pairs].map((p) => p.split("|"));
  for (let i = 0; i < list.length; i += 500) {
    const chunk = list.slice(i, i + 500);
    await db.query(`insert into transit_route_stops (route_id, stop_id) select * from unnest($1::uuid[], $2::uuid[]) on conflict do nothing`,
      [chunk.map((c) => c[0]), chunk.map((c) => c[1])]);
  }
  return { stops: stopIds.size, routes: routeIds.size, routeStops: pairs.size };
}

type OsmEl = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags: Record<string, string> };
const UM = /university of michigan|\bu-?m\b|umich/i;
const REC = /recreation|intramural|rec center/i;
// OSM contributor tagging errors observed in the Ann Arbor extract (not grocery stores).
const NOT_GROCERY = /^vertical media solutions$/i;

/** Classify OSM elements. Libraries and rec facilities must be U-M operated or named as such; grocery = supermarket. */
export function classifyOsm(elements: OsmEl[]) {
  const out: { kind: string; name: string; lat: number; lon: number; url: string; address: string | null }[] = [];
  const seen = new Map<string, number>();
  for (const e of elements) {
    const t = e.tags ?? {}, lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    if (!t.name || lat == null || lon == null) continue;
    const url = `https://www.openstreetmap.org/${e.type}/${e.id}`;
    const address = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ") || null;
    const umich = UM.test(t.operator ?? "") || UM.test(t.name);
    if (t.shop === "supermarket" && !NOT_GROCERY.test(t.name)) out.push({ kind: "grocery", name: t.name, lat, lon, url, address });
    else if (t.amenity === "library" && (umich || /library/i.test(t.name) && /(hatcher|shapiro|duderstadt|taubman|law|music|art|fine arts|kresge|askwith)/i.test(t.name)))
      out.push({ kind: "library", name: t.name, lat, lon, url, address });
    else if (/sports_centre|fitness_centre/.test(t.leisure ?? "") && REC.test(t.name) && umich)   // U-M operated only
      out.push({ kind: "rec_facility", name: t.name, lat, lon, url, address });
  }
  // Several stores share a name (e.g. Kroger); keep each branch distinct, and drop exact duplicate features.
  const uniq = new Map<string, (typeof out)[number]>();
  for (const p of out) {
    const n = (seen.get(p.kind + p.name) ?? 0) + 1; seen.set(p.kind + p.name, n);
    const dupeOfNear = [...uniq.values()].some((q) => q.kind === p.kind && q.name.startsWith(p.name) && Math.abs(q.lat - p.lat) < 0.002 && Math.abs(q.lon - p.lon) < 0.002);
    if (dupeOfNear) continue;
    uniq.set(p.url, n > 1 ? { ...p, name: `${p.name} (${p.address ?? p.url.split("/").slice(-2).join(" ")})` } : p);
  }
  return [...uniq.values()];
}

export async function importPlaces(db: Db, elements: OsmEl[]) {
  const places = classifyOsm(elements);
  for (const p of places)
    await db.query(`insert into external_locations (kind, name, address, latitude, longitude, source_url) values ($1,$2,$3,$4,$5,$6)
                    on conflict (kind, name) do update set latitude = excluded.latitude, longitude = excluded.longitude, source_url = excluded.source_url`,
      [p.kind, p.name, p.address, p.lat, p.lon, p.url]);
  return places.reduce<Record<string, number>>((m, p) => ((m[p.kind] = (m[p.kind] ?? 0) + 1), m), {});
}

if (process.argv[1]?.endsWith("import-transit.ts")) {
  const db = await connect();
  console.log("gtfs", await importGtfs(db, join(WORK, "gtfs-theride")));
  console.log("places", await importPlaces(db, JSON.parse(readFileSync(join(WORK, "osm.json"), "utf8")).elements));
  await db.close();
}

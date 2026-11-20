// Precomputes pin-independent location factors for every geocoded property:
//   56 short walk to a bus stop, 54 grocery nearby, 57 campus library nearby, 58 campus gym nearby.
// Method: straight-line distance x 1.3 detour at 80 m/min walking. Labeled as an estimate; replaces prior estimates.
// Usage (from web/): node --env-file=.env.local scripts/compute-routes.ts
import { connect, type Db } from "./lib/db.ts";

const WALK = { detour: 1.3, mPerMin: 80 };
// Default "nearby" thresholds in walking minutes. The ranking engine uses the minutes; these only set TRUE/FALSE.
export const THRESHOLDS: Record<string, { kind: string; factor: string; minutes: number }> = {
  bus_stop: { kind: "bus_stop", factor: "short_walk_bus_stop", minutes: 5 },
  grocery: { kind: "grocery", factor: "grocery_nearby", minutes: 15 },
  library: { kind: "library", factor: "library_nearby", minutes: 15 },
  rec_facility: { kind: "rec_facility", factor: "campus_gym_nearby", minutes: 15 },
};

export async function computeRoutes(db: Db) {
  await db.query(`delete from route_calculations where method = 'straight_line_estimate' and destination_kind <> 'pin'`);
  await db.query(`delete from extracted_attributes where extraction_method = 'computed'`);
  const result: Record<string, number> = {};
  for (const t of Object.values(THRESHOLDS)) {
    const dest = t.kind === "bus_stop"
      ? `select id, name, latitude, longitude, source_url from transit_stops`
      : `select id, name, latitude, longitude, source_url from external_locations where kind = '${t.kind}'`;
    const rows = await db.query<{ n: number }>(`
      with nearest as (
        select p.id pid, d.id did, d.name, d.latitude dlat, d.longitude dlng, d.source_url,
               haversine_m(p.latitude, p.longitude, d.latitude, d.longitude) m
        from properties p
        cross join lateral (select * from (${dest}) x
                            order by haversine_m(p.latitude, p.longitude, x.latitude, x.longitude) limit 1) d
        where p.latitude is not null
      ), calc as (
        insert into route_calculations (property_id, destination_kind, destination_id, dest_latitude, dest_longitude, mode,
                                        minutes, distance_m, method, source)
        select pid, $1, did, dlat, dlng, 'walk', round((m * $2 / $3)::numeric, 1), round(m::numeric), 'straight_line_estimate', source_url
        from nearest returning 1
      ), attrs as (
        insert into extracted_attributes (property_id, attribute_key, factor_key, scope, value_state, value_numeric, unit_of_measure,
                                          raw_text, evidence_text, source_url, source_title, extraction_method, confidence, verification_status)
        select pid, $4, $4, 'route', case when m * $2 / $3 <= $5 then 'true' else 'false' end, round((m * $2 / $3)::numeric, 1), 'walk_minutes',
               'Nearest: ' || name || ', ~' || round((m * $2 / $3)::numeric) || ' min walk (straight-line estimate)',
               'Straight-line ' || round(m::numeric) || ' m x ' || $2 || ' detour at ' || $3 || ' m/min', source_url, name, 'computed', 0.6, 'auto_accepted'
        from nearest returning 1
      )
      select (select count(*) from attrs)::int n`,
      [t.kind, WALK.detour, WALK.mPerMin, t.factor, t.minutes]);
    result[t.factor] = rows[0].n;
  }
  return result;
}

if (process.argv[1]?.endsWith("compute-routes.ts")) {
  const db = await connect();
  console.log(await computeRoutes(db));
  await db.close();
}

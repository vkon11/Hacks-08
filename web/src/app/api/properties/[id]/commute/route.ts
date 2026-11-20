import { NextResponse, type NextRequest } from "next/server";
import { publicDb } from "@/lib/supabase/public";

// GET /api/properties/:id/commute?lat=42.2780&lng=-83.7382 -> factor 1 (commute estimates) and 55 (one-seat TheRide routes).
export async function GET(request: NextRequest, ctx: RouteContext<"/api/properties/[id]/commute">) {
  const { id } = await ctx.params;
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat - 42.28) > 0.3 || Math.abs(lng + 83.74) > 0.3)
    return NextResponse.json({ error: "lat/lng must be a point in the Ann Arbor area" }, { status: 400 });
  const db = publicDb();
  const [commute, transit] = await Promise.all([
    db.rpc("commute_estimates", { p_property: id, p_lat: lat, p_lng: lng }),
    db.rpc("one_seat_routes", { p_property: id, p_lat: lat, p_lng: lng }),
  ]);
  const err = commute.error ?? transit.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });
  return NextResponse.json({
    pin: { lat, lng },
    commute: commute.data,
    one_seat_ride: (transit.data?.length ?? 0) > 0,
    one_seat_routes: transit.data,
    method: "Straight-line distance x detour factor; TheRide GTFS stop-route membership. Estimates, not schedules.",
    attribution: "Transit data provided by permission of AAATA/TheRide.",
  });
}

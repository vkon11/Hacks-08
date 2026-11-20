import { NextResponse, type NextRequest } from "next/server";
import { publicDb } from "@/lib/supabase/public";

// GET /api/properties/:id -> property, floor plans, price history, resolved 61-factor status, and supporting evidence.
// ?include=evidence adds every non-rejected evidence row with its source.
export async function GET(request: NextRequest, ctx: RouteContext<"/api/properties/[id]">) {
  const { id } = await ctx.params;
  const db = publicDb();
  const [property, floorPlans, listings, factors] = await Promise.all([
    db.from("properties").select("*").eq("id", id).maybeSingle(),
    db.from("floor_plans").select("id, name, bedrooms, bathrooms, square_feet, floor_plan_url").eq("property_id", id).order("bedrooms"),
    db.from("listings")
      .select("floor_plan_id, rent_min, rent_max, pricing_basis, pricing_frequency, price_type, available_date, observed_at, raw_text, source_id")
      .eq("property_id", id).order("observed_at", { ascending: false }).limit(200),
    db.from("property_factor_status").select("factor_key, number, acquisition, state, building_claim, max_numeric, best_text, last_evidence_at, evidence_count")
      .eq("property_id", id).order("number"),
  ]);
  const err = property.error ?? floorPlans.error ?? listings.error ?? factors.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });
  if (!property.data) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body: Record<string, unknown> = {
    property: property.data, floor_plans: floorPlans.data, listings: listings.data, factors: factors.data,
    missing: factors.data?.filter((f) => f.state === "unknown" && f.acquisition !== "calculated").map((f) => f.factor_key),
    conflicts: factors.data?.filter((f) => f.state === "conflict").map((f) => f.factor_key),
  };
  if (request.nextUrl.searchParams.get("include") === "evidence") {
    const ev = await db.from("extracted_attributes")
      .select("attribute_key, factor_key, scope, value_state, value_text, value_numeric, unit_of_measure, raw_text, source_url, source_title, extraction_method, confidence, verification_status, extracted_at")
      .eq("property_id", id).neq("verification_status", "rejected").order("attribute_key");
    if (ev.error) return NextResponse.json({ error: ev.error.message }, { status: 500 });
    body.evidence = ev.data;
  }
  return NextResponse.json(body);
}

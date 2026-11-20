import { NextResponse, type NextRequest } from "next/server";
import { publicDb } from "@/lib/supabase/public";

// GET /api/properties?limit=50&offset=0&type=apartment&scraped=1
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const limit = Math.min(Number(q.get("limit") ?? 50), 200);
  const offset = Math.max(Number(q.get("offset") ?? 0), 0);
  let query = publicDb()
    .from("properties")
    .select("id, name, street, zip, latitude, longitude, property_type, official_website, management_company", { count: "exact" })
    .order("name")
    .range(offset, offset + limit - 1);
  const type = q.get("type");
  if (type) query = query.eq("property_type", type);
  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ count, limit, offset, properties: data });
}

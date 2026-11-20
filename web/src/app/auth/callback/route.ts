import { NextResponse, type NextRequest } from "next/server";
import { createClient, UMICH_DOMAIN } from "@/lib/supabase/server";

// Google redirects here with ?code=. Exchange it for a session, enforce umich.edu, route to onboarding if new.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/account";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/account";

  if (!code) return NextResponse.redirect(`${origin}/login?error=missing_code`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return NextResponse.redirect(`${origin}/login?error=auth_failed`);

  if (!data.user.email?.toLowerCase().endsWith(UMICH_DOMAIN)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=not_umich`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", data.user.id)
    .maybeSingle();

  return NextResponse.redirect(`${origin}${profile ? next : "/onboarding"}`);
}

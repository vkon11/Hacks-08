import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

// Per-user content: render on request (Next 16 cache components would otherwise try to prerender).
export const instant = false;

// Placeholder landing. The questionnaire flow replaces this.
export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <h1 className="text-3xl font-semibold">Property Brothers</h1>
      <p className="text-zinc-500">Ann Arbor housing ranked by what you actually need.</p>
      <Link
        href={signedIn ? "/account" : "/login"}
        className="rounded-md bg-[#00274C] px-4 py-3 text-center font-medium text-white"
      >
        {signedIn ? "Go to my account" : "Get started"}
      </Link>
    </main>
  );
}

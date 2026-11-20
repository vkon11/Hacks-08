"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function GoogleButton({ next }: { next?: string }) {
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    const callback = new URL("/auth/callback", window.location.origin);
    if (next) callback.searchParams.set("next", next);
    await createClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callback.toString(),
        queryParams: { hd: "umich.edu", prompt: "select_account" }, // hd is only a hint; the callback enforces it
      },
    });
  }

  return (
    <button
      onClick={signIn}
      disabled={loading}
      className="rounded-md bg-[#00274C] px-4 py-3 font-medium text-white disabled:opacity-60"
    >
      {loading ? "Redirecting…" : "Continue with Google"}
    </button>
  );
}

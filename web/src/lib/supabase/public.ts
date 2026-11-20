import { createClient } from "@supabase/supabase-js";

// Cookie-free client for public housing data (read-only via RLS). Never use the secret key in app code.
export const publicDb = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false },
  });

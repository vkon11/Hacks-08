import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { saveProfile } from "./actions";

// Per-user content: render on request (Next 16 cache components would otherwise try to prerender).
export const instant = false;

const ERRORS: Record<string, string> = {
  invalid: "Fill in every field and check the consent box.",
  save_failed: "Couldn't save. Try again.",
};

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, move_in_date, roommate_count")
    .eq("id", user.id)
    .maybeSingle();

  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;
  const defaultName = profile?.full_name ?? user.user_metadata?.full_name ?? "";

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">A few basics</h1>
        <p className="mt-1 text-sm text-zinc-500">Your move-in date drives your housing timeline.</p>
      </div>
      {message && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {message}
        </p>
      )}
      <form action={saveProfile} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Name
          <input name="full_name" required maxLength={100} defaultValue={defaultName}
            className="rounded-md border border-zinc-300 px-3 py-2 font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Target move-in date
          <input name="move_in_date" type="date" required defaultValue={profile?.move_in_date ?? ""}
            className="rounded-md border border-zinc-300 px-3 py-2 font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Number of roommates (not counting you)
          <input name="roommate_count" type="number" min={0} max={10} required
            defaultValue={profile?.roommate_count ?? 0}
            className="rounded-md border border-zinc-300 px-3 py-2 font-normal" />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input name="consent" type="checkbox" required className="mt-1" />
          <span>
            Save these three details to my account. Questionnaire answers stay in this browser unless I save
            them. I can delete my account anytime.
          </span>
        </label>
        <button className="rounded-md bg-[#00274C] px-4 py-3 font-medium text-white">Continue</button>
      </form>
    </main>
  );
}

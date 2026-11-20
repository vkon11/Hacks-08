import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteAccount, signOut } from "./actions";

// Per-user content: render on request (Next 16 cache components would otherwise try to prerender).
export const instant = false;

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, move_in_date, roommate_count")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding");

  const { error } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Hi, {profile.full_name.split(" ")[0]}</h1>
      {error === "delete_failed" && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          Couldn&apos;t delete. Try again.
        </p>
      )}
      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-zinc-500">Email</dt>
        <dd>{user.email}</dd>
        <dt className="text-zinc-500">Move-in</dt>
        <dd>{profile.move_in_date}</dd>
        <dt className="text-zinc-500">Roommates</dt>
        <dd>{profile.roommate_count}</dd>
      </dl>
      <Link href="/onboarding" className="text-sm underline">Edit details</Link>
      <div className="flex gap-3">
        <form action={signOut}>
          <button className="rounded-md border border-zinc-300 px-4 py-2 text-sm">Sign out</button>
        </form>
        <form action={deleteAccount}>
          <button className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-700">Delete account</button>
        </form>
      </div>
    </main>
  );
}

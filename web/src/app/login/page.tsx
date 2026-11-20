import { GoogleButton } from "./google-button";

// Per-user content: render on request (Next 16 cache components would otherwise try to prerender).
export const instant = false;

const ERRORS: Record<string, string> = {
  not_umich: "Use your umich.edu Google account.",
  auth_failed: "Sign-in failed. Try again.",
  missing_code: "Sign-in was interrupted. Try again.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, next } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-zinc-500">
          U-M students only. We store your name, move-in date, and roommate count, nothing else.
        </p>
      </div>
      {message && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {message}
        </p>
      )}
      <GoogleButton next={typeof next === "string" ? next : undefined} />
    </main>
  );
}

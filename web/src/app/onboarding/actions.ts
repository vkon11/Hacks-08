"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function saveProfile(formData: FormData) {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const moveIn = String(formData.get("move_in_date") ?? "");
  const roommates = Number(formData.get("roommate_count"));
  const consent = formData.get("consent") === "on";

  const invalid =
    !consent ||
    fullName.length < 1 ||
    fullName.length > 100 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(moveIn) ||
    !Number.isInteger(roommates) ||
    roommates < 0 ||
    roommates > 10;
  if (invalid) redirect("/onboarding?error=invalid");

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");

  const { error } = await supabase.from("profiles").upsert({
    id: userId,
    full_name: fullName,
    move_in_date: moveIn,
    roommate_count: roommates,
  });
  if (error) redirect("/onboarding?error=save_failed");

  redirect("/account");
}

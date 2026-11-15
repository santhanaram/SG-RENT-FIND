"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/auth";

export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();

  // Same response either way, so the page doesn't reveal which email is allowed.
  if (!isAllowedEmail(email)) redirect("/login?sent=1");

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${siteUrl}/auth/callback`, shouldCreateUser: false },
  });

  if (error) redirect("/login?error=send_failed");
  redirect("/login?sent=1");
}

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/auth";

/** Origin of the current request, so magic links return to the same deployment (production or preview). */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  // Same response either way, so the page doesn't reveal which email is allowed.
  if (!isAllowedEmail(email)) redirect("/login?sent=1");

  const supabase = await createClient();
  const origin = await requestOrigin();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // The database trigger only lets the allow-listed email create an account,
    // so the first login can create it.
    options: { emailRedirectTo: `${origin}/auth/callback`, shouldCreateUser: true },
  });

  if (error) {
    console.error("[login] signInWithOtp failed", { status: error.status, code: error.code, message: error.message });
    const reason = error.status === 429 ? "rate_limited" : "send_failed";
    redirect(`/login?error=${reason}`);
  }
  redirect("/login?sent=1");
}

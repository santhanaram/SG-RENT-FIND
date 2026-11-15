import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  // Supabase sends errors back as query params, e.g. an expired link.
  if (searchParams.get("error") || searchParams.get("error_code")) {
    return NextResponse.redirect(`${origin}/login?error=callback_failed`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/`);
    console.error("[auth/callback] exchangeCodeForSession failed", { code: error.code, message: error.message });
  }

  return NextResponse.redirect(`${origin}/login?error=callback_failed`);
}

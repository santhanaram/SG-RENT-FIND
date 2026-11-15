import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client. The app has no login, so there is no user session;
 * all database access goes through server code with the publishable key.
 */
export function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

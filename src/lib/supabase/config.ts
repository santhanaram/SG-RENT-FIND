/** Env vars the app can't run without. Names only; values are never exposed. */
const REQUIRED = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "ALLOWED_EMAIL"] as const;

export function missingEnv(): string[] {
  const values: Record<(typeof REQUIRED)[number], string | undefined> = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ALLOWED_EMAIL: process.env.ALLOWED_EMAIL,
  };
  return REQUIRED.filter((key) => !values[key]?.trim());
}

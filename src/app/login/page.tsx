import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { sendMagicLink } from "./actions";

const errors: Record<string, string> = {
  not_allowed: "That account isn't allowed to use this app.",
  send_failed: "Couldn't send the sign-in link. Try again in a minute.",
  callback_failed: "That sign-in link has expired or was already used.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-navy text-white">
            <Building2 className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-navy">SG-Rent-Find</h1>
            <p className="text-sm text-muted-foreground">Sign in with a magic link</p>
          </div>
        </div>

        {sent ? (
          <p className="rounded-lg bg-primary-tint p-3 text-sm">
            If that email is allowed, a sign-in link is on its way. Check your inbox.
          </p>
        ) : (
          <form action={sendMagicLink} className="space-y-3">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
            <Button type="submit" className="w-full">
              Send sign-in link
            </Button>
          </form>
        )}

        {error && errors[error] && (
          <p className="mt-3 rounded-lg bg-error-soft p-3 text-sm text-error">{errors[error]}</p>
        )}
      </Card>
    </main>
  );
}

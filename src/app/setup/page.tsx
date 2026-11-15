import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { Card } from "@/components/ui/card";
import { missingEnv } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  const missing = missingEnv();
  if (missing.length === 0) redirect("/");

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-lg space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-navy text-white">
            <Settings className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-navy">Setup needed</h1>
            <p className="text-sm text-muted-foreground">SG-Rent-Find isn&apos;t connected to Supabase yet.</p>
          </div>
        </div>
        <p className="text-sm">These environment variables are missing on this deployment:</p>
        <ul className="space-y-1">
          {missing.map((key) => (
            <li key={key}>
              <code className="rounded bg-primary-tint px-2 py-0.5 text-sm">{key}</code>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          Add them in Vercel under Project Settings, Environment Variables, then redeploy. The README has the full
          setup steps.
        </p>
      </Card>
    </main>
  );
}

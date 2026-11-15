import { Building2, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

export default function Home() {
  return (
    <div className="min-h-dvh">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <Building2 className="size-5" aria-hidden />
            <span className="font-semibold">SG-Rent-Find</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <section>
          <h1 className="text-2xl font-semibold text-navy">Find a rental</h1>
          <p className="text-muted-foreground">
            Search the public web for Singapore rental listings. Only listings with a source link are shown.
          </p>
        </section>

        <Card className="flex flex-col items-start gap-4">
          <div className="flex items-center gap-2 text-navy">
            <Search className="size-5" aria-hidden />
            <h2 className="font-medium">Search</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            The search form and results dashboard arrive in the next milestones.
          </p>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status="verified" />
            <StatusBadge status="estimated" />
            <StatusBadge status="unverified" />
            <StatusBadge status="inaccessible" />
          </div>
        </Card>
      </main>
    </div>
  );
}

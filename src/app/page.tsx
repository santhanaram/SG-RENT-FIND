import { Building2 } from "lucide-react";
import { SearchDashboard } from "@/components/search/search-dashboard";

export default function Home() {
  return (
    <div className="min-h-dvh">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <Building2 className="size-5" aria-hidden />
            <span className="font-semibold">SG-Rent-Find</span>
          </div>
          <span className="text-xs text-white/70">Map: OneMap © Singapore Land Authority</span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <section>
          <h1 className="text-2xl font-semibold text-navy">Find a rental</h1>
          <p className="text-muted-foreground">
            Live search of the public web for Singapore rentals. Only listings with a real source link are shown, and anything
            the source doesn&apos;t state is left blank.
          </p>
        </section>
        <SearchDashboard />
      </main>
    </div>
  );
}

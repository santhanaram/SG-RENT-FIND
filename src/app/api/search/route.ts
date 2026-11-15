import { createHash } from "node:crypto";
import { searchInputSchema, type Listing, type StreamEvent } from "@/lib/search/schema";
import { searchWithClaude } from "@/lib/search/claude";
import { geocode } from "@/lib/geo/onemap";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

function fingerprint(l: { address: string | null; monthly_rent: number | null; bedrooms: number | null; source_urls: string[] }) {
  const key = l.address
    ? `${l.address.toLowerCase().replace(/[^a-z0-9]/g, "")}|${l.monthly_rent ?? ""}|${l.bedrooms ?? ""}`
    : l.source_urls[0];
  return createHash("sha1").update(key).digest("hex").slice(0, 16);
}

function site(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = searchInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid search" }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "Live search needs ANTHROPIC_API_KEY. Add it in Vercel → Settings → Environment Variables, then redeploy." },
      { status: 503 },
    );
  }
  const input = parsed.data;
  const supabase = createClient();
  const limit = Number(process.env.SEARCH_DAILY_LIMIT || 30);

  // Cost guard. If the database isn't reachable the search still runs.
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("searches")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since.toISOString());
  if (count !== null && count >= limit) {
    return Response.json({ error: `Daily search limit (${limit}) reached. Try again tomorrow.` }, { status: 429 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: StreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        send({ type: "progress", message: "Locating the area on OneMap" });
        const centerPromise = geocode(input.location);

        send({ type: "progress", message: "Starting web search" });
        const out = await searchWithClaude(input, (message) => send({ type: "progress", message }));

        send({ type: "progress", message: "Placing listings on the map" });
        const seen = new Set<string>();
        const listings: Listing[] = [];
        for (const l of out.listings) {
          const fp = fingerprint(l);
          if (seen.has(fp)) continue;
          seen.add(fp);
          listings.push({ ...l, fingerprint: fp, lat: null, lng: null, geocodedFrom: null, sourceSites: [...new Set(l.source_urls.map(site))] });
        }
        await Promise.all(
          listings.map(async (l) => {
            const q = l.address ?? null;
            if (!q) return;
            const p = await geocode(q);
            if (p) Object.assign(l, { lat: p.lat, lng: p.lng, geocodedFrom: p.label });
          }),
        );
        const c = await centerPromise;

        // Save history when the database allows it. Failure here never hides results.
        let searchId: string | null = null;
        const { data: row } = await supabase
          .from("searches")
          .insert({
            location: input.location,
            location_point: c ? `POINT(${c.lng} ${c.lat})` : null,
            max_budget: input.maxBudget ?? null,
            property_type: input.propertyType === "Any" ? null : input.propertyType,
            bedrooms: input.bedrooms ?? null,
            max_mrt_km: input.maxMrtKm ?? null,
            status: "done",
            summary: out.summary,
            inaccessible_sources: out.inaccessibleSources,
            raw_response: out.raw,
            completed_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        searchId = row?.id ?? null;
        if (searchId && listings.length) {
          await supabase.from("listings").insert(
            listings.map((l) => ({
              search_id: searchId,
              fingerprint: l.fingerprint,
              title: l.title,
              property_type: l.property_type,
              monthly_rent: l.monthly_rent,
              bedrooms: l.bedrooms,
              bathrooms: l.bathrooms,
              floor_area_sqft: l.floor_area_sqft,
              address: l.address,
              point: l.lat !== null ? `POINT(${l.lng} ${l.lat})` : null,
              nearest_mrt: l.nearest_mrt,
              furnishing: l.furnishing,
              source_urls: l.source_urls,
              source_sites: l.sourceSites,
              evidence: { quote: l.evidence, listed_on: l.listed_on, available_from: l.available_from, mrt_note: l.mrt_note },
            })),
          );
        }

        send({
          type: "result",
          result: {
            searchId,
            saved: searchId !== null,
            center: c ? { lat: c.lat, lng: c.lng } : null,
            listings,
            dropped: out.dropped,
            summary: out.summary,
            inaccessibleSources: out.inaccessibleSources,
          },
        });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Search failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}

import Anthropic from "@anthropic-ai/sdk";
import { rawListingSchema, rawResultSchema, type RawListing, type SearchInput } from "./schema";

const SYSTEM = `You find Singapore residential rental listings on the public web for one person.

Rules you must follow:
- Only report listings you actually saw in a search result or fetched page during this conversation. Never invent listings, prices, addresses, availability or links.
- Every listing needs at least one source_url copied exactly from a page you saw. Prefer the listing's own page over a search page.
- If a fact is not stated on the source, set it to null. Do not estimate rent, size or availability.
- Do not claim a unit is available unless the source says so. Put the date the source was posted in listed_on when shown.
- Do not try to get past logins, paywalls or bot checks. If a site blocks you, add its domain to inaccessible_sources and move on.
- Do not contact agents or submit forms.
- evidence is a short quote from the source showing the rent (and bedrooms if stated).
- Search several sites (for example PropertyGuru, 99.co, SRX, EdgeProp, Carousell, Ohmyhome, agency sites). Aim for up to 12 distinct listings that fit the criteria; fewer is fine.

When you are done, reply with only this JSON inside <result></result> tags:
{"listings":[{"title":string|null,"property_type":"HDB"|"Condo"|"Landed"|"Other"|null,"monthly_rent":number|null,"bedrooms":number|null,"bathrooms":number|null,"floor_area_sqft":number|null,"address":string|null,"nearest_mrt":string|null,"mrt_note":string|null,"available_from":string|null,"furnishing":string|null,"listed_on":string|null,"source_urls":[string],"evidence":string|null}],"summary":string,"inaccessible_sources":[string]}
summary is two or three plain sentences comparing what you found (price range, trade-offs).`;

function describe(input: SearchInput) {
  const parts = [`Location: ${input.location}, Singapore`];
  if (input.maxBudget) parts.push(`Maximum rent: S$${input.maxBudget} per month`);
  if (input.propertyType !== "Any") parts.push(`Property type: ${input.propertyType}`);
  if (input.bedrooms !== undefined) parts.push(`Bedrooms: ${input.bedrooms === 0 ? "studio or room" : input.bedrooms}`);
  if (input.maxMrtKm) parts.push(`Within about ${input.maxMrtKm} km of an MRT station`);
  return `Find current rental listings matching:\n${parts.join("\n")}`;
}

function normalizeUrl(u: string) {
  try {
    const url = new URL(u);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return u;
  }
}

export type ProviderOutput = {
  listings: RawListing[];
  dropped: number;
  summary: string | null;
  inaccessibleSources: string[];
  raw: unknown;
};

export async function searchWithClaude(
  input: SearchInput,
  onProgress: (message: string) => void,
): Promise<ProviderOutput> {
  const client = new Anthropic();
  const model = process.env.LLM_MODEL || "claude-sonnet-5-5";
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: describe(input) }];
  const seenUrls = new Set<string>();
  let searches = 0;
  let finalText = "";

  for (let turn = 0; turn < 4; turn++) {
    const stream = client.beta.messages.stream({
      model,
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: SYSTEM,
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: 8, user_location: { type: "approximate", country: "SG", city: "Singapore", timezone: "Asia/Singapore" } },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 10 },
      ],
      messages,
    });

    stream.on("streamEvent", (event) => {
      if (event.type === "content_block_start" && event.content_block.type === "server_tool_use") {
        if (event.content_block.name === "web_search") onProgress(`Searching the web (${++searches})`);
        else onProgress("Opening a listing page");
      }
    });

    const message = await stream.finalMessage();

    for (const block of message.content) {
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) seenUrls.add(normalizeUrl(r.url));
      } else if (block.type === "web_fetch_tool_result" && block.content.type === "web_fetch_result") {
        seenUrls.add(normalizeUrl((block.content as { url: string }).url));
      } else if (block.type === "text") {
        finalText += block.text;
        for (const c of block.citations ?? []) {
          if ("url" in c && typeof c.url === "string") seenUrls.add(normalizeUrl(c.url));
        }
      }
    }

    if (message.stop_reason === "refusal") throw new Error("The search was declined. Try rewording the location.");
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      onProgress("Still searching");
      continue;
    }
    break;
  }

  onProgress("Checking every listing has a real source link");
  const match = finalText.match(/<result>([\s\S]*?)<\/result>/);
  if (!match) throw new Error("The search finished without a readable result. Please try again.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1].trim().replace(/^```(?:json)?|```$/g, ""));
  } catch {
    throw new Error("The search result could not be read. Please try again.");
  }
  const result = rawResultSchema.parse(parsed);

  // Source-URL guard: keep only links the search actually returned, and drop listings left with none.
  const listings: RawListing[] = [];
  let dropped = 0;
  for (const item of result.listings) {
    const ok = rawListingSchema.safeParse(item);
    if (!ok.success) {
      dropped++;
      continue;
    }
    const urls = ok.data.source_urls.filter((u) => seenUrls.has(normalizeUrl(u)));
    if (urls.length === 0) {
      dropped++;
      continue;
    }
    listings.push({ ...ok.data, source_urls: urls });
  }

  return {
    listings,
    dropped,
    summary: result.summary ?? null,
    inaccessibleSources: result.inaccessible_sources ?? [],
    raw: { text: finalText, seenUrls: [...seenUrls] },
  };
}

# SG-Rent-Find Dashboard: Project Plan

A personal web dashboard that finds and compares Singapore rental listings from across the public web, built on the SG-Rent-Find agent spec. Hosted on Vercel, with Supabase for auth and storage.

Status: planning only. No code or deployment yet.

---

## 1. Decisions from the clarifying questions

| # | Question | Decision |
|---|---|---|
| 1 | Who uses it, and auth | Just you. Single-user app, sign-up disabled, one allow-listed email. |
| 2 | Listing data source | LLM search grounding (no scraping). Default provider: Claude with the web search tool, behind a swappable provider interface. |
| 3 | Search scope and storage | Search the general web (PropertyGuru, 99.co, SRX, EdgeProp, Carousell, agency sites and any other public pages). Store search history and a shortlist with notes. |
| 4 | Stack and look | Next.js App Router, Tailwind and shadcn/ui, navy palette from the spec, plus a map view. |
| 5 | v1 scope | Search only: on-demand search, results dashboard, map, history and shortlist. No scheduled alerts in v1. |

Assumptions made where you didn't specify (easy to change):
- Saved searches, price tracking and alerts are out of v1. The schema leaves room for them.
- Map and MRT data come from OneMap (Singapore Land Authority's free API).
- Light mode first, with dark mode tokens defined so it can be added cheaply.

---

## 2. Architecture

```
Browser (Next.js pages, React Server Components + client islands)
   |
   |  Supabase Auth session (magic link, your email only)
   v
Vercel (Next.js)
   ├─ Route handler  POST /api/search   ── streams progress to the UI
   │     1. Validate filters (zod)
   │     2. Call LLM provider with web search tool
   │     3. Parse structured JSON output (zod schema)
   │     4. Normalise, dedupe, geocode (OneMap), compute MRT distance
   │     5. Score verification status per field
   │     6. Write search + listings to Supabase
   ├─ Server actions  shortlist add/remove, notes, status
   └─ Pages           /, /search/[id], /shortlist, /history, /login
   |
   v
Supabase
   ├─ Auth (magic link, sign-ups disabled)
   ├─ Postgres (+ PostGIS for distance queries)
   └─ RLS on every table, keyed to auth.uid()

External
   ├─ Anthropic API (Claude + web search tool)
   └─ OneMap API (geocoding, MRT station coordinates, map tiles)
```

Key principles carried over from the agent spec:
- Never invent listings, prices, addresses or availability. Every listing must have a source URL returned by the search tool, and any listing without one is dropped.
- Every field carries a verification status: `verified` (seen on the source page), `estimated` (derived, such as MRT distance calculated from a geocoded address), or `unverified/missing`.
- Never claim availability without evidence. Availability defaults to "unverified" unless the source states it with a date.
- Respect site access rules. The app does not fetch pages itself in v1; it only uses what the search tool returns.
- The app never contacts agents or submits enquiries. "Contact" is just an outbound link.

---

## 3. Data pipeline (one search run)

1. **Input.** Location (required), max budget, property type (HDB / Condo / Landed / Any), bedrooms, max MRT distance in km, move-in date.
2. **Interpret location.** Geocode the location with OneMap to get a centre point and planning area. This anchors the map and the MRT calculations.
3. **LLM search.** Send one request to Claude with the web search tool enabled. The system prompt is the SG-Rent-Find agent spec. The model is asked to return JSON only, matching a strict schema:
   ```json
   {
     "listings": [{
       "title": "...", "property_type": "Condo", "monthly_rent_sgd": 3800,
       "bedrooms": 2, "bathrooms": 2, "floor_area_sqft": 750,
       "address_or_area": "...", "nearest_mrt_claimed": "...",
       "available_from": "2026-12-01", "furnishing": "...",
       "source_url": "https://...", "source_site": "99.co",
       "evidence": { "monthly_rent_sgd": "quoted text", "bedrooms": "quoted text" },
       "missing_fields": ["available_from"]
     }],
     "inaccessible_sources": [{ "url": "...", "reason": "..." }],
     "summary": "...", "key_differences": ["..."], "next_steps": ["..."]
   }
   ```
4. **Validate.** Parse with zod. Drop any listing whose `source_url` was not among the URLs the search tool actually returned (guards against invented links). Drop listings without a rent or a source.
5. **Normalise and dedupe.** Normalise rent to a number, property type to an enum, and the address to a canonical form. Dedupe by (normalised address or building name + bedrooms + rent within 5%), keeping all source URLs on the merged record.
6. **Geocode and MRT distance.** Geocode each address with OneMap. Compute straight-line distance to the nearest MRT/LRT station from a seeded `mrt_stations` table. Mark this as `estimated`. Walking distance from the OneMap routing API is a later enhancement.
7. **Filter and rank.** Apply budget, type, bedroom and MRT filters. Listings that fail a filter because a field is missing are kept in a separate "possible matches" group, never silently included.
8. **Persist.** Save the search, its listings and the LLM summary to Supabase. Store the raw model response for debugging.
9. **Stream to UI.** The route handler streams status events (searching, extracting, geocoding, done) so the page doesn't sit blank during a 30 to 90 second search.

Provider interface (so the LLM can be swapped later):
```ts
interface ListingSearchProvider {
  search(filters: SearchFilters): Promise<RawSearchResult>; // listings + cited URLs
}
```
Default: `ClaudeWebSearchProvider` using the latest Claude Sonnet model. An alternative such as Gemini with Google Search grounding (which the original agent spec used) can be added as a second implementation.

---

## 4. Supabase schema

```sql
-- Enable PostGIS for distance queries
create extension if not exists postgis;

create type property_type as enum ('HDB', 'Condo', 'Landed', 'Other');
create type verification as enum ('verified', 'estimated', 'unverified');
create type shortlist_status as enum ('interested', 'to_view', 'viewed', 'rejected', 'applied');

-- One row per search run
create table searches (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  location      text not null,
  location_point geography(point),
  max_budget    integer,
  property_type property_type,
  bedrooms      smallint,
  max_mrt_km    numeric(4,2),
  move_in_date  date,
  status        text not null default 'running',  -- running | done | failed
  summary       text,
  key_differences jsonb,
  next_steps    jsonb,
  inaccessible_sources jsonb,
  raw_response  jsonb,
  provider      text not null default 'claude',
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

-- Listings found by a search (one row per deduped listing per search)
create table listings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade default auth.uid(),
  search_id       uuid not null references searches(id) on delete cascade,
  fingerprint     text not null,          -- dedupe key, used to link the same listing across searches
  title           text,
  property_type   property_type,
  monthly_rent    integer,
  bedrooms        smallint,
  bathrooms       smallint,
  floor_area_sqft integer,
  address         text,
  point           geography(point),
  nearest_mrt     text,
  mrt_distance_km numeric(4,2),
  available_from  date,
  furnishing      text,
  source_urls     text[] not null,        -- at least one
  source_sites    text[],
  field_status    jsonb not null,         -- { "monthly_rent": "verified", "mrt_distance_km": "estimated", ... }
  evidence        jsonb,                  -- quoted snippets backing verified fields
  missing_fields  text[],
  matches_filters boolean not null,       -- false = "possible match" group
  created_at      timestamptz not null default now(),
  constraint has_source check (cardinality(source_urls) > 0)
);
create index on listings (search_id);
create index on listings (user_id, fingerprint);
create index on listings using gist (point);

-- Your shortlist, keyed by fingerprint so it survives across searches
create table shortlist (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade default auth.uid(),
  listing_id   uuid not null references listings(id) on delete cascade,
  fingerprint  text not null,
  status       shortlist_status not null default 'interested',
  notes        text,
  viewing_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, fingerprint)
);

-- Reference data (public read, seeded once from OneMap / LTA)
create table mrt_stations (
  code   text primary key,   -- e.g. 'NS22'
  name   text not null,
  line   text not null,
  point  geography(point) not null
);
create index on mrt_stations using gist (point);

-- Helper: nearest station to a point
create function nearest_mrt(p geography)
returns table (code text, name text, distance_km numeric)
language sql stable as $$
  select code, name, round((st_distance(point, p) / 1000)::numeric, 2)
  from mrt_stations order by point <-> p limit 1;
$$;
```

### Row-level security

```sql
alter table searches     enable row level security;
alter table listings     enable row level security;
alter table shortlist    enable row level security;
alter table mrt_stations enable row level security;

-- Owner-only access on personal tables (repeat for listings and shortlist)
create policy "owner select" on searches for select using (user_id = auth.uid());
create policy "owner insert" on searches for insert with check (user_id = auth.uid());
create policy "owner update" on searches for update using (user_id = auth.uid());
create policy "owner delete" on searches for delete using (user_id = auth.uid());

-- Reference data readable by signed-in users only
create policy "read stations" on mrt_stations for select to authenticated using (true);
```

Single-user lock-down:
- Disable sign-ups in Supabase Auth settings.
- Create your user once from the Supabase dashboard (or invite yourself).
- Add an `ALLOWED_EMAIL` check in Next.js middleware as a second guard.
- The service role key is never sent to the browser. Server code uses the user's session client so RLS always applies; the service role is only used for seeding `mrt_stations`.

Room left for v2 (no tables yet): `saved_searches`, `listing_price_history` (keyed by fingerprint), `alerts`.

---

## 5. Pages and components

### Pages
| Route | Purpose |
|---|---|
| `/login` | Magic-link sign-in. |
| `/` | Search form plus recent searches. |
| `/search/[id]` | The results dashboard for one search (live-streams while running). |
| `/shortlist` | Starred listings with status, notes, viewing dates, and a map. |
| `/history` | All past searches, re-run button, delete. |

### Results dashboard layout (from the spec)
1. **Header** with search parameters shown as tag chips (location, budget, type, bedrooms, MRT).
2. **Summary hero**, a bento grid: total matches, price range, median rent, most common property type, count of verified vs unverified listings.
3. **View toggle: Table / Map / Cards.**
   - **Table**: sticky header, zebra rows, tabular figures for rent, sortable columns (Property, Location, Monthly Rent, Bedrooms, MRT distance, Source). Unverified rows get a light amber tint.
   - **Map**: OneMap base tiles via Leaflet, listing pins coloured by verification status, MRT stations layer, a radius circle for the MRT filter, and a click-through popup to the listing.
   - **Cards**: the mobile default, stacked cards with icons for size, bedrooms and MRT.
4. **Analysis grid**, two columns: "Key property differences" and "Missing or unverified details".
5. **Possible matches**, a collapsed section of listings excluded only because data was missing.
6. **Footer**: sources list with per-site counts, inaccessible sources with reasons, and a "Suggested next steps" checklist.

### Components
`SearchForm`, `FilterChips`, `SummaryBento`, `ListingsTable`, `ListingsMap`, `ListingCard`, `StatusBadge` (Verified / Estimated / Unverified / Inaccessible pills), `FieldValue` (shows a value with a hover tooltip quoting the evidence), `DifferencesPanel`, `MissingDetailsPanel`, `SourcesFooter`, `NextStepsChecklist`, `ShortlistButton`, `ShortlistNotesDrawer`, `SearchProgress` (streamed steps).

### Design tokens
From the spec palette, exposed as Tailwind theme colours and CSS variables:
- Primary: `#006492` (primary-40), `#007eb7` (50), `#cae6ff` (90), `#f6f9ff` (98)
- Header navy: `#1a2b3c`
- Secondary slate: `#50606e` (40), `#d3e5f5` (90)
- Neutral text and surfaces: `#1a1c1e`, `#5d5e61`, `#f9f9fc`, `#ffffff`
- Error: `#ba1a1a`
- Verified accent: forest green (e.g. `#1f7a4d`); unverified tint: `#fff8e1`
- Font: Inter, with `font-variant-numeric: tabular-nums` on prices

---

## 6. Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router, TypeScript) |
| UI | Tailwind CSS, shadcn/ui, lucide-react icons |
| Map | Leaflet + react-leaflet with OneMap tiles |
| Validation | zod |
| Data | Supabase (Postgres + PostGIS, Auth), `@supabase/ssr` |
| LLM | Anthropic SDK, Claude Sonnet with the web search server tool |
| Tests | Vitest for pipeline logic, Playwright for a smoke test |
| Hosting | Vercel (Git-connected), Supabase cloud project in the Singapore region |

---

## 7. Vercel deployment and environment variables

Setup:
1. Create a GitHub repo and connect it to a new Vercel project (preview deploys on every PR, production on `main`).
2. Create a Supabase project in `ap-southeast-1` (Singapore). Apply migrations with the Supabase CLI.
3. Set the Supabase Auth site URL and redirect URLs to the Vercel production and preview domains.
4. Set environment variables in Vercel.
5. Set `maxDuration` on `/api/search` high enough for a full search (60 to 300 seconds depending on plan) and stream the response.

| Variable | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + server | Publishable key (RLS enforced) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Seeding scripts only, never in client code |
| `ANTHROPIC_API_KEY` | Server only | LLM search |
| `LLM_PROVIDER` | Server only | `claude` (default) |
| `LLM_MODEL` | Server only | Model ID, so it can change without a code change |
| `ONEMAP_EMAIL` / `ONEMAP_PASSWORD` | Server only | OneMap token for authenticated endpoints (token cached server-side) |
| `ALLOWED_EMAIL` | Server only | The one email allowed to sign in |
| `SEARCH_DAILY_LIMIT` | Server only | Cost guard, e.g. 30 searches a day |

---

## 8. Milestones

| # | Milestone | Done when |
|---|---|---|
| M0 | Project setup | Repo, Next.js scaffold, Tailwind tokens, shadcn, Vercel project and Supabase project linked; empty app deploys. |
| M1 | Auth and schema | Migrations applied, RLS on, sign-ups disabled, magic-link login works for your email only. MRT stations seeded. |
| M2 | Search pipeline | `/api/search` returns validated, deduped, geocoded listings for a real location; source-URL guard and verification statuses covered by unit tests. |
| M3 | Results dashboard | Header chips, summary bento, table, cards, analysis panels, sources footer, next steps, streamed progress. |
| M4 | Map view | Listing pins, MRT layer, radius filter, popups, verified/unverified pin styles. |
| M5 | History and shortlist | History list with re-run, shortlist with status, notes and viewing date, shortlist map. |
| M6 | Polish and launch | Mobile pass, empty and error states, rate limit, Playwright smoke test, production deploy. |

---

## 9. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| LLM invents a listing or a price | Breaks the core rule | Source-URL guard (drop listings whose URL wasn't a cited search result), evidence quotes required for "verified" fields, schema validation, and a visible verification badge on every field. |
| Search results are thin or stale (listing pages are often JS-heavy or behind anti-bot protection) | Few results; old listings shown as current | Show the count of inaccessible sources, default availability to "unverified", show the date the search ran, and add manual URL import in v2 if needed. |
| Site terms of service (PropertyGuru and others prohibit scraping) | Legal and ethical risk | No direct fetching or scraping in v1; only data surfaced by the search tool, always linked back to the source. |
| Vercel function timeout on long searches | Failed searches | Streamed response, `maxDuration` set, search row saved as `running` first so partial results survive and failures are recorded. |
| API cost creep | Unexpected bills | Daily search limit, model ID in env, log token usage per search in `searches.raw_response`. |
| Geocoding mismatches (vague addresses like "near Tiong Bahru") | Wrong map pins and MRT distances | Mark geocoded points and MRT distance as `estimated`, fall back to the planning-area centroid with a clear label. |
| Duplicate listings across sites with different wording | Cluttered results | Fingerprint dedupe on normalised address, bedrooms and rent band, with all sources kept on the merged listing. |
| Single-user lock-down misconfigured | Others could sign up | Sign-ups disabled in Supabase, email allow-list in middleware, RLS on every table, Supabase security advisor checked before launch. |

---

## 10. Later (v2 ideas)

- Saved searches and a daily Vercel cron that emails or Telegrams new matches.
- Price history per listing fingerprint.
- Walking distance to MRT via OneMap routing.
- Manual import: paste a listing URL or text and have it extracted and verified.
- Commute time to a chosen address (work or school).
- Dark mode.

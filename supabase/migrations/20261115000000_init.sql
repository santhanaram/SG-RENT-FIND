-- SG-Rent-Find initial schema: searches, listings, shortlist, MRT reference data.
-- Every personal table is owner-only through RLS keyed to auth.uid().

create extension if not exists postgis with schema extensions;

create type public.property_type as enum ('HDB', 'Condo', 'Landed', 'Other');
create type public.shortlist_status as enum ('interested', 'to_view', 'viewed', 'rejected', 'applied');

-- One row per search run
create table public.searches (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users(id) on delete cascade,
  location             text not null,
  location_point       extensions.geography(point),
  max_budget           integer check (max_budget is null or max_budget > 0),
  property_type        public.property_type,
  bedrooms             smallint check (bedrooms is null or bedrooms >= 0),
  max_mrt_km           numeric(4,2) check (max_mrt_km is null or max_mrt_km > 0),
  move_in_date         date,
  status               text not null default 'running' check (status in ('running', 'done', 'failed')),
  summary              text,
  key_differences      jsonb,
  next_steps           jsonb,
  inaccessible_sources jsonb,
  raw_response         jsonb,
  provider             text not null default 'claude',
  error                text,
  created_at           timestamptz not null default now(),
  completed_at         timestamptz
);
create index searches_user_created_idx on public.searches (user_id, created_at desc);

-- Listings found by a search (one row per deduped listing per search)
create table public.listings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  search_id       uuid not null references public.searches(id) on delete cascade,
  fingerprint     text not null,
  title           text,
  property_type   public.property_type,
  monthly_rent    integer,
  bedrooms        smallint,
  bathrooms       smallint,
  floor_area_sqft integer,
  address         text,
  point           extensions.geography(point),
  nearest_mrt     text,
  mrt_distance_km numeric(4,2),
  available_from  date,
  furnishing      text,
  source_urls     text[] not null,
  source_sites    text[],
  field_status    jsonb not null default '{}'::jsonb,
  evidence        jsonb,
  missing_fields  text[],
  matches_filters boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint listings_has_source check (cardinality(source_urls) > 0)
);
create index listings_search_idx on public.listings (search_id);
create index listings_user_fingerprint_idx on public.listings (user_id, fingerprint);
create index listings_point_idx on public.listings using gist (point);

-- Shortlist, keyed by fingerprint so a starred listing survives across searches
create table public.shortlist (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  listing_id  uuid not null references public.listings(id) on delete cascade,
  fingerprint text not null,
  status      public.shortlist_status not null default 'interested',
  notes       text,
  viewing_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, fingerprint)
);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger shortlist_set_updated_at
before update on public.shortlist
for each row execute function public.set_updated_at();

-- Reference data, seeded once with the service role
create table public.mrt_stations (
  code  text primary key,
  name  text not null,
  line  text not null,
  point extensions.geography(point) not null
);
create index mrt_stations_point_idx on public.mrt_stations using gist (point);

-- Nearest MRT/LRT station to a point (straight-line distance, so callers mark it 'estimated')
create function public.nearest_mrt(p extensions.geography)
returns table (code text, name text, distance_km numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.code, s.name, round((extensions.st_distance(s.point, p) / 1000)::numeric, 2)
  from public.mrt_stations s
  order by s.point operator(extensions.<->) p
  limit 1;
$$;

-- Row-level security
alter table public.searches     enable row level security;
alter table public.listings     enable row level security;
alter table public.shortlist    enable row level security;
alter table public.mrt_stations enable row level security;

create policy "searches: owner select" on public.searches for select to authenticated using ((select auth.uid()) = user_id);
create policy "searches: owner insert" on public.searches for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "searches: owner update" on public.searches for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "searches: owner delete" on public.searches for delete to authenticated using ((select auth.uid()) = user_id);

create policy "listings: owner select" on public.listings for select to authenticated using ((select auth.uid()) = user_id);
create policy "listings: owner insert" on public.listings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "listings: owner update" on public.listings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "listings: owner delete" on public.listings for delete to authenticated using ((select auth.uid()) = user_id);

create policy "shortlist: owner select" on public.shortlist for select to authenticated using ((select auth.uid()) = user_id);
create policy "shortlist: owner insert" on public.shortlist for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "shortlist: owner update" on public.shortlist for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "shortlist: owner delete" on public.shortlist for delete to authenticated using ((select auth.uid()) = user_id);

create policy "mrt_stations: read for signed-in users" on public.mrt_stations for select to authenticated using (true);

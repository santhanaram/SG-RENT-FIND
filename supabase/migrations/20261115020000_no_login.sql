-- The app no longer has a login. Rows are no longer tied to an auth user,
-- and the server reads and writes with the publishable (anon) key.

alter table public.searches  alter column user_id drop not null, alter column user_id drop default;
alter table public.listings  alter column user_id drop not null, alter column user_id drop default;
alter table public.shortlist alter column user_id drop not null, alter column user_id drop default;

alter table public.shortlist drop constraint if exists shortlist_user_id_fingerprint_key;
alter table public.shortlist add constraint shortlist_fingerprint_key unique (fingerprint);

do $$
declare t text; op text;
begin
  foreach t in array array['searches', 'listings', 'shortlist'] loop
    foreach op in array array['select', 'insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I', t || ': owner ' || op, t);
    end loop;
    execute format('create policy %I on public.%I for all to anon, authenticated using (true) with check (true)', t || ': app access', t);
  end loop;
end $$;

drop policy if exists "mrt_stations: read for signed-in users" on public.mrt_stations;
create policy "mrt_stations: public read" on public.mrt_stations for select to anon, authenticated using (true);

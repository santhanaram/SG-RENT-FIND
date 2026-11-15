-- Single-user lock-down at the database level.
-- Only emails listed in private.allowed_emails can ever get an auth account,
-- so sign-ups can stay enabled for the first magic-link login without
-- letting anyone else register through the public API.

create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists private.allowed_emails (
  email text primary key check (email = lower(email))
);

create or replace function private.enforce_allowed_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null
     or not exists (select 1 from private.allowed_emails a where a.email = lower(new.email)) then
    raise exception 'Sign-ups are restricted for this app' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_allowed_email on auth.users;
create trigger enforce_allowed_email
before insert or update of email on auth.users
for each row execute function private.enforce_allowed_email();

-- Add your email once (not committed to the repo):
--   insert into private.allowed_emails (email) values ('you@example.com');

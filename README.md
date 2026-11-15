# SG-Rent-Find

A personal dashboard for finding and comparing verified Singapore rental listings from across the public web. Built with Next.js on Vercel and Supabase.

See [Plan.md](Plan.md) for the architecture, schema and milestones.

## Local setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Supabase URL, anon key and `ALLOWED_EMAIL`.
3. Run `npm run dev` and open http://localhost:3000.

## Supabase setup

1. Create a project in the Singapore region (`ap-southeast-1`).
2. Apply the migrations in `supabase/migrations/` (Supabase CLI: `supabase link` then `supabase db push`, or paste them into the SQL editor), then add your email: `insert into private.allowed_emails (email) values ('you@example.com');`
3. Auth > Providers > Email: keep email enabled. Leave sign-ups on: a database trigger only lets emails in `private.allowed_emails` create an account, so your first magic-link login creates yours.
4. No need to add the user by hand.
5. Auth > URL Configuration: set the Site URL to your Vercel production URL and add `http://localhost:3000/auth/callback` and `https://<your-domain>/auth/callback` to the redirect URLs.

## Vercel setup

1. Import this repository as a new Vercel project (framework preset: Next.js).
2. Add the variables from `.env.example` under Project Settings > Environment Variables. Set `NEXT_PUBLIC_SITE_URL` to the production URL.
3. Deploy. Pushes to `main` deploy to production; pull requests get preview URLs.

## Access model

Only one account can use the app. A database trigger blocks accounts for any email not in `private.allowed_emails`, the middleware signs out any user whose email isn't `ALLOWED_EMAIL`, and row-level security limits every table to its owner.

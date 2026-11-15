# SG-Rent-Find

A personal dashboard for finding and comparing verified Singapore rental listings from across the public web. Built with Next.js on Vercel and Supabase.

See [Plan.md](Plan.md) for the architecture, schema and milestones.

## Local setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Supabase URL and anon key.
3. Run `npm run dev` and open http://localhost:3000.

## Supabase setup

1. Create a project in the Singapore region (`ap-southeast-1`).
2. Apply the migrations in `supabase/migrations/` in order (Supabase CLI: `supabase link` then `supabase db push`, or paste them into the SQL editor).

## Vercel setup

1. Import this repository as a new Vercel project (framework preset: Next.js).
2. Add the variables from `.env.example` under Project Settings > Environment Variables.
3. Deploy. Pushes to `main` deploy to production; pull requests get preview URLs.

## Access model

There is no login: anyone with the URL can open the dashboard. Database access happens only in server code.

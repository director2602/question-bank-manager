# Deployment Guide

This guide covers deploying Question Bank Manager & Paper Generator to **Vercel** (app hosting) + **Supabase** (Postgres, Auth, Storage) — the simplest reliable production combination for this stack. Any Node.js host that supports Next.js 14 (App Router) works equally well if you prefer a different platform; the steps below adapt directly.

## 1. Provision Supabase

1. Create a project at [supabase.com](https://supabase.com) (choose a region close to your users).
2. **Settings → API**: copy the Project URL and the `anon` public key → these become `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. **Settings → API**: copy the `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY`. **Never expose this to the browser or commit it to git.**
4. **Settings → Database → Connection string**:
   - Copy the **Transaction pooler** connection string (port 6543) → `DATABASE_URL`. Append `?pgbouncer=true&connection_limit=1` if not already present (required for Prisma + pgbouncer compatibility).
   - Copy the **Direct connection** string (port 5432) → `DIRECT_URL` (used only for running migrations).
5. **Authentication → Providers**: Email provider is enabled by default — that's all this app needs. Optionally disable "Confirm email" during initial testing to skip the email-verification step (re-enable for production).
6. **Authentication → Email Templates**: customize the confirmation email with your institute's branding (optional).

## 2. Run migrations and one-time SQL

From your local machine (with `.env` filled in from the values above):

```bash
npm install
npx prisma generate
npx prisma migrate deploy
```

Then, in the Supabase **SQL Editor**, run in order:

1. Open `supabase/sql/001_auth_trigger.sql`, replace the placeholder email in `bootstrap_owners` with your real Owner account's email, and run it.
2. Run `supabase/sql/002_storage_bucket.sql` as-is.

## 3. Seed initial data (optional but recommended)

```bash
npm run db:seed
```

This creates the lookup tables (required — the app won't function without Subject/Class/Code/Difficulty rows), a default paper template, and (if you keep the demo user list in `prisma/seed.ts`, or replace it with your real staff list) the initial set of accounts. **Edit `DEMO_USERS` in `prisma/seed.ts` to your real staff emails before running this against production**, or skip user seeding and have staff self-register (they land as standard Users automatically) with you promoting the first Owner manually — see below.

### First Owner account

If you didn't seed a bootstrap Owner:

1. Have that person sign up normally at `/register` (they'll land as a standard User).
2. Manually promote them to Owner via SQL (one-time, since the Users screen itself requires an existing Owner):
   ```sql
   update public.profiles
   set role_id = (select id from public.roles where code = 'ADMIN')
   where email = 'the-owner@yourdomain.com';
   ```
3. From then on, that Owner can promote/demote other accounts from **Users** in the app.

## 4. Deploy to Vercel

1. Push this repository to GitHub/GitLab/Bitbucket.
2. In Vercel: **New Project** → import the repository. Framework preset: **Next.js** (auto-detected).
3. **Environment Variables** — add every variable from `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (mark as sensitive/encrypted)
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `SUPABASE_STORAGE_BUCKET` = `question-bank-files`
   - `NEXT_PUBLIC_APP_URL` = your production URL (e.g. `https://qbank.yourdomain.com`) — **required** for server-side PDF export to resolve image/logo URLs correctly, see `src/lib/pdf/paperHtml.ts`.
   - `APP_BOOTSTRAP_ADMIN_EMAILS` (informational; the real bootstrap list lives in `supabase/sql/001_auth_trigger.sql`)
4. Deploy.
5. Add a custom domain under **Settings → Domains** if desired; Vercel provisions HTTPS automatically.

### Server-side PDF export on Vercel

`@sparticuz/chromium` (used by `src/lib/pdf/paperPdf.ts`) is compatible with Vercel's serverless Node functions out of the box — no extra configuration needed beyond the deploy above. If PDF generation ever times out on the default function duration, increase the function's `maxDuration` for the `/api/papers/[id]/export/pdf` route in `vercel.json`, or rely on the always-available in-browser Print → Save as PDF flow, which needs no server-side Chromium at all.

## 5. Post-deploy checklist

- [ ] Sign in as the Owner; confirm the Dashboard loads with seeded stats.
- [ ] Add a test question, confirm it appears in search within a few seconds.
- [ ] Generate a small test paper, confirm the exact requested count is selected.
- [ ] Export the paper as PDF and as a printed HTML page; confirm both render identically.
- [ ] Generate the answer key; confirm it lists answers only (no question text).
- [ ] Promote a second account to Owner (or confirm a User account cannot reach `/users`, `/audit-logs`, or `/settings`).
- [ ] Confirm `/api/questions/export` (CSV export) is reachable only by the Owner.
- [ ] Rotate the demo account passwords (or delete the demo accounts) if you seeded them.
- [ ] Enable Supabase's automated backups (**Database → Backups**) and note the retention window.
- [ ] Set up a monitoring/alerting hook (Vercel's built-in observability, or a third-party APM) on 5xx rates for the `/api/*` routes.

## Scaling beyond a single instance

The app is stateless by design — the database and storage bucket hold all persistent state — so horizontal scaling (more Vercel function instances, or more containers on another host) requires no code changes, with one exception: `src/lib/rate-limit.ts` uses an in-memory store, so rate limits are enforced per-instance rather than globally under heavy multi-instance load. Swap in a shared store (e.g. Upstash Redis, a `@upstash/ratelimit` drop-in) if you need cluster-wide rate limiting.

## Local development without Vercel

`npm run dev` runs the full app locally against your Supabase project (steps 1–3 above still apply — Supabase is the database/auth/storage backend either way, only the app's *hosting* differs between local dev and Vercel).

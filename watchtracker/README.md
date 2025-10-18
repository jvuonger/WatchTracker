# WatchTracker (MVP)

A minimal Next.js 13.5 + Prisma scaffold to ingest eBay sold listings and surface basic model pages.

## Quickstart

- Copy `.env.example` to `.env` and set values.
- Provide a Postgres `DATABASE_URL` (e.g., Neon/Railway/Local).
- Install deps and generate Prisma client:

```
npm install
npm run prisma:generate
```

- Initialize DB schema and open Prisma Studio (optional):

```
npx prisma migrate dev --name init  # Requires a reachable Postgres
npm run seed                         # Optional: seeds initial models
```

- Run the app:

```
npm run dev
```

Visit `http://localhost:3000`.

## Ingest endpoint

- POST `/api/ingest/sold` with header `x-cron-key: <CRON_KEY>`.
- Query `?backfill=1` to sweep up to 90 days.
- Requires `EBAY_APP_ID`.

## eBay Marketplace Account Deletion

- Endpoint (HTTPS): `/api/ebay/marketplace-account-deletion`
- Env: set `EBAY_MAD_TOKEN` in `.env` and enter the same value in eBay Dev Portal’s “Verification token”.
- eBay will POST JSON to the endpoint; we store each event in `AccountDeletionEvent` with `tokenValid`.
- Local test:

```
curl -X POST http://localhost:3000/api/ebay/marketplace-account-deletion \
  -H 'Content-Type: application/json' \
  -H 'x-verification-token: YOUR_TOKEN' \
  -d '{"userId":"exampleUser","verificationToken":"YOUR_TOKEN"}'
```

- For eBay’s “Send Test Notification”, deploy to an HTTPS URL (e.g., Vercel) and use that as the endpoint.
 - View received events during development with Prisma Studio:

```
npm run prisma:studio
```

## Deploying to Vercel

- Monorepo note: set the project Root Directory to `watchtracker` when importing the repo in Vercel.
- Framework preset: Next.js (auto-detected).
- Environment Variables (set for Preview and Production):
  - `DATABASE_URL` (Postgres, e.g., Neon/Railway)
  - `EBAY_APP_ID` (eBay Production App ID)
  - `EBAY_MAD_TOKEN` (verification token you configure in eBay Dev Portal)
  - `CRON_KEY` (optional; not required if using Vercel Cron header)
- Cron Job: `vercel.json` contains an hourly schedule hitting `/api/ingest/sold`.
  - The route accepts requests with Vercel’s `x-vercel-cron: 1` header (no `CRON_KEY` needed), or with your `x-cron-key: <CRON_KEY>` header.
- Build settings:
  - Build Command: `next build` (default)
  - Install Command: `npm install` (runs `postinstall` → `prisma generate`)
  - Output: auto
- After first deploy, run migrations from your machine or CI:
  - `cd watchtracker && npx prisma migrate deploy` (requires `DATABASE_URL` with permissions)
  - Or run once locally with `npx prisma migrate dev` then redeploy.

Tip: Using Neon or Prisma Accelerate is recommended to avoid serverless connection limits.

## Notes

- This MVP uses Postgres (arrays + JSON). Use a hosted Postgres like Neon/Railway or local Postgres.
- FX conversion is stubbed; currently treats non-USD as USD. You can add a daily rates table and convert in `normalize.ts`.
- The metrics SQL in `sql/metrics.sql` is Postgres-compatible and avoids `QUALIFY`.

## Environment variables

- `DATABASE_URL`: SQLite or Postgres URL
- `EBAY_APP_ID`: eBay Finding API App ID (production keys recommended)
- `CRON_KEY`: shared secret for cron authorization

## Seed models

Edit `data/models.json` to add more models; rerun `npm run seed`.

## Roadmap

- Add analytics computation job (hourly) using `sql/metrics.sql`.
- Add charts and filters to model pages.
- Implement Watchlist and trend alerts.

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

Perfect—thanks! Here’s a tight, JS/TS-only plan tailored to your answers. I’ll keep it practical so you can ship an MVP quickly.

# Architecture (simple + reliable)

* **Frontend:** Next.js (App Router), ISR for SEO’d model pages, client charts (e.g., Recharts).
* **Backend:** Next.js API routes (or a tiny Express server) for:

  * `/api/ingest/sold` (cron-only)
  * `/api/models` (list/search)
  * `/api/models/[brand]/[family]/[ref]/sold` (paginated sold comps)
  * `/api/analytics/[brand]/[ref]` (precomputed KPIs + timeseries)
  * `/api/watchlist` (CRUD) and `/api/alerts/trends`
* **Jobs:** Hourly cron (Vercel/Cloudflare/Render cron) calling your ingest endpoint with a secret.
* **DB:** Postgres (Neon/Railway). Use Prisma ORM.
* **Cache:** Incremental Static Regeneration + `swr` where needed.

---

# Data model (Prisma schema)

Paste into `prisma/schema.prisma`:

```prisma
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }
generator client { provider = "prisma-client-js" }

model Model {
  id          String  @id @default(cuid())
  brand       String
  family      String?     // e.g., Submariner
  ref         String      // e.g., 124060
  displayName String      // "Rolex Submariner 124060"
  keywords    String[]    // search hints for eBay queries
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  listings    SoldListing[]
  metrics     ModelMetric[]
  @@unique([brand, ref])
  @@index([brand, family, ref])
}

model SoldListing {
  itemId           String   @id       // eBay itemId
  title            String
  categoryId       String?
  brand            String?
  family           String?
  ref              String?
  condition        String?
  sellerUsername   String?
  sellerFeedback   Int?
  price            Decimal
  currency         String
  priceUsd         Decimal
  shippingCost     Decimal?
  country          String?
  endTimeUtc       DateTime
  sellingState     String
  url              String
  imageUrl         String?
  fullSet          Boolean  @default(false) // parsed "box|papers|card|full set"
  raw              Json
  ingestedAt       DateTime @default(now())

  modelId          String?
  model            Model?   @relation(fields: [modelId], references: [id])

  @@index([endTimeUtc])
  @@index([brand, ref, endTimeUtc])
}

model ModelMetric {
  id          String   @id @default(cuid())
  modelId     String
  model       Model    @relation(fields: [modelId], references: [id])
  window      String   // '30d' | '90d'
  // rolling stats at computation time
  mean        Decimal
  median      Decimal
  p25         Decimal
  p75         Decimal
  volume      Int
  // trend deltas
  momChange   Decimal? // % vs prior 30d
  yoyChange   Decimal? // NOTE: will be null until you store >12mo of data
  computedAt  DateTime @default(now())

  @@index([modelId, window, computedAt])
}

model WatchList {
  id        String   @id @default(cuid())
  // no auth → store client fingerprint or later userId when you add auth
  clientKey String
  modelId   String
  createdAt DateTime @default(now())
  @@unique([clientKey, modelId])
}

model TrendAlert {
  id          String   @id @default(cuid())
  clientKey   String
  modelId     String
  // basic “trend change” definition (e.g., 90d median breaks ±X%)
  thresholdPct Decimal  // e.g., 5 = ±5%
  direction    String    // 'up' | 'down' | 'both'
  active       Boolean   @default(true)
  createdAt    DateTime  @default(now())
}
```

> Note: You asked for **MoM/YoY** KPIs but you’re only storing **90 days**.
>
> * **MoM** is fine (two adjacent 30-day windows inside 90d).
> * **YoY** will be `null` until you’ve accumulated ≥12 months of data (keep the field for when you extend retention).

---

# eBay data ingestion (hourly)

**API:** Finding API → `findCompletedItems` with:

* `categoryId=31387` (Wristwatches)
* `itemFilter(0).name=SoldItemsOnly` → `true`
* Keywords from `Model.keywords` or `brand + ref` (e.g., `"Rolex 124060 -bezel insert -case only"`).
* Pagination: 100 per page; stop when `endTimeUtc <= lastWatermark`.

**Watermark strategy**

* Maintain a `last_end_time_utc` per model.
* Each run: fetch pages sorted by `EndTimeSoonest` (or `EndTimeNewest` if supported), ingest until you hit the watermark.

**Normalization rules**

* **USD only site focus:** If currency ≠ USD, convert using a cached daily FX table (still useful because US-based buyers sometimes buy cross-border).
* **Full set flag:** regex on title → `/(box|papers|card|warranty|full\s*set)/i`.
* **Trim outliers:** on analytics, not raw storage—drop top/bottom 2–5% by model + window.
* **Accept eBay displayed price** (per your choice). Note: Best Offer accepted may be lower; we won’t try to infer.

**Minimal ingest code (TypeScript sketch)**

```ts
// /lib/ebay.ts
export async function findCompleted({ keywords, page }: {keywords: string; page: number}) {
  const url = "https://svcs.ebay.com/services/search/FindingService/v1";
  const params = new URLSearchParams({
    "OPERATION-NAME": "findCompletedItems",
    "SERVICE-VERSION": "1.13.0",
    "SECURITY-APPNAME": process.env.EBAY_APP_ID!,
    "RESPONSE-DATA-FORMAT": "JSON",
    "categoryId": "31387",
    "keywords": keywords,
    "paginationInput.entriesPerPage": "100",
    "paginationInput.pageNumber": String(page),
  });
  const res = await fetch(`${url}?${params}`, { timeout: 20000 });
  if (!res.ok) throw new Error(`eBay ${res.status}`);
  return res.json();
}
```

```ts
// /app/api/ingest/sold/route.ts (Next.js App Router)
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findCompleted } from "@/lib/ebay";
import { normalizeEbayItem } from "@/lib/normalize";

export async function POST(req: NextRequest) {
  if (req.headers.get("x-cron-key") !== process.env.CRON_KEY) return NextResponse.json({ ok:false }, { status: 401 });

  const models = await prisma.model.findMany();
  for (const m of models) {
    const keywordsList = m.keywords.length ? m.keywords : [`${m.brand} ${m.ref}`];
    let keepGoing = true;
    for (const kw of keywordsList) {
      let page = 1;
      while (keepGoing) {
        const data = await findCompleted({ keywords: kw, page });
        const items = data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item ?? [];
        if (!items.length) break;

        for (const it of items) {
          const rec = normalizeEbayItem(it, m);
          // stop if we’ve crossed past the 90d backfill window
          if (rec.endTimeUtc < subDays(new Date(), 90)) { keepGoing = false; break; }
          await prisma.soldListing.upsert({
            where: { itemId: rec.itemId },
            update: rec,
            create: rec,
          });
        }

        const totalPages = Number(data?.findCompletedItemsResponse?.[0]?.paginationOutput?.[0]?.totalPages?.[0] ?? 1);
        if (page >= totalPages) break;
        page += 1;
      }
    }
    // optional: update per-model watermark (latest endTime in last run)
  }

  return NextResponse.json({ ok: true });
}
```

---

# Analytics & KPIs (computed hourly after ingest)

**Windows:** 30d and 90d per model.

SQL (run via Prisma `$executeRaw` or a lightweight SQL file):

```sql
-- Trim extremes by IQR or percent trimming (simpler for MVP)
WITH base AS (
  SELECT price_usd, end_time_utc
  FROM sold_listings
  WHERE model_id = $1
    AND end_time_utc >= now() - interval '90 days'
),
trimmed AS (
  SELECT price_usd
  FROM base
  QUALIFY percent_rank() OVER (ORDER BY price_usd) BETWEEN 0.02 AND 0.98
),
w30 AS (SELECT
  avg(price_usd) AS mean,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY price_usd) AS median,
  percentile_cont(0.25) WITHIN GROUP (ORDER BY price_usd) AS p25,
  percentile_cont(0.75) WITHIN GROUP (ORDER BY price_usd) AS p75,
  count(*) AS volume
  FROM trimmed WHERE end_time_utc >= now() - interval '30 days'),
w90 AS (SELECT
  avg(price_usd) AS mean,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY price_usd) AS median,
  percentile_cont(0.25) WITHIN GROUP (ORDER BY price_usd) AS p25,
  percentile_cont(0.75) WITHIN GROUP (ORDER BY price_usd) AS p75,
  count(*) AS volume
  FROM trimmed)

INSERT INTO model_metric (model_id, window, mean, median, p25, p75, volume, mom_change, yoy_change)
SELECT $1, '30d', w30.mean, w30.median, w30.p25, w30.p75, w30.volume,
       CASE WHEN w90.median > 0 THEN 100.0 * (w30.median - w90.median) / w90.median END,
       NULL
FROM w30, w90;

INSERT INTO model_metric (model_id, window, mean, median, p25, p75, volume, mom_change, yoy_change)
SELECT $1, '90d', w90.mean, w90.median, w90.p25, w90.p75, w90.volume, NULL, NULL;
```

For **trend-change alerts (in-app)**, a simple rule:

* Compare latest 30d median vs prior 30d (days −60 to −31).
* If `abs(delta%) ≥ thresholdPct` and direction matches, create an alert event for that model; surface in a notification bell UI.

---

# Next.js routing & pages

* `/` – landing: search bar; top tracked models.
* `/[brand]` – brand hub → families & references.
* `/[brand]/[family]/[ref]` – **Model page**:

  * Hero: 30/90-day median, mean, volume, MoM delta.
  * Chart: 90-day median line + sold dots (toggle “full set only”).
  * Filters: condition (basic), full set, time window (30/90).
  * Table: latest 50 sold (image, title, condition, price, end date, link).
  * Buttons: “Compare” (stack up to 3), “Watch” (adds to WatchList).
* `/compare?refs=rolex:124060,rolex:114060` – overlay chart.
* `/watchlist` – saved models + recent trend alerts.

**SEO**: ISR per model (e.g., revalidate every 30–60 min), structured data (`Product` with `offers` = sold comps summary), meta tags by model.

---

# Cron & Ops

* **Hourly cron** → POST `/api/ingest/sold` with `x-cron-key`.
* **Backfill** on day 1: same route with `?backfill=1` to sweep 90 days.
* **Monitoring:** log counts ingested per run; alert if zero results for a popular model or if API errors >X% of calls.
* **Rate limits:** rotate models; if you ever approach limits, shard the run (brand A at :00, brand B at :20, brand C at :40).

---

# Initial model catalog (so “volume unknown” doesn’t block you)

Start with a tiny seed you control in a JSON file or table:

```ts
[
  { brand: "Rolex", family: "Submariner", ref: "124060", keywords: ["Rolex 124060 Submariner"] },
  { brand: "Omega", family: "Speedmaster", ref: "310.30.42.50.01.001", keywords: ["Omega Speedmaster 310.30.42.50.01.001"] },
  { brand: "Seiko", family: "SKX", ref: "SKX007", keywords: ["Seiko SKX007"] }
]
```

Add more over time; your UI can let you “Add model” → persists to `Model`.

---

# Milestones (fast path)

**Day 1**

* Scaffold Next.js + Prisma + Neon.
* Seed 3–5 models.
* Implement `/api/ingest/sold` + normalize + upsert.
* Backfill 90d, build model page table (no charts).

**Day 2**

* Compute 30/90d metrics; show hero KPIs + basic price chart.
* Watchlist + compare routes.
* ISR + SEO metadata.

**Day 3**

* Trend-change alerts (in-app list).
* Filters (full set, condition).
* Polish: loading states, empty states, error toasts.

---

# Small but important choices

* **Currency:** keep `currency` + `price` raw and always set `priceUsd` (even if already USD) to simplify analytics.
* **Outliers:** trim in analytics only—never delete raw; keep `raw` JSON for audits.
* **No auth (MVP):** use a `clientKey` cookie to track watchlist/alerts until you add accounts.
* **Attribution:** always link to the item URL and show “Data from eBay”.

---

If you want, I can:

* generate the **Prisma migration SQL**,
* stub the **normalize** function for Rolex/Omega refs,
* and provide a **Next.js model page** scaffold with ISR + a working chart.

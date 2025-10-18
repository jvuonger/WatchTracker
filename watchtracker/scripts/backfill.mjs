#!/usr/bin/env node
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getFindingApiBase() {
  const env = (process.env.EBAY_ENV || 'production').toLowerCase();
  return env === 'sandbox'
    ? 'https://svcs.sandbox.ebay.com/services/search/FindingService/v1'
    : 'https://svcs.ebay.com/services/search/FindingService/v1';
}

async function findCompleted({ keywords, page }) {
  const appId = process.env.EBAY_APP_ID;
  if (!appId) throw new Error('Missing EBAY_APP_ID');
  // In-process rate limiter (per App ID per process)
  globalThis.__ebayLastCallAt = globalThis.__ebayLastCallAt || 0;
  const MIN_INTERVAL_MS = Number(process.env.EBAY_MIN_INTERVAL_MS || '1200');
  const base = getFindingApiBase();
  const params = new URLSearchParams({
    'OPERATION-NAME': 'findCompletedItems',
    'SERVICE-VERSION': '1.13.0',
    'RESPONSE-DATA-FORMAT': 'JSON',
    'GLOBAL-ID': 'EBAY-US',
    'REST-PAYLOAD': 'true',
    'categoryId': '31387',
    'keywords': keywords,
    'sortOrder': 'EndTimeSoonest',
    'paginationInput.entriesPerPage': '100',
    'paginationInput.pageNumber': String(page),
    'itemFilter(0).name': 'SoldItemsOnly',
    'itemFilter(0).value': 'true',
    'SECURITY-APPNAME': appId
  });
  const url = `${base}?${params}`;
  const headers = {
    'X-EBAY-SOA-SECURITY-APPNAME': appId,
    'X-EBAY-SOA-OPERATION-NAME': 'findCompletedItems',
    'X-EBAY-SOA-GLOBAL-ID': 'EBAY-US',
    'X-EBAY-SOA-REQUEST-DATA-FORMAT': 'JSON',
    'X-EBAY-SOA-RESPONSE-DATA-FORMAT': 'JSON',
    'Accept': 'application/json'
  };
  // Throttle per call
  const now = Date.now();
  const jitter = 50 + Math.floor(Math.random() * 150);
  const waitFor = globalThis.__ebayLastCallAt + MIN_INTERVAL_MS - now;
  if (waitFor > 0) await sleep(waitFor + jitter);
  globalThis.__ebayLastCallAt = Date.now();
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${txt.slice(0, 200)}`);
  }
  const json = await res.json();
  const resp = json?.findCompletedItemsResponse?.[0];
  const ack = resp?.ack?.[0];
  if (ack && ack !== 'Success') {
    const err = resp?.errorMessage?.[0]?.error?.[0];
    const msg = err?.message?.[0] || 'Unknown eBay error';
    const code = err?.errorId?.[0];
    throw new Error(`eBay ack=${ack}${code ? ` code=${code}` : ''}: ${msg}`);
  }
  return json;
}

function normalizeEbayItem(raw, model) {
  const itemId = String(raw?.itemId?.[0] ?? '').trim();
  const title = String(raw?.title?.[0] ?? '').trim();
  const url = String(raw?.viewItemURL?.[0] ?? '').trim();
  const imageUrl = String(raw?.galleryURL?.[0] ?? '') || null;
  const sellingState = String(raw?.sellingStatus?.[0]?.sellingState?.[0] ?? 'Ended').trim();
  const currency = String(raw?.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] ?? 'USD');
  const priceStr = raw?.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ ?? '0';
  const price = parseFloat(priceStr);
  const endTimeUtc = new Date(raw?.listingInfo?.[0]?.endTime?.[0] ?? Date.now());
  return {
    itemId,
    title,
    categoryId: raw?.primaryCategory?.[0]?.categoryId?.[0] ?? null,
    brand: model.brand,
    family: model.family,
    ref: model.ref,
    condition: raw?.condition?.[0]?.conditionDisplayName?.[0] ?? null,
    sellerUsername: raw?.sellerInfo?.[0]?.sellerUserName?.[0] ?? null,
    sellerFeedback: raw?.sellerInfo?.[0]?.feedbackScore?.[0] ? Number(raw?.sellerInfo?.[0]?.feedbackScore?.[0]) : null,
    price: new Prisma.Decimal(price),
    currency,
    priceUsd: new Prisma.Decimal(currency === 'USD' ? price : price),
    shippingCost: null,
    country: raw?.location?.[0] ?? null,
    endTimeUtc,
    sellingState,
    url,
    imageUrl,
    fullSet: /box|papers|card|warranty|full\s*set/i.test(title),
    raw,
    model: { connect: { id: model.id } }
  };
}

function parseArgs() {
  const args = Object.fromEntries(process.argv.slice(2).map(s => {
    const [k, v = 'true'] = s.replace(/^--/, '').split('=');
    return [k, v];
  }));
  return {
    sinceDays: Number(args.sinceDays || 90),
    maxPages: Number(args.maxPages || 20),
    delayMs: Number(args.delayMs || 400),
    only: args.only ? String(args.only) : null // CSV brand:ref
  };
}

async function run() {
  const { sinceDays, maxPages, delayMs, only } = parseArgs();
  const cutoff = new Date(Date.now() - sinceDays * 24 * 3600 * 1000);
  const models = only
    ? (await Promise.all(
        only.split(',').map(async (pair) => {
          const [brand, ref] = pair.split(':');
          return prisma.model.findFirst({ where: { brand, ref } });
        })
      )).filter(Boolean)
    : await prisma.model.findMany();

  console.log(`Backfill start: models=${models.length}, sinceDays=${sinceDays}, maxPages=${maxPages}`);
  let total = 0;

  for (const m of models) {
    const keywordsList = (m.keywords && m.keywords.length) ? m.keywords : [`${m.brand} ${m.ref}`];
    for (const kw of keywordsList) {
      let page = 1;
      console.log(`Model ${m.brand} ${m.ref} kw="${kw}"`);
      while (page <= maxPages) {
        try {
          const data = await findCompleted({ keywords: kw, page });
          const items = data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item ?? [];
          if (!items.length) break;
          for (const it of items) {
            const rec = normalizeEbayItem(it, m);
            if (new Date(rec.endTimeUtc) < cutoff) {
              page = maxPages + 1; // stop pages
              break;
            }
            await prisma.soldListing.upsert({ where: { itemId: rec.itemId }, update: rec, create: rec });
            total++;
          }
          const totalPages = Number(
            data?.findCompletedItemsResponse?.[0]?.paginationOutput?.[0]?.totalPages?.[0] ?? 1
          );
          if (page >= totalPages) break;
          page++;
          await sleep(delayMs);
        } catch (e) {
          const msg = (e && e.message) ? e.message : String(e);
          if (/RateLimiter|10001|exceeded/i.test(msg)) {
            const wait = 30000 + Math.floor(Math.random() * 10000);
            console.warn(`Rate limited. Sleeping ${wait}ms...`);
            await sleep(wait);
            continue; // retry same page
          }
          console.warn(`Error on page ${page}: ${msg}`);
          // brief backoff for transient errors
          await sleep(2000);
        }
      }
    }
  }
  console.log(`Backfill complete. Upserted ${total} records.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});

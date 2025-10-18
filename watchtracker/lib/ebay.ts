function getFindingApiBase() {
  const env = (process.env.EBAY_ENV || 'production').toLowerCase();
  return env === 'sandbox'
    ? 'https://svcs.sandbox.ebay.com/services/search/FindingService/v1'
    : 'https://svcs.ebay.com/services/search/FindingService/v1';
}

// Simple in-process rate limiter to respect per-second caps
let lastEbayCallAt = 0;
const MIN_INTERVAL_MS = Number(process.env.EBAY_MIN_INTERVAL_MS || '1200'); // ~1 req/sec default
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function findCompleted({ keywords, page }: { keywords: string; page: number }) {
  const appId = process.env.EBAY_APP_ID;
  if (!appId) throw new Error('Missing EBAY_APP_ID');

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
    // Include App ID as a query param to ensure recognition across proxies
    'SECURITY-APPNAME': appId,
  });

  const url = `${base}?${params}`;
  const headers: Record<string, string> = {
    'X-EBAY-SOA-SECURITY-APPNAME': appId,
    'X-EBAY-SOA-OPERATION-NAME': 'findCompletedItems',
    'X-EBAY-SOA-GLOBAL-ID': 'EBAY-US',
    'X-EBAY-SOA-REQUEST-DATA-FORMAT': 'JSON',
    'X-EBAY-SOA-RESPONSE-DATA-FORMAT': 'JSON',
    'Accept': 'application/json'
  };

  // Throttle to avoid rate limiting (per App ID per sec)
  const now = Date.now();
  const jitter = 50 + Math.floor(Math.random() * 150);
  const waitFor = lastEbayCallAt + MIN_INTERVAL_MS - now;
  if (waitFor > 0) await sleep(waitFor + jitter);
  lastEbayCallAt = Date.now();

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const snippet = text ? text.slice(0, 300) : '';
    throw new Error(`eBay ${res.status}${snippet ? `: ${snippet}` : ''}`);
  }
  const json = await res.json().catch(() => null);
  // Surface eBay-level errors if present
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

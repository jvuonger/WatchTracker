const FINDING_API = "https://svcs.ebay.com/services/search/FindingService/v1";

export async function findCompleted({ keywords, page }: { keywords: string; page: number }) {
  if (!process.env.EBAY_APP_ID) throw new Error('Missing EBAY_APP_ID');
  const params = new URLSearchParams({
    "OPERATION-NAME": "findCompletedItems",
    "SERVICE-VERSION": "1.13.0",
    "SECURITY-APPNAME": process.env.EBAY_APP_ID,
    "RESPONSE-DATA-FORMAT": "JSON",
    "GLOBAL-ID": "EBAY-US",
    "categoryId": "31387",
    "keywords": keywords,
    "sortOrder": "EndTimeSoonest",
    "paginationInput.entriesPerPage": "100",
    "paginationInput.pageNumber": String(page)
  });
  const res = await fetch(`${FINDING_API}?${params}`);
  if (!res.ok) throw new Error(`eBay ${res.status}`);
  return res.json();
}


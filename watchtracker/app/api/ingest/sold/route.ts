import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { findCompleted } from '@/lib/ebay';
import { normalizeEbayItem } from '@/lib/normalize';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const cronKey = req.headers.get('x-cron-key');
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  const hasCronKey = !!process.env.CRON_KEY && cronKey === process.env.CRON_KEY;
  if (!isVercelCron && !hasCronKey) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const backfill = req.nextUrl.searchParams.get('backfill') === '1';
  const cutoff = backfill ? new Date(Date.now() - 90 * 24 * 3600 * 1000) : new Date(Date.now() - 6 * 3600 * 1000);

  const models = await prisma.model.findMany();
  let ingested = 0;
  for (const m of models) {
    const keywordsList = (m.keywords && m.keywords.length) ? m.keywords : [`${m.brand} ${m.ref}`];
    for (const kw of keywordsList) {
      let page = 1;
      for (;;) {
        const data = await findCompleted({ keywords: kw, page });
        const items = data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item ?? [];
        if (!items.length) break;
        for (const it of items) {
          const rec = normalizeEbayItem(it, m);
          if (new Date(rec.endTimeUtc) < cutoff) {
            page = 99999; // force exit pages loop for this keyword
            break;
          }
          await prisma.soldListing.upsert({
            where: { itemId: rec.itemId },
            update: rec,
            create: rec,
          });
          ingested += 1;
        }
        const totalPages = Number(data?.findCompletedItemsResponse?.[0]?.paginationOutput?.[0]?.totalPages?.[0] ?? 1);
        if (page >= totalPages) break;
        page += 1;
      }
    }
  }
  return NextResponse.json({ ok: true, ingested });
}

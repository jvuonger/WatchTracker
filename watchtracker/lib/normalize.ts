import { Prisma } from '@prisma/client';

export function normalizeEbayItem(raw: any, model: { id: string; brand: string; family: string | null; ref: string }) {
  const itemId = String(raw?.itemId?.[0] ?? '').trim();
  const title = String(raw?.title?.[0] ?? '').trim();
  const url = String(raw?.viewItemURL?.[0] ?? '').trim();
  const imageUrl = String(raw?.galleryURL?.[0] ?? '') || null;
  const sellingState = String(raw?.sellingStatus?.[0]?.sellingState?.[0] ?? 'Ended').trim();
  const currency = String(raw?.sellingStatus?.[0]?.currentPrice?.[0]?.["@currencyId"] ?? 'USD');
  const priceStr = raw?.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ ?? '0';
  const price = parseFloat(priceStr);
  const endTimeUtc = new Date(raw?.listingInfo?.[0]?.endTime?.[0] ?? Date.now());

  const record: Prisma.SoldListingCreateInput = {
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
    priceUsd: new Prisma.Decimal(currency === 'USD' ? price : price), // TODO: FX conversion
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
  return record as any;
}

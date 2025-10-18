import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function getInboundToken(req: NextRequest, body: any): string | null {
  // Try common places; eBay docs place the token with the request, but naming can vary
  const h1 = req.headers.get('x-verification-token');
  const h2 = req.headers.get('x-ebay-verification-token');
  const qp = req.nextUrl.searchParams.get('verificationToken') || req.nextUrl.searchParams.get('token');
  const b1 = typeof body?.verificationToken === 'string' ? body.verificationToken : null;
  const b2 = typeof body?.metadata?.verificationToken === 'string' ? body.metadata.verificationToken : null;
  return h1 || h2 || qp || b1 || b2 || null;
}

export async function POST(req: NextRequest) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const inboundToken = getInboundToken(req, body);
  const expected = process.env.EBAY_MAD_TOKEN || '';
  const tokenValid = !!expected && inboundToken === expected;

  // Extract best-guess identifiers (fields may vary by provider/version)
  const userId = (body?.userId ?? body?.accountId ?? body?.metadata?.userId ?? null) as string | null;
  const username = (body?.username ?? body?.userName ?? body?.metadata?.username ?? null) as string | null;

  await prisma.accountDeletionEvent.create({
    data: {
      provider: 'ebay',
      tokenValid,
      userId: userId ?? null,
      username: username ?? null,
      payload: body ?? {},
    },
  });

  // Always return 200 to acknowledge; you can add extra checks if eBay requires otherwise
  return NextResponse.json({ ok: true, tokenValid });
}


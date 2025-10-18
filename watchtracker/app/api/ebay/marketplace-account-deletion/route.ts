import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  // Best-effort persistence; do not fail the webhook if DB is unavailable
  try {
    await prisma.accountDeletionEvent.create({
      data: {
        provider: 'ebay',
        tokenValid,
        userId: userId ?? null,
        username: username ?? null,
        payload: body ?? {},
      },
    });
  } catch (e) {
    // swallow errors to ensure 200 response for provider validation
  }

  // Always return 200 to acknowledge; you can add extra checks if eBay requires otherwise
  return NextResponse.json({ ok: true, tokenValid });
}

// Some providers validate via GET. Respond 200 quickly with a simple body.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const challengeCode = url.searchParams.get('challenge_code');
  const token = process.env.EBAY_MAD_TOKEN || '';
  const endpoint = process.env.EBAY_MAD_ENDPOINT || '';

  if (challengeCode && token && endpoint) {
    // Per eBay docs: hash(challengeCode + verificationToken + endpoint) using SHA-256
    const data = challengeCode + token + endpoint;
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    return NextResponse.json({ challengeResponse: hex });
  }

  // Fallback simple OK response for health checks
  return new NextResponse('ok', { status: 200, headers: { 'content-type': 'text/plain' } });
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Allow': 'GET,POST,HEAD,OPTIONS',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,HEAD,OPTIONS',
      'Access-Control-Allow-Headers': '*'
    }
  });
}

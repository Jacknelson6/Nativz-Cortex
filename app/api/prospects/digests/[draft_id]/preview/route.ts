// SPY-10 T17: HTML preview for the approval-modal iframe.

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';

export const dynamic = 'force-dynamic';

interface RouteCtx {
  params: Promise<{ draft_id: string }>;
}

export async function GET(_req: Request, { params }: RouteCtx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { draft_id } = await params;

  const { data, error } = await auth.admin
    .from('prospect_digest_drafts')
    .select('html')
    .eq('id', draft_id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return new NextResponse(data.html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

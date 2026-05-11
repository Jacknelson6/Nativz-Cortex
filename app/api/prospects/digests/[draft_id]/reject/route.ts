// SPY-10 T16: reject a drafted digest.

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';

export const dynamic = 'force-dynamic';

interface RouteCtx {
  params: Promise<{ draft_id: string }>;
}

export async function POST(_req: Request, { params }: RouteCtx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { draft_id } = await params;

  const { data, error } = await auth.admin
    .from('prospect_digest_drafts')
    .update({ status: 'rejected' })
    .eq('id', draft_id)
    .eq('status', 'drafted')
    .select('id')
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: 'Draft is not in drafted state.' },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}

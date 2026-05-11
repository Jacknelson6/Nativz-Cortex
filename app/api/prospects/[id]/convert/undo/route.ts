// SPY-07 T07: POST /api/prospects/[id]/convert/undo — 1-hour grace period
// to back out of a conversion. Deletes the new client (cascades into
// invite_tokens + user_client_access) and restores the prospect.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { undoConversion, ConvertProspectError } from '@/lib/prospects/convert';

export const maxDuration = 30;

async function handlePost(prospectId: string) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    await undoConversion(prospectId, auth.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ConvertProspectError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('POST /api/prospects/[id]/convert/undo error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handlePost(id);
}

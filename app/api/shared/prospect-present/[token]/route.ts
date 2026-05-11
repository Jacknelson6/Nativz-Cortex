// SPY-09 T09: GET /api/shared/prospect-present/[token]
//
// Public, no auth. Returns the locked PresentationSnapshot stored on
// the share-link row. 404 if archived; 410 if expired (per PRD edge
// cases — gives the prospect-side UI a distinct state).

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PresentationSnapshot } from '@/lib/prospects/types';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const admin = createAdminClient();

    const { data: link } = await admin
      .from('prospect_share_links')
      .select(
        'id, token, kind, expires_at, archived_at, created_at, metadata, prospect_id',
      )
      .eq('token', token)
      .eq('kind', 'presentation')
      .maybeSingle();

    if (!link || link.archived_at) {
      return NextResponse.json({ error: 'Presentation not found' }, { status: 404 });
    }
    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'This link has expired' }, { status: 410 });
    }

    const metadata = (link.metadata ?? {}) as { presentation_snapshot?: PresentationSnapshot };
    const snapshot = metadata.presentation_snapshot ?? null;
    if (!snapshot) {
      return NextResponse.json({ error: 'Presentation payload missing' }, { status: 410 });
    }

    return NextResponse.json({
      token: link.token,
      created_at: link.created_at,
      expires_at: link.expires_at,
      snapshot,
    });
  } catch (err) {
    console.error('GET /api/shared/prospect-present/[token] error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

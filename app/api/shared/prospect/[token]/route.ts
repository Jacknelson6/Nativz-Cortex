// SPY-04 T17: public GET endpoint for a prospect scorecard share link.
// No auth. 404 if archived, expired, or missing. Returns the JSON
// snapshot + signed PDF URL + minimal prospect identity. The actual page
// at /shared/prospect/[token] reads this.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSignedPdfUrl } from '@/lib/prospects/scorecard-storage';

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
        'id, token, name, pdf_storage_path, scorecard_snapshot, expires_at, archived_at, created_at, prospect_id, analysis_id',
      )
      .eq('token', token)
      .maybeSingle();

    if (!link || link.archived_at) {
      return NextResponse.json({ error: 'Share link not found' }, { status: 404 });
    }
    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Share link expired' }, { status: 404 });
    }

    const [{ data: prospect }, { data: analysis }] = await Promise.all([
      admin
        .from('prospects')
        .select('id, brand_name, primary_platform, primary_handle')
        .eq('id', link.prospect_id)
        .maybeSingle(),
      admin
        .from('prospect_analyses')
        .select('id, platform, handle')
        .eq('id', link.analysis_id)
        .maybeSingle(),
    ]);

    const signedPdfUrl = link.pdf_storage_path
      ? await getSignedPdfUrl(link.pdf_storage_path)
      : null;

    return NextResponse.json({
      token: link.token,
      name: link.name,
      created_at: link.created_at,
      expires_at: link.expires_at,
      scorecard_snapshot: link.scorecard_snapshot,
      signed_pdf_url: signedPdfUrl,
      prospect: prospect
        ? {
            brand_name: prospect.brand_name,
            platform: analysis?.platform ?? prospect.primary_platform,
            handle: analysis?.handle ?? prospect.primary_handle,
          }
        : null,
      lead_email: process.env.PROSPECT_SCORECARD_LEAD_EMAIL ?? 'hello@nativz.io',
    });
  } catch (err) {
    console.error('GET /api/shared/prospect/[token] error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

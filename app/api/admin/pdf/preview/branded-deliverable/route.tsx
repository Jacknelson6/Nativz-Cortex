/**
 * GET /api/admin/pdf/preview/branded-deliverable
 *
 * Admin-only preview of the branded deliverable template. Renders a fixed
 * fixture (truck-parking-style) so the layout and brand tokens can be
 * reviewed for either agency without running a real /generate skill.
 *
 * Query params:
 *   ?theme=nativz | anderson    — override agency detection
 *   ?download=1                 — force attachment (default inline)
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTheme, type AgencySlug } from '@/lib/branding';
import { detectAgencyFromHostname } from '@/lib/agency/detect';
import { BrandedDeliverableDocument } from "@/lib/pdf/branded";
import { BRANDED_PREVIEW_FIXTURE } from "@/lib/pdf/branded/_preview-fixture";


export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin' && !me?.is_super_admin) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const url = new URL(req.url);
  const themeOverride = url.searchParams.get('theme');
  const download = url.searchParams.get('download') === '1';

  const hostHeader =
    req.headers.get('x-forwarded-host') ??
    req.headers.get('host') ??
    url.hostname;
  const resolvedSlug: AgencySlug =
    themeOverride === 'nativz' || themeOverride === 'anderson'
      ? themeOverride
      : detectAgencyFromHostname(hostHeader);
  const theme = getTheme(resolvedSlug);

  const buffer = await renderToBuffer(
    <BrandedDeliverableDocument data={BRANDED_PREVIEW_FIXTURE} theme={theme} />,
  );

  const disposition = download ? 'attachment' : 'inline';
  const filename = `branded-deliverable-preview-${resolvedSlug}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

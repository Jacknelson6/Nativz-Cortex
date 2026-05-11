// SPY-09 T22b: public, token-gated presentation. Loads snapshot from
// prospect_share_links.metadata.presentation_snapshot. Tracks a view
// row using SPY-04's prospect_share_link_views table (kind='presentation'
// rows are filtered in the GET so analytics stay separate).

import { headers } from 'next/headers';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { PresentModeShell } from '@/components/prospects/present-mode-shell';
import type { PresentationSnapshot } from '@/lib/prospects/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ token: string }>;
}

function hashIp(ip: string | null): string {
  const salt = process.env.PROSPECT_LEAD_IP_SALT ?? 'cortex-prospect-lead';
  return crypto.createHash('sha256').update(`${salt}:${ip ?? 'unknown'}`).digest('hex').slice(0, 32);
}

export default async function PublicPresentPage({ params }: PageProps) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: link } = await admin
    .from('prospect_share_links')
    .select('id, kind, archived_at, expires_at, metadata')
    .eq('token', token)
    .eq('kind', 'presentation')
    .maybeSingle();

  if (!link || link.archived_at) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center text-zinc-300">
        This presentation is no longer available.
      </div>
    );
  }
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center text-zinc-300">
        This link has expired. Reach out to your contact at Nativz for a fresh copy.
      </div>
    );
  }

  const metadata = (link.metadata ?? {}) as { presentation_snapshot?: PresentationSnapshot };
  const snapshot = metadata.presentation_snapshot ?? null;
  if (!snapshot) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center text-zinc-300">
        Presentation data is missing. Reach out to your contact at Nativz.
      </div>
    );
  }

  // Best-effort view-tracking: don't fail the render if it errors.
  try {
    const h = await headers();
    const fwd = h.get('x-forwarded-for');
    const ip = fwd ? (fwd.split(',')[0]?.trim() ?? null) : h.get('x-real-ip');
    await admin.from('prospect_share_link_views').insert({
      share_link_id: link.id,
      viewer_ip_hash: hashIp(ip),
      viewer_ua: h.get('user-agent'),
      referrer: h.get('referer'),
    });
  } catch (err) {
    console.error('[present] view-tracking failed (non-blocking):', err);
  }

  return <PresentModeShell snapshot={snapshot} variant="public" token={token} />;
}

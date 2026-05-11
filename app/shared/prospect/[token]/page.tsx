// SPY-04 T24: public scorecard page. Server-renders from the share-link
// row, no admin chrome. The /api/shared/prospect/[token] endpoint already
// handles 404 for archived/expired tokens — we duplicate that check here
// so the page itself short-circuits if hit directly.

import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSignedPdfUrl } from '@/lib/prospects/scorecard-storage';
import { ProspectScorecardPublic } from '@/components/shared/prospect-scorecard-public';
import { TrackView } from './track-view';
import type { ScorecardSnapshot } from '@/lib/prospects/checklist';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function Page({ params }: PageProps) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: link } = await admin
    .from('prospect_share_links')
    .select(
      'id, token, pdf_storage_path, scorecard_snapshot, expires_at, archived_at, prospect_id, analysis_id',
    )
    .eq('token', token)
    .maybeSingle();

  if (!link || link.archived_at) notFound();
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) notFound();

  const [{ data: prospect }, { data: analysis }] = await Promise.all([
    admin
      .from('prospects')
      .select('brand_name, primary_platform, primary_handle')
      .eq('id', link.prospect_id)
      .maybeSingle(),
    admin
      .from('prospect_analyses')
      .select('platform, handle')
      .eq('id', link.analysis_id)
      .maybeSingle(),
  ]);

  const signedPdfUrl = link.pdf_storage_path
    ? await getSignedPdfUrl(link.pdf_storage_path)
    : null;

  return (
    <>
      <TrackView token={token} />
      <ProspectScorecardPublic
        brandName={prospect?.brand_name ?? 'Prospect'}
        handle={analysis?.handle ?? prospect?.primary_handle ?? null}
        platform={analysis?.platform ?? prospect?.primary_platform ?? null}
        snapshot={link.scorecard_snapshot as ScorecardSnapshot}
        signedPdfUrl={signedPdfUrl}
        leadEmail={process.env.PROSPECT_SCORECARD_LEAD_EMAIL ?? 'hello@nativz.io'}
      />
    </>
  );
}

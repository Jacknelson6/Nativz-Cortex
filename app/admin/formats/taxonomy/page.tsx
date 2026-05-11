// VFF-06 T11: server entry for /admin/formats/taxonomy.
// Streams the 4 columns + pending proposals server-side; client island
// handles the tab switch and approve/reject/merge mutations.

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import type { TaxonomyRow, TaxonomyProposal } from '@/lib/analytics/types';
import { TaxonomyClient } from './taxonomy-client';

export const dynamic = 'force-dynamic';

export default async function FormatTaxonomyPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const role = (me as { role?: string } | null)?.role;
  const isSuper = (me as { is_super_admin?: boolean } | null)?.is_super_admin === true
    || role === 'super_admin';
  if (role !== 'admin' && role !== 'super_admin' && !isSuper) {
    redirect('/admin/dashboard');
  }

  const [formatsResp, countsResp, proposalsResp, evidenceResp] = await Promise.all([
    admin
      .from('viral_formats')
      .select(
        'id, kind, slug, display_name, description, aliases, is_seeded, archived_at, example_video_id',
      )
      .order('kind', { ascending: true })
      .order('display_name', { ascending: true }),
    admin.from('viral_video_formats').select('format_id'),
    admin
      .from('format_taxonomy_proposals')
      .select(
        'id, kind, slug, display_name, proposed_description, evidence_video_id, proposal_count, status, merged_into_format_id, reviewed_by, reviewed_at, created_at, updated_at',
      )
      .eq('status', 'pending')
      .order('proposal_count', { ascending: false })
      .order('created_at', { ascending: false }),
    admin
      .from('viral_videos')
      .select('id, thumbnail_storage_url, thumbnail_source_url')
      .limit(0),
  ]);

  const lookup = new Map<string, number>();
  for (const row of (countsResp.data ?? []) as { format_id: string }[]) {
    lookup.set(row.format_id, (lookup.get(row.format_id) ?? 0) + 1);
  }
  const formats: TaxonomyRow[] = ((formatsResp.data ?? []) as Array<
    Omit<TaxonomyRow, 'video_count'>
  >).map((f) => ({ ...f, video_count: lookup.get(f.id) ?? 0 }));

  const proposals: TaxonomyProposal[] = (proposalsResp.data ?? []) as TaxonomyProposal[];

  // Lookup evidence thumbnails for the small subset that has them.
  const evidenceIds = Array.from(
    new Set(proposals.map((p) => p.evidence_video_id).filter((id): id is string => !!id)),
  );
  let evidenceMap: Record<string, string | null> = {};
  if (evidenceIds.length > 0) {
    const { data: vids } = await admin
      .from('viral_videos')
      .select('id, thumbnail_storage_url, thumbnail_source_url')
      .in('id', evidenceIds);
    evidenceMap = Object.fromEntries(
      ((vids ?? []) as Array<{
        id: string;
        thumbnail_storage_url: string | null;
        thumbnail_source_url: string | null;
      }>).map((v) => [v.id, v.thumbnail_storage_url ?? v.thumbnail_source_url ?? null]),
    );
  }
  // Silence unused-var on the placeholder query above.
  void evidenceResp;

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">Format taxonomy</h1>
        <p className="text-sm text-white/60">
          The 4 dimensions that drive Viral Format Finder. Edit slugs, archive
          dead ones, and review LLM-proposed additions.
        </p>
      </header>
      <TaxonomyClient
        formats={formats}
        proposals={proposals}
        evidenceMap={evidenceMap}
        isSuper={isSuper}
      />
    </div>
  );
}

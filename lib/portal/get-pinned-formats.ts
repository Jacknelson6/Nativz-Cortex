// VFF-10 T11: server-side helper that loads pinned format videos for
// every client inside a portal viewer's organization. The /portal/research/formats
// page renders a thin grid of these — no Use/Pin/Dismiss CTAs, viewer
// can only browse what their team curated.
//
// Pinned in this context means the strategist added the video to the
// client's "Pinned" viral_collections row. That's the same collection
// the admin formats feed reads via VFF-09 — keeping a single source of
// truth so admin and portal never disagree about what's pinned.

import { createAdminClient } from '@/lib/supabase/admin';

export interface PortalPinnedFormat {
  video_id: string;
  platform: string;
  source_url: string;
  thumbnail_url: string | null;
  title: string | null;
  creator_handle: string | null;
  engagement_hook_descriptor: string | null;
  views_count: number | null;
  // Format dimensions tagged on the video. Empty when the video hasn't
  // been classified yet (still useful to surface — the strategist pinned
  // it as a reference, not because of taxonomy).
  formats: Array<{
    slug: string;
    display_name: string;
    kind: 'hook_type' | 'structure' | 'archetype' | 'pacing';
  }>;
  // Which client inside the org pinned it. Helpful when a portal user
  // has access to multiple brands and wants to filter.
  client_id: string;
  client_name: string;
  pinned_at: string;
}

/**
 * Pulls every video pinned across every client in the given organization.
 * Org-scoped at every join: caller must already have authenticated the
 * viewer and resolved `organization_id`.
 */
export async function getPinnedFormats(
  organizationId: string,
): Promise<PortalPinnedFormat[]> {
  const admin = createAdminClient();

  // 1. Clients in this org.
  const { data: clients, error: clientsErr } = await admin
    .from('clients')
    .select('id, name')
    .eq('organization_id', organizationId);
  if (clientsErr || !clients || clients.length === 0) return [];

  const clientMap = new Map<string, string>();
  for (const c of clients as Array<{ id: string; name: string }>) {
    clientMap.set(c.id, c.name);
  }
  const clientIds = Array.from(clientMap.keys());

  // 2. "Pinned" collections for those clients.
  const { data: pinCollections } = await admin
    .from('viral_collections')
    .select('id, client_id')
    .in('client_id', clientIds)
    .eq('name', 'Pinned');
  const collections = (pinCollections ?? []) as Array<{ id: string; client_id: string }>;
  if (collections.length === 0) return [];

  const collectionToClient = new Map<string, string>();
  for (const row of collections) collectionToClient.set(row.id, row.client_id);
  const collectionIds = Array.from(collectionToClient.keys());

  // 3. Pinned video rows.
  const { data: pins } = await admin
    .from('viral_collection_videos')
    .select('collection_id, video_id, created_at')
    .in('collection_id', collectionIds)
    .order('created_at', { ascending: false });
  const pinRows = (pins ?? []) as Array<{
    collection_id: string;
    video_id: string;
    created_at: string;
  }>;
  if (pinRows.length === 0) return [];

  const videoIds = Array.from(new Set(pinRows.map((p) => p.video_id)));

  // 4. Video metadata.
  const { data: videos } = await admin
    .from('viral_videos')
    .select(
      'id, platform, source_url, thumbnail_url, title, creator_handle, engagement_hook_descriptor, views_count, analysis_status',
    )
    .in('id', videoIds);
  const videoMap = new Map<
    string,
    {
      id: string;
      platform: string;
      source_url: string;
      thumbnail_url: string | null;
      title: string | null;
      creator_handle: string | null;
      engagement_hook_descriptor: string | null;
      views_count: number | null;
      analysis_status: string;
    }
  >();
  for (const v of (videos ?? []) as Array<typeof videoMap extends Map<string, infer T> ? T : never>) {
    videoMap.set(v.id, v);
  }

  // 5. Format dimensions per video.
  const { data: vff } = await admin
    .from('viral_video_formats')
    .select('video_id, viral_formats!inner(slug, display_name, kind, archived_at)')
    .in('video_id', videoIds);
  const formatsByVideo = new Map<string, PortalPinnedFormat['formats']>();
  for (const row of (vff ?? []) as Array<{
    video_id: string;
    viral_formats:
      | {
          slug: string;
          display_name: string;
          kind: 'hook_type' | 'structure' | 'archetype' | 'pacing';
          archived_at: string | null;
        }
      | Array<{
          slug: string;
          display_name: string;
          kind: 'hook_type' | 'structure' | 'archetype' | 'pacing';
          archived_at: string | null;
        }>;
  }>) {
    const fmt = Array.isArray(row.viral_formats) ? row.viral_formats[0] : row.viral_formats;
    if (!fmt || fmt.archived_at) continue;
    const list = formatsByVideo.get(row.video_id) ?? [];
    list.push({ slug: fmt.slug, display_name: fmt.display_name, kind: fmt.kind });
    formatsByVideo.set(row.video_id, list);
  }

  // 6. Compose. Preserve the pin order (newest first) from step 3.
  const out: PortalPinnedFormat[] = [];
  const seen = new Set<string>();
  for (const pin of pinRows) {
    if (seen.has(pin.video_id)) continue;
    seen.add(pin.video_id);
    const video = videoMap.get(pin.video_id);
    if (!video) continue;
    const clientId = collectionToClient.get(pin.collection_id);
    if (!clientId) continue;
    const clientName = clientMap.get(clientId);
    if (!clientName) continue;
    out.push({
      video_id: video.id,
      platform: video.platform,
      source_url: video.source_url,
      thumbnail_url: video.thumbnail_url,
      title: video.title,
      creator_handle: video.creator_handle,
      engagement_hook_descriptor: video.engagement_hook_descriptor,
      views_count: video.views_count,
      formats: formatsByVideo.get(video.id) ?? [],
      client_id: clientId,
      client_name: clientName,
      pinned_at: pin.created_at,
    });
  }
  return out;
}

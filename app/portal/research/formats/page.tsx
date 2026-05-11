// VFF-10: portal-side pinned-formats library.
// Viewer-only, org-scoped via getPortalClient(). Shows every video the
// strategist team has pinned for any client in the viewer's organization.
// No save / pin / dismiss / use-this-format CTAs — those live on /admin/formats.

import { redirect } from 'next/navigation';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { getPinnedFormats } from '@/lib/portal/get-pinned-formats';
import { FormatCardPortal, type PortalFormatCardVideo } from '@/components/formats/format-card-portal';
import type { Platform } from '@/lib/branding/platform-tokens';

export const dynamic = 'force-dynamic';

export default async function PortalFormatsPage() {
  const portal = await getPortalClient();
  if (!portal) redirect('/login');

  const pinned = await getPinnedFormats(portal.organizationId);

  return (
    <div className="max-w-6xl mx-auto space-y-6 px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold text-white">Formats</h1>
        <p className="mt-1 text-sm text-white/60">
          Pinned references your team has curated. Click any card to see the breakdown.
        </p>
      </header>

      {pinned.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-surface p-8 text-center">
          <div className="text-sm font-medium">No pinned formats yet</div>
          <div className="mt-1 text-xs text-white/50">
            Your team will pin examples here as they curate the library.
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {pinned.map((p) => {
            const card: PortalFormatCardVideo = {
              id: p.video_id,
              platform: p.platform as Platform,
              thumbnail_url: p.thumbnail_url,
              title: p.title,
              engagement_hook_descriptor: p.engagement_hook_descriptor,
              creator_handle: p.creator_handle,
              views_count: p.views_count,
              formats: p.formats.map((f) => ({ slug: f.slug, display_name: f.display_name })),
              client_name: p.client_name,
            };
            return <FormatCardPortal key={p.video_id} video={card} />;
          })}
        </div>
      )}
    </div>
  );
}

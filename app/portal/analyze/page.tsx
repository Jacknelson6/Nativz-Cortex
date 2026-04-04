import { Microscope, Lock, Layers, Clock, FolderOpen } from 'lucide-react';
import Link from 'next/link';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/empty-state';
import { PageError } from '@/components/shared/page-error';
import { formatRelativeTime } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export default async function PortalAnalyzePage() {
  try {
    const result = await getPortalClient();
    if (!result) return null;

    const { client } = result;

    if ((client.feature_flags as unknown as Record<string, boolean>).can_view_analyze === false) {
      return (
        <div className="cortex-page-gutter">
          <EmptyState
            icon={<Lock size={24} />}
            title="Analyze not enabled"
            description="Contact your team to enable content analysis."
          />
        </div>
      );
    }

    const adminClient = createAdminClient();

    // Fetch boards for this client
    const { data: boards } = await adminClient
      .from('moodboard_boards')
      .select('id, name, description, created_at, updated_at')
      .eq('client_id', client.id)
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
      .limit(50);

    const allBoards = boards ?? [];

    // Get item counts for boards
    let itemCounts: Record<string, number> = {};
    if (allBoards.length > 0) {
      const boardIds = allBoards.map((b) => b.id);
      const { data: items } = await adminClient
        .from('moodboard_items')
        .select('board_id')
        .in('board_id', boardIds);

      if (items) {
        itemCounts = items.reduce(
          (acc, item) => {
            acc[item.board_id] = (acc[item.board_id] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );
      }
    }

    // Get first thumbnail per board
    const boardThumbnails: Record<string, string> = {};
    if (allBoards.length > 0) {
      const boardIds = allBoards.map((b) => b.id);
      const { data: thumbItems } = await adminClient
        .from('moodboard_items')
        .select('board_id, thumbnail_url')
        .in('board_id', boardIds)
        .not('thumbnail_url', 'is', null)
        .limit(50);

      if (thumbItems) {
        for (const item of thumbItems) {
          if (!boardThumbnails[item.board_id] && item.thumbnail_url) {
            boardThumbnails[item.board_id] = item.thumbnail_url;
          }
        }
      }
    }

    return (
      <div className="cortex-page-gutter max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="ui-page-title flex items-center gap-2.5">
            <Microscope size={20} className="text-accent-text" />
            Analyze
          </h1>
          <p className="text-sm text-text-muted mt-1">{client.name}</p>
          <p className="mt-1 text-sm text-text-muted">
            Content analysis boards shared with your brand.
          </p>
        </div>

        {allBoards.length === 0 ? (
          <EmptyState
            icon={<Layers size={24} />}
            title="No analysis boards yet"
            description="Content analysis boards will appear here when they're ready."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {allBoards.map((board) => (
              <Link key={board.id} href={`/portal/analyze/${board.id}`}>
                <Card interactive padding="none" className="overflow-hidden">
                  {/* Thumbnail */}
                  <div className="h-32 relative overflow-hidden">
                    {boardThumbnails[board.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={boardThumbnails[board.id]}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="h-full bg-gradient-to-br from-surface-hover via-accent/5 to-surface-hover flex items-center justify-center">
                        <Layers size={28} className="text-text-muted/20" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface to-transparent" />
                    <div className="absolute top-2.5 right-2.5 rounded-full bg-black/60 backdrop-blur-sm px-2 py-0.5 text-[10px] font-bold text-white shadow-md flex items-center gap-1">
                      <FolderOpen size={10} />
                      {itemCounts[board.id] ?? 0}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="px-4 py-3 space-y-1">
                    <h3 className="text-sm font-semibold text-text-primary truncate">
                      {board.name}
                    </h3>
                    {board.description && (
                      <p className="text-xs text-text-muted line-clamp-1">{board.description}</p>
                    )}
                    <div className="flex items-center gap-1 text-xs text-text-muted">
                      <Clock size={10} />
                      {formatRelativeTime(board.updated_at)}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  } catch (error) {
    console.error('PortalAnalyzePage error:', error);
    return <PageError />;
  }
}

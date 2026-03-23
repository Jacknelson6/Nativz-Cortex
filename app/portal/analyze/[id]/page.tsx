import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Layers, Video, Image as ImageIcon, Globe } from 'lucide-react';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { PageError } from '@/components/shared/page-error';
import { PortalAnalyzeItemGrid } from './item-grid';

export const dynamic = 'force-dynamic';

export default async function PortalAnalyzeBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    const { id: boardId } = await params;
    const result = await getPortalClient();
    if (!result) return null;

    const { client } = result;
    const adminClient = createAdminClient();

    // Fetch board
    const { data: board } = await adminClient
      .from('moodboard_boards')
      .select('id, name, description, client_id, created_at, updated_at')
      .eq('id', boardId)
      .single();

    if (!board || board.client_id !== client.id) {
      notFound();
    }

    // Fetch items
    const { data: items } = await adminClient
      .from('moodboard_items')
      .select('id, type, url, title, thumbnail_url, platform, author_name, transcript, concept_summary, hook, winning_elements, content_themes, status')
      .eq('board_id', boardId)
      .order('created_at', { ascending: true });

    return (
      <div className="cortex-page-gutter max-w-5xl mx-auto">
        <div className="mb-6">
          <Link
            href="/portal/analyze"
            className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-secondary transition-colors mb-4"
          >
            <ArrowLeft size={14} />
            Back to boards
          </Link>
          <h1 className="ui-page-title">{board.name}</h1>
          {board.description && (
            <p className="mt-1 text-sm text-text-muted">{board.description}</p>
          )}
        </div>

        {(!items || items.length === 0) ? (
          <EmptyState
            icon={<Layers size={24} />}
            title="No items on this board"
            description="Your team hasn't added any content to analyze yet."
          />
        ) : (
          <PortalAnalyzeItemGrid items={(items ?? []).map((item) => ({
            id: item.id,
            type: item.type as 'video' | 'image' | 'website',
            url: item.url,
            title: item.title ?? null,
            thumbnail_url: item.thumbnail_url ?? null,
            platform: item.platform ?? null,
            author_name: item.author_name ?? null,
            transcript: item.transcript ?? null,
            concept_summary: item.concept_summary ?? null,
            hook: item.hook ?? null,
            winning_elements: (item.winning_elements ?? []) as string[],
            content_themes: (item.content_themes ?? []) as string[],
            status: item.status as string,
          }))} />
        )}
      </div>
    );
  } catch (error) {
    console.error('PortalAnalyzeBoardPage error:', error);
    return <PageError />;
  }
}

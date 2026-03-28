import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { StrategyLabWorkspace } from '@/components/strategy-lab/strategy-lab-workspace';

export default async function StrategyLabClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/admin/login');
  }

  const admin = createAdminClient();

  const { data: client, error: clientErr } = await admin
    .from('clients')
    .select('id, name, slug, brand_dna_status')
    .eq('id', clientId)
    .maybeSingle();

  if (clientErr || !client) {
    notFound();
  }

  const [{ data: topicRows }, { data: pillarRows }, { data: boardRows }] = await Promise.all([
    admin
      .from('topic_searches')
      .select('id, query, status, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(200),
    admin
      .from('content_pillars')
      .select('*')
      .eq('client_id', clientId)
      .order('sort_order', { ascending: true }),
    admin
      .from('moodboard_boards')
      .select('id, name, archived_at, updated_at')
      .eq('client_id', clientId)
      .order('updated_at', { ascending: false })
      .limit(50),
  ]);

  const topicSearches = topicRows ?? [];
  const pillars = pillarRows ?? [];
  const boards = (boardRows ?? []).filter((b) => !b.archived_at);

  return (
    <div className="cortex-page-gutter pb-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 pt-2 sm:pt-4">
          <Link
            href="/admin/strategy-lab"
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition hover:text-accent-text"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
            Strategy lab
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary md:text-2xl">{client.name}</h1>
          <p className="mt-1 text-sm text-text-muted">{client.slug}</p>
        </div>

        <StrategyLabWorkspace
        clientId={client.id}
        clientSlug={client.slug}
        brandDnaStatus={client.brand_dna_status ?? 'none'}
        topicSearches={topicSearches}
        pillars={pillars}
        moodBoards={boards}
      />
      </div>
    </div>
  );
}

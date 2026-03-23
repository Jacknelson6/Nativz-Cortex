import { Brain, Lock } from 'lucide-react';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { createAdminClient } from '@/lib/supabase/admin';
import { EmptyState } from '@/components/shared/empty-state';
import { PageError } from '@/components/shared/page-error';
import { KnowledgeClient } from './knowledge-client';

export const dynamic = 'force-dynamic';

export default async function PortalKnowledgePage() {
  try {
    const result = await getPortalClient();
    if (!result) return null;

    const { client } = result;

    if ((client.feature_flags as unknown as Record<string, boolean>).can_view_knowledge === false) {
      return (
        <div className="cortex-page-gutter">
          <EmptyState
            icon={<Lock size={24} />}
            title="Knowledge base not enabled"
            description="Contact your Nativz team to enable the knowledge base."
          />
        </div>
      );
    }

    const adminClient = createAdminClient();
    const { data: entries } = await adminClient
      .from('client_knowledge_entries')
      .select('id, type, title, content, source, created_at')
      .eq('client_id', client.id)
      .eq('client_visible', true)
      .order('created_at', { ascending: false })
      .limit(200);

    return (
      <div className="cortex-page-gutter max-w-3xl mx-auto">
        <KnowledgeClient clientId={client.id} entries={entries ?? []} />
      </div>
    );
  } catch (error) {
    console.error('PortalKnowledgePage error:', error);
    return <PageError />;
  }
}

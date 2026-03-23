import { Lock } from 'lucide-react';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { createAdminClient } from '@/lib/supabase/admin';
import { EmptyState } from '@/components/shared/empty-state';
import { PageError } from '@/components/shared/page-error';
import { PortalIdeasTabs } from './ideas-tabs';
import type { IdeaSubmission } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

export default async function PortalIdeasPage() {
  try {
    const result = await getPortalClient();
    if (!result) return null;

    const { client } = result;

    if (!client.feature_flags.can_submit_ideas) {
      return (
        <div className="cortex-page-gutter">
          <EmptyState
            icon={<Lock size={24} />}
            title="Ideas not enabled"
            description="Contact your Nativz team to enable idea submissions."
          />
        </div>
      );
    }

    const adminClient = createAdminClient();

    const [ideasResult, savedResult] = await Promise.all([
      adminClient
        .from('idea_submissions')
        .select('*')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false })
        .limit(100),
      adminClient
        .from('client_knowledge_entries')
        .select('id, type, title, content, created_at')
        .eq('client_id', client.id)
        .eq('type', 'idea')
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    return (
      <div className="cortex-page-gutter max-w-3xl mx-auto">
        <PortalIdeasTabs
          clientId={client.id}
          submissions={(ideasResult.data || []) as IdeaSubmission[]}
          savedIdeas={(savedResult.data || []).map((e) => ({
            id: e.id,
            title: e.title,
            content: e.content,
            created_at: e.created_at,
          }))}
        />
      </div>
    );
  } catch (error) {
    console.error('PortalIdeasPage error:', error);
    return <PageError />;
  }
}

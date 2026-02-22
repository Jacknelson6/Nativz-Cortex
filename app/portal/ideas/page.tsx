import { Lock } from 'lucide-react';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { createAdminClient } from '@/lib/supabase/admin';
import { IdeaSubmissionList } from '@/components/ideas/idea-submission-list';
import { EmptyState } from '@/components/shared/empty-state';
import { PageError } from '@/components/shared/page-error';
import type { IdeaSubmission } from '@/lib/types/database';

export const dynamic = 'force-dynamic';

export default async function PortalIdeasPage() {
  try {
    const result = await getPortalClient();
    if (!result) return null;

    const { client } = result;

    if (!client.feature_flags.can_submit_ideas) {
      return (
        <div className="p-6">
          <EmptyState
            icon={<Lock size={24} />}
            title="Ideas not enabled"
            description="Contact your Nativz team to enable idea submissions."
          />
        </div>
      );
    }

    const adminClient = createAdminClient();
    const { data: ideas } = await adminClient
      .from('idea_submissions')
      .select('*')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(100);

    return (
      <div className="p-6 max-w-3xl mx-auto">
        <IdeaSubmissionList
          clientId={client.id}
          submissions={(ideas || []) as IdeaSubmission[]}
        />
      </div>
    );
  } catch (error) {
    console.error('PortalIdeasPage error:', error);
    return <PageError />;
  }
}

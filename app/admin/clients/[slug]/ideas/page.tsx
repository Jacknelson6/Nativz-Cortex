import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { IdeaTriageList } from '@/components/ideas/idea-triage-list';
import { PageError } from '@/components/shared/page-error';
import type { IdeaSubmission } from '@/lib/types/database';

export default async function AdminClientIdeasPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  try {
    const adminClient = createAdminClient();

    const { data: client, error } = await adminClient
      .from('clients')
      .select('id, name, slug')
      .eq('slug', slug)
      .single();

    if (error || !client) {
      notFound();
    }

    const { data: ideas } = await adminClient
      .from('idea_submissions')
      .select('*')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(200);

    return (
      <div className="cortex-page-gutter max-w-3xl mx-auto">
        <IdeaTriageList
          submissions={(ideas || []) as IdeaSubmission[]}
          clientName={client.name}
        />
      </div>
    );
  } catch (error) {
    console.error('AdminClientIdeasPage error:', error);
    return <PageError />;
  }
}

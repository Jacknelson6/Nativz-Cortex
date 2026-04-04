import { Bell, Lock } from 'lucide-react';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { EmptyState } from '@/components/shared/empty-state';
import { PageError } from '@/components/shared/page-error';
import { PortalNotificationList } from './notification-list';

export const dynamic = 'force-dynamic';

export default async function PortalNotificationsPage() {
  try {
    const result = await getPortalClient();
    if (!result) return null;

    const { client } = result;

    if ((client.feature_flags as unknown as Record<string, boolean>).can_view_notifications === false) {
      return (
        <div className="cortex-page-gutter">
          <EmptyState
            icon={<Lock size={24} />}
            title="Notifications not enabled"
            description="Contact your team to enable notifications."
          />
        </div>
      );
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const adminClient = createAdminClient();
    const { data: notifications } = await adminClient
      .from('notifications')
      .select('id, type, title, body, link_path, is_read, created_at')
      .eq('recipient_user_id', user.id)
      .in('type', [
        'post_top_performer',
        'engagement_spike',
        'follower_milestone',
        'post_trending',
        'report_published',
        'concepts_ready',
      ])
      .order('created_at', { ascending: false })
      .limit(50);

    return (
      <div className="cortex-page-gutter max-w-3xl mx-auto">
        <PortalNotificationList clientName={client.name} notifications={notifications ?? []} />
      </div>
    );
  } catch (error) {
    console.error('PortalNotificationsPage error:', error);
    return <PageError />;
  }
}

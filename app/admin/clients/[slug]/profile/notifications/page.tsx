import { notFound } from 'next/navigation';
import { Bell } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { SettingsPageHeader } from '@/components/clients/settings/settings-primitives';
import { WorkspaceSection } from '@/components/clients/profile/workspace-section';
import { NotificationToggleRow } from '@/components/clients/profile/notification-toggle-row';

export const dynamic = 'force-dynamic';

type ClientRow = {
  id: string;
  affiliate_digest_email_enabled: boolean | null;
  social_digest_email_enabled: boolean | null;
  drop_reminder_email_enabled: boolean | null;
};

export default async function ProfileNotificationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: client, error } = await admin
    .from('clients')
    .select(
      'id, affiliate_digest_email_enabled, social_digest_email_enabled, drop_reminder_email_enabled',
    )
    .eq('slug', slug)
    .single<ClientRow>();

  if (error || !client) notFound();

  return (
    <>
      <SettingsPageHeader
        icon={Bell}
        title="Notifications"
        subtitle="What we email this client. Toggle these off if a contact prefers Slack or a once-a-month touchpoint instead."
      />

      <WorkspaceSection
        title="Weekly digests"
        description="Recap emails sent to portal contacts every Monday."
      >
        <NotificationToggleRow
          clientId={client.id}
          field="social_digest_email_enabled"
          label="Social performance digest"
          description="Top posts, views, and reach across every connected channel."
          initial={Boolean(client.social_digest_email_enabled)}
        />
        <NotificationToggleRow
          clientId={client.id}
          field="affiliate_digest_email_enabled"
          label="Affiliate digest"
          description="UpPromote earnings + new affiliate sign-ups for the prior week."
          initial={Boolean(client.affiliate_digest_email_enabled)}
        />
      </WorkspaceSection>

      <WorkspaceSection
        title="Production touchpoints"
        description="Real-time pings around individual drops."
      >
        <NotificationToggleRow
          clientId={client.id}
          field="drop_reminder_email_enabled"
          label="Drop reminders"
          description="Email the brand POC 24 hours before a scheduled post still needs approval."
          initial={client.drop_reminder_email_enabled ?? true}
        />
      </WorkspaceSection>
    </>
  );
}

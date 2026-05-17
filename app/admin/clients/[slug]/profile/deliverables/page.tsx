import { notFound } from 'next/navigation';
import { Coins } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { SettingsPageHeader } from '@/components/clients/settings/settings-primitives';
import {
  WorkspaceSection,
  WorkspaceRow,
} from '@/components/clients/profile/workspace-section';
import {
  ServicesEditor,
  CapacityEditor,
  PostingDefaultsEditor,
} from '@/components/clients/profile/deliverables-editors';

export const dynamic = 'force-dynamic';

type ClientRow = {
  id: string;
  services: string[] | null;
  monthly_calendar_post_count: number | null;
  default_posting_time: string | null;
  default_posting_timezone: string | null;
};

function formatTime(value: string | null): string | null {
  if (!value) return null;
  // Postgres TIME comes back as HH:MM:SS — trim seconds for display.
  return value.slice(0, 5);
}

export default async function ProfileDeliverablesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: client } = await admin
    .from('clients')
    .select(
      'id, services, monthly_calendar_post_count, default_posting_time, default_posting_timezone',
    )
    .eq('slug', slug)
    .single<ClientRow>();
  if (!client) notFound();

  const services = client.services ?? [];
  const postCount = client.monthly_calendar_post_count ?? 0;
  const postTime = formatTime(client.default_posting_time);

  return (
    <>
      <SettingsPageHeader
        icon={Coins}
        title="Deliverables"
        subtitle="What we ship for this brand each month and when it goes live."
      />

      <WorkspaceSection
        title="Services"
        action={<ServicesEditor clientId={client.id} initial={{ services }} />}
      >
        <WorkspaceRow
          label="Active"
          value={
            services.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {services.map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-accent/30 bg-accent-surface px-2 py-0.5 text-xs text-accent-text"
                  >
                    {s}
                  </span>
                ))}
              </div>
            ) : null
          }
        />
      </WorkspaceSection>

      <WorkspaceSection
        title="Monthly output"
        description="How many posts the calendar pre-creates for this brand on the 1st of every month."
        action={
          <CapacityEditor
            clientId={client.id}
            initial={{ monthly_calendar_post_count: postCount }}
          />
        }
      >
        <WorkspaceRow
          label="Posts per month"
          value={
            postCount > 0
              ? `${postCount} ${postCount === 1 ? 'post' : 'posts'}`
              : 'Cron disabled'
          }
        />
      </WorkspaceSection>

      <WorkspaceSection
        title="Posting defaults"
        description="Used when new drops are pre-filled. Editors can still override per post."
        action={
          <PostingDefaultsEditor
            clientId={client.id}
            initial={{
              default_posting_time: postTime ?? '',
              default_posting_timezone: client.default_posting_timezone ?? '',
            }}
          />
        }
      >
        <WorkspaceRow label="Default post time" value={postTime} />
        <WorkspaceRow label="Timezone" value={client.default_posting_timezone} />
      </WorkspaceSection>
    </>
  );
}

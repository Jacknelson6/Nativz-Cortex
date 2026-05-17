import { notFound } from 'next/navigation';
import { Coins } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { SettingsPageHeader } from '@/components/clients/settings/settings-primitives';
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

function formatTime(value: string | null): string {
  if (!value) return '';
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

  return (
    <>
      <SettingsPageHeader
        icon={Coins}
        title="Deliverables"
        subtitle="What we ship for this brand each month and when it goes live."
      />

      <ServicesEditor
        clientId={client.id}
        initial={{ services: client.services ?? [] }}
      />

      <CapacityEditor
        clientId={client.id}
        initial={{
          monthly_calendar_post_count: client.monthly_calendar_post_count ?? 0,
        }}
      />

      <PostingDefaultsEditor
        clientId={client.id}
        initial={{
          default_posting_time: formatTime(client.default_posting_time),
          default_posting_timezone: client.default_posting_timezone ?? '',
        }}
      />
    </>
  );
}

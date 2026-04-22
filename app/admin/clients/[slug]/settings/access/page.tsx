import { ShieldCheck } from 'lucide-react';
import { ClientAccessServicesPanel } from '@/components/clients/client-access-services-panel';
import { RevisionWebhookSettings } from '@/components/clients/revision-webhook-settings';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  SettingsPageHeader,
  SettingsSectionHeader,
} from '@/components/clients/settings/settings-primitives';

export default async function ClientSettingsAccessPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();
  const { data: client } = await admin.from('clients').select('id').eq('slug', slug).single();
  if (!client) notFound();

  return (
    <div className="space-y-8">
      <SettingsPageHeader
        icon={ShieldCheck}
        title="Access & services"
        subtitle="Contracted services, team workspace modules, and portal feature flags."
      />

      <ClientAccessServicesPanel slug={slug} />

      <section className="space-y-3 pt-2">
        <SettingsSectionHeader
          title="Webhooks"
          description="Fire an outbound request when revision state changes."
        />
        <RevisionWebhookSettings clientId={client.id} />
      </section>
    </div>
  );
}

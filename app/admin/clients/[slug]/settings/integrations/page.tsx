import { notFound } from 'next/navigation';
import { Plug } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { IntegrationsTable } from '@/components/clients/settings/integrations-table';
import { SettingsPageHeader } from '@/components/clients/settings/settings-primitives';

export default async function ClientSettingsIntegrationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();
  const { data: client } = await admin
    .from('clients')
    .select('id, name, uppromote_api_key, chat_webhook_url')
    .eq('slug', slug)
    .single();
  if (!client) notFound();

  const c = client as { id: string; name: string; uppromote_api_key?: string | null; chat_webhook_url?: string | null };

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        icon={Plug}
        title="Integrations"
        subtitle="Connected accounts for reporting, analytics, affiliate tracking, and team notifications."
      />
      <IntegrationsTable
        clientId={c.id}
        hasAffiliateIntegration={Boolean(c.uppromote_api_key)}
        chatWebhookUrl={c.chat_webhook_url ?? null}
      />
    </div>
  );
}

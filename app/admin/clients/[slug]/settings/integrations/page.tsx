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
    .select('id, name, uppromote_api_key')
    .eq('slug', slug)
    .single();
  if (!client) notFound();

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        icon={Plug}
        title="Integrations"
        subtitle="Connected accounts for reporting, analytics, and affiliate tracking."
      />
      <IntegrationsTable
        clientId={client.id}
        hasAffiliateIntegration={Boolean((client as { uppromote_api_key?: string | null }).uppromote_api_key)}
      />
    </div>
  );
}

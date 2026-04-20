import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { IntegrationsTable } from '@/components/clients/settings/integrations-table';

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
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Integrations</h2>
        <p className="text-sm text-text-muted mt-0.5">
          Connected accounts for reporting, analytics, and affiliate tracking.
        </p>
      </div>
      <IntegrationsTable
        clientId={client.id}
        hasAffiliateIntegration={Boolean((client as { uppromote_api_key?: string | null }).uppromote_api_key)}
      />
    </div>
  );
}

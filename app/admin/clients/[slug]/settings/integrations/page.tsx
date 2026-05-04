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
    .select('id, name, agency, uppromote_api_key, chat_webhook_url, is_misc_catchall')
    .eq('slug', slug)
    .single();
  if (!client) notFound();

  const c = client as {
    id: string;
    name: string;
    agency: string | null;
    uppromote_api_key?: string | null;
    chat_webhook_url?: string | null;
    is_misc_catchall?: boolean | null;
  };

  // Look up the existing catchall (if any) so the toggle can show "Currently
  // routed to {Foo}" when this client is NOT the catchall — gives the admin
  // context before they reassign the flag.
  let currentCatchallName: string | null = null;
  if (c.agency && !c.is_misc_catchall) {
    const { data: existing } = await admin
      .from('clients')
      .select('name')
      .eq('agency', c.agency)
      .eq('is_misc_catchall', true)
      .maybeSingle<{ name: string }>();
    currentCatchallName = existing?.name ?? null;
  }

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
        isMiscCatchall={Boolean(c.is_misc_catchall)}
        currentCatchallName={currentCatchallName}
      />
    </div>
  );
}

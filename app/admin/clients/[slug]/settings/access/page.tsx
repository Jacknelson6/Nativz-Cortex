import { ClientAccessServicesPanel } from '@/components/clients/client-access-services-panel';
import { RevisionWebhookSettings } from '@/components/clients/revision-webhook-settings';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';

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
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Access & services</h2>
        <p className="text-sm text-text-muted mt-0.5">
          Contracted services, team workspace modules, and portal feature flags.
        </p>
      </div>

      <ClientAccessServicesPanel slug={slug} />

      <div className="pt-2">
        <h3 className="text-base font-semibold text-text-primary mb-2">Webhooks</h3>
        <RevisionWebhookSettings clientId={client.id} />
      </div>
    </div>
  );
}

import { notFound } from 'next/navigation';
import { Handshake } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  isAdminWorkspaceNavVisible,
  normalizeAdminWorkspaceModules,
} from '@/lib/clients/admin-workspace-modules';
import { ClientAccessServicesPanel } from '@/components/clients/client-access-services-panel';
import { RevisionWebhookSettings } from '@/components/clients/revision-webhook-settings';
import { ContractWorkspace } from '@/components/clients/contract/contract-workspace';
import {
  SettingsPageHeader,
  SettingsSectionHeader,
} from '@/components/clients/settings/settings-primitives';
import { StickySubnav } from '@/components/clients/settings/sticky-subnav';

export const dynamic = 'force-dynamic';

/**
 * /admin/clients/[slug]/settings/partnership — what we actually do for
 * the client and how the engagement is structured. Merges the former
 * Access & services page + Contract workspace into a single scrollable
 * view with a sticky anchor nav.
 *
 * Future: onboarding tracker will link here by client. Plans/tiers are
 * intentionally left out — they'll live as a bespoke configuration
 * layer (per-contract) rather than a dropdown on this page.
 */
export default async function ClientSettingsPartnershipPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const admin = createAdminClient();
  const [{ data: me }, { data: client }] = await Promise.all([
    admin.from('users').select('role').eq('id', user.id).single(),
    admin
      .from('clients')
      .select('id, slug, name, services, admin_workspace_modules')
      .eq('slug', slug)
      .single(),
  ]);
  const isAdmin = me?.role === 'admin' || me?.role === 'super_admin';
  if (!isAdmin) notFound();
  if (!client) notFound();

  const modules = normalizeAdminWorkspaceModules(
    (client as { admin_workspace_modules?: unknown }).admin_workspace_modules,
  );
  const contractEnabled = isAdminWorkspaceNavVisible(modules, 'contract');

  // Contract data — only fetched if the workspace module is enabled.
  let contracts: unknown[] = [];
  let deliverables: unknown[] = [];
  if (contractEnabled) {
    const [{ data: contractRows }] = await Promise.all([
      admin
        .from('client_contracts')
        .select('*')
        .eq('client_id', client.id)
        .order('uploaded_at', { ascending: false }),
    ]);
    contracts = contractRows ?? [];
    const ids = (contracts as { id: string }[]).map((c) => c.id);
    if (ids.length) {
      const { data: delRows } = await admin
        .from('client_contract_deliverables')
        .select('*')
        .in('contract_id', ids)
        .order('sort_order', { ascending: true });
      deliverables = delRows ?? [];
    }
  }

  const sections = [
    { id: 'access', label: 'Access & services' },
    ...(contractEnabled ? [{ id: 'contract', label: 'Contract' }] : []),
    { id: 'webhooks', label: 'Webhooks' },
  ];

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        icon={Handshake}
        title="Partnership"
        subtitle="Services we deliver, contracted scope, and the integration hooks that tie it together."
      />

      <StickySubnav sections={sections} />

      {/* 1. Access & services — contracted services, workspace modules, portal flags */}
      <section id="access" className="space-y-4 scroll-mt-24">
        <SettingsSectionHeader
          title="Access & services"
          description="Contracted services, team workspace modules, and portal feature flags."
        />
        <ClientAccessServicesPanel slug={slug} />
      </section>

      {/* 2. Contract — scoped deliverables + uploaded PDFs */}
      {contractEnabled && (
        <section id="contract" className="space-y-4 scroll-mt-24">
          <SettingsSectionHeader
            title="Contract"
            description="Signed contracts and the deliverables we committed to."
          />
          <ContractWorkspace
            slug={slug}
            clientName={client.name ?? slug}
            services={Array.isArray(client.services) ? (client.services as string[]) : []}
            initialContracts={contracts as Parameters<typeof ContractWorkspace>[0]['initialContracts']}
            initialDeliverables={deliverables as Parameters<typeof ContractWorkspace>[0]['initialDeliverables']}
          />
        </section>
      )}

      {/* 3. Webhooks — revision state callouts */}
      <section id="webhooks" className="space-y-4 scroll-mt-24">
        <SettingsSectionHeader
          title="Webhooks"
          description="Fire an outbound request when revision state changes."
        />
        <RevisionWebhookSettings clientId={client.id} />
      </section>
    </div>
  );
}

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  isAdminWorkspaceNavVisible,
  normalizeAdminWorkspaceModules,
} from '@/lib/clients/admin-workspace-modules';
import { ContractWorkspace } from '@/components/clients/contract/contract-workspace';

export const dynamic = 'force-dynamic';

export default async function AdminClientContractPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  const isAdmin = me?.role === 'admin' || me?.role === 'super_admin';
  if (!isAdmin) notFound();

  const { data: client } = await admin
    .from('clients')
    .select('id, slug, name, services, admin_workspace_modules')
    .eq('slug', slug)
    .single();
  if (!client) notFound();

  const modules = normalizeAdminWorkspaceModules(
    (client as { admin_workspace_modules?: unknown }).admin_workspace_modules,
  );
  if (!isAdminWorkspaceNavVisible(modules, 'contract')) notFound();

  const { data: contracts } = await admin
    .from('client_contracts')
    .select('*')
    .eq('client_id', client.id)
    .order('uploaded_at', { ascending: false });

  const ids = (contracts ?? []).map((c) => c.id);
  const { data: deliverables } = ids.length
    ? await admin
        .from('client_contract_deliverables')
        .select('*')
        .in('contract_id', ids)
        .order('sort_order', { ascending: true })
    : { data: [] as never[] };

  return (
    <ContractWorkspace
      slug={slug}
      clientName={client.name ?? slug}
      services={Array.isArray(client.services) ? (client.services as string[]) : []}
      initialContracts={contracts ?? []}
      initialDeliverables={deliverables ?? []}
    />
  );
}

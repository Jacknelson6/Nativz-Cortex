import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PortalBrandDNAView } from '@/components/brand-dna/portal-brand-dna-view';

export default async function PortalBrandPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  // Get user's organization
  const { data: userData } = await admin
    .from('users')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!userData?.organization_id) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-text-muted">No organization found</p>
      </div>
    );
  }

  // Find client + guideline
  const { data: client } = await admin
    .from('clients')
    .select('id, name')
    .eq('organization_id', userData.organization_id)
    .limit(1)
    .maybeSingle();

  if (!client) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-text-muted">No client profile found</p>
      </div>
    );
  }

  const { data: guideline } = await admin
    .from('client_knowledge_entries')
    .select('id, content, metadata, created_at, updated_at')
    .eq('client_id', client.id)
    .eq('type', 'brand_guideline')
    .is('metadata->superseded_by', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <PortalBrandDNAView
      clientName={client.name ?? ''}
      guideline={guideline}
    />
  );
}

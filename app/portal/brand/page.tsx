import { createAdminClient } from '@/lib/supabase/admin';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { PortalBrandDNAView } from '@/components/brand-dna/portal-brand-dna-view';
import { PageError } from '@/components/shared/page-error';

export const dynamic = 'force-dynamic';

export default async function PortalBrandPage() {
  try {
    const result = await getPortalClient();
    if (!result) return null;

    const { client } = result;
    const admin = createAdminClient();

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
  } catch (error) {
    console.error('PortalBrandPage error:', error);
    return <PageError />;
  }
}

import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdCreativesView } from '@/components/ad-creatives/ad-creatives-view';

export default async function AdCreativesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: client } = await admin
    .from('clients')
    .select('id, name, slug, website_url, brand_dna_status')
    .eq('slug', slug)
    .single();

  if (!client) notFound();

  // Fetch creative count for badge display
  const { count } = await admin
    .from('ad_creatives')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', client.id);

  return (
    <AdCreativesView
      clientId={client.id}
      clientName={client.name ?? ''}
      clientSlug={client.slug ?? slug}
      websiteUrl={client.website_url}
      brandDnaStatus={client.brand_dna_status}
      creativeCount={count ?? 0}
    />
  );
}

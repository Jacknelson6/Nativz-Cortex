import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getKnowledgeEntries, getKnowledgeGraph } from '@/lib/knowledge/queries';
import { VaultLayout } from '@/components/knowledge/VaultLayout';

export default async function KnowledgeVaultPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createAdminClient();

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, slug')
    .eq('slug', slug)
    .single();

  if (!client) {
    notFound();
  }

  const [entries, graphData] = await Promise.all([
    getKnowledgeEntries(client.id),
    getKnowledgeGraph(client.id),
  ]);

  return (
    <VaultLayout
      clientId={client.id}
      clientName={client.name ?? ''}
      clientSlug={client.slug}
      initialEntries={entries}
      initialGraphData={graphData}
    />
  );
}

import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getKnowledgeGraph } from '@/lib/knowledge/queries';
import { KnowledgeGraph } from '@/components/knowledge/KnowledgeGraph';

export default async function KnowledgeGraphPage({
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

  const graphData = await getKnowledgeGraph(client.id);

  return (
    <KnowledgeGraph
      clientId={client.id}
      clientSlug={client.slug}
      clientName={client.name ?? slug}
      initialData={graphData}
    />
  );
}

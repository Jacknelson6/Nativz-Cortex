import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { IdeaGenerator } from '@/components/knowledge/IdeaGenerator';

export default async function GenerateIdeasPage({
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

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <IdeaGenerator clientId={client.id} clientName={client.name ?? slug} />
    </div>
  );
}

import { createAdminClient } from '@/lib/supabase/admin';
import { IdeaGeneratorWithClientSelector } from '@/components/knowledge/IdeaGeneratorWithClientSelector';

export default async function AdminIdeaGeneratorPage() {
  const supabase = createAdminClient();

  const { data: dbClients } = await supabase
    .from('clients')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  const clients = (dbClients ?? []).map((c) => ({
    id: c.id,
    name: c.name ?? '',
  }));

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto pt-4">
        <IdeaGeneratorWithClientSelector clients={clients} />
      </div>
    </div>
  );
}

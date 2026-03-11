import { createAdminClient } from '@/lib/supabase/admin';
import { getVaultClients } from '@/lib/vault/reader';
import { IdeaGeneratorWithClientSelector } from '@/components/knowledge/IdeaGeneratorWithClientSelector';

export default async function AdminIdeaGeneratorPage() {
  const supabase = createAdminClient();

  const [vaultClients, { data: dbClients }] = await Promise.all([
    getVaultClients(),
    supabase
      .from('clients')
      .select('id, slug, name, logo_url, is_active')
      .eq('is_active', true),
  ]);

  const clients = (dbClients || []).map((db) => {
    const vault = vaultClients.find((v) => v.slug === db.slug);
    return {
      id: db.id,
      name: vault?.name || db.name || db.slug,
      slug: db.slug,
      logo_url: db.logo_url,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto pt-4">
        <IdeaGeneratorWithClientSelector clients={clients} />
      </div>
    </div>
  );
}

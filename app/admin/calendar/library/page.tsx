import { createAdminClient } from '@/lib/supabase/admin';
import { CaptionLibraryView } from '@/components/calendar-library/caption-library-view';

export const dynamic = 'force-dynamic';

interface ClientRow {
  id: string;
  name: string;
  slug: string;
}

export default async function CaptionLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client: requestedSlug } = await searchParams;
  const admin = createAdminClient();

  const { data: clientRows } = await admin
    .from('clients')
    .select('id, name, slug')
    .eq('is_active', true)
    .contains('services', ['SMM'])
    .order('name');

  const clients: ClientRow[] = (clientRows ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    slug: c.slug as string,
  }));

  const initialClient =
    clients.find((c) => c.slug === requestedSlug) ?? clients[0] ?? null;

  return <CaptionLibraryView clients={clients} initialClientId={initialClient?.id ?? null} />;
}

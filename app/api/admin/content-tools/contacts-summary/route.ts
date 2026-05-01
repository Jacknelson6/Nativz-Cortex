import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/content-tools/contacts-summary
 *
 * One row per brand that has at least one POC on the brand profile.
 * Used by the Notifications tab on /admin/content-tools so an admin
 * can spot a brand with no contacts (won't get notified) at a glance.
 *
 * Aggregates the `contacts` table (brand profile POC roster) into one
 * summary row per `client_id`, joined to `clients` for display name.
 * Sort: most-contacts first, then alphabetical.
 */

interface ContactRow {
  client_id: string;
  email: string | null;
}

interface SummaryRow {
  clientId: string;
  clientName: string;
  total: number;
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: contacts } = await admin
    .from('contacts')
    .select('client_id, email')
    .not('email', 'is', null)
    .returns<ContactRow[]>();

  const list = contacts ?? [];

  const byClient = new Map<string, number>();
  for (const c of list) {
    if (!c.client_id) continue;
    byClient.set(c.client_id, (byClient.get(c.client_id) ?? 0) + 1);
  }

  const clientIds = Array.from(byClient.keys());
  let nameById = new Map<string, string>();
  if (clientIds.length > 0) {
    const { data: clients } = await admin
      .from('clients')
      .select('id, name')
      .in('id', clientIds);
    nameById = new Map((clients ?? []).map((c) => [c.id, c.name]));
  }

  const rows: SummaryRow[] = clientIds
    .map((id) => ({
      clientId: id,
      clientName: nameById.get(id) ?? 'Unknown brand',
      total: byClient.get(id) ?? 0,
    }))
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return a.clientName.localeCompare(b.clientName);
    });

  return NextResponse.json({ rows });
}

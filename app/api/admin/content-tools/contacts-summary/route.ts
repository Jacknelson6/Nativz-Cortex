import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/content-tools/contacts-summary
 *
 * One row per brand that has at least one POC registered for content
 * review. Used by the Notifications tab on /admin/content-tools to
 * surface "which brands currently have notifications turned off
 * entirely" so an admin can spot a misconfigured client at a glance.
 *
 * Aggregates `content_drop_review_contacts` (per-contact rows scoped to
 * a client) into one summary row per `client_id`, joined to `clients`
 * for display name. Sort: most-contacts first, then alphabetical.
 */

interface ContactRow {
  client_id: string;
  notifications_enabled: boolean | null;
}

interface SummaryRow {
  clientId: string;
  clientName: string;
  total: number;
  notifyEnabled: number;
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
    .from('content_drop_review_contacts')
    .select('client_id, notifications_enabled')
    .returns<ContactRow[]>();

  const list = contacts ?? [];

  // Roll up per client_id.
  const byClient = new Map<string, { total: number; notifyEnabled: number }>();
  for (const c of list) {
    if (!c.client_id) continue;
    const cur = byClient.get(c.client_id) ?? { total: 0, notifyEnabled: 0 };
    cur.total += 1;
    if (c.notifications_enabled) cur.notifyEnabled += 1;
    byClient.set(c.client_id, cur);
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
      total: byClient.get(id)?.total ?? 0,
      notifyEnabled: byClient.get(id)?.notifyEnabled ?? 0,
    }))
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return a.clientName.localeCompare(b.clientName);
    });

  return NextResponse.json({ rows });
}

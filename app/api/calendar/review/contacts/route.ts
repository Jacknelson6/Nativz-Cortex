import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

/**
 * /api/calendar/review/contacts
 *
 * Read-only mirror of the brand-profile POC roster (`contacts` table).
 * Brand profile is the single source of truth for who gets emailed when
 * a calendar is shared, comments arrive, or follow-ups fire — this
 * route just exposes that list to the calendar UI surfaces (`/review`
 * Notifications panel and the share-link detail dialog).
 *
 *   GET ?clientId=…  →  { contacts: [{ id, email, name, role }] }
 */

interface BrandContactRow {
  id: string;
  email: string | null;
  name: string | null;
  role: string | null;
}

async function resolveClientAccess(userId: string, clientId: string): Promise<boolean> {
  if (await isAdmin(userId)) return true;
  const admin = createAdminClient();
  const { data } = await admin
    .from('user_client_access')
    .select('client_id')
    .eq('user_id', userId)
    .eq('client_id', clientId)
    .maybeSingle();
  return !!data;
}

export async function GET(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const clientId = url.searchParams.get('clientId')?.trim();
  if (!clientId) {
    return NextResponse.json({ error: 'clientId required' }, { status: 400 });
  }

  if (!(await resolveClientAccess(user.id, clientId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('contacts')
    .select('id, email, name, role')
    .eq('client_id', clientId)
    .not('email', 'is', null)
    .order('name', { ascending: true })
    .returns<BrandContactRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const contacts = (data ?? [])
    .filter((c): c is BrandContactRow & { email: string } => !!c.email)
    .map((c) => ({
      id: c.id,
      email: c.email,
      name: c.name,
      role: c.role,
    }));

  return NextResponse.json({ contacts });
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

interface PersonRow {
  id: string;
  display_name: string;
  color: string;
  priority_tier: number;
  sort_order: number;
  is_active: boolean;
}

interface EmailRow {
  person_id: string;
  email: string;
}

interface PeoplePayload {
  id: string;
  displayName: string;
  color: string;
  priorityTier: 1 | 2 | 3;
  sortOrder: number;
  isActive: boolean;
  emails: string[];
}

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, isAdmin: false };
  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .maybeSingle();
  const isAdmin = me?.role === 'admin' || me?.is_super_admin === true;
  return { user, isAdmin };
}

/**
 * GET /api/calendar/people
 *
 * Returns the configurable list of stakeholders for team availability + the
 * unified calendar overlay. Each row is one logical person; their multiple
 * workspace emails (e.g. jake@nativz.io and jake@andersoncollaborative.com)
 * are returned as a string[]. Admins only.
 */
export async function GET() {
  const { isAdmin } = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const [{ data: peopleRows, error: peopleErr }, { data: emailRows, error: emailErr }] = await Promise.all([
    admin
      .from('scheduling_people')
      .select('id, display_name, color, priority_tier, sort_order, is_active')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    admin
      .from('scheduling_person_emails')
      .select('person_id, email'),
  ]);

  if (peopleErr || emailErr) {
    return NextResponse.json({ error: 'Failed to load people' }, { status: 500 });
  }

  const emailsByPerson = new Map<string, string[]>();
  for (const row of (emailRows ?? []) as EmailRow[]) {
    const list = emailsByPerson.get(row.person_id) ?? [];
    list.push(row.email);
    emailsByPerson.set(row.person_id, list);
  }

  const people: PeoplePayload[] = ((peopleRows ?? []) as PersonRow[]).map((p) => ({
    id: p.id,
    displayName: p.display_name,
    color: p.color,
    priorityTier: p.priority_tier as 1 | 2 | 3,
    sortOrder: p.sort_order,
    isActive: p.is_active,
    emails: (emailsByPerson.get(p.id) ?? []).sort(),
  }));

  return NextResponse.json({ people });
}

const createSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color must be a hex like #aabbcc'),
  priorityTier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  sortOrder: z.number().int().optional(),
  emails: z.array(z.string().trim().toLowerCase().email()).min(1).max(8),
});

/**
 * POST /api/calendar/people
 *
 * Create a new person + their email aliases. Admins only. Emails are
 * lowercased and validated against the authorized workspace domains client-
 * side too, but final domain check happens at calendar fetch time.
 */
export async function POST(request: NextRequest) {
  const { isAdmin } = await requireAdmin();
  if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Default sort_order to bottom of the list
  let sortOrder = parsed.data.sortOrder;
  if (typeof sortOrder !== 'number') {
    const { data: max } = await admin
      .from('scheduling_people')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    sortOrder = ((max?.sort_order as number | undefined) ?? -1) + 1;
  }

  const { data: inserted, error: insertErr } = await admin
    .from('scheduling_people')
    .insert({
      display_name: parsed.data.displayName,
      color: parsed.data.color,
      priority_tier: parsed.data.priorityTier,
      sort_order: sortOrder,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: insertErr?.message ?? 'Failed to insert person' },
      { status: 500 },
    );
  }

  const { error: emailErr } = await admin
    .from('scheduling_person_emails')
    .insert(parsed.data.emails.map((email) => ({ person_id: inserted.id, email })));

  if (emailErr) {
    // Best-effort cleanup so we don't leave a personless ghost
    await admin.from('scheduling_people').delete().eq('id', inserted.id);
    return NextResponse.json(
      { error: emailErr.message ?? 'Failed to insert emails' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, id: inserted.id });
}

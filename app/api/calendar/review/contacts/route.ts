import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

/**
 * /api/calendar/review/contacts
 *
 * Per-brand POC list driving the "Notifications" subpage of `/review`.
 * Admins manage contacts for any brand; viewers manage contacts for
 * the brands they have access to via `user_client_access`.
 *
 *   GET  ?clientId=…   → list contacts for a brand
 *   POST { clientId, email, name?, role?, notifications_enabled?,
 *          followup_cadence? } → create
 */

const CreateSchema = z
  .object({
    clientId: z.string().uuid(),
    email: z.string().email().max(255).transform((s) => s.toLowerCase().trim()),
    name: z.string().trim().max(120).nullable().optional(),
    role: z.string().trim().max(80).nullable().optional(),
    notifications_enabled: z.boolean().optional(),
    followup_cadence: z
      .enum(['off', 'daily', 'every_3_days', 'weekly', 'biweekly'])
      .optional(),
  })
  .strict();

async function resolveClientAccess(userId: string, clientId: string): Promise<{
  allowed: boolean;
  isAdminUser: boolean;
}> {
  const adminUser = await isAdmin(userId);
  if (adminUser) return { allowed: true, isAdminUser: true };
  const admin = createAdminClient();
  const { data } = await admin
    .from('user_client_access')
    .select('client_id')
    .eq('user_id', userId)
    .eq('client_id', clientId)
    .maybeSingle();
  return { allowed: !!data, isAdminUser: false };
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
  // When set, falls back to the brand profile's POC roster (`contacts`
  // table) if no review-specific contacts exist for the brand. Used by
  // the calendar share-link dialog so admins don't have to re-enter the
  // same people they already added to the brand profile.
  const fallback = url.searchParams.get('fallback')?.trim() === 'brand';

  const access = await resolveClientAccess(user.id, clientId);
  if (!access.allowed) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('content_drop_review_contacts')
    .select('id, client_id, email, name, role, notifications_enabled, followup_cadence, created_at, updated_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const reviewContacts = (data ?? []).map((c) => ({ ...c, source: 'review' as const }));
  if (reviewContacts.length > 0 || !fallback) {
    return NextResponse.json({ contacts: reviewContacts });
  }

  const { data: brand, error: brandError } = await admin
    .from('contacts')
    .select('id, name, email, role')
    .eq('client_id', clientId)
    .not('email', 'is', null);
  if (brandError) {
    return NextResponse.json({ contacts: reviewContacts });
  }

  const brandContacts = (brand ?? [])
    .filter((c): c is { id: string; email: string; name: string | null; role: string | null } => !!c.email)
    .map((c) => ({
      id: c.id,
      client_id: clientId,
      email: c.email,
      name: c.name,
      role: c.role,
      notifications_enabled: true,
      followup_cadence: 'every_3_days' as const,
      created_at: null,
      updated_at: null,
      source: 'brand' as const,
    }));

  return NextResponse.json({ contacts: brandContacts });
}

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const access = await resolveClientAccess(user.id, parsed.data.clientId);
  if (!access.allowed) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('content_drop_review_contacts')
    .insert({
      client_id: parsed.data.clientId,
      email: parsed.data.email,
      name: parsed.data.name ?? null,
      role: parsed.data.role ?? null,
      notifications_enabled: parsed.data.notifications_enabled ?? true,
      followup_cadence: parsed.data.followup_cadence ?? 'every_3_days',
    })
    .select(
      'id, client_id, email, name, role, notifications_enabled, followup_cadence, created_at, updated_at',
    )
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'A contact with that email already exists for this brand.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ contact: data });
}

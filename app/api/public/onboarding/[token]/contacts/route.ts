/**
 * /api/public/onboarding/[token]/contacts
 *
 * Public, share-token-gated CRUD for the client's points-of-contact list.
 * The points_of_contact onboarding screen calls these endpoints so the
 * client can add / edit / remove POC entries without needing an admin
 * login. The token IS the auth: anyone with the URL can write contacts
 * scoped to that onboarding's client.
 *
 * GET    -> list contacts for the share-token's client
 * POST   -> create a new contact (auto-demotes primary if needed)
 * PATCH  -> update a contact ({ id, ...fields })
 * DELETE -> remove a contact ({ id })
 *
 * Step state on the onboarding row mirrors a redacted view (contact_id +
 * name + email + role + is_primary) so the stepper can render its own
 * list without a second round trip.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOnboardingByToken, patchStepState } from '@/lib/onboarding/api';
import type { PointOfContactEntry } from '@/lib/onboarding/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ContactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  role: z.string().max(100).optional().nullable(),
  is_primary: z.boolean().optional().default(false),
});

const UpdateSchema = ContactSchema.partial().extend({
  id: z.string().uuid(),
});

const DeleteSchema = z.object({ id: z.string().uuid() });

interface DbContact {
  id: string;
  client_id: string;
  name: string;
  email: string | null;
  role: string | null;
  is_primary: boolean;
}

function toEntry(row: DbContact): PointOfContactEntry {
  return {
    contact_id: row.id,
    name: row.name,
    email: row.email ?? '',
    role: row.role ?? undefined,
    is_primary: row.is_primary,
  };
}

async function syncContactsToStepState(opts: {
  onboarding_id: string;
  client_id: string;
}) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('contacts')
    .select('id, client_id, name, email, role, is_primary')
    .eq('client_id', opts.client_id)
    .order('is_primary', { ascending: false })
    .order('name');
  const list = (data ?? []) as DbContact[];
  await patchStepState(opts.onboarding_id, {
    points_of_contact: { contacts: list.map(toEntry) },
  });
}

async function loadOnboarding(token: string) {
  const row = await getOnboardingByToken(token);
  if (!row) return null;
  if (row.status === 'abandoned') return null;
  return row;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const row = await loadOnboarding(token);
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('contacts')
    .select('id, client_id, name, email, role, is_primary')
    .eq('client_id', row.client_id)
    .order('is_primary', { ascending: false })
    .order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ contacts: ((data ?? []) as DbContact[]).map(toEntry) });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const row = await loadOnboarding(token);
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = ContactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid input', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  if (parsed.data.is_primary) {
    await admin
      .from('contacts')
      .update({ is_primary: false })
      .eq('client_id', row.client_id)
      .eq('is_primary', true);
  }

  const { data, error } = await admin
    .from('contacts')
    .insert({ client_id: row.client_id, ...parsed.data })
    .select('id, client_id, name, email, role, is_primary')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await syncContactsToStepState({ onboarding_id: row.id, client_id: row.client_id });
  return NextResponse.json({ contact: toEntry(data as DbContact) }, { status: 201 });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const row = await loadOnboarding(token);
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid input', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { id, ...patch } = parsed.data;

  // Confirm the contact belongs to this client (token's blast radius).
  const { data: existing } = await admin
    .from('contacts')
    .select('id, client_id')
    .eq('id', id)
    .maybeSingle();
  if (!existing || existing.client_id !== row.client_id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  if (patch.is_primary === true) {
    await admin
      .from('contacts')
      .update({ is_primary: false })
      .eq('client_id', row.client_id)
      .eq('is_primary', true);
  }

  const { data, error } = await admin
    .from('contacts')
    .update(patch)
    .eq('id', id)
    .select('id, client_id, name, email, role, is_primary')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await syncContactsToStepState({ onboarding_id: row.id, client_id: row.client_id });
  return NextResponse.json({ contact: toEntry(data as DbContact) });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const row = await loadOnboarding(token);
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('contacts')
    .select('id, client_id')
    .eq('id', parsed.data.id)
    .maybeSingle();
  if (!existing || existing.client_id !== row.client_id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const { error } = await admin.from('contacts').delete().eq('id', parsed.data.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await syncContactsToStepState({ onboarding_id: row.id, client_id: row.client_id });
  return NextResponse.json({ ok: true });
}

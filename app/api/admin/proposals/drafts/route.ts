import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const CreateBody = z.object({
  agency: z.enum(['anderson', 'nativz']),
  client_id: z.string().uuid().optional().nullable(),
  flow_id: z.string().uuid().optional().nullable(),
  title: z.string().max(200).optional(),
  payment_model: z.enum(['one_off', 'subscription']).optional().default('one_off'),
  cadence: z.enum(['week', 'month', 'quarter', 'year']).optional().nullable(),
});

async function adminCheck(userId: string, admin: ReturnType<typeof createAdminClient>) {
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', userId)
    .single();
  return me?.role === 'admin' || me?.is_super_admin === true;
}

/**
 * POST /api/admin/proposals/drafts — create a new draft. If client_id
 * is set, auto-fills signer fields from the client's primary contact.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  if (!(await adminCheck(user.id, admin))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'bad body' }, { status: 400 });
  }
  const body = parsed.data;

  const insert: Record<string, unknown> = {
    agency: body.agency,
    client_id: body.client_id ?? null,
    flow_id: body.flow_id ?? null,
    title: body.title ?? null,
    payment_model: body.payment_model,
    cadence: body.cadence ?? (body.payment_model === 'subscription' ? 'month' : null),
    created_by: user.id,
  };

  if (body.client_id) {
    const { data: contact } = await admin
      .from('contacts')
      .select('name, email, title')
      .eq('client_id', body.client_id)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (contact) {
      insert.signer_name = contact.name ?? null;
      insert.signer_email = contact.email ?? null;
      insert.signer_title = contact.title ?? null;
    }
    const { data: client } = await admin
      .from('clients')
      .select('name')
      .eq('id', body.client_id)
      .maybeSingle();
    if (client && !insert.signer_legal_entity) {
      insert.signer_legal_entity = client.name ?? null;
    }
    if (client && !insert.title) {
      insert.title = `${client.name} — Social proposal`;
    }
  }

  const { data: draft, error } = await admin
    .from('proposal_drafts')
    .insert(insert)
    .select('*')
    .single();
  if (error || !draft) {
    return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, draft });
}

/** GET /api/admin/proposals/drafts — list this admin's recent drafts. */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  if (!(await adminCheck(user.id, admin))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { data } = await admin
    .from('proposal_drafts')
    .select('id, agency, client_id, title, status, total_cents, deposit_cents, updated_at, clients(name, slug, logo_url)')
    .eq('created_by', user.id)
    .neq('status', 'discarded')
    .order('updated_at', { ascending: false })
    .limit(50);
  return NextResponse.json({ ok: true, drafts: data ?? [] });
}

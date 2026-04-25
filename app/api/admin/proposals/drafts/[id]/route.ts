import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { persistRecomputedDraft } from '@/lib/proposals/draft-engine';

const PatchBody = z.object({
  title: z.string().max(200).nullable().optional(),
  signer_name: z.string().max(200).nullable().optional(),
  signer_email: z.string().email().nullable().optional(),
  signer_title: z.string().max(200).nullable().optional(),
  signer_legal_entity: z.string().max(200).nullable().optional(),
  signer_address: z.string().max(300).nullable().optional(),
  payment_model: z.enum(['one_off', 'subscription']).optional(),
  cadence: z.enum(['week', 'month', 'quarter', 'year']).nullable().optional(),
  status: z.enum(['drafting', 'ready', 'discarded']).optional(),
});

async function adminCheck(userId: string, admin: ReturnType<typeof createAdminClient>) {
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', userId)
    .single();
  return me?.role === 'admin' || me?.is_super_admin === true;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  if (!(await adminCheck(user.id, admin))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { data, error } = await admin
    .from('proposal_drafts')
    .select('*, clients(name, slug, logo_url, agency)')
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true, draft: data });
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  if (!(await adminCheck(user.id, admin))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'bad body' }, { status: 400 });
  }
  const { error } = await admin
    .from('proposal_drafts')
    .update(parsed.data)
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // payment_model / cadence changes affect totals → recompute.
  if (parsed.data.payment_model !== undefined || parsed.data.cadence !== undefined) {
    const r = await persistRecomputedDraft(id, admin);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });
    return NextResponse.json({ ok: true, draft: r.draft });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  if (!(await adminCheck(user.id, admin))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  // Soft-delete: drafts are cheap to keep around for audit/recovery.
  const { error } = await admin
    .from('proposal_drafts')
    .update({ status: 'discarded' })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const PatchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  scope_md: z.string().max(20000).nullable().optional(),
  included_items: z.array(z.string().max(200)).max(50).optional(),
  billing_unit: z
    .enum(['per_video', 'per_post', 'per_month', 'per_year', 'per_quarter', 'flat', 'per_hour', 'per_unit'])
    .optional(),
  base_unit_price_cents: z.number().int().nonnegative().optional(),
  default_quantity: z.number().int().positive().optional(),
  active: z.boolean().optional(),
  category: z.enum(['social', 'paid_media', 'web', 'creative', 'strategy', 'other']).optional(),
});

async function adminCheck(userId: string, admin: ReturnType<typeof createAdminClient>) {
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', userId)
    .single();
  return me?.role === 'admin' || me?.is_super_admin === true;
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
    .from('proposal_services')
    .update(parsed.data)
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
  // Soft-delete: catalog entries can be referenced by historical drafts.
  const { error } = await admin
    .from('proposal_services')
    .update({ active: false })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

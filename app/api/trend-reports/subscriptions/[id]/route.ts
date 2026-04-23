import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  topic_query: z.string().min(1).max(500).optional(),
  keywords: z.array(z.string().min(1)).max(20).optional(),
  brand_names: z.array(z.string().min(1)).max(20).optional(),
  platforms: z.array(z.string()).max(10).optional(),
  cadence: z.enum(['weekly', 'biweekly', 'monthly']).optional(),
  recipients: z.array(z.string().email()).max(20).optional(),
  include_portal_users: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin = me?.role === 'admin' || me?.role === 'super_admin' || me?.is_super_admin;
  return isAdmin ? { admin } : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.flatten() }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) update[k] = v;
  }

  const { data, error } = await ctx.admin
    .from('trend_report_subscriptions')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ subscription: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

  const { id } = await params;
  const { error } = await ctx.admin.from('trend_report_subscriptions').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

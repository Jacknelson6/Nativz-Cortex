import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const CreateBody = z.object({
  agency: z.enum(['anderson', 'nativz']),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-]*$/i, 'lowercase alphanumeric + hyphens'),
  name: z.string().min(1).max(120),
  category: z.enum(['social', 'paid_media', 'web', 'creative', 'strategy', 'other']),
  description: z.string().max(500).nullable().optional(),
  scope_md: z.string().max(20000).nullable().optional(),
  included_items: z.array(z.string().max(200)).max(50).optional(),
  billing_unit: z.enum([
    'per_video',
    'per_post',
    'per_month',
    'per_year',
    'per_quarter',
    'flat',
    'per_hour',
    'per_unit',
  ]),
  base_unit_price_cents: z.number().int().nonnegative(),
  default_quantity: z.number().int().positive().optional(),
});

async function adminCheck(userId: string, admin: ReturnType<typeof createAdminClient>) {
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', userId)
    .single();
  return me?.role === 'admin' || me?.is_super_admin === true;
}

/** GET /api/admin/proposal-services?agency= — list catalog. */
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  if (!(await adminCheck(user.id, admin))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const url = new URL(req.url);
  const agency = url.searchParams.get('agency');
  let q = admin
    .from('proposal_services')
    .select('id, agency, slug, name, category, description, scope_md, included_items, billing_unit, base_unit_price_cents, default_quantity, active, updated_at')
    .order('agency')
    .order('category')
    .order('name');
  if (agency) q = q.eq('agency', agency);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, services: data ?? [] });
}

/** POST /api/admin/proposal-services — create. */
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
  const { error, data } = await admin
    .from('proposal_services')
    .insert({
      ...parsed.data,
      included_items: parsed.data.included_items ?? [],
      created_by: user.id,
    })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A service with that slug already exists for this agency.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, service: data });
}

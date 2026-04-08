import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { invalidateGuardrailsCache } from '@/lib/nerd/guardrails';

async function requireSuperAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401, user: null };

  const admin = createAdminClient();
  const { data: userData } = await admin
    .from('users')
    .select('is_super_admin')
    .eq('id', user.id)
    .single();

  if (!userData?.is_super_admin) return { error: 'Forbidden', status: 403, user: null };
  return { error: null, status: 200, user };
}

/** GET /api/nerd/guardrails — list all guardrails */
export async function GET() {
  const auth = await requireSuperAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  const { data } = await admin
    .from('nerd_guardrails')
    .select('*')
    .order('priority', { ascending: false });

  return NextResponse.json({ guardrails: data ?? [] });
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  trigger_patterns: z.array(z.string().min(1)).min(1),
  category: z.string().min(1).max(50),
  response: z.string().min(1).max(2000),
  priority: z.number().int().min(0).max(1000).default(0),
  mode: z.enum(['short_circuit', 'inject']).default('short_circuit'),
});

/** POST /api/nerd/guardrails — create a guardrail */
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('nerd_guardrails')
    .insert({ ...parsed.data, created_by: auth.user!.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateGuardrailsCache();
  return NextResponse.json({ guardrail: data }, { status: 201 });
}

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  trigger_patterns: z.array(z.string().min(1)).min(1).optional(),
  category: z.string().min(1).max(50).optional(),
  response: z.string().min(1).max(2000).optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  mode: z.enum(['short_circuit', 'inject']).optional(),
  is_active: z.boolean().optional(),
});

/** PATCH /api/nerd/guardrails — update a guardrail */
export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { id, ...updates } = parsed.data;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('nerd_guardrails')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateGuardrailsCache();
  return NextResponse.json({ guardrail: data });
}

/** DELETE /api/nerd/guardrails — remove a guardrail */
export async function DELETE(req: NextRequest) {
  const auth = await requireSuperAdmin();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const admin = createAdminClient();
  await admin.from('nerd_guardrails').delete().eq('id', id);

  invalidateGuardrailsCache();
  return NextResponse.json({ deleted: true });
}

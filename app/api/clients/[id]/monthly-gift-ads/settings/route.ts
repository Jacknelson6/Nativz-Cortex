import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  monthlyCount: z.number().int().min(1).max(50).optional(),
  renderImages: z.boolean().optional(),
  promptNotes: z.string().max(4000).nullable().optional(),
});

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, admin: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  const isAdmin =
    me?.is_super_admin === true ||
    me?.role === 'admin' ||
    me?.role === 'super_admin';
  if (!isAdmin) return { user: null, admin: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };

  return { user, admin, error: null };
}

function nextMonthlyRun(dayOfMonth: number, from = new Date()): string {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth();
  const candidate = new Date(Date.UTC(year, month, dayOfMonth, 13, 0, 0));
  if (candidate <= from) {
    return new Date(Date.UTC(year, month + 1, dayOfMonth, 13, 0, 0)).toISOString();
  }
  return candidate.toISOString();
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id: clientId } = await params;

  const { data, error } = await auth.admin!
    .from('ad_monthly_generation_settings')
    .select('client_id, enabled, day_of_month, monthly_count, aspect_ratio, render_images, prompt_notes, last_run_at, next_run_at')
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    settings: data ?? {
      client_id: clientId,
      enabled: false,
      day_of_month: 20,
      monthly_count: 20,
      aspect_ratio: '1:1',
      render_images: true,
      prompt_notes: null,
      last_run_at: null,
      next_run_at: nextMonthlyRun(20),
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id: clientId } = await params;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const { data: existing } = await auth.admin!
    .from('ad_monthly_generation_settings')
    .select('day_of_month')
    .eq('client_id', clientId)
    .maybeSingle();
  const day = parsed.data.dayOfMonth ?? ((existing?.day_of_month as number | undefined) ?? 20);

  const row = {
    client_id: clientId,
    ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
    ...(parsed.data.dayOfMonth !== undefined ? { day_of_month: parsed.data.dayOfMonth } : {}),
    ...(parsed.data.monthlyCount !== undefined ? { monthly_count: parsed.data.monthlyCount } : {}),
    ...(parsed.data.renderImages !== undefined ? { render_images: parsed.data.renderImages } : {}),
    ...(parsed.data.promptNotes !== undefined ? { prompt_notes: parsed.data.promptNotes } : {}),
    next_run_at: nextMonthlyRun(day),
  };

  const { data, error } = await auth.admin!
    .from('ad_monthly_generation_settings')
    .upsert(row, { onConflict: 'client_id' })
    .select('client_id, enabled, day_of_month, monthly_count, aspect_ratio, render_images, prompt_notes, last_run_at, next_run_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ settings: data });
}

/**
 * GET /api/accounting/periods/[id]/submit-tokens
 * POST /api/accounting/periods/[id]/submit-tokens  { team_member_id, default_entry_type? }
 *
 * Admin-only. Mints or rotates a submission token for a (period,
 * team_member) pair. GET lists existing tokens with their links.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 as const };
  const adminClient = createAdminClient();
  const { data: userRow } = await adminClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (userRow?.role !== 'admin') return { error: 'Forbidden', status: 403 as const };
  return { user, adminClient };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAdmin();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { data } = await ctx.adminClient
    .from('payroll_submission_tokens')
    .select('id, token, period_id, team_member_id, default_entry_type, expires_at, last_used_at, use_count, team_members:team_member_id(id, full_name, role)')
    .eq('period_id', id);

  const baseUrl = request.nextUrl.origin;
  return NextResponse.json({
    tokens: (data ?? []).map((row) => ({
      id: row.id,
      team_member: row.team_members,
      default_entry_type: row.default_entry_type,
      expires_at: row.expires_at,
      last_used_at: row.last_used_at,
      use_count: row.use_count,
      url: `${baseUrl}/submit-payroll/${row.token}`,
    })),
  });
}

const postSchema = z.object({
  team_member_id: z.string().uuid(),
  default_entry_type: z.enum(['editing', 'smm', 'affiliate', 'blogging']).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAdmin();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { data: period } = await ctx.adminClient
    .from('payroll_periods')
    .select('status')
    .eq('id', id)
    .single();
  if (!period) return NextResponse.json({ error: 'Period not found' }, { status: 404 });
  if (period.status === 'paid') {
    return NextResponse.json({ error: 'Cannot create submit tokens for a paid period' }, { status: 400 });
  }

  const token = randomBytes(18).toString('base64url');
  const { data, error } = await ctx.adminClient
    .from('payroll_submission_tokens')
    .upsert(
      {
        token,
        period_id: id,
        team_member_id: parsed.data.team_member_id,
        default_entry_type: parsed.data.default_entry_type ?? null,
        expires_at: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
        last_used_at: null,
        use_count: 0,
        created_by: ctx.user.id,
      },
      { onConflict: 'period_id,team_member_id' },
    )
    .select('id, token')
    .single();

  if (error || !data) {
    console.error('[accounting] submit-token upsert failed', error);
    return NextResponse.json({ error: 'Failed to create token' }, { status: 500 });
  }

  const url = `${request.nextUrl.origin}/submit-payroll/${data.token}`;
  return NextResponse.json({ token: data.token, url });
}

/**
 * Mint + manage read-only payroll-view tokens for Comptroller / CEO access.
 *
 * POST /api/accounting/periods/[id]/view-tokens — mint a new token
 *   body: { role: 'comptroller' | 'ceo', label?, days? }
 *   returns: { token, url, expires_at }
 *
 * GET  /api/accounting/periods/[id]/view-tokens — list active tokens for a period
 *   returns: { tokens: [{ id, token, role, label, expires_at, first_viewed_at, viewer_email, revoked_at, created_at }] }
 *
 * DELETE /api/accounting/periods/[id]/view-tokens?token_id=<uuid> — revoke
 *   returns: { success: true }
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
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

const mintSchema = z.object({
  role: z.enum(['comptroller', 'ceo']),
  label: z.string().max(120).optional(),
  days: z.number().int().min(1).max(365).default(30),
});

function generateToken(): string {
  // 24 bytes → 32 base64url chars; collision-resistant without being unwieldy.
  return randomBytes(24).toString('base64url');
}

function publicBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    'https://cortex.nativz.io'
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await requireAdmin();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json().catch(() => null);
  const parsed = mintSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { data: period } = await ctx.adminClient
    .from('payroll_periods')
    .select('id')
    .eq('id', id)
    .single();
  if (!period) {
    return NextResponse.json({ error: 'Period not found' }, { status: 404 });
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + parsed.data.days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await ctx.adminClient
    .from('payroll_view_tokens')
    .insert({
      token,
      period_id: id,
      role: parsed.data.role,
      label: parsed.data.label ?? null,
      expires_at: expiresAt,
      created_by: ctx.user.id,
    })
    .select('id, token, role, label, expires_at, created_at')
    .single();

  if (error || !data) {
    console.error('[view-tokens] mint failed', error);
    return NextResponse.json({ error: 'Failed to mint token' }, { status: 500 });
  }

  return NextResponse.json({
    ...data,
    url: `${publicBaseUrl()}/comptroller/${data.token}`,
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await requireAdmin();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { data, error } = await ctx.adminClient
    .from('payroll_view_tokens')
    .select('id, token, role, label, expires_at, first_viewed_at, viewer_name, viewer_email, revoked_at, created_at')
    .eq('period_id', id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[view-tokens] list failed', error);
    return NextResponse.json({ error: 'Failed to list tokens' }, { status: 500 });
  }

  return NextResponse.json({ tokens: data ?? [] });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await requireAdmin();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const tokenId = new URL(request.url).searchParams.get('token_id');
  if (!tokenId) {
    return NextResponse.json({ error: 'token_id required' }, { status: 400 });
  }

  const { error } = await ctx.adminClient
    .from('payroll_view_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', tokenId)
    .eq('period_id', id);

  if (error) {
    console.error('[view-tokens] revoke failed', error);
    return NextResponse.json({ error: 'Failed to revoke token' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

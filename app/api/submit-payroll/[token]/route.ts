/**
 * Public endpoints for token-based payroll submission. NO auth required —
 * the token itself is the credential, scoped to exactly one
 * (period, team_member) pair.
 *
 * GET  /api/submit-payroll/[token]              — verify token, return context
 * POST /api/submit-payroll/[token]/parse        — LLM-parse pasted text
 * POST /api/submit-payroll/[token]/commit       — write confirmed rows
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { labelFor } from '@/lib/accounting/periods';

async function resolveToken(token: string) {
  const adminClient = createAdminClient();
  const { data } = await adminClient
    .from('payroll_submission_tokens')
    .select('id, token, period_id, team_member_id, default_entry_type, expires_at')
    .eq('token', token)
    .single();

  if (!data) return { error: 'Invalid link', status: 404 as const };
  if (new Date(data.expires_at).getTime() < Date.now()) {
    return { error: 'This link has expired. Ask your admin for a new one.', status: 410 as const };
  }

  const [{ data: period }, { data: member }] = await Promise.all([
    adminClient
      .from('payroll_periods')
      .select('id, start_date, end_date, half, status')
      .eq('id', data.period_id)
      .single(),
    adminClient
      .from('team_members')
      .select('id, full_name, role')
      .eq('id', data.team_member_id)
      .single(),
  ]);
  if (!period || !member) return { error: 'Link context missing', status: 404 as const };

  return { adminClient, token: data, period, member };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveToken(token);
  if ('error' in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { adminClient, period, member, token: tokenRow } = resolved;

  const { data: clients } = await adminClient
    .from('clients')
    .select('id, name')
    .order('name');

  return NextResponse.json({
    period: {
      id: period.id,
      label: labelFor(period.start_date, period.half as 'first-half' | 'second-half'),
      status: period.status,
    },
    member: {
      id: member.id,
      full_name: member.full_name,
      role: member.role,
    },
    default_entry_type: tokenRow.default_entry_type ?? 'editing',
    clients: (clients ?? []).map((c) => ({ id: c.id, name: c.name })),
  });
}

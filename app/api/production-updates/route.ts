/**
 * GET  /api/production-updates      — list updates (admin).
 * POST /api/production-updates      — create + send a production update email
 *                                     to all portal users matching the audience.
 *
 * Audience:
 *   - audience_agency: 'nativz' | 'anderson' | null (both)
 *   - audience_client_id: null (all clients in the agency scope)
 *
 * @auth Required (admin / super_admin)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendProductionUpdateEmail } from '@/lib/email/production-update';
import { getBrandFromAgency } from '@/lib/agency/use-agency-brand';
import type { AgencyBrand } from '@/lib/agency/detect';

const sendSchema = z.object({
  title: z.string().min(1).max(160),
  body_markdown: z.string().min(1).max(20000),
  audience_agency: z.enum(['nativz', 'anderson']).nullable().optional(),
  audience_client_id: z.string().uuid().nullable().optional(),
  test_only: z.boolean().optional(),
  test_recipients: z.array(z.string().email()).max(10).optional(),
});

async function requireAdmin(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from('users').select('role').eq('id', userId).single();
  return data?.role === 'admin' || data?.role === 'super_admin';
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await requireAdmin(user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('production_updates')
    .select(
      'id, title, body_markdown, audience_agency, audience_client_id, status, sent_at, recipient_count, failure_reason, created_by, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[production-updates] list failed:', error);
    return NextResponse.json({ error: 'Failed to list updates' }, { status: 500 });
  }

  return NextResponse.json({ updates: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await requireAdmin(user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const raw = await request.json().catch(() => ({}));
  const parsed = sendSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const {
    title,
    body_markdown,
    audience_agency = null,
    audience_client_id = null,
    test_only = false,
    test_recipients = [],
  } = parsed.data;

  const admin = createAdminClient();

  // Draft row up front so failures leave an audit trail.
  const { data: draft, error: draftErr } = await admin
    .from('production_updates')
    .insert({
      title,
      body_markdown,
      audience_agency,
      audience_client_id,
      status: 'draft',
      created_by: user.id,
    })
    .select('id')
    .single();

  if (draftErr || !draft) {
    console.error('[production-updates] draft insert failed:', draftErr);
    return NextResponse.json({ error: 'Failed to save update' }, { status: 500 });
  }

  // Resolve the recipient list.
  // Test mode: send only to the explicit list, leave draft as 'draft'.
  let recipients: { email: string; full_name: string | null; agency: AgencyBrand }[] = [];

  if (test_only) {
    recipients = test_recipients.map((email) => ({
      email,
      full_name: null,
      // Test sends use the composer's chosen agency (or nativz by default)
      // so the preview matches what the live audience will see.
      agency: (audience_agency ?? 'nativz') as AgencyBrand,
    }));
  } else {
    // Join viewers → organizations → clients so we can match on clients.agency
    // when the audience filter is set. A viewer may map to multiple clients
    // via user_client_access — dedupe by email at the end.
    const { data: rows, error: recErr } = await admin
      .from('users')
      .select(
        `
        id,
        email,
        full_name,
        role,
        organization_id,
        organizations:organization_id ( id )
      `,
      )
      .eq('role', 'viewer');

    if (recErr) {
      console.error('[production-updates] viewer query failed:', recErr);
      await admin
        .from('production_updates')
        .update({ status: 'failed', failure_reason: 'viewer lookup failed' })
        .eq('id', draft.id);
      return NextResponse.json({ error: 'Failed to resolve recipients' }, { status: 500 });
    }

    // Map each viewer's organization → its clients to apply agency / client filters.
    const orgIds = Array.from(
      new Set((rows ?? []).map((r) => r.organization_id).filter((v): v is string => Boolean(v))),
    );

    const { data: clientRows } = orgIds.length
      ? await admin
          .from('clients')
          .select('id, agency, organization_id')
          .in('organization_id', orgIds)
      : { data: [] as { id: string; agency: string | null; organization_id: string }[] };

    const clientsByOrg = new Map<string, { id: string; agency: string | null }[]>();
    for (const c of clientRows ?? []) {
      const list = clientsByOrg.get(c.organization_id) ?? [];
      list.push({ id: c.id, agency: c.agency });
      clientsByOrg.set(c.organization_id, list);
    }

    const dedupe = new Map<string, { email: string; full_name: string | null; agency: AgencyBrand }>();
    for (const row of rows ?? []) {
      if (!row.email) continue;
      const orgClients = row.organization_id ? clientsByOrg.get(row.organization_id) ?? [] : [];
      // Pick the first client whose agency matches the filter. If no filter,
      // use the first client's agency (or nativz fallback).
      const matching = orgClients.filter((c) => {
        if (audience_client_id && c.id !== audience_client_id) return false;
        if (!audience_agency) return true;
        return getBrandFromAgency(c.agency) === audience_agency;
      });
      if (audience_agency || audience_client_id) {
        if (matching.length === 0) continue;
      }
      const chosen = matching[0] ?? orgClients[0] ?? null;
      const agency = getBrandFromAgency(chosen?.agency ?? null);
      dedupe.set(row.email.toLowerCase(), { email: row.email, full_name: row.full_name, agency });
    }

    recipients = [...dedupe.values()];
  }

  if (recipients.length === 0) {
    await admin
      .from('production_updates')
      .update({ status: 'failed', failure_reason: 'no matching recipients' })
      .eq('id', draft.id);
    return NextResponse.json(
      { id: draft.id, sent: 0, failed: 0, error: 'No recipients match this audience' },
      { status: 400 },
    );
  }

  // Send sequentially — Resend rate-limits free plans, and this keeps the
  // per-agency theming correct without batching complexity. For larger sends
  // we'd hand this to a queue; admin broadcasts stay small enough for inline.
  let sent = 0;
  let failed = 0;
  const failures: string[] = [];
  for (const r of recipients) {
    try {
      const res = await sendProductionUpdateEmail({
        to: r.email,
        recipientName: r.full_name,
        title,
        bodyMarkdown: body_markdown,
        agency: r.agency,
      });
      if (res.error) {
        failed += 1;
        failures.push(`${r.email}: ${res.error.message ?? 'resend error'}`);
      } else {
        sent += 1;
      }
    } catch (err) {
      failed += 1;
      failures.push(`${r.email}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  // Mark the row sent only on real broadcasts — test sends leave it as draft.
  if (!test_only) {
    await admin
      .from('production_updates')
      .update({
        status: failed === recipients.length ? 'failed' : 'sent',
        sent_at: new Date().toISOString(),
        recipient_count: sent,
        failure_reason: failures.slice(0, 5).join('\n') || null,
      })
      .eq('id', draft.id);
  }

  return NextResponse.json({
    id: draft.id,
    sent,
    failed,
    test_only,
    failures: failures.slice(0, 10),
  });
}

// SPY-10 T13: prospect-scoped digest subscribe/unsubscribe.
// POST  → upsert subscription, mint unsubscribe_token if missing.
// DELETE → soft-stop (active=false).

import { NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { requireAdmin } from '@/lib/auth/require-admin';

export const dynamic = 'force-dynamic';

const PostBody = z.object({
  kind: z.enum(['weekly_competitor', 'monthly_format']),
  start_date: z.string().refine((s) => /^\d{4}-\d{2}-\d{2}$/.test(s), 'YYYY-MM-DD'),
});

const DeleteBody = z.object({
  kind: z.enum(['weekly_competitor', 'monthly_format']),
});

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: RouteCtx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id: prospectId } = await params;

  const json = await req.json().catch(() => null);
  const parsed = PostBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Bad request', issues: parsed.error.issues }, { status: 400 });
  }

  const unsubscribe_token = crypto.randomBytes(24).toString('hex');

  const { data, error } = await auth.admin
    .from('prospect_digest_subscriptions')
    .upsert(
      {
        prospect_id: prospectId,
        kind: parsed.data.kind,
        start_date: parsed.data.start_date,
        active: true,
        unsubscribed_at: null,
        unsubscribed_via: null,
        unsubscribe_token,
      },
      { onConflict: 'prospect_id,kind', ignoreDuplicates: false },
    )
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
  }

  return NextResponse.json({ subscription: data });
}

export async function DELETE(req: Request, { params }: RouteCtx) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { id: prospectId } = await params;

  const json = await req.json().catch(() => null);
  const parsed = DeleteBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Bad request', issues: parsed.error.issues }, { status: 400 });
  }

  const { error } = await auth.admin
    .from('prospect_digest_subscriptions')
    .update({
      active: false,
      unsubscribed_at: new Date().toISOString(),
      unsubscribed_via: 'per_type',
    })
    .eq('prospect_id', prospectId)
    .eq('kind', parsed.data.kind);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

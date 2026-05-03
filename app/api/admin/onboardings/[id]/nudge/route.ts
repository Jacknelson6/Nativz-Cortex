/**
 * POST /api/admin/onboardings/[id]/nudge
 *
 * Admin-triggered email nudge. Body: { kind: 'manual' | 'step_reminder' | 'lagging_nudge', message?: string, to?: string }
 * Defaults to 'manual'. Logs to onboarding_emails_log + sends through Resend.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOnboardingAdminContext } from '@/lib/onboarding/admin-auth';
import { getOnboardingById, logEmail } from '@/lib/onboarding/api';
import { sendOnboardingNudgeEmail } from '@/lib/onboarding/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Schema = z.object({
  kind: z.enum(['manual', 'step_reminder', 'lagging_nudge']).optional(),
  message: z.string().max(2000).optional(),
  to: z.string().email().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await getOnboardingAdminContext();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { body = {}; }
  const parsed = Schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid input', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const row = await getOnboardingById(id);
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const kind = parsed.data.kind ?? 'manual';

  try {
    const sentList = await sendOnboardingNudgeEmail({
      onboarding: row,
      kind,
      recipient_email: parsed.data.to,
      message: parsed.data.message,
      triggered_by: guard.ctx.user.id,
    });

    // Log one row per recipient. When the admin passes an explicit `to`,
    // sentList has length 1 - same audit trail as before.
    for (const sent of sentList) {
      await logEmail({
        onboarding_id: row.id,
        kind,
        to_email: sent.to,
        subject: sent.subject,
        body_preview: sent.body_preview,
        resend_id: sent.resend_id,
        ok: sent.ok,
        error: sent.error,
        triggered_by: guard.ctx.user.id,
      });
    }

    // Surface a partial-failure 502 only when EVERY send failed; if at least
    // one POC got the nudge we treat the call as ok and let the per-recipient
    // log rows tell the rest of the story.
    const anyOk = sentList.some((s) => s.ok);
    if (!anyOk) {
      const firstErr = sentList.find((s) => s.error)?.error ?? 'send failed';
      return NextResponse.json({ error: firstErr }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      sent_count: sentList.filter((s) => s.ok).length,
      total: sentList.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

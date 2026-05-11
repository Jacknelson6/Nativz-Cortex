/**
 * POST /api/admin/onboardings/[id]/welcome
 *
 * Re-sends the onboarding welcome email to the brand profile POCs. The
 * welcome email is also fired at create time; this route exists so the
 * admin can resend it from the detail page after a tweak (or when the
 * POC list changes after creation).
 *
 * Body: { to?: string }  // optional recipient override
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOnboardingAdminContext } from '@/lib/onboarding/admin-auth';
import { getOnboardingById, logEmail } from '@/lib/onboarding/api';
import { sendOnboardingWelcomeEmail } from '@/lib/onboarding/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Schema = z.object({
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

  try {
    const sentList = await sendOnboardingWelcomeEmail({
      onboarding: row,
      recipient_email: parsed.data.to,
      triggered_by: guard.ctx.user.id,
    });

    for (const sent of sentList) {
      await logEmail({
        onboarding_id: row.id,
        kind: 'welcome',
        to_email: sent.to,
        subject: sent.subject,
        body_preview: sent.body_preview,
        resend_id: sent.resend_id,
        ok: sent.ok,
        error: sent.error,
        triggered_by: guard.ctx.user.id,
      });
    }

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

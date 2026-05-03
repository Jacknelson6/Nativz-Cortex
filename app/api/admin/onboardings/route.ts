/**
 * /api/admin/onboardings
 *
 * GET   list in-flight onboardings (with client + last email metadata)
 * POST  create a new onboarding for a client (kind locked at create time)
 *
 * The create path also fires the welcome email (kind='welcome') and
 * logs it to onboarding_emails_log. Future cron jobs (Phase 5) decide
 * whether to chase a step reminder or escalate to a lagging nudge.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOnboardingAdminContext } from '@/lib/onboarding/admin-auth';
import {
  createOnboarding,
  listOnboardingsForAdmin,
  logEmail,
} from '@/lib/onboarding/api';
import { sendOnboardingWelcomeEmail } from '@/lib/onboarding/email';
import type { OnboardingStatus } from '@/lib/onboarding/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS_VALUES = ['in_progress', 'completed', 'paused', 'abandoned'] as const;

export async function GET(req: Request) {
  const guard = await getOnboardingAdminContext();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const url = new URL(req.url);
  const statusParam = url.searchParams.get('status');
  let status: OnboardingStatus[] | undefined;
  if (statusParam) {
    const wanted = statusParam.split(',').filter((s): s is OnboardingStatus =>
      (STATUS_VALUES as readonly string[]).includes(s),
    );
    if (wanted.length > 0) status = wanted;
  }

  try {
    const rows = await listOnboardingsForAdmin({ status });
    return NextResponse.json({ rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

const CreateSchema = z.object({
  client_id: z.string().uuid(),
  kind: z.enum(['smm', 'editing']),
  platforms: z.array(z.string()).optional(),
  /** When true, fire the welcome email immediately. Default true. */
  send_welcome: z.boolean().optional(),
  /** Optional first POC email. If omitted we fall back to the client's primary contact. */
  poc_email: z.string().email().optional(),
});

export async function POST(req: Request) {
  const guard = await getOnboardingAdminContext();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid input', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { client_id, kind, platforms, send_welcome, poc_email } = parsed.data;
  if (kind === 'editing' && platforms && platforms.length > 0) {
    return NextResponse.json(
      { error: 'editing kind does not accept platforms' },
      { status: 400 },
    );
  }

  try {
    const row = await createOnboarding({ client_id, kind, platforms });

    // Fire welcome email best-effort. Failure does NOT roll back the create:
    // the admin can resend manually from the detail page.
    if (send_welcome !== false) {
      try {
        const sentList = await sendOnboardingWelcomeEmail({
          onboarding: row,
          recipient_email: poc_email,
          triggered_by: guard.ctx.user.id,
        });
        // One log row per POC; the welcome fan-out lands separate emails to
        // every brand-profile contact, so each gets its own audit trail.
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
      } catch (mailErr) {
        // Log + continue.
        const msg = mailErr instanceof Error ? mailErr.message : 'unknown';
        console.warn('[onboarding/create] welcome email failed:', msg);
      }
    }

    return NextResponse.json({ row }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    if (msg.includes('onboardings_active_per_kind_unique')) {
      return NextResponse.json(
        { error: 'an onboarding of this kind is already in flight for this client' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/admin/onboardings/[id]/nudge/preview
 *
 * Renders the nudge email body without sending. Powers the "preview"
 * step in the admin composer so the admin can eyeball copy before firing
 * it off to the brand POCs.
 *
 * Body: same shape as POST /nudge minus `to` (preview ignores recipient
 * fan-out and uses a generic greeting).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOnboardingAdminContext } from '@/lib/onboarding/admin-auth';
import { getOnboardingById } from '@/lib/onboarding/api';
import { previewOnboardingNudgeEmail } from '@/lib/onboarding/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Schema = z.object({
  kind: z.enum(['manual', 'step_reminder', 'lagging_nudge']).optional(),
  message: z.string().max(2000).optional(),
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
    const { subject, html } = await previewOnboardingNudgeEmail({
      onboarding: row,
      kind: parsed.data.kind ?? 'manual',
      message: parsed.data.message,
    });
    return NextResponse.json({ subject, html });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

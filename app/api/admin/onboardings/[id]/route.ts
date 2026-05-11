/**
 * /api/admin/onboardings/[id]
 *
 * GET    full row + email log + team assignments
 * PATCH  status / current_step changes (manual override)
 * DELETE soft-cancel (status = 'abandoned'); does NOT drop the row
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOnboardingAdminContext } from '@/lib/onboarding/admin-auth';
import {
  advanceStep,
  getOnboardingById,
  listEmailLog,
  listTeamAssignments,
  patchCompletionRequirements,
  setStatus,
  setStepOverride,
} from '@/lib/onboarding/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await getOnboardingAdminContext();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await params;
  try {
    const row = await getOnboardingById(id);
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const [emails, team] = await Promise.all([
      listEmailLog(id),
      listTeamAssignments(row.client_id),
    ]);
    return NextResponse.json({ row, emails, team });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

const PatchSchema = z.object({
  status: z.enum(['in_progress', 'completed', 'paused', 'abandoned']).optional(),
  current_step: z.number().int().min(0).optional(),
  step_override: z
    .object({
      screen_key: z.string().min(1),
      checked: z.boolean(),
    })
    .optional(),
  completion_requirements: z
    .object({
      video_count: z.number().int().nonnegative().nullable().optional(),
      boosting_budget_cents: z.number().int().nonnegative().nullable().optional(),
      paid_media_webhook_ack: z.boolean().optional(),
      editing_webhook_ack: z.boolean().optional(),
      notes: z.string().nullable().optional(),
    })
    .optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await getOnboardingAdminContext();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid input', details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    let row = await getOnboardingById(id);
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

    if (parsed.data.step_override !== undefined) {
      row = await setStepOverride(
        id,
        parsed.data.step_override.screen_key,
        parsed.data.step_override.checked,
        guard.ctx.user.id,
      );
    }
    if (parsed.data.completion_requirements !== undefined) {
      row = await patchCompletionRequirements(id, parsed.data.completion_requirements);
    }
    if (parsed.data.current_step !== undefined) {
      row = await advanceStep(id, { to: parsed.data.current_step });
    }
    if (parsed.data.status !== undefined) {
      row = await setStatus(id, parsed.data.status);
    }

    return NextResponse.json({ row });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await getOnboardingAdminContext();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const { id } = await params;
  try {
    const row = await setStatus(id, 'abandoned');
    return NextResponse.json({ row });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

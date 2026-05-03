/**
 * /api/admin/onboardings/[id]/team
 *
 * GET   list team assignments for the onboarding's client
 * POST  upsert one assignment (account_manager / strategist / smm /
 *       editor / videographer / poc)
 *
 * Note: assignments live on the *client*, not the onboarding. The
 * onboarding id is here for routing convenience + audit trail; we
 * resolve `client_id` server-side.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOnboardingAdminContext } from '@/lib/onboarding/admin-auth';
import {
  getOnboardingById,
  listTeamAssignments,
  upsertTeamAssignment,
} from '@/lib/onboarding/api';
import type { TeamRole } from '@/lib/onboarding/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROLE_VALUES = [
  'account_manager',
  'strategist',
  'smm',
  'editor',
  'videographer',
  'poc',
] as const satisfies readonly TeamRole[];

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
    const team = await listTeamAssignments(row.client_id);
    return NextResponse.json({ team });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

const UpsertSchema = z.object({
  team_member_id: z.string().uuid(),
  role: z.enum(ROLE_VALUES),
  is_primary: z.boolean().optional(),
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
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsed = UpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid input', details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const row = await getOnboardingById(id);
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const assignment = await upsertTeamAssignment({
      client_id: row.client_id,
      team_member_id: parsed.data.team_member_id,
      role: parsed.data.role,
      is_primary: parsed.data.is_primary,
    });
    return NextResponse.json({ assignment }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

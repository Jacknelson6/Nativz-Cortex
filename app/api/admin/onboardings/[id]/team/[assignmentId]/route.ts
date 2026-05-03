/**
 * DELETE /api/admin/onboardings/[id]/team/[assignmentId]
 *
 * Removes one assignment row. The client + onboarding stay intact.
 */

import { NextResponse } from 'next/server';
import { getOnboardingAdminContext } from '@/lib/onboarding/admin-auth';
import { removeTeamAssignment } from '@/lib/onboarding/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> },
) {
  const guard = await getOnboardingAdminContext();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const { assignmentId } = await params;
  try {
    await removeTeamAssignment(assignmentId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

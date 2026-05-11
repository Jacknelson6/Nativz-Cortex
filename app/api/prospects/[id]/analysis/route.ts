// SPY-03 T12: GET + PATCH /api/prospects/[id]/analysis
//
// GET — return the latest analysis row (or one specific run_id via
// `?run_id=`). Returns `{ analysis: null }` if no row exists yet so the
// UI can render the empty state without a 404 round-trip.
//
// PATCH — merge per-field overrides into prospect_analyses.overrides and
// write a touchpoint note so the audit trail captures who edited what.

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/prospects/auth';
import { getAnalysisById, getLatestAnalysis } from '@/lib/prospects/analysis-queries';
import type { ProspectAnalysisRow } from '@/lib/prospects/types';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const runId = req.nextUrl.searchParams.get('run_id');
  const analysis = runId ? await getAnalysisById(id, runId) : await getLatestAnalysis(id);
  return NextResponse.json({ analysis });
}

const PatchSchema = z.object({
  run_id: z.string().uuid(),
  overrides: z.record(z.string(), z.unknown()),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existing = await getAnalysisById(id, parsed.data.run_id);
  if (!existing) {
    return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
  }

  const mergedOverrides = {
    ...(existing.overrides ?? {}),
    ...parsed.data.overrides,
  };

  const { admin } = auth;
  const { data: updated, error: updateErr } = await admin
    .from('prospect_analyses')
    .update({ overrides: mergedOverrides })
    .eq('id', existing.id)
    .select('*')
    .single();
  if (updateErr || !updated) {
    return NextResponse.json(
      { error: `Override write failed: ${updateErr?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  const touchedFields = Object.keys(parsed.data.overrides).join(', ');
  void admin.from('prospect_touchpoints').insert({
    prospect_id: id,
    kind: 'note',
    body: `Analysis override: ${touchedFields}`,
    metadata: { run_id: parsed.data.run_id, fields: Object.keys(parsed.data.overrides) },
    created_by: auth.userId,
  });

  return NextResponse.json({ analysis: updated as ProspectAnalysisRow });
}

// SPY-03 T11: POST /api/prospects/[id]/analyze
//
// Manual re-run of the initial analysis pipeline. Runs SYNCHRONOUSLY:
// the strategist clicks "Re-run", the route waits for the full pipeline
// (~90s p95), and returns the updated analysis row.
//
// 6h rate limit (D-04): if the latest succeeded/partial run is <6h old
// AND force=false, return 429. Failed runs don't gate.

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/prospects/auth';
import { runInitialAnalysis } from '@/lib/prospects/initial-analysis';
import { canRerun, getAnalysisById, getLatestAnalysis } from '@/lib/prospects/analysis-queries';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const RequestSchema = z.object({
  force: z.boolean().default(false),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  let body: unknown = {};
  try {
    body = (await req.json().catch(() => ({}))) ?? {};
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Prospect existence check (cheap, gives the right 404).
  const { admin } = auth;
  const { data: prospect } = await admin
    .from('prospects')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (!prospect) {
    return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
  }

  if (!parsed.data.force) {
    const gate = await canRerun(id);
    if (!gate.ok) {
      return NextResponse.json(
        { error: 'Rate limited', retry_after_seconds: gate.retryAfterSec },
        { status: 429 },
      );
    }
  }

  const result = await runInitialAnalysis(id, { createdBy: auth.userId });
  if (!result.ok || !result.analysisId) {
    return NextResponse.json(
      { error: result.message ?? 'Analysis failed' },
      { status: 500 },
    );
  }
  const analysis = result.runId ? await getAnalysisById(id, result.runId) : await getLatestAnalysis(id);
  return NextResponse.json({ analysis });
}

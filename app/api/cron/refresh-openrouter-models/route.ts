import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import {
  fetchOpenRouterModelsLive,
  upsertOpenRouterModels,
} from '@/lib/ai/openrouter-models';

export const maxDuration = 120;

/**
 * GET /api/cron/refresh-openrouter-models
 *
 * Twice-monthly snapshot of OpenRouter's `/api/v1/models` catalog into the
 * `openrouter_models` table. Powers the AI-tab catalog dropdown and the
 * Trend-finder LLM cost estimator without putting OpenRouter on the request
 * path. Schedule lives in `vercel.json` (`0 4 1,15 * *`).
 *
 * Auth: `Bearer $CRON_SECRET` (matches the other Vercel crons in this repo).
 */
async function handleGet(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const models = await fetchOpenRouterModelsLive();
  const { inserted, pruned } = await upsertOpenRouterModels(admin, models);

  return NextResponse.json({
    inserted,
    pruned,
    refreshedAt: new Date().toISOString(),
  });
}

export const GET = withCronTelemetry(
  { route: '/api/cron/refresh-openrouter-models' },
  handleGet,
);

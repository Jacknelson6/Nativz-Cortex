import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import { generateReferenceDrivenAdBatch } from '@/lib/ad-creatives/monthly-gift-ads';

export const maxDuration = 300;

function nextMonthlyRun(dayOfMonth: number, from = new Date()): string {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth();
  const candidate = new Date(Date.UTC(year, month, dayOfMonth, 13, 0, 0));
  if (candidate <= from) {
    return new Date(Date.UTC(year, month + 1, dayOfMonth, 13, 0, 0)).toISOString();
  }
  return candidate.toISOString();
}

async function handleGet(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const limit = Number(process.env.AD_MONTHLY_GIFT_MAX_CLIENTS_PER_CRON ?? 2);
  const forcedClientId = req.nextUrl.searchParams.get('clientId');

  let query = admin
    .from('ad_monthly_generation_settings')
    .select('client_id, monthly_count, day_of_month, render_images, prompt_notes, next_run_at')
    .eq('enabled', true)
    .order('next_run_at', { ascending: true })
    .limit(Math.max(1, limit));

  if (forcedClientId) {
    query = query.eq('client_id', forcedClientId);
  } else {
    query = query.lte('next_run_at', now.toISOString());
  }

  const { data: due, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Array<{ clientId: string; ok: boolean; batchId?: string; error?: string }> = [];

  for (const setting of due ?? []) {
    const clientId = setting.client_id as string;
    try {
      const prompt =
        (setting.prompt_notes as string | null)?.trim() ||
        'Generate this month’s 20 client gift ads. Use Brand DNA, all available memory, and matched proven reference ads. Make the batch varied, polished, and ready for client review.';
      const result = await generateReferenceDrivenAdBatch({
        clientId,
        prompt,
        count: (setting.monthly_count as number | null) ?? 20,
        userId: null,
        renderImages: setting.render_images as boolean,
        pipeline: 'chatgpt_image_monthly_gift',
      });

      await admin
        .from('ad_monthly_generation_settings')
        .update({
          last_run_at: now.toISOString(),
          next_run_at: nextMonthlyRun((setting.day_of_month as number | null) ?? 20, now),
        })
        .eq('client_id', clientId);

      results.push({ clientId, ok: true, batchId: result.batchId });
    } catch (err) {
      results.push({
        clientId,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    success: true,
    processed: results.length,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}

export const GET = withCronTelemetry(
  {
    route: '/api/cron/monthly-gift-ads',
    extractRowsProcessed: (body) => {
      const count = (body as { processed?: number } | null)?.processed;
      return typeof count === 'number' ? count : undefined;
    },
  },
  handleGet,
);

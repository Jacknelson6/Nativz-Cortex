import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';
import { postOpsSlack, type SlackBlock } from '@/lib/social/slack-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/smm-review-digest
 *
 * CUP-02 T11. Once-a-day rollup of every drop currently sitting in
 * smm_review state, grouped by organization. Off by default; only fires
 * when SMM_REVIEW_DIGEST_MODE === 'on'. When off, the per-handoff
 * dispatcher (lib/calendar/notify-smm-review.ts) handles real-time pings
 * and this cron is a no-op so the team can flip between real-time and
 * digest cadence without code changes.
 *
 * Auth: Bearer CRON_SECRET (Vercel cron header).
 */

type AwaitingDrop = {
  id: string;
  client_id: string;
  start_date: string | null;
  end_date: string | null;
  last_smm_review_notified_at: string | null;
  clients: {
    name: string | null;
    organization_id: string | null;
  } | null;
};

function fmtRange(start: string | null, end: string | null): string {
  if (!start && !end) return 'date range pending';
  if (start && end) return `${start} to ${end}`;
  return start ?? end ?? '';
}

async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const digestOn = process.env.SMM_REVIEW_DIGEST_MODE === 'on';
  if (!digestOn) {
    return NextResponse.json({
      digestSent: false,
      dropCount: 0,
      orgCount: 0,
      reason: 'digest_mode_off',
    });
  }

  const slackUrl = process.env.SLACK_OPS_WEBHOOK_URL;
  const slackEnabled = process.env.SLACK_OPS_WEBHOOK_ENABLED === 'true';
  if (!slackEnabled || !slackUrl) {
    return NextResponse.json({
      digestSent: false,
      dropCount: 0,
      orgCount: 0,
      reason: 'slack_not_configured',
    });
  }

  const admin = createAdminClient();

  const { data: rows, error } = await admin
    .from('content_drops')
    .select(
      'id, client_id, start_date, end_date, last_smm_review_notified_at, clients(name, organization_id)',
    )
    .eq('handoff_state', 'smm_review');
  if (error) {
    return NextResponse.json(
      { error: 'failed to load awaiting drops', detail: error.message },
      { status: 500 },
    );
  }

  const drops = (rows ?? []) as unknown as AwaitingDrop[];
  if (drops.length === 0) {
    return NextResponse.json({ digestSent: false, dropCount: 0, orgCount: 0 });
  }

  const byOrg = new Map<string, AwaitingDrop[]>();
  for (const d of drops) {
    const orgId = d.clients?.organization_id ?? '__no_org__';
    const list = byOrg.get(orgId) ?? [];
    list.push(d);
    byOrg.set(orgId, list);
  }

  let cardsFired = 0;
  for (const [, group] of byOrg) {
    const lines = group.map(
      (d) =>
        `• *${d.clients?.name ?? 'Unknown brand'}* - ${fmtRange(d.start_date, d.end_date)}`,
    );
    const blocks: SlackBlock[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `:scroll: *Daily SMM review digest*`,
            `${group.length} drop${group.length === 1 ? '' : 's'} awaiting review`,
            '',
            lines.join('\n'),
          ].join('\n'),
        },
      },
    ];

    const result = await postOpsSlack({
      webhookUrl: slackUrl,
      text: `Daily SMM review digest: ${group.length} drop(s) awaiting review`,
      blocks,
    });
    if (result.ok) cardsFired += 1;

    const ids = group.map((d) => d.id);
    if (ids.length > 0) {
      await admin
        .from('content_drops')
        .update({ last_smm_review_notified_at: new Date().toISOString() })
        .in('id', ids);
    }
  }

  return NextResponse.json({
    digestSent: cardsFired > 0,
    dropCount: drops.length,
    orgCount: byOrg.size,
    cardsFired,
  });
}

export const GET = withCronTelemetry(
  {
    route: '/api/cron/smm-review-digest',
    extractRowsProcessed: (body) => {
      const b = body as { dropCount?: number } | null;
      return b?.dropCount;
    },
  },
  handleGet,
);

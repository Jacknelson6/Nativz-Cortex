/**
 * GET/POST /api/cron/fyxer-import — DEPRECATED (410 Gone)
 *
 * Fyxer ingestion moved to Agency Brain on 2026-04-13. Brain polls
 * Fyxer's official MCP server every 5 minutes at
 * `/api/cron/brain-fyxer-poll` and writes directly into `brain.documents`.
 *
 * This route ran alongside the Brain poller for ~1 day and was
 * double-ingesting every meeting. Disabled to stop the drift.
 *
 * Timeline:
 *   - Replaced by `/api/cron/brain-fyxer-poll` in Agency Brain repo
 *   - Removed from `vercel.json` crons on 2026-04-13
 *   - This route returns 410 so any stale callers fail loudly
 *   - The importer helper at `lib/knowledge/fyxer-importer.ts` is
 *     retained for one more slice in case we need to reference the
 *     Gmail-scraping parser logic for a migration backfill; it will be
 *     deleted in Strangler Slice 3 (Meetings).
 *
 * See: Agency Brain `docs/REVERSE-MERGE-AUDIT.md`, section 4 (Ingestion).
 */

import { NextRequest, NextResponse } from 'next/server'
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry'

const GONE_PAYLOAD = {
  error: 'This endpoint was retired.',
  reason:
    'Fyxer ingestion is now owned by Agency Brain. See Agency Brain `/api/cron/brain-fyxer-poll`.',
  retired_at: '2026-04-13',
} as const

async function handleGet(_req: NextRequest): Promise<NextResponse> {
  return NextResponse.json(GONE_PAYLOAD, { status: 410 })
}

async function handlePost(_req: NextRequest): Promise<NextResponse> {
  return NextResponse.json(GONE_PAYLOAD, { status: 410 })
}

export const GET = withCronTelemetry({ route: '/api/cron/fyxer-import' }, handleGet);
export const POST = withCronTelemetry({ route: '/api/cron/fyxer-import' }, handlePost);

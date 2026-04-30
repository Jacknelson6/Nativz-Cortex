import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/permissions';
import { getSecret } from '@/lib/secrets/store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/content-tools/connections
 *
 * Powers the Connections tab on /admin/content-tools. Returns one row
 * per integration the content pipeline depends on, classified as
 * `connected` / `missing` / `unknown` based on a presence probe of
 * the underlying secret or env var.
 *
 * Iter 14.1: presence checks only (does the env var or app_secrets
 * override exist?). Cheap, accurate, and good enough to flag the
 * agency-stopping "we forgot to set RESEND_API_KEY in this env" case.
 *
 * Iter 14.2 (next push) layers in real reachability probes -- e.g.
 * Resend `/domains` round-trip, Monday `me {}` query, Supabase
 * heartbeat. Done as a separate iteration because each probe has its
 * own failure modes and timing budget.
 */

type Status = 'connected' | 'missing' | 'unknown';

interface ConnectionRow {
  id: string;
  label: string;
  description: string;
  status: Status;
  lastCheckedAt: string;
  detail: string | null;
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }

  // Resend lives in app_secrets via the Setup UI, so we use getSecret
  // (which falls back to process.env) instead of a bare env read.
  const resendKey = await getSecret('RESEND_API_KEY').catch(() => undefined);

  const checks: { row: Omit<ConnectionRow, 'lastCheckedAt'> }[] = [
    {
      row: {
        id: 'supabase',
        label: 'Supabase',
        description: 'Postgres, auth, RLS, storage. The agency database.',
        status: presenceStatus(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
        ),
        detail: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
      },
    },
    {
      row: {
        id: 'resend',
        label: 'Resend',
        description: 'Outbound transactional email (calendar shares, followups).',
        status: resendKey ? 'connected' : 'missing',
        detail: resendKey ? null : 'RESEND_API_KEY not set',
      },
    },
    {
      row: {
        id: 'monday',
        label: 'Monday',
        description: 'Source of truth for editor approvals + content calendar items.',
        status: presenceStatus(process.env.MONDAY_API_TOKEN),
        detail: process.env.MONDAY_CONTENT_CALENDARS_BOARD_ID
          ? `Board ${process.env.MONDAY_CONTENT_CALENDARS_BOARD_ID}`
          : 'MONDAY_CONTENT_CALENDARS_BOARD_ID not set',
      },
    },
    {
      row: {
        id: 'zernio',
        label: 'Zernio',
        description: 'Social posting webhook + scheduled-post lifecycle notifications.',
        status: presenceStatus(process.env.ZERNIO_WEBHOOK_SECRET),
        detail: process.env.ZERNIO_WEBHOOK_NOTIFY_EMAILS
          ? 'Webhook + notify configured'
          : 'Webhook secret only -- no notify recipients',
      },
    },
    {
      row: {
        id: 'google-drive',
        label: 'Google Drive',
        description: 'Editor folder ingestion (raw masters + thumbnails).',
        status: presenceStatus(
          process.env.GOOGLE_SERVICE_ACCOUNT_KEY ??
            process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
          process.env.GOOGLE_SERVICE_ACCOUNT_IMPERSONATE_EMAIL,
        ),
        detail: process.env.GOOGLE_SERVICE_ACCOUNT_IMPERSONATE_EMAIL ?? null,
      },
    },
    {
      row: {
        id: 'openrouter',
        label: 'OpenRouter',
        description: 'Claude Sonnet 4.5 routing for caption + topic AI calls.',
        status: presenceStatus(process.env.OPENROUTER_API_KEY),
        detail: process.env.OPENROUTER_API_KEY ? null : 'OPENROUTER_API_KEY not set',
      },
    },
    {
      row: {
        id: 'gemini',
        label: 'Gemini',
        description: 'Video analysis + thumbnail extraction + transcript pipeline.',
        status: presenceStatus(process.env.GOOGLE_AI_STUDIO_KEY),
        detail: process.env.GOOGLE_AI_STUDIO_KEY
          ? null
          : 'GOOGLE_AI_STUDIO_KEY not set',
      },
    },
  ];

  const checkedAt = new Date().toISOString();
  const rows: ConnectionRow[] = checks.map((c) => ({
    ...c.row,
    lastCheckedAt: checkedAt,
  }));

  return NextResponse.json({ rows });
}

/** All listed values must be non-empty strings for `connected`. Any
 *  missing -> `missing`. We don't currently have a path that returns
 *  `unknown` (presence is binary), but keeping the type exposed lets
 *  iter 14.2 reachability probes return it cleanly when a network
 *  probe times out without proving the upstream is dead. */
function presenceStatus(...values: (string | undefined | null)[]): Status {
  if (values.every((v) => typeof v === 'string' && v.trim().length > 0)) {
    return 'connected';
  }
  return 'missing';
}

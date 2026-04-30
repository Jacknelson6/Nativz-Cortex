import { createAdminClient } from '@/lib/supabase/admin';
import { getSecret } from '@/lib/secrets/store';

/**
 * Reachability probes for the /admin/content-tools Connections tab.
 *
 * Each probe runs in parallel, behind a 5s timeout, and returns a
 * structured result the route handler turns into a row. Probes that
 * can't be cheaply round-tripped (Drive token refresh, Zernio webhook)
 * fall back to env-presence with a `presence-only` detail string so the
 * UI can flag "we know the secret is set, but we haven't actually
 * pinged the upstream".
 *
 * Status semantics:
 *  - `connected`: HTTP 2xx (or DB select returned without throwing)
 *  - `missing`:   credential not configured at all
 *  - `unknown`:   credential present but probe failed/timeout/non-2xx
 *
 * The 5s budget is generous for a manual admin tab. We use AbortController
 * rather than Promise.race so the underlying fetch is cancelled when we
 * give up, instead of leaking a network connection past the response.
 */

export type ProbeStatus = 'connected' | 'missing' | 'unknown';

export interface ProbeResult {
  status: ProbeStatus;
  detail: string | null;
  latencyMs: number | null;
}

const DEFAULT_TIMEOUT_MS = 5_000;

async function timed<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ value: T; latencyMs: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const value = await fn(controller.signal);
    return { value, latencyMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

function unknown(detail: string, latencyMs: number | null = null): ProbeResult {
  return { status: 'unknown', detail, latencyMs };
}

function missing(detail: string): ProbeResult {
  return { status: 'missing', detail, latencyMs: null };
}

function connected(detail: string | null, latencyMs: number): ProbeResult {
  return { status: 'connected', detail, latencyMs };
}

/** Service-role SELECT against `clients` is a cheap round-trip that
 *  exercises pgbouncer + RLS bypass + auth header validation in one go. */
export async function probeSupabase(): Promise<ProbeResult> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return missing('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
  }
  try {
    const { latencyMs, value } = await timed(async () => {
      const admin = createAdminClient();
      return admin.from('clients').select('id').limit(1);
    });
    if (value.error) return unknown(`Postgres error: ${value.error.message}`, latencyMs);
    return connected(`${latencyMs}ms round-trip`, latencyMs);
  } catch (err) {
    return unknown(err instanceof Error ? err.message : 'probe failed');
  }
}

/** Resend `/domains` is the canonical "is this API key live" probe.
 *  200 = key valid, 401/403 = key expired, anything else = upstream
 *  weather. We surface domain count as the detail line so an admin can
 *  spot "key works but the wrong account" at a glance. */
export async function probeResend(): Promise<ProbeResult> {
  const key = await getSecret('RESEND_API_KEY').catch(() => undefined);
  if (!key) return missing('RESEND_API_KEY not set (env or app_secrets)');
  try {
    const { latencyMs, value } = await timed(async (signal) => {
      const res = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${key}` },
        signal,
        cache: 'no-store',
      });
      const body = (await res.json().catch(() => null)) as
        | { data?: { name?: string }[] }
        | null;
      return { ok: res.ok, status: res.status, body };
    });
    if (!value.ok) return unknown(`Resend HTTP ${value.status}`, latencyMs);
    const count = Array.isArray(value.body?.data) ? value.body.data.length : 0;
    return connected(
      `${count} verified domain${count === 1 ? '' : 's'} · ${latencyMs}ms`,
      latencyMs,
    );
  } catch (err) {
    return unknown(err instanceof Error ? err.message : 'probe failed');
  }
}

/** Monday's GraphQL `me {}` query is the recommended health probe. We
 *  also surface the workspace name + user email so an admin can confirm
 *  the token is wired to the right Monday account. */
export async function probeMonday(): Promise<ProbeResult> {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) return missing('MONDAY_API_TOKEN not set');
  try {
    const { latencyMs, value } = await timed(async (signal) => {
      const res = await fetch('https://api.monday.com/v2', {
        method: 'POST',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: '{ me { id name email } }' }),
        signal,
        cache: 'no-store',
      });
      const body = (await res.json().catch(() => null)) as
        | { data?: { me?: { name?: string; email?: string } }; errors?: unknown }
        | null;
      return { ok: res.ok, status: res.status, body };
    });
    if (!value.ok) return unknown(`Monday HTTP ${value.status}`, latencyMs);
    if (value.body?.errors) {
      return unknown('Monday returned GraphQL errors (token likely invalid)', latencyMs);
    }
    const me = value.body?.data?.me;
    const detail = me?.email
      ? `${me.email} · ${latencyMs}ms`
      : `${latencyMs}ms`;
    return connected(detail, latencyMs);
  } catch (err) {
    return unknown(err instanceof Error ? err.message : 'probe failed');
  }
}

/** OpenRouter publishes `/api/v1/credits`, a 1-shot balance lookup
 *  that doubles as an auth probe. 200 = key live + tells us how much
 *  budget is left, which is genuinely useful in the same UI cell. */
export async function probeOpenRouter(): Promise<ProbeResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return missing('OPENROUTER_API_KEY not set');
  try {
    const { latencyMs, value } = await timed(async (signal) => {
      const res = await fetch('https://openrouter.ai/api/v1/credits', {
        headers: { Authorization: `Bearer ${key}` },
        signal,
        cache: 'no-store',
      });
      const body = (await res.json().catch(() => null)) as
        | { data?: { total_credits?: number; total_usage?: number } }
        | null;
      return { ok: res.ok, status: res.status, body };
    });
    if (!value.ok) return unknown(`OpenRouter HTTP ${value.status}`, latencyMs);
    const total = value.body?.data?.total_credits ?? 0;
    const used = value.body?.data?.total_usage ?? 0;
    const remaining = Math.max(0, total - used);
    return connected(
      `$${remaining.toFixed(2)} credit remaining · ${latencyMs}ms`,
      latencyMs,
    );
  } catch (err) {
    return unknown(err instanceof Error ? err.message : 'probe failed');
  }
}

/** Gemini's `models.list` is the cheapest auth probe Google publishes.
 *  We don't actually need the model list, just the 200 status. */
export async function probeGemini(): Promise<ProbeResult> {
  const key = process.env.GOOGLE_AI_STUDIO_KEY;
  if (!key) return missing('GOOGLE_AI_STUDIO_KEY not set');
  try {
    const { latencyMs, value } = await timed(async (signal) => {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=1`,
        { signal, cache: 'no-store' },
      );
      return { ok: res.ok, status: res.status };
    });
    if (!value.ok) return unknown(`Gemini HTTP ${value.status}`, latencyMs);
    return connected(`${latencyMs}ms round-trip`, latencyMs);
  } catch (err) {
    return unknown(err instanceof Error ? err.message : 'probe failed');
  }
}

/** Drive needs a service-account JWT exchange to actually probe; the
 *  cheapest reliable check is "did we configure a key at all + does the
 *  impersonation address look right". A real token round-trip lands
 *  with the Quick Schedule pipeline (iter 14.4) since the scheduler
 *  already has to hold a Drive client for the same window. */
export function probeDrivePresence(): ProbeResult {
  const hasKey =
    !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY ||
    !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  const impersonate = process.env.GOOGLE_SERVICE_ACCOUNT_IMPERSONATE_EMAIL;
  if (!hasKey || !impersonate) {
    return missing(
      !hasKey
        ? 'GOOGLE_SERVICE_ACCOUNT_KEY not set'
        : 'GOOGLE_SERVICE_ACCOUNT_IMPERSONATE_EMAIL not set',
    );
  }
  return {
    status: 'connected',
    detail: `${impersonate} (presence-only)`,
    latencyMs: null,
  };
}

/** Zernio uses a shared webhook secret + outbound notify recipients;
 *  there's no public health endpoint we can hit without spamming the
 *  channel. Presence-only check, with a heads-up in the detail line. */
export function probeZernioPresence(): ProbeResult {
  const secret = process.env.ZERNIO_WEBHOOK_SECRET;
  if (!secret) return missing('ZERNIO_WEBHOOK_SECRET not set');
  const notify = process.env.ZERNIO_WEBHOOK_NOTIFY_EMAILS;
  return {
    status: 'connected',
    detail: notify
      ? 'Webhook + notify configured (presence-only)'
      : 'Webhook secret only, no notify recipients (presence-only)',
    latencyMs: null,
  };
}

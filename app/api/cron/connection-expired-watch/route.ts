import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getFromAddress, getReplyTo, layout } from '@/lib/email/resend';
import { getSecret } from '@/lib/secrets/store';
import { Resend } from 'resend';
import { ZernioPostingService } from '@/lib/posting';
import { withCronTelemetry } from '@/lib/observability/with-cron-telemetry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/cron/connection-expired-watch
 *
 * Watches every active `social_profiles` row Zernio has a token for.
 * On each tick:
 *
 *   1. Re-probe Zernio's `/accounts/{id}/health` so `token_status` +
 *      `token_expires_at` reflect reality (same call the matrix's
 *      "Re-check" button makes).
 *   2. Group profiles where the token is now `expired`, `needs_refresh`,
 *      or the row was flagged disconnected by `is_active=false`.
 *   3. For each client with at least one bad platform, mint a fresh
 *      reconnect invite + email the brand's primary contact (the
 *      `contacts.is_primary` row), CC'd to the agency owner per
 *      `getInviteCc(brand)`. Skip clients we've already auto-emailed
 *      in the last 7 days so we don't spam them on every cron tick.
 *
 * The cron is the safety net: an admin can still hand-send an invite
 * from the Connections matrix at any time, and that path uses the same
 * `connection_invites` row, so dedup works in both directions.
 *
 * Auth: Bearer `CRON_SECRET` (Vercel cron header).
 */

const SUPPORTED_PLATFORMS = [
  'tiktok',
  'instagram',
  'facebook',
  'youtube',
  'linkedin',
  'googlebusiness',
  'pinterest',
  'x',
  'threads',
  'bluesky',
] as const;

type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

const PLATFORM_LABEL: Record<SupportedPlatform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  googlebusiness: 'Google Business',
  pinterest: 'Pinterest',
  x: 'X (Twitter)',
  threads: 'Threads',
  bluesky: 'Bluesky',
};

const TOKEN_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// 7-day cooldown: once we've auto-emailed a brand about expired
// tokens, we wait a week before trying again. Admins can still
// override by sending a manual invite from the matrix — that uses the
// same `connection_invites` table so the cooldown applies to both.
const AUTO_RESEND_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function mintToken(length = 32): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  }
  return out;
}

function inviteUrl(brand: 'nativz' | 'anderson', token: string): string {
  const host =
    brand === 'anderson'
      ? process.env.PROPOSALS_PUBLIC_HOST_ANDERSON ??
        'https://cortex.andersoncollaborative.com'
      : process.env.PROPOSALS_PUBLIC_HOST_NATIVZ ??
        'https://cortex.nativz.io';
  return `${host.replace(/\/+$/, '')}/s/${token}`;
}

function getInviteCc(brand: 'nativz' | 'anderson'): string[] {
  if (brand === 'anderson') return ['Jack@andersoncollaborative.com'];
  return ['Jack@nativz.io'];
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Auto-reconnect email body. Same visual shell as the manual
 * `inviteHtml` but with a slightly different opener so the recipient
 * understands this one was triggered by a system check, not by the
 * agency operator hitting Send.
 */
function autoReconnectHtml(opts: {
  clientName: string;
  url: string;
  platforms: string[];
  brand: 'nativz' | 'anderson';
}): string {
  const platformRows = opts.platforms
    .map((p) => {
      const label = PLATFORM_LABEL[p as SupportedPlatform] ?? p;
      return `<tr><td class="k">${esc(label)}</td><td class="v">Authorization expired</td></tr>`;
    })
    .join('');

  const single = opts.platforms.length === 1;
  const accountWord = single ? 'account' : 'accounts';
  const heroTitle = single
    ? `Reconnect ${esc(opts.clientName)}'s social account`
    : `Reconnect ${esc(opts.clientName)}'s social accounts`;
  const replyTo = getReplyTo(opts.brand);
  const accent = opts.brand === 'anderson' ? '#36D1C2' : '#00ADEF';
  const accentDark = opts.brand === 'anderson' ? '#2BB8AA' : '#0090CC';
  const text = opts.brand === 'anderson' ? '#00161F' : '#0A1628';
  const muted = '#7b8794';
  const border = '#e8ecf0';

  const stepRows = [
    {
      n: '1',
      title: 'Open the secure link',
      body: `Tap the button below. No login on your end &mdash; the link signs you in automatically and lands you on a single reconnect screen.`,
    },
    {
      n: '2',
      title: `Reauthorize each ${single ? 'account' : 'platform'}`,
      body: `You'll see a row for each expired account. Hit "Reconnect," accept the prompt from ${single ? 'the platform' : 'each platform'}, and the row turns green.`,
    },
    {
      n: '3',
      title: 'Done',
      body: `As soon as the last row is green, scheduled posts start flowing again on our end. Nothing else for you to do.`,
    },
  ]
    .map(
      (s) => `
    <tr>
      <td style="vertical-align:top;width:34px;padding:14px 0 14px 0;border-bottom:1px solid ${border};">
        <div style="display:inline-block;width:24px;height:24px;line-height:24px;border-radius:999px;background:${accent};color:#ffffff;font-size:12px;font-weight:700;text-align:center;">${s.n}</div>
      </td>
      <td style="vertical-align:top;padding:14px 0 14px 12px;border-bottom:1px solid ${border};">
        <div style="font-size:13.5px;font-weight:700;color:${text};margin-bottom:3px;">${s.title}</div>
        <div style="font-size:13px;line-height:1.6;color:#3d4852;">${s.body}</div>
      </td>
    </tr>`,
    )
    .join('');

  const inner = `
    <p class="subtext" style="margin-top:0;">
      Our system just flagged that <strong>${esc(opts.clientName)}</strong>'s social authorizations on the platforms below have expired, which means scheduled posts can't go out to them until they're refreshed. Reconnecting takes about a minute and doesn't require a Cortex login.
    </p>

    <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${muted};margin:22px 0 8px;">${single ? 'Account that needs attention' : 'Accounts that need attention'}</div>
    <div class="stats" style="margin:0 0 6px;"><table>${platformRows}</table></div>

    <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${muted};margin:26px 0 4px;">What happens next</div>
    <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="border-collapse:collapse;border-top:1px solid ${border};">${stepRows}</table>

    <div class="button-wrap" style="text-align:center;margin:26px 0 4px;">
      <a class="button" href="${esc(opts.url)}">Reconnect ${accountWord} &rarr;</a>
    </div>
    <p style="font-size:12px;color:${muted};margin:8px 0 0;line-height:1.55;text-align:center;">
      Link valid for 30 days &middot; ${opts.platforms.length} ${single ? 'account' : 'accounts'} &middot; ${esc(opts.clientName)}
    </p>

    <p style="font-size:11.5px;line-height:1.6;color:${muted};margin-top:22px;border-top:1px solid ${border};padding-top:16px;">
      Questions, or hit a snag? Reply to this email or write to <a href="mailto:${replyTo}" style="color:${accentDark};text-decoration:none;">${replyTo}</a> &mdash; we'll jump in.
    </p>`;

  return layout(inner, opts.brand, {
    eyebrow: 'Action Required',
    heroTitle,
  });
}

function deriveStatus(health: {
  tokenValid: boolean;
  needsRefresh: boolean;
  tokenExpiresAt: string | null;
}): string {
  if (!health.tokenValid) return 'expired';
  if (health.needsRefresh) return 'needs_refresh';
  if (
    health.tokenExpiresAt &&
    new Date(health.tokenExpiresAt).getTime() < Date.now()
  ) {
    return 'expired';
  }
  return 'valid';
}

interface SocialProfileRow {
  id: string;
  client_id: string;
  platform: string;
  late_account_id: string | null;
  token_status: string | null;
  is_active: boolean | null;
}

interface ClientRow {
  id: string;
  name: string;
  agency: string | null;
}

interface ContactRow {
  id: string;
  client_id: string;
  email: string | null;
  is_primary: boolean | null;
}

async function handleGet(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // ---- Step 1: probe Zernio + persist token_status -----------------
  const { data: probeRows, error: probeErr } = await admin
    .from('social_profiles')
    .select('id, late_account_id')
    .not('late_account_id', 'is', null);

  if (probeErr) {
    return NextResponse.json(
      { error: 'db_error', detail: probeErr.message },
      { status: 500 },
    );
  }

  const service = new ZernioPostingService();
  let probed = 0;
  let probeSkipped = 0;
  await Promise.all(
    (probeRows ?? []).map(async (r) => {
      const accountId = r.late_account_id as string | null;
      if (!accountId) {
        probeSkipped += 1;
        return;
      }
      const health = await service.getAccountHealth(accountId);
      if (!health) {
        probeSkipped += 1;
        return;
      }
      const status = deriveStatus(health);
      const { error: updateErr } = await admin
        .from('social_profiles')
        .update({
          token_expires_at: health.tokenExpiresAt,
          token_status: status,
        })
        .eq('id', r.id);
      if (updateErr) {
        probeSkipped += 1;
        return;
      }
      probed += 1;
    }),
  );

  // ---- Step 2: collect bad platforms per client --------------------
  const { data: badProfiles, error: badErr } = await admin
    .from('social_profiles')
    .select('id, client_id, platform, late_account_id, token_status, is_active');
  if (badErr) {
    return NextResponse.json(
      { error: 'db_error', detail: badErr.message },
      { status: 500 },
    );
  }

  const platformsByClient = new Map<string, Set<SupportedPlatform>>();
  for (const raw of (badProfiles ?? []) as SocialProfileRow[]) {
    const isBad =
      raw.token_status === 'expired' ||
      raw.token_status === 'needs_refresh' ||
      raw.is_active === false;
    if (!isBad) continue;
    if (!SUPPORTED_PLATFORMS.includes(raw.platform as SupportedPlatform)) {
      continue;
    }
    const set =
      platformsByClient.get(raw.client_id) ?? new Set<SupportedPlatform>();
    set.add(raw.platform as SupportedPlatform);
    platformsByClient.set(raw.client_id, set);
  }

  if (platformsByClient.size === 0) {
    return NextResponse.json({
      probed,
      probeSkipped,
      candidates: 0,
      sent: 0,
      skipped: 0,
    });
  }

  const clientIds = Array.from(platformsByClient.keys());

  // ---- Step 3: fetch clients + primary contacts in parallel --------
  const [clientsRes, contactsRes, recentInvitesRes] = await Promise.all([
    admin
      .from('clients')
      .select('id, name, agency')
      .in('id', clientIds),
    admin
      .from('contacts')
      .select('id, client_id, email, is_primary')
      .in('client_id', clientIds)
      .not('email', 'is', null),
    admin
      .from('connection_invites')
      .select('client_id, sent_at')
      .in('client_id', clientIds)
      .gte(
        'sent_at',
        new Date(Date.now() - AUTO_RESEND_COOLDOWN_MS).toISOString(),
      ),
  ]);

  if (clientsRes.error || contactsRes.error || recentInvitesRes.error) {
    return NextResponse.json(
      {
        error: 'db_error',
        detail:
          clientsRes.error?.message ??
          contactsRes.error?.message ??
          recentInvitesRes.error?.message,
      },
      { status: 500 },
    );
  }

  const clientsById = new Map<string, ClientRow>(
    (clientsRes.data as ClientRow[] | null ?? []).map((c) => [c.id, c]),
  );

  // Collect contacts per client and pick the primary, falling back to
  // the alphabetically-first contact with an email if no primary is
  // marked. We don't email a brand we have no contact for — those go
  // back unsent and the matrix still surfaces them.
  const contactsByClient = new Map<string, ContactRow[]>();
  for (const raw of (contactsRes.data as ContactRow[] | null) ?? []) {
    const list = contactsByClient.get(raw.client_id) ?? [];
    list.push(raw);
    contactsByClient.set(raw.client_id, list);
  }

  const cooldownClientIds = new Set<string>(
    ((recentInvitesRes.data as { client_id: string }[] | null) ?? []).map(
      (r) => r.client_id,
    ),
  );

  // ---- Step 4: per-client mint + send ------------------------------
  const apiKey = (await getSecret('RESEND_API_KEY')) ?? '';
  const resend = apiKey ? new Resend(apiKey) : null;

  let sent = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const [clientId, platforms] of platformsByClient) {
    const client = clientsById.get(clientId);
    if (!client) {
      skipped += 1;
      continue;
    }
    if (cooldownClientIds.has(clientId)) {
      skipped += 1;
      continue;
    }

    const contacts = contactsByClient.get(clientId) ?? [];
    const primary =
      contacts.find((c) => c.is_primary && c.email) ??
      contacts.find((c) => c.email) ??
      null;
    if (!primary?.email) {
      skipped += 1;
      continue;
    }

    const brand = getBrandFromAgency(client.agency);
    const platformList = Array.from(platforms);
    const token = mintToken(32);

    const { data: inserted, error: insertErr } = await admin
      .from('connection_invites')
      .insert({
        client_id: clientId,
        token,
        platforms: platformList,
        recipient_emails: [primary.email],
        notify_chat: true,
        notify_email: false,
        // created_by stays null — that's how we mark a row as
        // cron-generated vs admin-sent.
        created_by: null,
      })
      .select('id, token')
      .single();
    if (insertErr || !inserted) {
      failures.push(`${client.name}: insert failed`);
      skipped += 1;
      continue;
    }

    const url = inviteUrl(brand, inserted.token);
    if (!resend) {
      // No Resend key in this env — row is minted, just skip the send.
      skipped += 1;
      continue;
    }

    const subject = `${client.name}: reconnect your social accounts`;
    const html = autoReconnectHtml({
      clientName: client.name,
      url,
      platforms: platformList,
      brand,
    });
    const cc = getInviteCc(brand);

    try {
      const res = await resend.emails.send({
        from: getFromAddress(brand),
        replyTo: getReplyTo(brand),
        to: primary.email,
        cc,
        subject,
        html,
      });
      if (res.error) {
        failures.push(`${client.name}: ${res.error.message}`);
        skipped += 1;
      } else {
        sent += 1;
      }
    } catch (err) {
      failures.push(
        `${client.name}: ${err instanceof Error ? err.message : 'send threw'}`,
      );
      skipped += 1;
    }
  }

  if (failures.length) {
    console.error('[connection-expired-watch] failures:', failures);
  }

  return NextResponse.json({
    probed,
    probeSkipped,
    candidates: platformsByClient.size,
    sent,
    skipped,
    failures: failures.slice(0, 20),
  });
}

export const GET = withCronTelemetry(
  {
    route: '/api/cron/connection-expired-watch',
    extractRowsProcessed: (body) => {
      if (typeof body !== 'object' || body === null) return undefined;
      const sent = (body as { sent?: number }).sent;
      return typeof sent === 'number' ? sent : undefined;
    },
  },
  handleGet,
);

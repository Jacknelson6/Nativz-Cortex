import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/permissions';
import { Resend } from 'resend';
import { getFromAddress, getReplyTo, layout } from '@/lib/email/resend';
import { getSecret } from '@/lib/secrets/store';
import { getBrandFromAgency } from '@/lib/agency/detect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/connection-invites
 *
 * Mints a self-serve connection invite for a brand and emails the
 * recipients. The email contains a single CTA that opens
 * `/connect/invite/{token}` (no login). Notify hooks fire later from
 * the OAuth callback when each platform comes back connected.
 *
 * Request:
 *   {
 *     clientId: uuid,
 *     platforms: string[],            // e.g. ['tiktok','instagram']
 *     recipientEmails: string[],      // emails to email
 *     notifyChat: boolean,
 *     notifyEmail: boolean,
 *   }
 *
 * Response: { id, token, sent }
 *
 * Auth: admin only.
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

const Body = z.object({
  clientId: z.string().uuid(),
  platforms: z.array(z.enum(SUPPORTED_PLATFORMS)).min(1).max(20),
  recipientEmails: z.array(z.string().email()).min(1).max(20),
  notifyChat: z.boolean(),
  notifyEmail: z.boolean(),
});

const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function mintToken(length = 32): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  }
  return out;
}

const PLATFORM_LABEL: Record<(typeof SUPPORTED_PLATFORMS)[number], string> = {
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

function inviteUrl(brand: 'nativz' | 'anderson', token: string): string {
  const host =
    brand === 'anderson'
      ? process.env.PROPOSALS_PUBLIC_HOST_ANDERSON ??
        'https://cortex.andersoncollaborative.com'
      : process.env.PROPOSALS_PUBLIC_HOST_NATIVZ ??
        'https://cortex.nativz.io';
  return `${host.replace(/\/+$/, '')}/connect/invite/${token}`;
}

function inviteHtml(opts: {
  clientName: string;
  url: string;
  platforms: string[];
  brand: 'nativz' | 'anderson';
}): string {
  // Mirrors Trevor's emailShell pattern (intro paragraph -> stats panel ->
  // structured detail rows -> left-aligned CTA -> small footer note). Body
  // is intentionally dense so the email reads like the docs-repo
  // notifications, not a one-paragraph blast.
  const platformRows = opts.platforms
    .map((p) => {
      const label = PLATFORM_LABEL[p as keyof typeof PLATFORM_LABEL] ?? p;
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
      A few of <strong>${esc(opts.clientName)}</strong>'s social authorizations have expired on our end, which means scheduled posts can't go out to those platforms until they're refreshed. Reconnecting takes about a minute and doesn't require a Cortex login.
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

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) {
      return NextResponse.json({ error: 'admin only' }, { status: 403 });
    }

    const json = await request.json();
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }
    const {
      clientId,
      platforms,
      recipientEmails,
      notifyChat,
      notifyEmail,
    } = parsed.data;

    const admin = createAdminClient();
    const { data: client, error: clientErr } = await admin
      .from('clients')
      .select('id, name, slug, agency')
      .eq('id', clientId)
      .maybeSingle();
    if (clientErr) {
      return NextResponse.json(
        { error: 'db_error', detail: clientErr.message },
        { status: 500 },
      );
    }
    if (!client) {
      return NextResponse.json({ error: 'client not found' }, { status: 404 });
    }

    // Soft dedupe: same brand + same recipient set in last 60s ⇒ reuse.
    const sortedRecipients = [...recipientEmails]
      .map((e) => e.trim().toLowerCase())
      .sort();
    const recentCutoff = new Date(Date.now() - 60_000).toISOString();
    const { data: recentInvites } = await admin
      .from('connection_invites')
      .select('id, token, recipient_emails, sent_at')
      .eq('client_id', clientId)
      .gte('sent_at', recentCutoff)
      .order('sent_at', { ascending: false })
      .limit(5);
    const dupe = (recentInvites ?? []).find((row) => {
      const existing = ((row.recipient_emails as string[]) ?? [])
        .map((e) => e.trim().toLowerCase())
        .sort();
      return (
        existing.length === sortedRecipients.length &&
        existing.every((v, i) => v === sortedRecipients[i])
      );
    });
    if (dupe) {
      return NextResponse.json({
        id: dupe.id,
        token: dupe.token,
        sent: 0,
        deduped: true,
      });
    }

    const token = mintToken(32);
    const { data: inserted, error: insertErr } = await admin
      .from('connection_invites')
      .insert({
        client_id: clientId,
        token,
        platforms,
        recipient_emails: recipientEmails,
        notify_chat: notifyChat,
        notify_email: notifyEmail,
        created_by: user.id,
      })
      .select('id, token')
      .single();
    if (insertErr || !inserted) {
      return NextResponse.json(
        { error: 'db_error', detail: insertErr?.message ?? 'insert failed' },
        { status: 500 },
      );
    }

    const brand = getBrandFromAgency(client.agency as string | null);
    const url = inviteUrl(brand, inserted.token);

    const apiKey = (await getSecret('RESEND_API_KEY')) ?? '';
    if (!apiKey) {
      console.warn(
        '[connection-invites] RESEND_API_KEY missing; row created but no email sent',
      );
      return NextResponse.json({
        id: inserted.id,
        token: inserted.token,
        sent: 0,
      });
    }

    const resend = new Resend(apiKey);
    const subject = `${client.name}: connect your accounts`;
    const html = inviteHtml({
      clientName: client.name as string,
      url,
      platforms,
      brand,
    });

    let sent = 0;
    for (const to of recipientEmails) {
      try {
        const res = await resend.emails.send({
          from: getFromAddress(brand),
          replyTo: getReplyTo(brand),
          to,
          subject,
          html,
        });
        if (!res.error) sent += 1;
        else
          console.error(
            '[connection-invites] resend send error:',
            res.error.message,
          );
      } catch (err) {
        console.error('[connection-invites] resend exception:', err);
      }
    }

    return NextResponse.json({
      id: inserted.id,
      token: inserted.token,
      sent,
    });
  } catch (err) {
    console.error('POST /api/admin/connection-invites error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'internal error' },
      { status: 500 },
    );
  }
}

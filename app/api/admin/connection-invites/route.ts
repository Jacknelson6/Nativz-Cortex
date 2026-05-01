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
  const platformRows = opts.platforms
    .map((p) => {
      const label = PLATFORM_LABEL[p as keyof typeof PLATFORM_LABEL] ?? p;
      return `
        <tr>
          <td class="k">${esc(label)}</td>
          <td class="v" style="text-align:right;">Reconnect</td>
        </tr>`;
    })
    .join('');

  const accountWord = opts.platforms.length === 1 ? 'account' : 'accounts';
  const eyebrow =
    opts.platforms.length === 1
      ? 'Account reconnect'
      : 'Account reconnects';

  const inner = `
    <div class="card">
      <h1 class="heading">Let's reconnect ${esc(opts.clientName)}.</h1>
      <p class="subtext">
        Your ${accountWord} below ${opts.platforms.length === 1 ? 'needs' : 'need'} a quick reconnect so we can keep publishing on your behalf. Tap the button to open one page where you can knock them out in a few taps.
      </p>
      <div class="stats">
        <table>${platformRows}</table>
      </div>
      <div class="button-wrap" style="text-align:center;margin:28px 0 12px;">
        <a class="button" href="${esc(opts.url)}" style="color:#ffffff !important;padding:16px 36px;font-size:15px;letter-spacing:0.02em;">
          Reconnect ${accountWord} &rarr;
        </a>
      </div>
      <hr class="divider" />
      <p class="small">
        This link is valid for 30 days. Reply to this email if anything looks off and we'll sort it out.
      </p>
    </div>`;
  return layout(inner, opts.brand, { eyebrow });
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

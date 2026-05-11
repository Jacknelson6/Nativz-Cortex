// SPY-09 T10: POST /api/shared/prospect-present/[token]/lead
//
// Public lead-capture form on the public present page. Rate-limited 3
// submissions per hour per (token, ip-hash) via prospect_share_link_views
// existing infra. On success, emails the owner sales rep via Resend and
// drops a touchpoint on the prospect for visibility.

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendAndLog } from '@/lib/email/resend';
import type { PresentationSnapshot } from '@/lib/prospects/types';

export const dynamic = 'force-dynamic';

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  notes: z.string().max(2000).optional(),
});

const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function hashIp(ip: string | null): string {
  const salt = process.env.PROSPECT_LEAD_IP_SALT ?? 'cortex-prospect-lead';
  return crypto.createHash('sha256').update(`${salt}:${ip ?? 'unknown'}`).digest('hex').slice(0, 32);
}

function clientIp(request: NextRequest): string | null {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() ?? null;
  return request.headers.get('x-real-ip');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const json = (await request.json().catch(() => ({}))) as unknown;
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: link } = await admin
      .from('prospect_share_links')
      .select('id, kind, archived_at, expires_at, metadata, prospect_id')
      .eq('token', token)
      .eq('kind', 'presentation')
      .maybeSingle();

    if (!link || link.archived_at) {
      return NextResponse.json({ error: 'Presentation not found' }, { status: 404 });
    }
    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'This link has expired' }, { status: 410 });
    }

    const ipHash = hashIp(clientIp(request));
    const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const { count } = await admin
      .from('prospect_share_link_views')
      .select('id', { count: 'exact', head: true })
      .eq('share_link_id', link.id)
      .eq('viewer_ip_hash', ipHash)
      .gte('viewed_at', windowStart);

    if ((count ?? 0) >= RATE_LIMIT) {
      return NextResponse.json(
        { error: 'Please try again in a few minutes.' },
        { status: 429 },
      );
    }

    // Log this submission as a view row so it counts toward the next
    // window check. Re-uses the views table rather than a bespoke one.
    await admin.from('prospect_share_link_views').insert({
      share_link_id: link.id,
      viewer_ip_hash: ipHash,
      viewer_ua: request.headers.get('user-agent'),
      referrer: request.headers.get('referer'),
    });

    const metadata = (link.metadata ?? {}) as { presentation_snapshot?: PresentationSnapshot };
    const snapshot = metadata.presentation_snapshot ?? null;
    const repEmail = snapshot?.contact?.sales_rep_email ?? 'hello@nativz.io';
    const repName = snapshot?.contact?.sales_rep_name ?? 'Nativz team';
    const brandName = snapshot?.cover?.brand_name ?? 'a prospect';

    const subject = `New lead from presentation: ${parsed.data.name} (${brandName})`;
    const html = `
      <div style="font-family:Inter,system-ui,sans-serif;line-height:1.6;color:#0b0b0b;">
        <p>Hi ${repName},</p>
        <p><strong>${parsed.data.name}</strong> just submitted the lead form on the presentation for <strong>${brandName}</strong>.</p>
        <table style="border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:4px 12px 4px 0;color:#666;">Name</td><td style="padding:4px 0;">${parsed.data.name}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#666;">Email</td><td style="padding:4px 0;"><a href="mailto:${parsed.data.email}">${parsed.data.email}</a></td></tr>
          ${parsed.data.notes ? `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top;">Notes</td><td style="padding:4px 0;white-space:pre-wrap;">${parsed.data.notes}</td></tr>` : ''}
        </table>
        <p style="color:#666;font-size:12px;">Token: ${token}</p>
      </div>
    `;

    await sendAndLog({
      category: 'system',
      typeKey: 'prospect_present_lead',
      agency: 'nativz',
      to: repEmail,
      subject,
      html,
      metadata: { token, prospect_id: link.prospect_id, lead_email: parsed.data.email },
    });

    await admin.from('prospect_touchpoints').insert({
      prospect_id: link.prospect_id,
      kind: 'note',
      body: `Lead form submitted by ${parsed.data.name} <${parsed.data.email}>`,
      metadata: {
        share_link_id: link.id,
        kind: 'presentation_lead',
        notes: parsed.data.notes ?? null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('POST /api/shared/prospect-present/[token]/lead error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

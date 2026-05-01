/**
 * Render the connection-invite email and send a sample to jack@nativz.io
 * so we can eyeball the new layout in a real client (Gmail, Apple Mail).
 *
 * Usage:
 *   npx tsx scripts/test-connection-invite-email.ts
 *   TO=other@nativz.io npx tsx scripts/test-connection-invite-email.ts
 *   AGENCY=anderson npx tsx scripts/test-connection-invite-email.ts
 *   PLATFORMS=tiktok,instagram,youtube npx tsx scripts/test-connection-invite-email.ts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env.local');
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq);
  let val = trimmed.slice(eq + 1);
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

if (!process.env.RESEND_API_KEY) {
  console.error('Missing RESEND_API_KEY in .env.local');
  process.exit(1);
}

import { Resend } from 'resend';
import { getFromAddress, getReplyTo, layout } from '@/lib/email/resend';
import type { AgencyBrand } from '@/lib/agency/detect';

const TO = process.env.TO ?? 'jack@nativz.io';
const AGENCY: AgencyBrand =
  process.env.AGENCY === 'anderson' ? 'anderson' : 'nativz';
const PLATFORMS = (process.env.PLATFORMS ?? 'tiktok,instagram,youtube')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);

const PLATFORM_LABEL: Record<string, string> = {
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

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inviteHtml(opts: {
  clientName: string;
  url: string;
  platforms: string[];
  brand: AgencyBrand;
}): string {
  const platformRows = opts.platforms
    .map((p) => {
      const label = PLATFORM_LABEL[p] ?? p;
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

async function main() {
  const clientName = AGENCY === 'anderson' ? 'Sample Brand' : 'Safestop';
  const sampleUrl =
    AGENCY === 'anderson'
      ? 'https://cortex.andersoncollaborative.com/connect/invite/SAMPLE-TOKEN-VISUAL-QA-ONLY'
      : 'https://cortex.nativz.io/connect/invite/SAMPLE-TOKEN-VISUAL-QA-ONLY';

  console.log(`Sending sample connection-invite to ${TO}`);
  console.log(`  agency:    ${AGENCY}`);
  console.log(`  client:    ${clientName}`);
  console.log(`  platforms: ${PLATFORMS.join(', ')}`);

  const resend = new Resend(process.env.RESEND_API_KEY!);
  const html = inviteHtml({
    clientName,
    url: sampleUrl,
    platforms: PLATFORMS,
    brand: AGENCY,
  });

  const { data, error } = await resend.emails.send({
    from: getFromAddress(AGENCY),
    replyTo: getReplyTo(AGENCY),
    to: TO,
    subject: `${clientName}: connect your accounts (visual QA)`,
    html,
  });

  if (error) {
    console.error('Send failed:', error);
    process.exit(1);
  }
  console.log(`Sent. resend_id=${data?.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

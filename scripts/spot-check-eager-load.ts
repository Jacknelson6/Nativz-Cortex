/**
 * Spot-check the eager-load on /admin/clients/[slug]/settings/info.
 *
 * Mints a Supabase session for jack@nativz.io server-side, injects the auth
 * cookie into Playwright, navigates to the info page, and reports:
 *   - whether contact emails appear in the SSR'd HTML payload
 *   - whether invite URLs appear in the SSR'd HTML payload
 *   - whether the contacts API was hit during hydration (it shouldn't be)
 *
 * Usage: npx tsx scripts/spot-check-eager-load.ts [client-slug]
 */

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load .env.local without pulling dotenv as a dep.
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const SLUG = process.argv[2] ?? 'toastique';
const EMAIL = 'jack@nativz.io';
const ORIGIN = 'http://localhost:3001';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PROJECT_REF = SUPABASE_URL.match(/\/\/([a-z0-9-]+)\.supabase\.co/)![1];
const COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`;

(async () => {
  // 1. Server-side: mint a magic link, then verify it to get a real session.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: EMAIL,
  });
  if (linkErr || !linkData.properties?.hashed_token) {
    throw new Error(`generateLink failed: ${linkErr?.message ?? 'no hashed_token'}`);
  }
  const anonClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data: sessionData, error: verifyErr } = await anonClient.auth.verifyOtp({
    type: 'magiclink',
    token_hash: linkData.properties.hashed_token,
  });
  if (verifyErr || !sessionData.session) {
    throw new Error(`verifyOtp failed: ${verifyErr?.message ?? 'no session'}`);
  }
  const { access_token, refresh_token } = sessionData.session;
  console.log(`Minted session for ${EMAIL} (sub: ${sessionData.session.user.id})`);

  // 2. Format the cookie payload the way @supabase/ssr expects: a base64-encoded
  //    JSON array prefixed with `base64-`.
  const cookieValue =
    'base64-' +
    Buffer.from(
      JSON.stringify({
        access_token,
        refresh_token,
        expires_at: sessionData.session.expires_at,
        expires_in: sessionData.session.expires_in,
        token_type: 'bearer',
        user: sessionData.session.user,
      }),
    ).toString('base64');

  // 3. Drive Playwright with the cookie pre-injected.
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addCookies([
    {
      name: COOKIE_NAME,
      value: cookieValue,
      url: ORIGIN,
      httpOnly: false,
      sameSite: 'Lax',
    },
  ]);
  const page = await ctx.newPage();

  const apiHits: { url: string; method: string }[] = [];
  page.on('request', (req) => {
    const u = req.url();
    if (
      u.includes('/api/clients/') ||
      u.includes('/api/invites') ||
      u.includes('/api/scheduler')
    ) {
      apiHits.push({ url: u, method: req.method() });
    }
  });

  const start = Date.now();
  const response = await page.goto(`${ORIGIN}/admin/clients/${SLUG}/settings/info`, {
    waitUntil: 'domcontentloaded',
  });
  const ttfbDom = Date.now() - start;
  const html = await response!.text();
  console.log(
    `Status: ${response!.status()}, TTFB+DOM: ${ttfbDom}ms, HTML bytes: ${html.length}`,
  );

  if (response!.status() !== 200) {
    console.error('Non-200 — likely auth issue. First 500 bytes of HTML:');
    console.error(html.slice(0, 500));
  }

  // Spot-check: emails + invite URLs in the SSR payload prove the eager-load.
  const emailMatches = html.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
  const inviteUrlMatches = html.match(/\/join\/[A-Za-z0-9_-]{20,}/g) ?? [];
  const sampleEmails = [...new Set(emailMatches)].slice(0, 12);
  console.log(`Emails in initial HTML: ${sampleEmails.length} unique`);
  console.log(`  → ${sampleEmails.join(', ')}`);
  console.log(`Invite URLs in initial HTML: ${inviteUrlMatches.length} matches`);
  console.log(`  → ${inviteUrlMatches.slice(0, 3).join(', ')}`);

  // Now wait for the client to finish hydrating; the contacts card should NOT
  // re-fetch contacts/invites (only portal-users still fetches client-side).
  await page.waitForLoadState('networkidle');
  console.log('\nAPI hits during/after hydration:');
  for (const h of apiHits) console.log(`  ${h.method} ${h.url}`);

  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

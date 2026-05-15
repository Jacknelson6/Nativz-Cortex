/**
 * Take a screenshot of the rendered "Search interest over time" chart on a
 * real /finder/[id] page, using a service-role-minted Supabase session
 * injected into Playwright as cookies. Skips needing Jack's password.
 */

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal } from './load-env-local';
import { writeFileSync } from 'fs';

loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
const cookieName = `sb-${projectRef}-auth-token`;

async function main() {
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: 'jack@nativz.io',
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    console.error('generateLink failed:', linkErr);
    process.exit(1);
  }

  const anonClient = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: verifyData, error: verifyErr } = await anonClient.auth.verifyOtp({
    type: 'magiclink',
    token_hash: linkData.properties.hashed_token,
  });
  if (verifyErr || !verifyData?.session) {
    console.error('verifyOtp failed:', verifyErr);
    process.exit(1);
  }

  const session = verifyData.session;
  const cookieValue = `base64-${Buffer.from(JSON.stringify({
    access_token: session.access_token,
    token_type: 'bearer',
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  })).toString('base64')}`;

  const searchId = process.argv[2] ?? 'bb46026b-bd5d-43be-8037-c17e6bbf00ee';
  const outPath = process.argv[3] ?? '/tmp/trends-chart.png';

  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addCookies([
      {
        name: cookieName,
        value: cookieValue,
        domain: 'localhost',
        path: '/',
        httpOnly: false,
        secure: false,
        sameSite: 'Lax',
      },
    ]);
    const page = await ctx.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') console.log('[browser-error]', m.text());
    });

    const url = `http://localhost:3001/finder/${searchId}`;
    console.log(`→ ${url}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for the new chart heading
    const heading = page.getByRole('heading', { name: /Search interest over time/i });
    await heading.waitFor({ timeout: 20000 });
    console.log('  found heading "Search interest over time"');

    // Wait for the recharts SVG inside that card
    const card = heading.locator('xpath=ancestor::*[contains(@class, "rounded-xl") or contains(@class, "card")][1]').first();
    await card.locator('svg').first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(2500);

    // Dump the JSON the chart actually rendered with
    const payload = await page.evaluate(async () => {
      const url = window.location.pathname.replace('/finder/', '/api/search/') + '/google-trends';
      const r = await fetch(url);
      const j = await r.json();
      return {
        status: r.status,
        pointCount: j?.trends?.points?.length ?? 0,
        firstDate: j?.trends?.points?.[0]?.date,
        lastDate: j?.trends?.points?.[j?.trends?.points?.length - 1]?.date,
        lastSmoothed: j?.trends?.points?.[j?.trends?.points?.length - 1]?.smoothed,
      };
    });
    console.log('  API check from browser:', JSON.stringify(payload));

    const buf = await card.screenshot();
    writeFileSync(outPath, buf);
    console.log(`  screenshot → ${outPath}`);
  } finally {
    await browser.close();
  }
}

void main().catch((err) => {
  console.error('FAILED', err);
  process.exit(1);
});

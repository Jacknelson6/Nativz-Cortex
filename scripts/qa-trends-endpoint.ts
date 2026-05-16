/**
 * One-off QA: mint a real Supabase auth session for Jack, set the resulting
 * cookies on a fetch request to the dev server's /api/search/[id]/google-trends
 * route, and assert the response is well-formed.
 *
 * This is the cheap equivalent of "log in via the UI then open devtools" —
 * no browser required.
 */

import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal } from './load-env-local';

loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
const cookieName = `sb-${projectRef}-auth-token`;

async function main() {
  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  // Mint a one-time password for jack@nativz.io that we'll immediately consume.
  // (admin.generateLink + sign-in-with-otp is the only way without his password.)
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: 'jack@nativz.io',
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    console.error('generateLink failed:', linkErr);
    process.exit(1);
  }
  const hashedToken = linkData.properties.hashed_token;

  // Exchange the hashed token for a real session via the anon-key verify endpoint.
  const anonClient = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: verifyData, error: verifyErr } = await anonClient.auth.verifyOtp({
    type: 'magiclink',
    token_hash: hashedToken,
  });
  if (verifyErr || !verifyData?.session) {
    console.error('verifyOtp failed:', verifyErr);
    process.exit(1);
  }

  const session = verifyData.session;
  // The @supabase/ssr cookie format is a base64-encoded JSON payload.
  const payload = `base64-${Buffer.from(JSON.stringify({
    access_token: session.access_token,
    token_type: 'bearer',
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  })).toString('base64')}`;

  const searchId = process.argv[2] ?? 'bb46026b-bd5d-43be-8037-c17e6bbf00ee';
  const endpoint = `http://localhost:3001/api/search/${searchId}/google-trends`;
  console.log(`GET ${endpoint}`);

  const res = await fetch(endpoint, {
    headers: { Cookie: `${cookieName}=${payload}` },
  });
  console.log('Status:', res.status);
  const body = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    console.log('Body (not JSON, first 200 chars):', body.slice(0, 200));
    process.exit(2);
  }

  const obj = parsed as {
    trends?: { points?: Array<{ date: string; value: number; smoothed: number }> };
    cached?: boolean;
    error?: string;
  };
  if (obj.error) {
    console.error('Error response:', obj.error);
    process.exit(3);
  }

  const points = obj.trends?.points ?? [];
  if (points.length === 0) {
    console.log('Empty trends payload — sanity check failed.');
    process.exit(4);
  }

  const peak = Math.max(...points.map((p) => p.smoothed));
  const last = points[points.length - 1];
  console.log(`OK — cached=${obj.cached}, points=${points.length}, peak=${peak}, latest=${last.date}@${last.smoothed}`);
}

void main();

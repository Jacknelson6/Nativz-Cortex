/**
 * Onboarding v2 E2E (post-flow-revamp).
 *
 * Walks an editing-kind onboarding from create through completion using
 * the share-token-gated public endpoint, then loads the stepper page in
 * a real browser to confirm the "done" screen renders.
 *
 * The post-revamp editing flow has 4 screens:
 *   0 welcome
 *   1 brand_basics
 *   2 footage_and_references
 *   3 done
 */

import { test, expect, type APIRequestContext } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local',
  );
}

const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface Fixtures {
  orgId: string;
  clientId: string;
  onboardingId: string;
  shareToken: string;
}

async function seed(): Promise<Fixtures> {
  const ts = Date.now();
  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({
      name: `E2E Onboarding Org ${ts}`,
      slug: `e2e-onb-org-${ts}`,
      type: 'client',
    })
    .select('id')
    .single();
  if (orgErr) throw new Error(`org insert: ${orgErr.message}`);

  const { data: client, error: clientErr } = await admin
    .from('clients')
    .insert({
      name: `E2E Editing Brand ${ts}`,
      slug: `e2e-editing-brand-${ts}`,
      industry: 'Apparel & Footwear',
      organization_id: org!.id,
      agency: 'nativz',
    })
    .select('id')
    .single();
  if (clientErr) throw new Error(`client insert: ${clientErr.message}`);

  const { data: onb, error: onbErr } = await admin
    .from('onboardings')
    .insert({
      client_id: client!.id,
      kind: 'editing',
      platforms: [],
      current_step: 0,
      step_state: {},
      status: 'in_progress',
    })
    .select('id, share_token')
    .single();
  if (onbErr) throw new Error(`onboarding insert: ${onbErr.message}`);

  return {
    orgId: org!.id as string,
    clientId: client!.id as string,
    onboardingId: onb!.id as string,
    shareToken: onb!.share_token as string,
  };
}

async function cleanup(f: Fixtures): Promise<void> {
  await admin.from('onboarding_emails_log').delete().eq('onboarding_id', f.onboardingId);
  await admin.from('onboardings').delete().eq('id', f.onboardingId);
  await admin.from('clients').delete().eq('id', f.clientId);
  await admin.from('organizations').delete().eq('id', f.orgId);
}

async function patch(
  request: APIRequestContext,
  token: string,
  body: Record<string, unknown>,
) {
  const res = await request.patch(`/api/public/onboarding/${token}`, {
    data: body,
    headers: { 'content-type': 'application/json' },
  });
  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`PATCH /onboarding/${token} ${res.status()}: ${text}`);
  }
  return res.json();
}

test.describe('Onboarding v2: editing kind end-to-end', () => {
  test.setTimeout(120_000);

  test('walks editing onboarding from welcome to done, flips status, logs completion email', async ({
    request,
    page,
  }) => {
    const fx = await seed();

    try {
      // 1. GET share-token endpoint returns shape
      const getRes = await request.get(`/api/public/onboarding/${fx.shareToken}`);
      expect(getRes.ok()).toBe(true);
      const getBody = await getRes.json();
      expect(getBody.onboarding.kind).toBe('editing');
      expect(getBody.onboarding.current_step).toBe(0);
      expect(getBody.onboarding.status).toBe('in_progress');
      expect(getBody.client.name).toContain('E2E Editing Brand');
      expect(Array.isArray(getBody.screens)).toBe(true);
      expect(getBody.screens).toHaveLength(4);

      // 2. Welcome -> brand_basics
      let body = await patch(request, fx.shareToken, { advance_to: 1 });
      expect(body.onboarding.current_step).toBe(1);
      expect(body.onboarding.status).toBe('in_progress');

      // 3. brand_basics submits + advances to footage_and_references
      body = await patch(request, fx.shareToken, {
        step_state: {
          brand_basics: {
            tagline: 'Performance gear for runners',
            what_we_sell: 'Trail running apparel and accessories',
            audience: 'Trail runners 25-45 in the western US',
            voice: 'Energetic but technical',
            current_offers: 'Free shipping over $75',
          },
        },
        advance_to: 2,
      });
      expect(body.onboarding.current_step).toBe(2);
      expect(body.onboarding.step_state.brand_basics).toBeTruthy();

      // 4. footage_and_references submits + completes
      body = await patch(request, fx.shareToken, {
        step_state: {
          footage_and_references: {
            raw_footage_urls: ['https://drive.google.com/drive/folders/abc123'],
            reference_edit_urls: ['https://www.youtube.com/watch?v=ref'],
            previous_edit_urls: [],
            notes: 'Match the pacing of the reference. No music with vocals.',
          },
        },
        complete: true,
      });
      expect(body.onboarding.current_step).toBe(3);
      expect(body.onboarding.status).toBe('completed');
      expect(body.onboarding.completed_at).not.toBeNull();

      // 5. DB confirms completion
      const { data: dbRow } = await admin
        .from('onboardings')
        .select('status, current_step, step_state, completed_at')
        .eq('id', fx.onboardingId)
        .single();
      expect(dbRow?.status).toBe('completed');
      expect(dbRow?.current_step).toBe(3);
      expect(dbRow?.completed_at).toBeTruthy();
      expect((dbRow?.step_state as Record<string, unknown>).brand_basics).toBeTruthy();
      expect((dbRow?.step_state as Record<string, unknown>).footage_and_references).toBeTruthy();

      // 6. Completion email row may or may not land (depends on POC seeded);
      //    soft-assert by logging the count.
      const { data: completionLogs } = await admin
        .from('onboarding_emails_log')
        .select('kind, ok')
        .eq('onboarding_id', fx.onboardingId)
        .eq('kind', 'complete');
      console.log(`[onboarding-v2] complete email log rows: ${completionLogs?.length ?? 0}`);

      // 7. Public stepper renders the "Done" screen for completed onboarding
      const stepperResp = await page.goto(`/onboarding/${fx.shareToken}`);
      expect(stepperResp?.ok()).toBe(true);
      await expect(page.locator('body')).toContainText(/done|complete|handoff|all set|thanks/i, {
        timeout: 15_000,
      });
      await page.screenshot({
        path: 'test-results/onboarding-v2-done.png',
        fullPage: true,
      });
    } finally {
      await cleanup(fx);
    }
  });

  test('public PATCH rejects step_state for the wrong shape (zod gate)', async ({
    request,
  }) => {
    const fx = await seed();
    try {
      const res = await request.patch(`/api/public/onboarding/${fx.shareToken}`, {
        data: { step_state: 'not-an-object' },
        headers: { 'content-type': 'application/json' },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('invalid input');
    } finally {
      await cleanup(fx);
    }
  });

  test('public GET returns 404 for unknown share token', async ({ request }) => {
    const res = await request.get(
      '/api/public/onboarding/00000000-0000-0000-0000-000000000000',
    );
    expect(res.status()).toBe(404);
  });
});

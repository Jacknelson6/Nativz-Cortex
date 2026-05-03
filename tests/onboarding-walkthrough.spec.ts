/**
 * Onboarding v2 visual walkthrough.
 *
 * Captures every screen of both onboarding kinds (smm and editing) plus
 * the admin-side surfaces. Output lands in test-results/onboarding-walkthrough/.
 *
 * Coverage:
 *   - Public stepper (no auth): 7 SMM screens + 5 editing screens, full page
 *   - Admin tracker (/admin/onboarding) authed via magic link
 *   - Admin add-modal (closed roster + open dialog states)
 *   - Admin detail page (/admin/onboarding/[id])
 *
 * The spec seeds its own org/client/onboarding rows and cleans up after
 * itself. It uses the supabase admin generateLink to get a real session
 * for jack@nativz.io rather than fabricating cookies.
 */

import { test, type Page, type APIRequestContext } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SHOT_DIR = 'test-results/onboarding-walkthrough';

interface SeedRow {
  orgId: string;
  clientId: string;
  onboardingId: string;
  shareToken: string;
}

async function seedOnboarding(opts: {
  kind: 'smm' | 'editing';
  brand: string;
  platforms?: string[];
}): Promise<SeedRow> {
  const ts = Date.now();
  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({
      name: `Walkthrough ${opts.brand} ${ts}`,
      slug: `walkthrough-${opts.kind}-${ts}`,
      type: 'client',
    })
    .select('id')
    .single();
  if (orgErr) throw new Error(`org insert: ${orgErr.message}`);

  const { data: client, error: clientErr } = await admin
    .from('clients')
    .insert({
      name: opts.brand,
      slug: `walkthrough-${opts.kind}-brand-${ts}`,
      industry: opts.kind === 'smm' ? 'Apparel & Footwear' : 'Media & Entertainment',
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
      kind: opts.kind,
      platforms: opts.platforms ?? [],
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

async function cleanup(rows: SeedRow[]): Promise<void> {
  for (const r of rows) {
    await admin.from('onboarding_emails_log').delete().eq('onboarding_id', r.onboardingId);
    await admin.from('onboardings').delete().eq('id', r.onboardingId);
    await admin.from('clients').delete().eq('id', r.clientId);
    await admin.from('organizations').delete().eq('id', r.orgId);
  }
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
    throw new Error(`PATCH ${token} ${res.status()}: ${text}`);
  }
  return res.json();
}

async function shoot(page: Page, name: string) {
  await page.waitForTimeout(350);
  await page.screenshot({
    path: `${SHOT_DIR}/${name}.png`,
    fullPage: true,
  });
}

interface TempAdmin {
  authId: string;
  email: string;
  password: string;
}

async function createTempAdmin(): Promise<TempAdmin> {
  // Spin up a one-shot admin user we can sign in with via the normal
  // login form. We delete it in afterAll. This keeps the spec from
  // touching jack@nativz.io's real session.
  const ts = Date.now();
  const email = `walkthrough+admin-${ts}@nativz.io`;
  const password = `walkthrough-${ts}-NPx7!aQ`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) throw new Error(`createUser: ${createErr?.message}`);
  const { error: rowErr } = await admin.from('users').insert({
    id: created.user.id,
    email,
    full_name: 'Walkthrough Admin',
    role: 'admin',
    is_owner: false,
    is_super_admin: false,
    is_active: true,
    hidden_sidebar_items: [],
  });
  if (rowErr) throw new Error(`users insert: ${rowErr.message}`);
  return { authId: created.user.id, email, password };
}

async function deleteTempAdmin(t: TempAdmin | null): Promise<void> {
  if (!t) return;
  await admin.from('users').delete().eq('id', t.authId);
  await admin.auth.admin.deleteUser(t.authId);
}

async function adminLogin(page: Page, creds: TempAdmin) {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', creds.email);
  await page.fill('input[type="password"]', creds.password);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(/\/admin\//, { timeout: 15_000 });
}

test.describe('Onboarding v2 walkthrough', () => {
  test.setTimeout(180_000);
  test.describe.configure({ mode: 'serial' });

  const seeded: SeedRow[] = [];
  let tempAdmin: TempAdmin | null = null;

  test.afterAll(async () => {
    await cleanup(seeded);
    await deleteTempAdmin(tempAdmin);
  });

  test('SMM kind, all 7 screens', async ({ page, request }) => {
    const fx = await seedOnboarding({
      kind: 'smm',
      brand: 'Northwind Apparel',
      platforms: ['tiktok', 'instagram', 'youtube'],
    });
    seeded.push(fx);

    // 1. welcome
    await page.goto(`/onboarding/${fx.shareToken}`);
    await page.waitForLoadState('networkidle');
    await shoot(page, 'smm-1-welcome');

    // 2. brand_basics: fill in client-side via the form, screenshot, then advance via API + reload
    await page.click('button:has-text("Get started")');
    await page.waitForTimeout(500);
    await page.fill('#tagline', 'Modern essentials, made to last.');
    await page.fill('#what_we_sell', 'DTC apparel: technical basics for everyday wear, built in Portugal.');
    await page.fill('#audience', '25-40 urban professionals who buy quality over quantity. Lurkers on TikTok, buyers on Instagram.');
    await page.fill('#voice', 'Confident, considered, dry humor. Never preachy.');
    await shoot(page, 'smm-2-brand-basics');

    await patch(request, fx.shareToken, {
      step_state: {
        brand_basics: {
          tagline: 'Modern essentials, made to last.',
          what_we_sell: 'DTC apparel: technical basics for everyday wear, built in Portugal.',
          audience: '25-40 urban professionals who buy quality over quantity. Lurkers on TikTok, buyers on Instagram.',
          voice: 'Confident, considered, dry humor. Never preachy.',
        },
      },
      advance_to: 2,
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    // 3. social_connect
    await page.fill('input#tiktok-handle', '@northwindapparel');
    await page.fill('input#tiktok-url', 'https://tiktok.com/@northwindapparel');
    await page.fill('input#instagram-handle', '@northwind.apparel');
    await page.fill('input#instagram-url', 'https://instagram.com/northwind.apparel');
    await page.fill('input#youtube-handle', '@northwindapparel');
    await shoot(page, 'smm-3-social-connect');

    await patch(request, fx.shareToken, {
      step_state: {
        social_handles: {
          handles: {
            tiktok: { handle: '@northwindapparel', url: 'https://tiktok.com/@northwindapparel' },
            instagram: { handle: '@northwind.apparel', url: 'https://instagram.com/northwind.apparel' },
            youtube: { handle: '@northwindapparel', url: '' },
          },
        },
      },
      advance_to: 3,
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    // 4. content_prefs
    await page.click('button[aria-pressed="true"], button:has-text("3")').catch(() => {});
    await shoot(page, 'smm-4-content-prefs');

    await patch(request, fx.shareToken, {
      step_state: {
        content_prefs: {
          cadence_per_week: 3,
          pillars: ['Product education', 'Behind the seams', 'Customer stories'],
          avoid: 'Anything political, no fast-fashion comparisons, no discount messaging.',
        },
      },
      advance_to: 4,
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    // 5. audience_tone
    await shoot(page, 'smm-5-audience-tone');
    await patch(request, fx.shareToken, {
      step_state: {
        audience_tone: {
          persona:
            'Mid-30s creative professional. Owns a few good things, hates clutter. Buys once, expects it to last.',
          tones: ['confident', 'down-to-earth', 'witty', 'premium'],
        },
      },
      advance_to: 5,
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    // 6. kickoff_pick
    await shoot(page, 'smm-6-kickoff-pick');
    await patch(request, fx.shareToken, {
      step_state: {
        kickoff_pick: {
          preferred_date: '2026-05-08',
          preferred_time: '10:00',
          notes: 'Mornings are best, anything before noon Pacific.',
        },
      },
      complete: true,
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    // 7. done
    await shoot(page, 'smm-7-done');
  });

  test('Editing kind, all 5 screens', async ({ page, request }) => {
    const fx = await seedOnboarding({
      kind: 'editing',
      brand: 'Atlas Studios',
    });
    seeded.push(fx);

    // 1. welcome
    await page.goto(`/onboarding/${fx.shareToken}`);
    await page.waitForLoadState('networkidle');
    await shoot(page, 'editing-1-welcome');

    // 2. project_brief
    await page.click('button:has-text("Get started")');
    await page.waitForTimeout(500);
    await shoot(page, 'editing-2-project-brief');

    await patch(request, fx.shareToken, {
      step_state: {
        project_brief: {
          description:
            'We need a 30-second hero spot cut from runway footage shot at the Atlas SS26 show, plus three 15s vertical pulls for paid social.',
          target_count: 4,
          references: [
            'https://example.com/reference-spot-1',
            'https://example.com/reference-spot-2',
          ],
        },
      },
      advance_to: 2,
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    // 3. asset_link
    await shoot(page, 'editing-3-asset-link');
    await patch(request, fx.shareToken, {
      step_state: {
        asset_link: {
          url: 'https://drive.google.com/drive/folders/atlas-ss26-runway',
          provider: 'Google Drive',
          notes: 'Folder is public-link enabled. Camera A is hero, B is detail, C is crowd reactions.',
        },
      },
      advance_to: 3,
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    // 4. turnaround_ack
    await shoot(page, 'editing-4-turnaround-ack');
    await patch(request, fx.shareToken, {
      step_state: {
        turnaround_ack: {
          acknowledged: true,
          acknowledged_at: new Date().toISOString(),
        },
      },
      complete: true,
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    // 5. done
    await shoot(page, 'editing-5-done');
  });

  test('Admin tracker + add modal + detail', async ({ page }) => {
    tempAdmin = await createTempAdmin();
    await adminLogin(page, tempAdmin);

    // Seed one in-flight onboarding so the tracker isn't an empty state
    // (the SMM and editing seeds above both finish completion).
    const liveFx = await seedOnboarding({
      kind: 'smm',
      brand: 'Greyfield Coffee',
      platforms: ['tiktok', 'instagram'],
    });
    seeded.push(liveFx);
    // Advance one step so the progress bar has visible fill.
    await admin
      .from('onboardings')
      .update({ current_step: 2 })
      .eq('id', liveFx.onboardingId);

    await page.goto('/admin/onboarding', { waitUntil: 'networkidle' });
    await shoot(page, 'admin-1-tracker');

    // open the new-onboarding modal
    const newBtn = page.locator('button:has-text("New onboarding")').first();
    if (await newBtn.count()) {
      await newBtn.click();
      await page.waitForTimeout(600);
      await shoot(page, 'admin-2-new-modal');
      await page.keyboard.press('Escape');
    }

    // detail page for one of the seeded onboardings
    if (seeded.length > 0) {
      await page.goto(`/admin/onboarding/${seeded[0].onboardingId}`, {
        waitUntil: 'networkidle',
      });
      await shoot(page, 'admin-3-detail-smm');
    }
    if (seeded.length > 1) {
      await page.goto(`/admin/onboarding/${seeded[1].onboardingId}`, {
        waitUntil: 'networkidle',
      });
      await shoot(page, 'admin-4-detail-editing');
    }
  });
});

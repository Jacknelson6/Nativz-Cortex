/**
 * Onboarding v2 visual walkthrough.
 *
 * Captures every screen of both onboarding kinds (smm and editing) plus
 * the admin-side surfaces. Output lands in test-results/onboarding-walkthrough/.
 *
 * Coverage:
 *   - Public stepper (no auth): 5 SMM screens + 4 editing screens, full page
 *   - Admin tracker (/admin/onboarding) authed via temp admin user
 *   - Admin add-modal (closed roster + open dialog states)
 *   - Admin detail page (/admin/onboarding/[id])
 *
 * The spec seeds its own org/client/onboarding rows and cleans up after
 * itself.
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
    await admin.from('contacts').delete().eq('client_id', r.clientId);
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

const SMM_BRAND_BASICS = {
  tagline: 'Modern essentials, made to last.',
  what_we_sell: 'DTC apparel: technical basics for everyday wear, built in Portugal.',
  audience:
    '25-40 urban professionals who buy quality over quantity. Lurkers on TikTok, buyers on Instagram.',
  voice: 'Confident, considered, dry humor. Never preachy.',
  current_offers: 'Free shipping over $100. 30-day returns. Annual restock list email.',
};

const EDITING_BRAND_BASICS = {
  tagline: 'Cinematic stories for ambitious brands.',
  what_we_sell: 'Brand films, runway recap edits, and short-form social cuts.',
  audience: 'Emerging fashion houses and indie labels building their world online.',
  voice: 'Editorial, cinematic, no fluff.',
  current_offers: 'Quarterly retainer with 4 deliverables a month.',
};

test.describe('Onboarding v2 walkthrough', () => {
  test.setTimeout(180_000);
  test.describe.configure({ mode: 'serial' });

  const seeded: SeedRow[] = [];
  let tempAdmin: TempAdmin | null = null;

  test.afterAll(async () => {
    await cleanup(seeded);
    await deleteTempAdmin(tempAdmin);
  });

  test('SMM kind, all 5 screens', async ({ page, request }) => {
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
    await page.fill('#tagline', SMM_BRAND_BASICS.tagline);
    await page.fill('#what_we_sell', SMM_BRAND_BASICS.what_we_sell);
    await page.fill('#audience', SMM_BRAND_BASICS.audience);
    await page.fill('#voice', SMM_BRAND_BASICS.voice);
    await page.fill('#current_offers', SMM_BRAND_BASICS.current_offers);
    await shoot(page, 'smm-2-brand-basics');

    await patch(request, fx.shareToken, {
      step_state: { brand_basics: SMM_BRAND_BASICS },
      advance_to: 2,
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    // 3. social_connect (tri-state platform tiles + Meta Business Suite tile)
    await page.waitForTimeout(500);
    await shoot(page, 'smm-3-social-connect');

    await patch(request, fx.shareToken, {
      step_state: {
        social_handles: {
          handles: {
            tiktok: {
              handle: '@northwindapparel',
              url: 'https://tiktok.com/@northwindapparel',
              status: 'manual',
            },
            instagram: {
              handle: '@northwind.apparel',
              url: 'https://instagram.com/northwind.apparel',
              status: 'manual',
            },
            youtube: {
              handle: '@northwindapparel',
              url: '',
              status: 'manual',
            },
          },
          meta_business_suite_acknowledged: true,
        },
      },
      advance_to: 3,
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    // 4. points_of_contact
    await page.waitForTimeout(500);
    await shoot(page, 'smm-4-points-of-contact');

    await patch(request, fx.shareToken, {
      step_state: {
        points_of_contact: {
          contacts: [
            {
              name: 'Riya Anand',
              email: 'riya@northwind.test',
              role: 'Marketing lead',
              is_primary: true,
            },
            {
              name: 'Marcus Lee',
              email: 'marcus@northwind.test',
              role: 'Founder',
              is_primary: false,
            },
          ],
        },
      },
      complete: true,
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    // 5. done
    await shoot(page, 'smm-5-done');
  });

  test('Editing kind, all 4 screens', async ({ page, request }) => {
    const fx = await seedOnboarding({
      kind: 'editing',
      brand: 'Atlas Studios',
    });
    seeded.push(fx);

    // 1. welcome
    await page.goto(`/onboarding/${fx.shareToken}`);
    await page.waitForLoadState('networkidle');
    await shoot(page, 'editing-1-welcome');

    // 2. brand_basics
    await page.click('button:has-text("Get started")');
    await page.waitForTimeout(500);
    await page.fill('#tagline', EDITING_BRAND_BASICS.tagline);
    await page.fill('#what_we_sell', EDITING_BRAND_BASICS.what_we_sell);
    await page.fill('#audience', EDITING_BRAND_BASICS.audience);
    await page.fill('#voice', EDITING_BRAND_BASICS.voice);
    await page.fill('#current_offers', EDITING_BRAND_BASICS.current_offers);
    await shoot(page, 'editing-2-brand-basics');

    await patch(request, fx.shareToken, {
      step_state: { brand_basics: EDITING_BRAND_BASICS },
      advance_to: 2,
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    // 3. footage_and_references
    await page.waitForTimeout(500);
    await page.fill(
      '#raw-footage',
      'https://drive.google.com/drive/folders/atlas-ss26-runway',
    );
    await page.fill(
      '#reference-edits',
      'https://www.youtube.com/watch?v=ref-1\nhttps://www.youtube.com/watch?v=ref-2',
    );
    await page.fill(
      '#previous-edits',
      'https://www.youtube.com/watch?v=prev-1',
    );
    await page.fill(
      '#footage-notes',
      'Camera A is hero, B is detail, C is crowd reactions. Match the pacing of the references. No music with vocals.',
    );
    await shoot(page, 'editing-3-footage-and-references');

    await patch(request, fx.shareToken, {
      step_state: {
        footage_and_references: {
          raw_footage_urls: ['https://drive.google.com/drive/folders/atlas-ss26-runway'],
          reference_edit_urls: [
            'https://www.youtube.com/watch?v=ref-1',
            'https://www.youtube.com/watch?v=ref-2',
          ],
          previous_edit_urls: ['https://www.youtube.com/watch?v=prev-1'],
          notes:
            'Camera A is hero, B is detail, C is crowd reactions. Match the pacing of the references. No music with vocals.',
        },
      },
      complete: true,
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    // 4. done
    await shoot(page, 'editing-4-done');
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

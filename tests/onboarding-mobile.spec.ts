/**
 * Mobile (iPhone 14 Pro) walkthrough of the public onboarding stepper.
 *
 * Captures every screen at 390x844 so we can audit the client-facing
 * surfaces against `.impeccable.md` mobile expectations. Admin surfaces
 * are desktop-only by design and skipped here.
 *
 * Output: test-results/onboarding-walkthrough/mobile-*.png
 */

import { test, type Page, type APIRequestContext } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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
      name: `MobileWalk ${opts.brand} ${ts}`,
      slug: `mobilewalk-${opts.kind}-${ts}`,
      type: 'client',
    })
    .select('id')
    .single();
  if (orgErr) throw new Error(`org insert: ${orgErr.message}`);

  const { data: client, error: clientErr } = await admin
    .from('clients')
    .insert({
      name: opts.brand,
      slug: `mobilewalk-${opts.kind}-brand-${ts}`,
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

test.describe('Onboarding mobile walkthrough', () => {
  test.setTimeout(180_000);
  test.describe.configure({ mode: 'serial' });
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  const seeded: SeedRow[] = [];

  test.afterAll(async () => {
    await cleanup(seeded);
  });

  test('SMM mobile, all 5 screens', async ({ page, request }) => {
    const fx = await seedOnboarding({
      kind: 'smm',
      brand: 'Northwind Apparel',
      platforms: ['tiktok', 'instagram', 'youtube'],
    });
    seeded.push(fx);

    await page.goto(`/onboarding/${fx.shareToken}`);
    await page.waitForLoadState('networkidle');
    await shoot(page, 'mobile-smm-1-welcome');

    await page.click('button:has-text("Get started")');
    await page.waitForTimeout(500);
    await page.fill('#tagline', SMM_BRAND_BASICS.tagline);
    await page.fill('#what_we_sell', SMM_BRAND_BASICS.what_we_sell);
    await page.fill('#audience', SMM_BRAND_BASICS.audience);
    await page.fill('#voice', SMM_BRAND_BASICS.voice);
    await page.fill('#current_offers', SMM_BRAND_BASICS.current_offers);
    await shoot(page, 'mobile-smm-2-brand-basics');

    await patch(request, fx.shareToken, {
      step_state: { brand_basics: SMM_BRAND_BASICS },
      advance_to: 2,
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    await page.waitForTimeout(500);
    await shoot(page, 'mobile-smm-3-social-connect');

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

    await page.waitForTimeout(500);
    await shoot(page, 'mobile-smm-4-points-of-contact');

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
          ],
        },
      },
      complete: true,
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    await shoot(page, 'mobile-smm-5-done');
  });

  test('Editing mobile, all 4 screens', async ({ page, request }) => {
    const fx = await seedOnboarding({
      kind: 'editing',
      brand: 'Atlas Studios',
    });
    seeded.push(fx);

    await page.goto(`/onboarding/${fx.shareToken}`);
    await page.waitForLoadState('networkidle');
    await shoot(page, 'mobile-editing-1-welcome');

    await page.click('button:has-text("Get started")');
    await page.waitForTimeout(500);
    await page.fill('#tagline', EDITING_BRAND_BASICS.tagline);
    await page.fill('#what_we_sell', EDITING_BRAND_BASICS.what_we_sell);
    await page.fill('#audience', EDITING_BRAND_BASICS.audience);
    await page.fill('#voice', EDITING_BRAND_BASICS.voice);
    await page.fill('#current_offers', EDITING_BRAND_BASICS.current_offers);
    await shoot(page, 'mobile-editing-2-brand-basics');

    await patch(request, fx.shareToken, {
      step_state: { brand_basics: EDITING_BRAND_BASICS },
      advance_to: 2,
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    await page.waitForTimeout(500);
    await page.fill(
      '#raw-footage',
      'https://drive.google.com/drive/folders/atlas-ss26-runway',
    );
    await page.fill(
      '#reference-edits',
      'https://www.youtube.com/watch?v=ref-1\nhttps://www.youtube.com/watch?v=ref-2',
    );
    await page.fill('#previous-edits', 'https://www.youtube.com/watch?v=prev-1');
    await page.fill(
      '#footage-notes',
      'Camera A is hero, B is detail, C is crowd reactions. Match the pacing of the references. No music with vocals.',
    );
    await shoot(page, 'mobile-editing-3-footage-and-references');

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

    await shoot(page, 'mobile-editing-4-done');
  });
});

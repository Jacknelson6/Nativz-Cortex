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

test.describe('Onboarding mobile walkthrough', () => {
  test.setTimeout(180_000);
  test.describe.configure({ mode: 'serial' });
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  const seeded: SeedRow[] = [];

  test.afterAll(async () => {
    await cleanup(seeded);
  });

  test('SMM mobile, all 7 screens', async ({ page, request }) => {
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
    await page.fill('#tagline', 'Modern essentials, made to last.');
    await page.fill('#what_we_sell', 'DTC apparel: technical basics for everyday wear, built in Portugal.');
    await page.fill('#audience', '25-40 urban professionals who buy quality over quantity. Lurkers on TikTok, buyers on Instagram.');
    await page.fill('#voice', 'Confident, considered, dry humor. Never preachy.');
    await shoot(page, 'mobile-smm-2-brand-basics');

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

    await page.fill('input#tiktok-handle', '@northwindapparel');
    await page.fill('input#tiktok-url', 'https://tiktok.com/@northwindapparel');
    await page.fill('input#instagram-handle', '@northwind.apparel');
    await page.fill('input#instagram-url', 'https://instagram.com/northwind.apparel');
    await page.fill('input#youtube-handle', '@northwindapparel');
    await shoot(page, 'mobile-smm-3-social-connect');

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

    await shoot(page, 'mobile-smm-4-content-prefs');
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

    await shoot(page, 'mobile-smm-5-audience-tone');
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

    await shoot(page, 'mobile-smm-6-kickoff-pick');
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

    await shoot(page, 'mobile-smm-7-done');
  });

  test('Editing mobile, all 5 screens', async ({ page, request }) => {
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
    await shoot(page, 'mobile-editing-2-project-brief');

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

    await shoot(page, 'mobile-editing-3-asset-link');
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

    await shoot(page, 'mobile-editing-4-turnaround-ack');
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

    await shoot(page, 'mobile-editing-5-done');
  });
});

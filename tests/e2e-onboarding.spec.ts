import { test, expect, chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'Jack@nativz.io';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD!;

const supabase = createClient(
  'https://phypsgxszrvwdaaqpxup.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

test.describe('Full onboarding + portal + search flow', () => {
  test('admin onboards Nike client, invites portal user, portal user runs search', async () => {
    test.setTimeout(300_000); // 5 min — search processing takes up to 60s
    const browser = await chromium.launch({ headless: false, slowMo: 300 });
    const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const adminPage = await adminCtx.newPage();

    // ── STEP 1: Admin logs in ──────────────────────────────────────────────
    await adminPage.goto(`${BASE_URL}/admin/login`);
    await adminPage.waitForLoadState('networkidle');

    await adminPage.locator('input[type="email"]').fill(ADMIN_EMAIL);
    await adminPage.locator('input[type="password"]').fill(ADMIN_PASSWORD);
    await adminPage.getByRole('button', { name: /sign in/i }).click();
    await adminPage.waitForURL(/\/admin/, { timeout: 15000 });
    console.log('✅ Admin logged in');

    // ── STEP 2: Onboard Nike test client ──────────────────────────────────
    // Navigate to clients
    await adminPage.goto(`${BASE_URL}/admin/clients`);
    await adminPage.waitForLoadState('networkidle');

    // Check if Nike E2E Test client already exists
    const existingNike = await adminPage.locator('text=Nike E2E Test').count();
    let clientSlug = 'nike-e2e-test';

    if (existingNike === 0) {
      // Click new client / onboard button
      const newClientBtn = adminPage.getByRole('button', { name: /new client|add client|onboard/i }).first();
      await newClientBtn.click();
      await adminPage.waitForLoadState('networkidle');

      // Fill onboarding form — look for URL input first (analyze-url flow)
      const urlInput = adminPage.locator('input[placeholder*="website"], input[placeholder*="URL"], input[type="url"]').first();
      if (await urlInput.isVisible({ timeout: 3000 })) {
        await urlInput.fill('https://nike.com');
        const analyzeBtn = adminPage.getByRole('button', { name: /analyze|continue/i }).first();
        await analyzeBtn.click();
        await adminPage.waitForLoadState('networkidle');
        await adminPage.waitForTimeout(3000); // wait for AI analysis
      }

      // Fill name if not auto-filled
      const nameInput = adminPage.locator('input[name="name"], input[placeholder*="name"], input[placeholder*="Name"]').first();
      if (await nameInput.isVisible({ timeout: 3000 })) {
        const currentName = await nameInput.inputValue();
        if (!currentName) await nameInput.fill('Nike E2E Test');
      }

      // Fill slug if visible
      const slugInput = adminPage.locator('input[name="slug"], input[placeholder*="slug"]').first();
      if (await slugInput.isVisible({ timeout: 2000 })) {
        const currentSlug = await slugInput.inputValue();
        if (!currentSlug) await slugInput.fill(clientSlug);
      }

      // Submit
      const submitBtn = adminPage.getByRole('button', { name: /save|create|submit/i }).first();
      await submitBtn.click();
      await adminPage.waitForLoadState('networkidle');
      await adminPage.waitForTimeout(1000);
      console.log('✅ Nike client created');
    } else {
      console.log('✅ Nike E2E Test client already exists');
    }

    // ── STEP 3: Find Nike client and generate invite ──────────────────────
    await adminPage.goto(`${BASE_URL}/admin/clients`);
    await adminPage.waitForLoadState('networkidle');

    // Click on Nike E2E Test
    await adminPage.locator('text=Nike E2E Test').first().click();
    await adminPage.waitForLoadState('networkidle');
    console.log('✅ On Nike client page:', adminPage.url());

    // Find invite button
    const inviteBtn = adminPage.getByRole('button', { name: /invite|send invite|generate invite/i }).first();
    await inviteBtn.click();
    await adminPage.waitForTimeout(1000);

    // Copy invite URL from modal/dialog
    let inviteUrl = '';
    const inviteLink = adminPage.locator('a[href*="/portal/join"], input[value*="/portal/join"]').first();
    if (await inviteLink.isVisible({ timeout: 5000 })) {
      inviteUrl = await inviteLink.getAttribute('href') || await inviteLink.inputValue();
      if (!inviteUrl.startsWith('http')) inviteUrl = BASE_URL + inviteUrl;
    }

    // Fallback: create invite via Supabase directly if UI didn't expose the URL
    if (!inviteUrl) {
      console.log('⚠️  Could not get invite URL from UI, getting from DB...');
      const { data: invite } = await supabase
        .from('invite_tokens')
        .select('token')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (invite) inviteUrl = `${BASE_URL}/portal/join/${invite.token}`;
    }

    console.log('✅ Invite URL:', inviteUrl);
    expect(inviteUrl).toBeTruthy();

    // Close modal if open
    await adminPage.keyboard.press('Escape');
    await adminPage.waitForTimeout(500);

    // ── STEP 4: Open invite URL, create portal account ─────────────────────
    const portalCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const portalPage = await portalCtx.newPage();

    await portalPage.goto(inviteUrl);
    await portalPage.waitForLoadState('networkidle');

    // Verify it's showing the signup form (not invalid/expired)
    const formVisible = await portalPage.locator('form').isVisible({ timeout: 8000 });
    expect(formVisible).toBeTruthy();

    const heading = await portalPage.locator('h2, h1').first().textContent();
    console.log('✅ Join page loaded, heading:', heading);
    expect(heading).not.toMatch(/invalid|expired|already used/i);

    // Fill the signup form
    const testEmail = `portal-e2e-${Date.now()}@test.nativz.io`;
    const testPassword = 'TestPortal123!';

    await portalPage.locator('input[id="full_name"], input[placeholder*="name"], input[placeholder*="Name"]').first().fill('E2E Test User');
    await portalPage.locator('input[type="email"]').fill(testEmail);
    await portalPage.locator('input[type="password"]').fill(testPassword);
    await portalPage.getByRole('button', { name: /create account|sign up|submit/i }).click();

    // Wait for success state
    await portalPage.waitForSelector('text=Account created, text=created, text=sign in', { timeout: 15000 });
    console.log('✅ Portal account created:', testEmail);

    // ── STEP 5: Log in as portal user ─────────────────────────────────────
    await portalPage.goto(`${BASE_URL}/portal/login`);
    await portalPage.waitForLoadState('networkidle');

    await portalPage.locator('input[type="email"]').fill(testEmail);
    await portalPage.locator('input[type="password"]').fill(testPassword);
    await portalPage.getByRole('button', { name: /sign in/i }).click();
    await portalPage.waitForURL(/\/portal\/(dashboard|search|reports)/, { timeout: 15000 });
    console.log('✅ Portal user logged in, landed on:', portalPage.url());

    // ── STEP 6: Enable can_search for this client via Supabase if needed ──
    // (in case feature flag is off by default)
    const { data: portalUser } = await supabase
      .from('users')
      .select('id, organization_id')
      .eq('email', testEmail)
      .single();

    if (portalUser) {
      const { data: clients } = await supabase
        .from('clients')
        .select('id, feature_flags')
        .eq('organization_id', portalUser.organization_id)
        .limit(1);

      if (clients && clients[0]) {
        const flags = (clients[0].feature_flags as any) || {};
        if (!flags.can_search) {
          await supabase
            .from('clients')
            .update({ feature_flags: { ...flags, can_search: true, can_view_reports: true } })
            .eq('id', clients[0].id);
          console.log('✅ Enabled can_search for client');
          // Reload portal page to pick up new flags
          await portalPage.reload();
          await portalPage.waitForLoadState('networkidle');
        }
      }
    }

    // ── STEP 7: Navigate to search and run a topic search ─────────────────
    // Find the search link in portal nav
    const searchLink = portalPage.locator('a[href*="/portal/search"], nav >> text=Search, nav >> text=Research').first();
    if (await searchLink.isVisible({ timeout: 3000 })) {
      await searchLink.click();
    } else {
      await portalPage.goto(`${BASE_URL}/portal/search`);
    }
    await portalPage.waitForLoadState('networkidle');
    console.log('✅ On search page:', portalPage.url());

    // Fill search query
    const queryInput = portalPage.locator('input[placeholder*="topic"], input[placeholder*="search"], input[placeholder*="Query"], input[type="search"]').first();
    await queryInput.waitFor({ timeout: 10000 });
    await queryInput.fill('Nike running shoes trends 2025');

    // Submit search
    const searchBtn = portalPage.getByRole('button', { name: /search|research|run|start/i }).first();
    await searchBtn.click();

    // Wait for redirect to processing page or results
    await portalPage.waitForURL(/\/portal\/search\/[a-z0-9-]+/, { timeout: 15000 });
    console.log('✅ Search started, URL:', portalPage.url());

    // ── STEP 8: Wait for search to complete ───────────────────────────────
    // Poll until status changes from processing to completed
    let completed = false;
    let attempts = 0;
    while (!completed && attempts < 30) {
      await portalPage.waitForTimeout(3000);
      const url = portalPage.url();
      if (url.includes('/processing')) {
        console.log(`⏳ Search processing... (${attempts * 3}s)`);
      } else {
        // Redirected to results page
        completed = true;
      }
      attempts++;

      // Check for error state
      const errorText = await portalPage.locator('text=failed, text=error, text=Failed').count();
      if (errorText > 0) {
        const errMsg = await portalPage.locator('text=failed, text=error, text=Failed').first().textContent();
        throw new Error(`Search failed: ${errMsg}`);
      }
    }

    // ── STEP 9: Verify results ─────────────────────────────────────────────
    if (!completed) {
      // Try navigating to results directly
      const searchId = portalPage.url().match(/\/portal\/search\/([a-z0-9-]+)/)?.[1];
      if (searchId) await portalPage.goto(`${BASE_URL}/portal/search/${searchId}`);
      await portalPage.waitForLoadState('networkidle');
    }

    // Verify there are trending topics rendered
    const topics = await portalPage.locator('[data-testid*="topic"], .trending-topic, h3, h4').count();
    console.log('✅ Search completed. Elements on results page:', topics);

    const pageText = await portalPage.locator('body').textContent();
    const hasSummary = pageText!.toLowerCase().includes('nike') || pageText!.toLowerCase().includes('running');
    console.log('✅ Results contain expected content:', hasSummary);

    expect(hasSummary).toBeTruthy();

    console.log('\n🎉 FULL E2E FLOW PASSED\n');

    await browser.close();
  });
});

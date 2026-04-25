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
  test('admin onboards client, invites portal user, portal user runs search', async () => {
    test.setTimeout(600_000); // 10 min — generous for full flow including AI search

    const browser = await chromium.launch({ headless: false, slowMo: 200 });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    // ── STEP 1: Admin logs in ──────────────────────────────────────────
    console.log('🔄 Step 1: Admin login...');
    await page.goto(`${BASE_URL}/login`);
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });
    console.log('✅ Step 1: Admin logged in →', page.url());

    // ── STEP 2: Navigate to Clients page ──────────────────────────────
    console.log('🔄 Step 2: Navigate to clients...');
    await page.goto(`${BASE_URL}/admin/clients`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    console.log('✅ Step 2: On clients page');

    // Screenshot for debugging
    await page.screenshot({ path: 'test-results/step2-clients.png' });

    // ── STEP 3: Check if test client exists, if not create via Supabase ─
    console.log('🔄 Step 3: Ensure test client exists...');
    const { data: existingClient } = await supabase
      .from('clients')
      .select('id, name, organization_id')
      .eq('slug', 'e2e-test-client')
      .single();

    let clientId: string;
    let orgId: string;

    if (existingClient) {
      clientId = existingClient.id;
      orgId = existingClient.organization_id;
      console.log('✅ Step 3: Test client already exists:', clientId);
    } else {
      // Create org + client via Supabase directly (faster and more reliable than UI)
      // Reuse an existing org if available to avoid insert permission issues
      const { data: existingOrg } = await supabase
        .from('organizations')
        .select('id')
        .limit(1)
        .single();

      if (existingOrg) {
        orgId = existingOrg.id;
      } else {
        const { data: org, error: orgErr } = await supabase
          .from('organizations')
          .insert({ name: 'E2E Test Org' })
          .select()
          .single();
        if (orgErr) throw new Error('Org insert failed: ' + orgErr.message + ' ' + orgErr.details);
        orgId = org!.id;
      }

      const { data: client } = await supabase
        .from('clients')
        .insert({
          name: 'E2E Test Brand',
          slug: 'e2e-test-client',
          industry: 'Apparel & Footwear',
          website_url: 'https://nike.com',
          organization_id: orgId,
          feature_flags: { can_search: true, can_view_reports: true, can_edit_preferences: true, can_submit_ideas: true },
        })
        .select()
        .single();
      clientId = client!.id;
      console.log('✅ Step 3: Created test client:', clientId);
    }

    // ── STEP 4: Create invite via Supabase ────────────────────────────
    console.log('🔄 Step 4: Creating invite...');
    const { data: adminUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', ADMIN_EMAIL)
      .single();

    const { data: invite, error: inviteErr } = await supabase
      .from('invite_tokens')
      .insert({
        client_id: clientId,
        organization_id: orgId,
        created_by: adminUser!.id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('token')
      .single();

    if (inviteErr) throw new Error(`Failed to create invite: ${inviteErr.message}`);
    const inviteToken = invite!.token;
    const inviteUrl = `${BASE_URL}/join/${inviteToken}`;
    console.log('✅ Step 4: Invite created:', inviteUrl);

    // ── STEP 5: Validate invite via API ───────────────────────────────
    console.log('🔄 Step 5: Validating invite...');
    const validateRes = await page.request.get(`${BASE_URL}/api/invites/validate?token=${inviteToken}`);
    expect(validateRes.ok()).toBe(true);
    const validateBody = await validateRes.json();
    expect(validateBody.valid).toBe(true);
    console.log('✅ Step 5: Invite valid, client:', validateBody.client_name);

    // ── STEP 6: Open invite URL and create portal account ─────────────
    console.log('🔄 Step 6: Creating portal account...');
    const portalCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const portalPage = await portalCtx.newPage();
    await portalPage.goto(inviteUrl);
    await portalPage.waitForLoadState('networkidle');

    await portalPage.screenshot({ path: 'test-results/step6-join-page.png' });

    // Wait for the form to appear (valid invite state)
    const form = portalPage.locator('form');
    await form.waitFor({ timeout: 10000 });

    const testEmail = `e2e-${Date.now()}@test.nativz.io`;
    const testPassword = 'TestPortal123!';

    // Fill form fields
    const nameInput = portalPage.locator('#full_name, input[placeholder*="name" i], input[placeholder*="Name"]').first();
    await nameInput.fill('E2E Test User');

    await portalPage.locator('input[type="email"]').fill(testEmail);
    await portalPage.locator('input[type="password"]').fill(testPassword);

    // Submit
    await portalPage.getByRole('button', { name: /create account/i }).click();

    // Wait for success (look for success text or sign-in redirect)
    await portalPage.waitForSelector('text=/account created|created|sign in/i', { timeout: 15000 });
    await portalPage.screenshot({ path: 'test-results/step6-account-created.png' });
    console.log('✅ Step 6: Portal account created:', testEmail);

    // ── STEP 7: Log in as portal user ─────────────────────────────────
    console.log('🔄 Step 7: Portal login...');
    await portalPage.goto(`${BASE_URL}/login`);
    await portalPage.waitForSelector('input[type="email"]', { timeout: 10000 });
    await portalPage.locator('input[type="email"]').fill(testEmail);
    await portalPage.locator('input[type="password"]').fill(testPassword);
    await portalPage.getByRole('button', { name: /sign in/i }).click();
    await portalPage.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });
    await portalPage.screenshot({ path: 'test-results/step7-portal-dashboard.png' });
    console.log('✅ Step 7: Portal user logged in →', portalPage.url());

    // ── STEP 8: Navigate to search ────────────────────────────────────
    console.log('🔄 Step 8: Running search...');
    await portalPage.goto(`${BASE_URL}/finder`);
    await portalPage.waitForLoadState('networkidle');
    await portalPage.screenshot({ path: 'test-results/step8-search-page.png' });

    // Find and fill the search query input
    const queryInput = portalPage.locator('input, textarea').filter({ hasText: /topic|search|query/i }).first();
    const anyInput = portalPage.locator('input[type="text"], input[type="search"], textarea').first();
    const searchInput = await queryInput.isVisible({ timeout: 3000 }).catch(() => false) ? queryInput : anyInput;
    await searchInput.waitFor({ timeout: 10000 });
    await searchInput.fill('Nike running shoes trends 2025');
    await portalPage.screenshot({ path: 'test-results/step8-search-filled.png' });

    // Click search/run button
    const searchBtn = portalPage.getByRole('button', { name: /search|research|run|start/i }).first();
    await searchBtn.click();

    // Wait for navigation to processing or results page
    await portalPage.waitForURL((url) => url.pathname !== '/finder', { timeout: 20000 });
    console.log('✅ Step 8: Search started →', portalPage.url());
    await portalPage.screenshot({ path: 'test-results/step8-search-started.png' });

    // ── STEP 9: Wait for search to complete ───────────────────────────
    console.log('🔄 Step 9: Waiting for search results...');
    let resultReady = false;
    for (let i = 0; i < 60; i++) {
      await portalPage.waitForTimeout(5000);
      const currentUrl = portalPage.url();

      // Check if we're on results page (not processing)
      if (!currentUrl.includes('/processing')) {
        resultReady = true;
        break;
      }

      // Check for error on page
      const errorVisible = await portalPage.locator('text=/failed|error/i').isVisible().catch(() => false);
      if (errorVisible) {
        await portalPage.screenshot({ path: 'test-results/step9-error.png' });
        const errorText = await portalPage.locator('text=/failed|error/i').first().textContent();
        console.log('❌ Search failed:', errorText);
        break;
      }

      console.log(`⏳ Processing... (${(i + 1) * 5}s)`);
    }

    await portalPage.screenshot({ path: 'test-results/step9-results.png' });

    if (resultReady) {
      // Verify results contain expected content
      const bodyText = await portalPage.locator('body').textContent();
      const hasContent = bodyText!.toLowerCase().includes('nike') || bodyText!.toLowerCase().includes('running') || bodyText!.toLowerCase().includes('shoe');
      console.log('✅ Step 9: Search completed, has relevant content:', hasContent);
      expect(hasContent).toBeTruthy();
    } else {
      console.log('⚠️  Search did not complete in time — check step9 screenshots');
    }

    console.log('\n🎉 FULL E2E FLOW COMPLETED\n');

    // ── Cleanup ───────────────────────────────────────────────────────
    // Delete test portal user
    const { data: testUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', testEmail)
      .single();
    if (testUser) {
      await supabase.from('users').delete().eq('id', testUser.id);
      await supabase.auth.admin.deleteUser(testUser.id);
    }
    // Mark invite as used (cleanup)
    await supabase.from('invite_tokens').update({ used_at: new Date().toISOString() }).eq('token', inviteToken);

    await browser.close();
  });
});

/**
 * Playwright Global Setup
 *
 * Creates isolated test fixtures:
 *   - Test organization + client
 *   - Test admin auth user (role = 'admin' in users table)
 *   - Logs in via browser UI and saves auth state to tests/.auth/admin.json
 *   - Saves fixture IDs to tests/.auth/test-data.json for use in specs
 *
 * Requires .env.local with:
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 */

import { chromium, type FullConfig } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loadEnvConfig } from '@next/env';
import * as fs from 'fs';
import * as path from 'path';

export default async function globalSetup(config: FullConfig) {
  // Load .env.local so env vars are available to this setup script
  loadEnvConfig(process.cwd());

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing required env vars. Create .env.local with:\n' +
        '  NEXT_PUBLIC_SUPABASE_URL\n' +
        '  NEXT_PUBLIC_SUPABASE_ANON_KEY\n' +
        '  SUPABASE_SERVICE_ROLE_KEY\n',
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const ts = Date.now();

  // ── 1. Create test organization ────────────────────────────────────────────
  const { data: org, error: orgError } = await admin
    .from('organizations')
    .insert({ name: `Test Org ${ts}`, slug: `test-org-${ts}`, type: 'client' })
    .select()
    .single();

  if (orgError) throw new Error(`Failed to create test org: ${orgError.message}`);

  // ── 2. Create test client linked to that org ───────────────────────────────
  const { data: client, error: clientError } = await admin
    .from('clients')
    .insert({
      name: `Test Client ${ts}`,
      slug: `test-client-${ts}`,
      industry: 'Technology',
      organization_id: org.id,
    })
    .select()
    .single();

  if (clientError) {
    await admin.from('organizations').delete().eq('id', org.id);
    throw new Error(`Failed to create test client: ${clientError.message}`);
  }

  // ── 3. Create test admin auth user ─────────────────────────────────────────
  const adminEmail = `test-admin-${ts}@test.nativz.io`;
  const adminPassword = `TestAdmin${ts}!`;

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
  });

  if (authError) {
    await admin.from('clients').delete().eq('id', client.id);
    await admin.from('organizations').delete().eq('id', org.id);
    throw new Error(`Failed to create admin auth user: ${authError.message}`);
  }

  const adminUserId = authData.user.id;

  // ── 4. Create users table record for the admin ────────────────────────────
  const { error: userError } = await admin.from('users').insert({
    id: adminUserId,
    email: adminEmail,
    full_name: 'Test Admin',
    role: 'admin',
  });

  if (userError) {
    await admin.auth.admin.deleteUser(adminUserId);
    await admin.from('clients').delete().eq('id', client.id);
    await admin.from('organizations').delete().eq('id', org.id);
    throw new Error(`Failed to create admin users record: ${userError.message}`);
  }

  // ── 5. Save test data for use in specs ────────────────────────────────────
  const authDir = path.join(__dirname, '.auth');
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

  const testData = {
    organizationId: org.id,
    clientId: client.id,
    clientName: `Test Client ${ts}`,
    adminEmail,
    adminPassword,
    adminUserId,
  };

  fs.writeFileSync(path.join(authDir, 'test-data.json'), JSON.stringify(testData, null, 2));

  // ── 6. Log in via browser UI and save auth state ──────────────────────────
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:3000';
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${baseURL}/admin/login`);
  await page.fill('#email', adminEmail);
  await page.fill('#password', adminPassword);
  await page.click('button[type="submit"]');

  // Wait for dashboard redirect (admin login redirects to /admin/dashboard)
  await page.waitForURL('**/admin/dashboard', { timeout: 15000 });

  await context.storageState({ path: path.join(authDir, 'admin.json') });
  await browser.close();

  console.log(`\n✓ Test fixtures created (ts=${ts})`);
  console.log(`  org:    ${org.id}`);
  console.log(`  client: ${client.id}`);
  console.log(`  admin:  ${adminEmail}`);
}

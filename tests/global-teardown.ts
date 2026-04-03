/**
 * Playwright Global Teardown
 *
 * Cleans up all fixtures created by global-setup.ts:
 *   - Deletes invite_tokens created during the test run (by test org)
 *   - Deletes portal users created by accept tests
 *   - Deletes test admin auth user
 *   - Deletes test client + organization
 */

import { createClient } from '@supabase/supabase-js';
import { loadEnvConfig } from '@next/env';
import * as fs from 'fs';
import * as path from 'path';

export default async function globalTeardown() {
  loadEnvConfig(process.cwd());

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const testDataPath = path.join(__dirname, '.auth', 'test-data.json');
  if (!fs.existsSync(testDataPath)) return;

  let testData: {
    organizationId: string;
    clientId: string;
    adminEmail: string;
    adminUserId: string;
  };

  try {
    testData = JSON.parse(fs.readFileSync(testDataPath, 'utf-8'));
  } catch {
    return;
  }

  // Delete any invite tokens created for the test client
  await admin.from('invite_tokens').delete().eq('client_id', testData.clientId);

  // Delete any portal users linked to the test organization (created during accept tests)
  const { data: portalUsers } = await admin
    .from('users')
    .select('id')
    .eq('organization_id', testData.organizationId)
    .neq('id', testData.adminUserId);

  if (portalUsers?.length) {
    await Promise.all(portalUsers.map((u) => admin.auth.admin.deleteUser(u.id)));
    await admin.from('users').delete().eq('organization_id', testData.organizationId).neq('id', testData.adminUserId);
  }

  // Delete test admin
  await admin.auth.admin.deleteUser(testData.adminUserId);

  // Delete test client + org
  await admin.from('clients').delete().eq('id', testData.clientId);
  await admin.from('organizations').delete().eq('id', testData.organizationId);

  // Clean up auth state files
  fs.rmSync(testDataPath, { force: true });
  fs.rmSync(path.join(__dirname, '.auth', 'admin.json'), { force: true });

  console.log('\n✓ Test fixtures cleaned up');
}

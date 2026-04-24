/**
 * One-shot runner for the proposals-generate E2E spec.
 *
 * Creates a throwaway test admin in Supabase (using the service role key),
 * exports creds into the environment, runs the Playwright spec, then
 * cleans up the user + users-table row so we don't accrete orphans.
 *
 *   npx tsx scripts/run-proposals-e2e.ts [--keep]
 *
 *   --keep   don't delete the test admin after the run (useful when debugging)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

// Minimal .env.local loader
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const keep = process.argv.includes('--keep');
const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const ts = Date.now();
  const email = `test-proposals-${ts}@test.nativz.io`;
  const password = `TestProposals${ts}!`;

  console.log(`\n▶ Creating test admin ${email}…`);
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authError || !authData.user) {
    throw new Error(`createUser failed: ${authError?.message ?? 'no user returned'}`);
  }
  const userId = authData.user.id;

  const { error: userRowError } = await admin.from('users').insert({
    id: userId,
    email,
    full_name: 'E2E Test Admin',
    role: 'admin',
  });
  if (userRowError) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    throw new Error(`users insert failed: ${userRowError.message}`);
  }

  console.log('✓ Test admin created.');
  console.log('\n▶ Running Playwright spec…\n');

  // Run the spec with creds in env. Use `spawn` so we inherit stdout and can
  // return the exit code.
  const proc = spawn('npx', ['playwright', 'test', 'proposals-generate.spec.ts', '--reporter=list'], {
    env: {
      ...process.env,
      E2E_ADMIN_EMAIL: email,
      E2E_ADMIN_PASSWORD: password,
    },
    stdio: 'inherit',
  });

  const exitCode = await new Promise<number>((resolve) => {
    proc.on('close', (code) => resolve(code ?? 0));
  });

  if (!keep) {
    console.log('\n▶ Cleaning up test admin…');
    await admin.from('users').delete().eq('id', userId);
    await admin.auth.admin.deleteUser(userId).catch((e) => {
      console.warn('  (deleteUser warning)', e?.message);
    });
    console.log('✓ Cleanup done.');
  } else {
    console.log(`\n(kept ${email} — delete manually when done)`);
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

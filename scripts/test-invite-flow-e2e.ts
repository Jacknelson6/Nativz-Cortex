/**
 * End-to-end probe of the full bulk-invite flow WITHOUT going through the
 * HTTP route. Hits admin Supabase + Resend exactly the way the route does,
 * so if it fails the failure is reproducible and visible instead of being
 * masked by a generic 500. Output explains which step failed.
 *
 *   npx tsx scripts/test-invite-flow-e2e.ts [clientId] [toEmail]
 *
 *   clientId defaults to the first active client in the DB
 *   toEmail  defaults to jack@nativz.io
 */

import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) {
      const [, key, rawVal] = match;
      if (!process.env[key]) process.env[key] = rawVal.replace(/^["']|["']$/g, '');
    }
  }
}

async function main() {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { sendClientInviteEmail } = await import('@/lib/email/resend');
  const { getBrandFromAgency } = await import('@/lib/agency/detect');

  const toEmail = process.argv[3] ?? 'jack@nativz.io';
  const admin = createAdminClient();

  // 1. Resolve client — either CLI arg or first one we find
  let clientId = process.argv[2];
  if (!clientId) {
    const { data, error } = await admin
      .from('clients')
      .select('id, name, agency')
      .eq('is_active', true)
      .limit(1)
      .single();
    if (error || !data) {
      console.error('✗ Could not find any active client:', error);
      process.exit(1);
    }
    clientId = data.id;
    console.log(`→ Auto-selected client: ${data.name} (${data.id}, agency=${data.agency ?? 'null'})`);
  }

  // 2. Fetch full client record — same shape the route uses
  console.log('\nStep 1 — Fetch client record');
  const { data: client, error: clientErr } = await admin
    .from('clients')
    .select('id, name, organization_id, agency')
    .eq('id', clientId)
    .single();
  if (clientErr || !client) {
    console.error('✗ Client lookup failed:', clientErr);
    process.exit(1);
  }
  console.log(`  ✓ ${client.name} · org=${client.organization_id} · agency=${client.agency ?? 'null'}`);
  if (!client.organization_id) {
    console.error('✗ Client has no organization_id — bulk insert will fail.');
    process.exit(1);
  }

  // 3. Pick a creator — first admin user in the DB (route uses the caller,
  //    but for this probe we just need any admin uuid so invite_tokens.created_by satisfies FK)
  console.log('\nStep 2 — Find an admin user to own the tokens');
  const { data: admins, error: adminErr } = await admin
    .from('users')
    .select('id, full_name, email')
    .eq('role', 'admin')
    .limit(1);
  if (adminErr || !admins?.[0]) {
    console.error('✗ No admin users found:', adminErr);
    process.exit(1);
  }
  const adminUser = admins[0];
  console.log(`  ✓ Using admin ${adminUser.email} (${adminUser.id})`);

  // 4. Insert an invite token (the exact operation the bulk route does)
  console.log('\nStep 3 — Insert invite_tokens row');
  const { data: tokens, error: insertErr } = await admin
    .from('invite_tokens')
    .insert([
      {
        client_id: client.id,
        organization_id: client.organization_id,
        created_by: adminUser.id,
      },
    ])
    .select('token, expires_at');
  if (insertErr) {
    console.error('✗ Token insert failed:', insertErr);
    process.exit(1);
  }
  console.log(`  ✓ Token inserted: ${tokens?.[0]?.token}`);

  // 5. Send the branded email
  console.log('\nStep 4 — Send via Resend');
  const agency = getBrandFromAgency(client.agency);
  console.log(`  → Resolved agency: ${agency}`);
  const inviteUrl = `https://cortex.nativz.io/portal/join/${tokens?.[0]?.token}`;
  const res = await sendClientInviteEmail({
    to: toEmail,
    contactName: 'Jack',
    clientName: client.name,
    inviteUrl,
    invitedBy: adminUser.full_name ?? adminUser.email ?? 'Cortex probe',
    agency,
  });

  if (res.error) {
    console.error('✗ Resend error:', res.error);
    process.exit(1);
  }
  if (!res.data?.id) {
    console.error('✗ Resend returned no id:', res);
    process.exit(1);
  }
  console.log(`  ✓ Sent, message id: ${res.data.id}`);

  // 6. Clean up the test token so the DB doesn't accumulate junk
  console.log('\nStep 5 — Cleanup');
  if (tokens?.[0]?.token) {
    await admin.from('invite_tokens').delete().eq('token', tokens[0].token);
    console.log('  ✓ Test token removed');
  }

  console.log('\n✓ Full flow works end-to-end.');
}

main().catch((err) => {
  console.error('\n✗ Unhandled exception:', err);
  if (err instanceof Error) console.error(err.stack);
  process.exit(1);
});

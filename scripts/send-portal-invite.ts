/**
 * One-off: send a branded portal invite directly.
 *
 *   npx tsx scripts/send-portal-invite.ts <clientSlugOrName> <recipientEmail> [agencyOverride]
 *
 *   agencyOverride: "nativz" | "anderson" — forces branding regardless of
 *                   what's on the client row. Omit to use the client's
 *                   configured agency.
 */

import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

async function main() {
  const clientArg = process.argv[2];
  const toEmail = process.argv[3];
  const agencyOverride = process.argv[4] as 'nativz' | 'anderson' | undefined;

  if (!clientArg || !toEmail) {
    console.error('Usage: npx tsx scripts/send-portal-invite.ts <clientSlugOrName> <email> [agencyOverride]');
    process.exit(1);
  }

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { sendClientInviteEmail } = await import('@/lib/email/resend');
  const { getBrandFromAgency } = await import('@/lib/agency/use-agency-brand');
  const { getCortexAppUrl } = await import('@/lib/agency/cortex-url');

  const admin = createAdminClient();

  // Resolve client by slug first, then by name substring
  const slugMatch = await admin
    .from('clients')
    .select('id, name, slug, organization_id, agency')
    .eq('slug', clientArg.toLowerCase())
    .maybeSingle();

  let client = slugMatch.data;
  if (!client) {
    const nameMatch = await admin
      .from('clients')
      .select('id, name, slug, organization_id, agency')
      .ilike('name', `%${clientArg}%`)
      .limit(1)
      .maybeSingle();
    client = nameMatch.data;
  }

  if (!client) {
    console.error(`✗ No client matched "${clientArg}" (tried slug + name ilike)`);
    process.exit(1);
  }

  console.log(`→ Client: ${client.name} (${client.id})`);
  console.log(`  slug=${client.slug}, agency=${client.agency ?? 'null'}, org=${client.organization_id}`);

  if (!client.organization_id) {
    console.error('✗ Client has no organization_id — invite would fail.');
    process.exit(1);
  }

  const agency = agencyOverride ?? getBrandFromAgency(client.agency);
  console.log(`→ Agency branding: ${agency}${agencyOverride ? ' (override)' : ''}`);
  console.log(`→ Recipient: ${toEmail}`);

  // Find an admin to own the token
  const { data: adminUsers, error: adminErr } = await admin
    .from('users')
    .select('id, full_name, email')
    .eq('role', 'admin')
    .limit(1);
  if (adminErr || !adminUsers?.[0]) {
    console.error('✗ No admin user found to own the token:', adminErr);
    process.exit(1);
  }
  const adminUser = adminUsers[0];

  // Create the invite token
  const { data: tokenRow, error: insertErr } = await admin
    .from('invite_tokens')
    .insert({
      client_id: client.id,
      organization_id: client.organization_id,
      created_by: adminUser.id,
    })
    .select('token, expires_at')
    .single();
  if (insertErr || !tokenRow) {
    console.error('✗ Token insert failed:', insertErr);
    process.exit(1);
  }

  const inviteUrl = `${getCortexAppUrl(agency)}/portal/join/${tokenRow.token}`;
  console.log(`→ Invite URL: ${inviteUrl}`);

  const contactName = toEmail.split('@')[0] ?? toEmail;
  const res = await sendClientInviteEmail({
    to: toEmail,
    contactName,
    clientName: client.name,
    inviteUrl,
    invitedBy: adminUser.full_name?.trim() || adminUser.email || 'your team',
    agency,
  });

  if (res.error) {
    console.error('✗ Resend error:', res.error);
    // Clean up orphan token
    await admin.from('invite_tokens').delete().eq('token', tokenRow.token);
    process.exit(1);
  }
  if (!res.data?.id) {
    console.error('✗ Resend returned no message id:', res);
    await admin.from('invite_tokens').delete().eq('token', tokenRow.token);
    process.exit(1);
  }

  console.log(`\n✓ Sent. Resend message id: ${res.data.id}`);
  console.log(`✓ Invite token (active 7 days): ${tokenRow.token}`);
  console.log(`✓ Expires: ${tokenRow.expires_at}`);
}

main().catch((err) => {
  console.error('\n✗ Unhandled:', err);
  if (err instanceof Error) console.error(err.stack);
  process.exit(1);
});

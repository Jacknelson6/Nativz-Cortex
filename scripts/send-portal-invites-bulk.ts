/**
 * Bulk portal invites with QA-first preview.
 *
 *   npx tsx scripts/send-portal-invites-bulk.ts --dry-run
 *     # prints every planned send (one invite per recipient — unique
 *     # token) without touching Resend or invite_tokens.
 *
 *   npx tsx scripts/send-portal-invites-bulk.ts --live
 *     # inserts tokens + fires Resend for every recipient.
 *
 * Config block is edited inline — simpler than CLI flag plumbing for a
 * one-off operation that's worth eyeballing before it runs.
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

// ── Config ──────────────────────────────────────────────────────────────────

const CLIENT_SLUG = 'jamnola';
const AGENCY: 'nativz' | 'anderson' = 'anderson';
const CC_EMAILS = ['Jack@andersoncollaborative.com'];
const RECIPIENTS: { email: string; name?: string }[] = [
  { email: 'Cait@jamnola.com' },
  { email: 'zoomz@zoomzandco.com', name: '' }, // no clean first name → drop the greeting
  { email: 'Laura@jamnola.com' },
  { email: 'Chad@jamnola.com' },
  { email: 'asoletti@gmail.com', name: 'Amber' },
  { email: 'Jonny@jamnola.com' },
  { email: 'Stacie@jamnola.com' },
];

// Throttle. Resend allows 5/sec so 300ms between sends gives headroom.
const SEND_SPACING_MS = 300;

// ── Helpers ─────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function cleanContactName(email: string): string {
  const local = email.split('@')[0] ?? email;
  // "Cait" from cait@…, "Stacie" from stacie@… — capitalized leading word.
  const firstWord = local.split(/[._-]/)[0] ?? local;
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const mode = process.argv[2];
  if (mode !== '--dry-run' && mode !== '--live') {
    console.error('Usage: npx tsx scripts/send-portal-invites-bulk.ts --dry-run | --live');
    process.exit(1);
  }
  const live = mode === '--live';

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { sendClientInviteEmail, getFromAddress, getReplyTo } = await import('@/lib/email/resend');
  const { getCortexAppUrl } = await import('@/lib/agency/cortex-url');

  const admin = createAdminClient();

  // QA 1: Validate every recipient looks like a real email
  console.log('\n=== QA: Validation ===');
  const bad = RECIPIENTS.filter((r) => !EMAIL_RE.test(r.email));
  if (bad.length > 0) {
    console.error('✗ Malformed recipient(s):', bad);
    process.exit(1);
  }
  console.log(`  ✓ ${RECIPIENTS.length} recipients pass regex`);

  const seen = new Set<string>();
  for (const r of RECIPIENTS) {
    const key = r.email.toLowerCase();
    if (seen.has(key)) {
      console.error(`✗ Duplicate recipient: ${r.email}`);
      process.exit(1);
    }
    seen.add(key);
  }
  console.log('  ✓ No duplicates');

  for (const cc of CC_EMAILS) {
    if (!EMAIL_RE.test(cc)) {
      console.error(`✗ CC address malformed: ${cc}`);
      process.exit(1);
    }
  }
  console.log(`  ✓ CC list: ${CC_EMAILS.join(', ')}`);

  // QA 2: Resolve client
  console.log('\n=== QA: Client lookup ===');
  const { data: client, error: clientErr } = await admin
    .from('clients')
    .select('id, name, slug, organization_id, agency')
    .eq('slug', CLIENT_SLUG)
    .single();
  if (clientErr || !client) {
    console.error(`✗ Client "${CLIENT_SLUG}" not found:`, clientErr);
    process.exit(1);
  }
  if (!client.organization_id) {
    console.error('✗ Client has no organization_id');
    process.exit(1);
  }
  console.log(`  ✓ Client: ${client.name} (${client.id})`);
  console.log(`  ✓ Slug: ${client.slug}`);
  console.log(`  ✓ DB agency: ${client.agency ?? 'null'}`);
  console.log(`  ✓ Override agency: ${AGENCY}`);
  console.log(`  ✓ Org: ${client.organization_id}`);

  // QA 3: Resolve URL host + Resend headers
  console.log('\n=== QA: Branding + delivery ===');
  const baseUrl = getCortexAppUrl(AGENCY);
  console.log(`  ✓ Invite URL host: ${baseUrl}`);
  console.log(`  ✓ From: ${getFromAddress(AGENCY)}`);
  console.log(`  ✓ Reply-to: ${getReplyTo(AGENCY)}`);

  // QA 4: Find an admin user to own tokens
  const { data: adminUsers } = await admin
    .from('users')
    .select('id, full_name, email')
    .eq('role', 'admin')
    .limit(1);
  if (!adminUsers?.[0]) {
    console.error('✗ No admin user to own tokens');
    process.exit(1);
  }
  const adminUser = adminUsers[0];
  console.log(`  ✓ Token owner: ${adminUser.email} (${adminUser.id})`);
  const invitedBy = adminUser.full_name?.trim() || adminUser.email || 'your team';

  // QA 5: Print per-recipient preview
  console.log('\n=== Per-recipient preview ===');
  RECIPIENTS.forEach((r, i) => {
    const contactName = r.name ?? cleanContactName(r.email);
    console.log(
      `  [${i + 1}/${RECIPIENTS.length}] ${r.email} → "${contactName}" · cc=${CC_EMAILS.join(',')}`,
    );
  });

  // Stop here in dry-run mode
  if (!live) {
    console.log('\n🛑 Dry-run complete. No tokens inserted, no emails sent.');
    console.log('   Re-run with --live to fire for real.');
    return;
  }

  // ── Live path ──
  console.log('\n=== LIVE SEND ===');
  const summary: Array<{
    email: string;
    status: 'sent' | 'failed';
    messageId?: string;
    token?: string;
    error?: string;
  }> = [];

  for (let i = 0; i < RECIPIENTS.length; i++) {
    const r = RECIPIENTS[i];
    const contactName = r.name ?? cleanContactName(r.email);
    console.log(`\n[${i + 1}/${RECIPIENTS.length}] ${r.email}`);

    // Insert a UNIQUE token per recipient
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
      console.error('  ✗ Token insert failed:', insertErr);
      summary.push({ email: r.email, status: 'failed', error: insertErr?.message });
      continue;
    }

    const inviteUrl = `${baseUrl}/portal/join/${tokenRow.token}`;

    try {
      const res = await sendClientInviteEmail({
        to: r.email,
        contactName,
        clientName: client.name,
        inviteUrl,
        invitedBy,
        agency: AGENCY,
        cc: CC_EMAILS,
      });

      if (res.error || !res.data?.id) {
        console.error('  ✗ Resend error:', res.error ?? 'no message id');
        await admin.from('invite_tokens').delete().eq('token', tokenRow.token);
        summary.push({
          email: r.email,
          status: 'failed',
          error: res.error?.message ?? 'no message id returned',
        });
        continue;
      }

      console.log(`  ✓ Sent · token=${tokenRow.token.slice(0, 12)}… · resend=${res.data.id}`);
      summary.push({
        email: r.email,
        status: 'sent',
        messageId: res.data.id,
        token: tokenRow.token,
      });
    } catch (err) {
      console.error('  ✗ Threw:', err);
      await admin.from('invite_tokens').delete().eq('token', tokenRow.token);
      summary.push({
        email: r.email,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Throttle between sends to stay under Resend's 5/sec ceiling
    if (i < RECIPIENTS.length - 1) await sleep(SEND_SPACING_MS);
  }

  // Final report
  console.log('\n=== Summary ===');
  const sent = summary.filter((s) => s.status === 'sent').length;
  const failed = summary.length - sent;
  console.log(`  Sent:   ${sent}`);
  console.log(`  Failed: ${failed}`);
  if (failed > 0) {
    console.log('\n  Failed recipients:');
    for (const s of summary.filter((s) => s.status === 'failed')) {
      console.log(`    - ${s.email}: ${s.error}`);
    }
  }
}

main().catch((err) => {
  console.error('\n✗ Unhandled:', err);
  if (err instanceof Error) console.error(err.stack);
  process.exit(1);
});

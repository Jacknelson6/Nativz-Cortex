/**
 * Minimal Resend probe — sends a Client Portal invite email directly
 * (bypassing auth + DB) so we can see the RAW Resend API response and
 * pinpoint why branded emails fail in prod.
 *
 *   npx tsx scripts/test-resend-invite.ts [to] [agency]
 *
 * Default: to=jack@nativz.io, agency=nativz
 * Agency options: "nativz" | "anderson"
 */

import fs from 'node:fs';
import path from 'node:path';

// Minimal .env.local loader — avoids adding a dotenv dep just for a probe.
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) {
      const [, key, rawVal] = match;
      if (!process.env[key]) {
        process.env[key] = rawVal.replace(/^["']|["']$/g, '');
      }
    }
  }
}

async function main() {
  const to = process.argv[2] ?? 'jack@nativz.io';
  const agency = (process.argv[3] ?? 'nativz') as 'nativz' | 'anderson';

  if (!process.env.RESEND_API_KEY) {
    console.error('✗ RESEND_API_KEY not loaded from .env.local');
    process.exit(1);
  }
  console.log(`✓ RESEND_API_KEY loaded (${process.env.RESEND_API_KEY.slice(0, 8)}…${process.env.RESEND_API_KEY.slice(-4)})`);
  console.log(`→ Target: ${to}`);
  console.log(`→ Agency: ${agency}`);

  const { sendClientInviteEmail } = await import('@/lib/email/resend');

  console.log('→ Calling sendClientInviteEmail …');
  try {
    const res = await sendClientInviteEmail({
      to,
      contactName: 'Jack',
      clientName: 'Diagnostic Test',
      inviteUrl: 'https://cortex.nativz.io/portal/join/diag-token',
      invitedBy: 'Cortex diagnostics',
      agency,
    });

    console.log('\n=== Resend response ===');
    console.log(JSON.stringify(res, null, 2));

    if (res.error) {
      console.log('\n✗ Resend returned an error object:');
      console.log(res.error);
      process.exit(1);
    }
    if (!res.data?.id) {
      console.log('\n✗ No message id returned (send did not actually fire).');
      process.exit(1);
    }
    console.log(`\n✓ Message queued. id=${res.data.id}`);
  } catch (err) {
    console.log('\n✗ Exception thrown:');
    console.log(err);
    if (err instanceof Error) {
      console.log('\nstack:\n' + err.stack);
    }
    process.exit(1);
  }
}

main();

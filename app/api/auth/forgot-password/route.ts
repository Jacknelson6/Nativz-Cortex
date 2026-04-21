import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { Resend } from 'resend';
import type { AgencyBrand } from '@/lib/agency/detect';
import { layout, getFromAddress, getReplyTo } from '@/lib/email/resend';
import { getSecret } from '@/lib/secrets/store';

const schema = z.object({
  email: z.string().email(),
  redirectTo: z.string().url().optional(),
});

let _resend: Resend | null = null;
let _resendKey: string | undefined;
async function getResend(): Promise<Resend> {
  const apiKey = (await getSecret('RESEND_API_KEY')) ?? '';
  if (!_resend || _resendKey !== apiKey) {
    _resend = new Resend(apiKey);
    _resendKey = apiKey;
  }
  return _resend;
}

/**
 * POST /api/auth/forgot-password
 *
 * Server-side password reset that bypasses Supabase's built-in email.
 * Uses admin.auth.admin.generateLink() to create the recovery URL,
 * then sends the email directly via Resend.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  const { email, redirectTo } = parsed.data;
  const admin = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cortex.nativz.io';
  const resetPage = redirectTo ?? `${appUrl}/admin/reset-password`;

  // Generate recovery link via Supabase admin API (no email sent by Supabase)
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: {
      redirectTo: resetPage,
    },
  });

  if (error) {
    // Don't reveal whether the email exists or not
    console.error('[forgot-password] generateLink error:', error.message);
    // Return success even on error to prevent email enumeration
    return NextResponse.json({ sent: true });
  }

  // IMPORTANT: don't use `action_link` directly — it redirects through
  // Supabase's `/auth/v1/verify` which hands back a PKCE `?code=...` URL.
  // Our browser clients don't have the paired code_verifier cookie (the link
  // was generated server-side, not by the client), so exchange fails silently
  // and the reset page hangs on "Validating your reset link…" forever.
  //
  // Instead, hand the raw `hashed_token` to our own reset page and let it
  // call `supabase.auth.verifyOtp({ token_hash, type: 'recovery' })` — no
  // code_verifier needed.
  const hashedToken = data?.properties?.hashed_token;
  if (!hashedToken) {
    console.error('[forgot-password] No hashed_token in response');
    return NextResponse.json({ sent: true });
  }
  const resetUrl = `${resetPage}?token_hash=${encodeURIComponent(hashedToken)}&type=recovery`;

  // Determine agency brand from email domain
  const agency: AgencyBrand = email.toLowerCase().includes('andersoncollaborative') ? 'anderson' : 'nativz';

  // Send branded email via Resend
  try {
    const { error: sendError } = await (await getResend()).emails.send({
      from: getFromAddress(agency),
      replyTo: getReplyTo(agency),
      to: email,
      subject: 'Reset your password',
      html: layout(
        `<div class="card">
          <h1 class="heading">Reset your password.</h1>
          <p class="subtext">
            We received a request to reset the password for your Cortex account. Click the button below to choose a new password.
          </p>
          <div class="button-wrap"><a href="${resetUrl}" class="button">Reset password &rarr;</a></div>
          <hr class="divider" />
          <p class="small">This link expires in 1 hour. If you didn&rsquo;t request a password reset, you can safely ignore this email.</p>
        </div>`,
        agency,
      ),
    });

    if (sendError) {
      console.error('[forgot-password] Resend error:', sendError);
    } else {
      console.log(`[forgot-password] Reset email sent to ${email} (agency=${agency})`);
    }
  } catch (err) {
    console.error('[forgot-password] Failed to send email:', err);
  }

  // Always return success to prevent email enumeration
  return NextResponse.json({ sent: true });
}

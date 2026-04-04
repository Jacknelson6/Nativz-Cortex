import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { resolveAgencyFromHookPayload } from '@/lib/email/resolve-agency';
import { layout, getFromAddress, getReplyTo } from '@/lib/email/resend';
import type { AgencyBrand } from '@/lib/agency/detect';

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

type EmailType = 'signup' | 'recovery' | 'invite' | 'email_change' | 'reauthentication';

function buildEmailHtml(
  type: EmailType,
  data: Record<string, unknown>,
  agency: AgencyBrand,
): { subject: string; html: string } {
  switch (type) {
    case 'signup': {
      const url = (data.confirmation_url ?? data.token_hash) as string | undefined;
      return {
        subject: 'Confirm your email',
        html: layout(
          `<div class="card">
            <h1 class="heading">Confirm your email address.</h1>
            <p class="subtext">
              Thanks for signing up for Cortex. Click the button below to confirm your email and activate your account.
            </p>
            ${url ? `<div class="button-wrap"><a href="${url}" class="button">Confirm email &rarr;</a></div>` : ''}
            <hr class="divider" />
            <p class="small">If you didn&rsquo;t create a Cortex account, you can safely ignore this email.</p>
          </div>`,
          agency,
        ),
      };
    }

    case 'recovery': {
      const url = (data.recovery_url ?? data.confirmation_url) as string | undefined;
      return {
        subject: 'Reset your password',
        html: layout(
          `<div class="card">
            <h1 class="heading">Reset your password.</h1>
            <p class="subtext">
              We received a request to reset the password for your Cortex account. Click the button below to choose a new password.
            </p>
            ${url ? `<div class="button-wrap"><a href="${url}" class="button">Reset password &rarr;</a></div>` : ''}
            <hr class="divider" />
            <p class="small">This link expires in 1 hour. If you didn&rsquo;t request a password reset, you can safely ignore this email.</p>
          </div>`,
          agency,
        ),
      };
    }

    case 'invite': {
      const url = (data.invitation_url ?? data.confirmation_url) as string | undefined;
      return {
        subject: "You're invited to Cortex",
        html: layout(
          `<div class="card">
            <h1 class="heading">You&rsquo;re invited.</h1>
            <p class="subtext">
              You&rsquo;ve been invited to Cortex. Click below to set up your account.
            </p>
            ${url ? `<div class="button-wrap"><a href="${url}" class="button">Accept invitation &rarr;</a></div>` : ''}
            <hr class="divider" />
            <p class="small">This link expires in 7 days. If you weren&rsquo;t expecting this, you can safely ignore it.</p>
          </div>`,
          agency,
        ),
      };
    }

    case 'email_change': {
      const url = (data.email_change_url ?? data.confirmation_url) as string | undefined;
      return {
        subject: 'Confirm your email change',
        html: layout(
          `<div class="card">
            <h1 class="heading">Confirm your email change.</h1>
            <p class="subtext">
              We received a request to change the email address on your Cortex account. Click the button below to confirm.
            </p>
            ${url ? `<div class="button-wrap"><a href="${url}" class="button">Confirm email change &rarr;</a></div>` : ''}
            <hr class="divider" />
            <p class="small">If you didn&rsquo;t request this change, please contact support immediately.</p>
          </div>`,
          agency,
        ),
      };
    }

    case 'reauthentication': {
      const otp = data.token as string | undefined;
      return {
        subject: 'Confirm reauthentication',
        html: layout(
          `<div class="card">
            <h1 class="heading">Reauthentication required.</h1>
            <p class="subtext">
              To complete this action, please enter the one-time code below.
            </p>
            ${otp
              ? `<div class="button-wrap" style="margin: 28px 0;">
                   <span style="display:inline-block;background:#01151D;border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:14px 36px;font-size:28px;font-weight:700;letter-spacing:0.15em;color:#FFFFFF;font-family:monospace;">${otp}</span>
                 </div>`
              : ''}
            <hr class="divider" />
            <p class="small">This code expires in 10 minutes. If you didn&rsquo;t request reauthentication, you can safely ignore this email.</p>
          </div>`,
          agency,
        ),
      };
    }
  }
}

const VALID_TYPES = new Set<string>(['signup', 'recovery', 'invite', 'email_change', 'reauthentication']);

export async function POST(req: NextRequest) {
  // Verify webhook secret if configured
  const hookSecret = process.env.AUTH_HOOK_SECRET;
  if (hookSecret) {
    const authHeader = req.headers.get('authorization') ?? '';
    const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (provided !== hookSecret) {
      return new NextResponse(null, { status: 401 });
    }
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const type = body.type as string | undefined;
  const email = body.email as string | undefined;
  const data = (body.data ?? {}) as Record<string, unknown>;

  if (!type || !VALID_TYPES.has(type) || !email) {
    return new NextResponse(null, { status: 400 });
  }

  const agency = await resolveAgencyFromHookPayload({ ...body, data });
  const { subject, html } = buildEmailHtml(type as EmailType, data, agency);

  try {
    const { error: sendError } = await getResend().emails.send({
      from: getFromAddress(agency),
      replyTo: getReplyTo(agency),
      to: email,
      subject,
      html,
    });

    if (sendError) {
      console.error(`[auth/send-email] Resend error for ${type} to ${email}:`, sendError);
      return new NextResponse(null, { status: 500 });
    }
  } catch (err) {
    console.error(`[auth/send-email] Failed to send ${type} email to ${email}:`, err);
    return new NextResponse(null, { status: 500 });
  }

  console.log(`[auth/send-email] Sent ${type} email to ${email} (agency=${agency})`);
  // Supabase requires a 200 with empty body on success
  return new NextResponse(null, { status: 200 });
}

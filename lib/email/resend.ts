import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS = 'Nativz Cortex <notifications@nativz.io>';

// ── Shared layout ────────────────────────────────────────────────────────────

function layout(content: string) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { margin: 0; padding: 0; background: #0f1117; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .container { max-width: 480px; margin: 0 auto; padding: 40px 24px; }
    .logo { text-align: center; margin-bottom: 32px; }
    .card { background: #1a1d27; border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; padding: 32px; }
    .heading { color: #ffffff; font-size: 20px; font-weight: 600; margin: 0 0 8px; }
    .subtext { color: #8b8fa3; font-size: 14px; line-height: 1.6; margin: 0 0 24px; }
    .button { display: inline-block; background: #046bd2; color: #ffffff !important; text-decoration: none; font-size: 14px; font-weight: 500; padding: 12px 28px; border-radius: 10px; }
    .button:hover { background: #0580f0; }
    .button-wrap { text-align: center; margin: 24px 0; }
    .divider { border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 24px 0; }
    .detail-label { color: #8b8fa3; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 4px; }
    .detail-value { color: #e0e2eb; font-size: 14px; margin: 0 0 16px; }
    .footer { text-align: center; margin-top: 32px; color: #4a4e5e; font-size: 11px; }
    .footer a { color: #5ba3e6; text-decoration: none; }
    .highlight { color: #5ba3e6; font-weight: 500; }
    .badge { display: inline-block; background: rgba(4,107,210,0.12); color: #5ba3e6; font-size: 11px; font-weight: 500; padding: 3px 10px; border-radius: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <img src="https://cortex.nativz.io/nativz-logo.png" alt="Nativz" width="120" style="display:inline-block;" />
    </div>
    ${content}
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Nativz &mdash; <a href="https://cortex.nativz.io">cortex.nativz.io</a></p>
    </div>
  </div>
</body>
</html>`;
}

// ── Team member invite ───────────────────────────────────────────────────────

export async function sendTeamInviteEmail(opts: {
  to: string;
  memberName: string;
  inviteUrl: string;
  invitedBy: string;
}) {
  return resend.emails.send({
    from: FROM_ADDRESS,
    to: opts.to,
    subject: `You're invited to join Nativz Cortex`,
    html: layout(`
      <div class="card">
        <h1 class="heading">Welcome to the team, ${opts.memberName}!</h1>
        <p class="subtext">
          ${opts.invitedBy} has invited you to join <span class="highlight">Nativz Cortex</span> — the internal dashboard where we manage clients, content strategy, and creative production.
        </p>
        <div class="button-wrap">
          <a href="${opts.inviteUrl}" class="button">Create your account</a>
        </div>
        <hr class="divider" />
        <p class="detail-label">What you'll get access to</p>
        <p class="detail-value">Client dashboards, task management, content pipeline, AI research tools, and more.</p>
        <p class="subtext" style="font-size:12px; margin-bottom:0;">
          This link expires in 7 days. If it expires, ask your admin for a new one.
        </p>
      </div>
    `),
  });
}

// ── Client portal invite ─────────────────────────────────────────────────────

export async function sendClientInviteEmail(opts: {
  to: string;
  contactName: string;
  clientName: string;
  inviteUrl: string;
  invitedBy: string;
}) {
  return resend.emails.send({
    from: FROM_ADDRESS,
    to: opts.to,
    subject: `${opts.clientName} — Your content portal is ready`,
    html: layout(`
      <div class="card">
        <h1 class="heading">Your portal is ready</h1>
        <p class="subtext">
          Hi ${opts.contactName},<br /><br />
          The Nativz team has set up a dedicated content portal for <span class="highlight">${opts.clientName}</span>. You'll be able to view reports, submit content ideas, manage brand preferences, and stay in sync with your creative team.
        </p>
        <div class="button-wrap">
          <a href="${opts.inviteUrl}" class="button">Set up your account</a>
        </div>
        <hr class="divider" />
        <p class="detail-label">What's inside</p>
        <p class="detail-value">Topic research reports, content ideas, brand preferences, content calendar, and knowledge base — all in one place.</p>
        <p class="subtext" style="font-size:12px; margin-bottom:0;">
          This link expires in 7 days. Contact ${opts.invitedBy} if you need a new one.
        </p>
      </div>
    `),
  });
}

// ── Welcome email (after account creation) ───────────────────────────────────

export async function sendWelcomeEmail(opts: {
  to: string;
  name: string;
  role: 'admin' | 'viewer';
  loginUrl: string;
}) {
  const isTeam = opts.role === 'admin';
  return resend.emails.send({
    from: FROM_ADDRESS,
    to: opts.to,
    subject: `Welcome to Nativz Cortex`,
    html: layout(`
      <div class="card">
        <h1 class="heading">You're all set, ${opts.name}!</h1>
        <p class="subtext">
          Your Nativz Cortex account is ready. ${isTeam
            ? 'You now have full access to the admin dashboard — clients, tasks, content pipeline, AI tools, and more.'
            : 'You can now access your dedicated client portal to view reports, submit ideas, and collaborate with the Nativz team.'
          }
        </p>
        <div class="button-wrap">
          <a href="${opts.loginUrl}" class="button">Sign in to Cortex</a>
        </div>
        <hr class="divider" />
        <p class="detail-label">Account details</p>
        <p class="detail-value">${opts.to}</p>
        <p class="detail-label">Access level</p>
        <p class="detail-value"><span class="badge">${isTeam ? 'Team member' : 'Client portal'}</span></p>
      </div>
    `),
  });
}

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS = 'Nativz Cortex <notifications@nativz.io>';

// ── Brand tokens (from Nativz Brand Guide) ──────────────────────────────────
const BRAND = {
  bgDark: '#000C11',
  bgCard: '#01151D',
  borderCard: 'rgba(255,255,255,0.06)',
  textPrimary: '#FFFFFF',
  textBody: '#D1D5DB',
  textMuted: '#9CA3AF',
  textFooter: '#617792',
  blue: '#00AEEF',      // Brand blue — the "z"
  blueCta: '#046BD2',   // CTA button blue
  blueHover: '#045CB4', // Hover state
  blueSurface: 'rgba(0,174,239,0.10)',
  fontStack: '"futura-pt", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Oxygen-Sans", Ubuntu, Cantarell, "Helvetica Neue", sans-serif',
};

// ── Shared layout ────────────────────────────────────────────────────────────

function layout(content: string) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <!--suppress CheckEmptyScriptTag -->
  <link rel="stylesheet" href="https://use.typekit.net/your-kit-id.css" />
  <style>
    body { margin: 0; padding: 0; background: ${BRAND.bgDark}; font-family: ${BRAND.fontStack}; -webkit-font-smoothing: antialiased; }
    .wrapper { max-width: 520px; margin: 0 auto; padding: 48px 24px; }

    /* Header strip */
    .header { text-align: center; padding-bottom: 32px; }
    .header img { display: inline-block; }

    /* Card */
    .card { background: ${BRAND.bgCard}; border: 1px solid ${BRAND.borderCard}; border-radius: 16px; padding: 36px 32px; }

    /* Typography */
    .heading { color: ${BRAND.textPrimary}; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 12px; }
    .subtext { color: ${BRAND.textBody}; font-size: 14px; line-height: 1.7; margin: 0 0 24px; }
    .small { color: ${BRAND.textMuted}; font-size: 12px; line-height: 1.6; margin: 0; }

    /* CTA Button */
    .button-wrap { text-align: center; margin: 28px 0; }
    .button {
      display: inline-block;
      background: ${BRAND.blueCta};
      color: #ffffff !important;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.02em;
      padding: 14px 36px;
      border-radius: 10px;
      mso-padding-alt: 14px 36px;
    }

    /* Divider */
    .divider { border: none; border-top: 1px solid ${BRAND.borderCard}; margin: 28px 0; }

    /* Detail rows */
    .detail-label { color: ${BRAND.textMuted}; font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600; margin: 0 0 4px; }
    .detail-value { color: ${BRAND.textBody}; font-size: 14px; margin: 0 0 16px; }

    /* Badges */
    .badge { display: inline-block; background: ${BRAND.blueSurface}; color: ${BRAND.blue}; font-size: 11px; font-weight: 600; padding: 4px 12px; border-radius: 20px; letter-spacing: 0.02em; }

    /* Highlight */
    .highlight { color: ${BRAND.blue}; font-weight: 600; }

    /* Feature list */
    .features { margin: 0; padding: 0; list-style: none; }
    .features li { color: ${BRAND.textBody}; font-size: 13px; padding: 6px 0; padding-left: 20px; position: relative; }
    .features li::before { content: ""; position: absolute; left: 0; top: 13px; width: 8px; height: 8px; border-radius: 50%; background: ${BRAND.blue}; opacity: 0.5; }

    /* Footer */
    .footer { text-align: center; padding-top: 36px; }
    .footer p { color: ${BRAND.textFooter}; font-size: 11px; margin: 0 0 4px; }
    .footer a { color: ${BRAND.blue}; text-decoration: none; }
    .footer-line { display: block; width: 40px; height: 2px; background: ${BRAND.blue}; opacity: 0.2; margin: 0 auto 16px; border-radius: 1px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <img src="https://cortex.nativz.io/nativz-logo.png" alt="Nativz" width="110" />
    </div>
    ${content}
    <div class="footer">
      <div class="footer-line"></div>
      <p>&copy; ${new Date().getFullYear()} Nativz &middot; <a href="https://cortex.nativz.io">cortex.nativz.io</a></p>
      <p style="margin-top:8px;"><a href="https://nativz.io">nativz.io</a></p>
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
        <h1 class="heading">Welcome to the team, ${opts.memberName}.</h1>
        <p class="subtext">
          ${opts.invitedBy} has invited you to join <span class="highlight">Nativz Cortex</span> — the internal command center where the team manages clients, content strategy, and creative production.
        </p>
        <div class="button-wrap">
          <a href="${opts.inviteUrl}" class="button">Create your account &rarr;</a>
        </div>
        <hr class="divider" />
        <p class="detail-label">What you'll get access to</p>
        <ul class="features">
          <li>Client dashboards &amp; brand profiles</li>
          <li>Task management &amp; content pipeline</li>
          <li>AI-powered topic research &amp; strategy</li>
          <li>Shoot scheduler &amp; content calendar</li>
        </ul>
        <hr class="divider" />
        <p class="small">
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
        <h1 class="heading">Your portal is ready.</h1>
        <p class="subtext">
          Hi ${opts.contactName},<br /><br />
          The Nativz team has set up a dedicated content portal for <span class="highlight">${opts.clientName}</span>. Everything your team needs to stay in sync with creative production — in one place.
        </p>
        <div class="button-wrap">
          <a href="${opts.inviteUrl}" class="button">Set up your account &rarr;</a>
        </div>
        <hr class="divider" />
        <p class="detail-label">What's inside</p>
        <ul class="features">
          <li>Topic research reports &amp; trend analysis</li>
          <li>Content ideas &amp; video scripts</li>
          <li>Brand preferences &amp; tone settings</li>
          <li>Content calendar &amp; knowledge base</li>
        </ul>
        <hr class="divider" />
        <p class="small">
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
        <h1 class="heading">You're all set, ${opts.name}.</h1>
        <p class="subtext">
          Your account is ready. ${isTeam
            ? 'You now have full access to Cortex — the internal command center for clients, content, and creative production.'
            : 'You can now access your dedicated client portal to view reports, submit ideas, and collaborate with the Nativz team.'
          }
        </p>
        <div class="button-wrap">
          <a href="${opts.loginUrl}" class="button">Sign in to Cortex &rarr;</a>
        </div>
        <hr class="divider" />
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="padding-right: 24px;">
              <p class="detail-label">Email</p>
              <p class="detail-value">${opts.to}</p>
            </td>
            <td>
              <p class="detail-label">Access level</p>
              <p class="detail-value"><span class="badge">${isTeam ? 'Team member' : 'Client portal'}</span></p>
            </td>
          </tr>
        </table>
      </div>
    `),
  });
}

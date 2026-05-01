/**
 * Render every email type to HTML files for visual review.
 *
 * Iterates every sender × every brand (`nativz`, `anderson`) and writes the
 * fully composed HTML (Trevor shell + inner card) to
 * `/tmp/email-previews/<agency>/<key>.html`. Builds an index.html with links
 * so the whole catalog is browsable in a single tab.
 *
 *   npx tsx scripts/preview-all-emails.ts
 *
 * No DB writes, no Resend calls. Pulls from the real `layout()` + the
 * existing `build*Html` helpers, then reconstructs each sender's inner card
 * inline (matches the body string in `lib/email/resend.ts` 1:1). Keep this
 * script in sync when senders change.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { layout } from '@/lib/email/resend';
import { buildAffiliateWeeklyReportCardHtml } from '@/lib/email/templates/affiliate-weekly-report-html';
import { buildWeeklySocialReportCardHtml } from '@/lib/email/templates/weekly-social-report-html';
import { buildCompetitorReportCardHtml } from '@/lib/email/templates/competitor-report-html';
import { buildUserEmailHtml } from '@/lib/email/templates/user-email';
import type { AgencyBrand } from '@/lib/agency/detect';
import type { WeeklySocialReport } from '@/lib/reporting/weekly-social-report';
import type { CompetitorReportData } from '@/lib/reporting/competitor-report-types';

// ── Local helpers (mirror private functions inside resend.ts / system-emails)

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function messageToHtmlParagraphs(message: string): string {
  const paragraphs = message
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paragraphs
    .map((p, i) => {
      const safe = escapeHtml(p).replace(/\n/g, '<br />');
      const margin = i === 0 ? '' : ' style="margin-top:10px;"';
      return `<p class="subtext"${margin}>${safe}</p>`;
    })
    .join('');
}

function humanizeNameList(names: string[]): string {
  const cleaned = names.map((n) => n.trim()).filter(Boolean);
  if (cleaned.length <= 1) return cleaned[0] ?? '';
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(', ')}, and ${cleaned[cleaned.length - 1]}`;
}

function formatDateLabel(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatShootDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const datePart = d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timePart = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${datePart} at ${timePart}`;
}

// ── Sample data fixtures ────────────────────────────────────────────────────

const SAMPLE_REPORT: WeeklySocialReport = {
  clientId: 'sample-client',
  clientName: 'JAMNOLA',
  clientLogoUrl: null,
  periodStart: '2026-04-21',
  periodEnd: '2026-04-28',
  followers: {
    delta: 1284,
    perPlatform: [
      { platform: 'tiktok', current: 48230, delta: 982 },
      { platform: 'instagram', current: 22150, delta: 248 },
      { platform: 'youtube', current: 6280, delta: 54 },
    ],
  },
  aggregates: { views: 384210, engagement: 18943, posts: 14 },
  topPosts: [
    {
      platform: 'tiktok',
      caption: 'Behind the scenes of the new immersive room reveal',
      thumbnailUrl: null,
      postUrl: 'https://www.tiktok.com/@jamnola/video/sample',
      views: 184320,
      engagement: 9821,
    },
    {
      platform: 'instagram',
      caption: 'Customer reaction reel that hit our highest reach all month',
      thumbnailUrl: null,
      postUrl: 'https://www.instagram.com/p/sample',
      views: 89220,
      engagement: 5410,
    },
    {
      platform: 'youtube',
      caption: 'Founder Q+A short, no script, just real talk',
      thumbnailUrl: null,
      postUrl: 'https://youtu.be/sample',
      views: 42180,
      engagement: 1830,
    },
  ],
  upcomingShoots: [
    { shootDate: '2026-05-04', notes: 'Founder interview series, JAMNOLA studio, 10am call time' },
    { shootDate: '2026-05-07', notes: 'Customer testimonial roundup, on-site at the gallery' },
  ],
} as WeeklySocialReport;

const SAMPLE_COMPETITOR_DATA: CompetitorReportData = {
  client_id: 'sample-client',
  client_name: 'JAMNOLA',
  client_agency: 'nativz',
  period_start: '2026-04-21',
  period_end: '2026-04-28',
  competitors: [
    {
      competitor_id: 'c1',
      username: 'meowwolf',
      display_name: 'Meow Wolf',
      platform: 'tiktok',
      followers: 412000,
      followers_delta: 8200,
      avg_views: 184000,
      avg_views_delta: 12800,
      engagement_rate: 0.0612,
      engagement_rate_delta: 0.004,
      posts_count: 9,
      posts_count_delta: 2,
      scrape_error: null,
      top_posts: [
        {
          description: 'Walk-through of the new Convergence Station hidden room',
          views: 942000,
          likes: 84200,
          comments: 1820,
        },
        {
          description: 'Artist spotlight, painting installation in real time',
          views: 421000,
          likes: 32100,
          comments: 940,
        },
      ],
    },
    {
      competitor_id: 'c2',
      username: 'museumofice_cream',
      display_name: 'Museum of Ice Cream',
      platform: 'instagram',
      followers: 612000,
      followers_delta: -340,
      avg_views: 92000,
      avg_views_delta: -4200,
      engagement_rate: 0.0428,
      engagement_rate_delta: -0.002,
      posts_count: 6,
      posts_count_delta: -1,
      scrape_error: 'Rate limited on last 2 posts; partial data this run.',
      top_posts: [
        {
          description: 'Sprinkle pool video, rotating angle reel',
          views: 218000,
          likes: 14200,
          comments: 412,
        },
      ],
    },
  ],
} as CompetitorReportData;

// ── Sender renderers ────────────────────────────────────────────────────────
// Each renderer returns `{ subject, html }` for a given agency. Mirrors the
// real sender's HTML construction 1:1 so the preview matches what Resend
// would actually deliver.

interface PreviewEntry {
  key: string;
  label: string;
  category: 'transactional' | 'system' | 'campaign';
  render: (agency: AgencyBrand) => { subject: string; html: string };
}

const PREVIEWS: PreviewEntry[] = [
  // 01 — Team invite
  {
    key: '01-team-invite',
    label: 'Team invite',
    category: 'transactional',
    render: (agency) => {
      const brandName = agency === 'anderson' ? 'Anderson Collaborative' : 'Nativz';
      const memberName = 'Trevor';
      const inviteUrl = 'https://cortex.nativz.io/invite/team-sample-token';
      const invitedBy = 'Jack Nelson';
      return {
        subject: `You're invited to ${brandName} Cortex`,
        html: layout(
          `
      <p class="subtext">
        ${invitedBy} has invited you to <span class="highlight">${brandName} Cortex</span>, your team's content intelligence platform.
      </p>
      <div class="button-wrap">
        <a href="${inviteUrl}" class="button">Create your account &rarr;</a>
      </div>
      <hr class="divider" />
      <p class="small">
        This link expires in 7 days. If it expires, ask your admin for a new one.
      </p>
    `,
          agency,
          {
            eyebrow: 'Team Invite',
            heroTitle: `You're invited, ${memberName}.`,
          },
        ),
      };
    },
  },
  // 02 — Client portal invite
  {
    key: '02-client-invite',
    label: 'Client portal invite',
    category: 'transactional',
    render: (agency) => {
      const contactName = 'Trevor';
      const clientName = 'JAMNOLA';
      const inviteUrl = 'https://cortex.nativz.io/portal/join/sample-token';
      const invitedBy = 'Jack Nelson';
      const heroTitle = `Your portal is ready, ${contactName}.`;
      return {
        subject: `Your ${clientName} Cortex portal is ready`,
        html: layout(
          `
      <p class="subtext">
        Your team at <span class="highlight">${agency === 'anderson' ? 'Anderson Collaborative' : 'Nativz'}</span> has set up a dedicated Cortex portal for <strong>${clientName}</strong>. Set up your account to get started.
      </p>
      <div class="button-wrap">
        <a href="${inviteUrl}" class="button">Set up your account &rarr;</a>
      </div>
      <hr class="divider" />
      <p class="small">
        This link expires in 7 days. Contact ${invitedBy} if you need a new one.
      </p>
    `,
          agency,
          { eyebrow: 'Portal Invite', heroTitle },
        ),
      };
    },
  },
  // 03 — Welcome (after account creation)
  {
    key: '03-welcome',
    label: 'Welcome (post-signup)',
    category: 'transactional',
    render: (agency) => {
      const name = 'Trevor';
      const to = 'trevor@example.com';
      const loginUrl = 'https://cortex.nativz.io/login';
      return {
        subject: 'Welcome to Cortex',
        html: layout(
          `
      <p class="subtext">
        Your Cortex account is ready. Sign in to get started.
      </p>
      <div class="button-wrap">
        <a href="${loginUrl}" class="button">Sign in &rarr;</a>
      </div>
      <hr class="divider" />
      <p class="small">
        Signed up as <strong>${to}</strong>
      </p>
    `,
          agency,
          { eyebrow: 'Welcome', heroTitle: `You're all set, ${name}.` },
        ),
      };
    },
  },
  // 04 — Search completed
  {
    key: '04-search-completed',
    label: 'Topic search completed',
    category: 'transactional',
    render: (agency) => {
      const query = 'short-form gym reels for spring promo';
      const clientName = 'JAMNOLA';
      const summaryPreview =
        'We pulled 14 trending angles across TikTok and Reels. The strongest pattern is creator-led "rate my plan" remixes, paired with a quick first-impression hook.';
      const resultsUrl = 'https://cortex.nativz.io/research/sample';
      const clientLine = `<p class="detail-label">Client</p><p class="detail-value">${clientName}</p>`;
      return {
        subject: `Research ready, ${query}`,
        html: layout(
          `
      <p class="subtext">
        Results for <span class="highlight">&ldquo;${query}&rdquo;</span> are in.
      </p>
      <p class="small" style="margin-bottom: 24px;">
        ${summaryPreview}${summaryPreview.length >= 200 ? '&hellip;' : ''}
      </p>
      ${clientLine}
      <div class="button-wrap">
        <a href="${resultsUrl}" class="button">View report &rarr;</a>
      </div>
    `,
          agency,
          { eyebrow: 'Research Complete', heroTitle: 'Your research is ready.' },
        ),
      };
    },
  },
  // 05 — Affiliate weekly report
  {
    key: '05-affiliate-weekly-report',
    label: 'Affiliate weekly report',
    category: 'system',
    render: (agency) => {
      const clientName = 'JAMNOLA';
      const rangeLabel = 'Apr 21 to Apr 28';
      const cardHtml = buildAffiliateWeeklyReportCardHtml({
        clientName,
        rangeLabel,
        kpis: {
          newAffiliates: 4,
          totalAffiliates: 47,
          activeAffiliates: 22,
          referralsInPeriod: 31,
          periodRevenue: 8420.5,
          totalClicks: 12480,
        },
        topAffiliates: [
          { name: 'Maya Chen', revenue: 1820.0, referrals: 12 },
          { name: 'Devon Park', revenue: 1240.5, referrals: 8 },
          { name: 'Riley Vasquez', revenue: 980.0, referrals: 6 },
          { name: 'Jordan Reed', revenue: 720.5, referrals: 4 },
        ],
        agency,
      });
      return {
        subject: `Weekly affiliate report for ${clientName} (${rangeLabel})`,
        html: layout(cardHtml, agency, {
          eyebrow: `Weekly affiliate report · ${rangeLabel}`,
          heroTitle: `${clientName} affiliates`,
        }),
      };
    },
  },
  // 06 — Weekly social report
  {
    key: '06-weekly-social-report',
    label: 'Weekly social recap',
    category: 'system',
    render: (agency) => {
      const rangeLabel = 'Apr 21 to Apr 28';
      const cardHtml = buildWeeklySocialReportCardHtml({
        report: SAMPLE_REPORT,
        rangeLabel,
        agency,
      });
      return {
        subject: `Weekly recap for ${SAMPLE_REPORT.clientName} (${rangeLabel})`,
        html: layout(cardHtml, agency, {
          eyebrow: `Weekly recap · ${rangeLabel}`,
          heroTitle: `${SAMPLE_REPORT.clientName} performance`,
        }),
      };
    },
  },
  // 07 — Competitor report
  {
    key: '07-competitor-report',
    label: 'Competitor report',
    category: 'system',
    render: (agency) => {
      const data = { ...SAMPLE_COMPETITOR_DATA, client_agency: agency };
      const rangeLabel = 'Apr 21 to Apr 28';
      const cardHtml = buildCompetitorReportCardHtml({
        data,
        agency,
        analyticsUrl: 'https://cortex.nativz.io/admin/analytics',
      });
      return {
        subject: `Competitor update for ${data.client_name} (${rangeLabel})`,
        html: layout(cardHtml, agency, {
          eyebrow: `Competitor update · ${rangeLabel}`,
          heroTitle: `${data.client_name} vs. competitors`,
        }),
      };
    },
  },
  // 08 — Onboarding (markdown body via buildUserEmailHtml)
  {
    key: '08-onboarding-markdown',
    label: 'Onboarding (admin markdown)',
    category: 'transactional',
    render: (agency) => {
      const md = `# Welcome aboard, Trevor.

Your agreement is signed and the deposit cleared, thank you. Here's what to expect over the next two weeks:

- Day 1, brand kickoff call to align on voice + first shoot
- Day 3, content lab onboarding so you can drop ideas any time
- Day 7, first calendar lands in your inbox

[Open your setup checklist](https://cortex.nativz.io/onboarding/sample)

If anything feels off, hit reply and we'll jump on a call.

– Jack`;
      return {
        subject: 'Welcome to Cortex',
        html: buildUserEmailHtml(md, agency),
      };
    },
  },
  // 09 — Drop comment: approved
  {
    key: '09-drop-comment-approved',
    label: 'Calendar comment, approved',
    category: 'transactional',
    render: (agency) => {
      const authorName = 'Trevor';
      const clientName = 'JAMNOLA';
      const status = 'approved' as const;
      const verbBySubject = { approved: 'approved a post', changes_requested: 'requested changes', comment: 'left a comment' };
      const headlineByStatus = {
        approved: `${authorName} approved a post.`,
        changes_requested: `${authorName} requested changes.`,
        comment: `New comment from ${authorName}.`,
      };
      const eyebrowByStatus = { approved: 'Calendar Approved', changes_requested: 'Changes Requested', comment: 'New Comment' };
      const contentPreview = 'Looks great, ship it.';
      const dropUrl = 'https://cortex.nativz.io/c/sample';
      return {
        subject: `${authorName} ${verbBySubject[status]} on ${clientName}`,
        html: layout(
          `
      <p class="subtext">
        <span class="highlight">${authorName}</span> ${verbBySubject[status]} on the ${clientName} content calendar.
      </p>
      <p class="small" style="margin-bottom: 24px;">
        &ldquo;${contentPreview}&rdquo;
      </p>
      <div class="button-wrap">
        <a href="${dropUrl}" class="button">Open content calendar &rarr;</a>
      </div>
    `,
          agency,
          { eyebrow: eyebrowByStatus[status], heroTitle: headlineByStatus[status] },
        ),
      };
    },
  },
  // 09b — Drop comment: changes requested
  {
    key: '09b-drop-comment-changes',
    label: 'Calendar comment, changes requested',
    category: 'transactional',
    render: (agency) => {
      const authorName = 'Trevor';
      const clientName = 'JAMNOLA';
      const status = 'changes_requested' as const;
      const verbBySubject = { approved: 'approved a post', changes_requested: 'requested changes', comment: 'left a comment' };
      const headlineByStatus = {
        approved: `${authorName} approved a post.`,
        changes_requested: `${authorName} requested changes.`,
        comment: `New comment from ${authorName}.`,
      };
      const eyebrowByStatus = { approved: 'Calendar Approved', changes_requested: 'Changes Requested', comment: 'New Comment' };
      const contentPreview = 'Can we tighten the first 3 seconds and re-cut the b-roll?';
      const dropUrl = 'https://cortex.nativz.io/c/sample';
      return {
        subject: `${authorName} ${verbBySubject[status]} on ${clientName}`,
        html: layout(
          `
      <p class="subtext">
        <span class="highlight">${authorName}</span> ${verbBySubject[status]} on the ${clientName} content calendar.
      </p>
      <p class="small" style="margin-bottom: 24px;">
        &ldquo;${contentPreview}&rdquo;
      </p>
      <div class="button-wrap">
        <a href="${dropUrl}" class="button">Open content calendar &rarr;</a>
      </div>
    `,
          agency,
          { eyebrow: eyebrowByStatus[status], heroTitle: headlineByStatus[status] },
        ),
      };
    },
  },
  // 09c — Drop comment: plain comment
  {
    key: '09c-drop-comment-comment',
    label: 'Calendar comment, plain',
    category: 'transactional',
    render: (agency) => {
      const authorName = 'Trevor';
      const clientName = 'JAMNOLA';
      const status = 'comment' as const;
      const verbBySubject = { approved: 'approved a post', changes_requested: 'requested changes', comment: 'left a comment' };
      const headlineByStatus = {
        approved: `${authorName} approved a post.`,
        changes_requested: `${authorName} requested changes.`,
        comment: `New comment from ${authorName}.`,
      };
      const eyebrowByStatus = { approved: 'Calendar Approved', changes_requested: 'Changes Requested', comment: 'New Comment' };
      const contentPreview = 'What about leading with the customer reaction shot?';
      const dropUrl = 'https://cortex.nativz.io/c/sample';
      return {
        subject: `${authorName} ${verbBySubject[status]} on ${clientName}`,
        html: layout(
          `
      <p class="subtext">
        <span class="highlight">${authorName}</span> ${verbBySubject[status]} on the ${clientName} content calendar.
      </p>
      <p class="small" style="margin-bottom: 24px;">
        &ldquo;${contentPreview}&rdquo;
      </p>
      <div class="button-wrap">
        <a href="${dropUrl}" class="button">Open content calendar &rarr;</a>
      </div>
    `,
          agency,
          { eyebrow: eyebrowByStatus[status], heroTitle: headlineByStatus[status] },
        ),
      };
    },
  },
  // 10 — Calendar comment digest
  {
    key: '10-calendar-comment-digest',
    label: 'Calendar comment digest',
    category: 'system',
    render: (agency) => {
      const groups = [
        {
          clientName: 'JAMNOLA',
          dropUrl: 'https://cortex.nativz.io/c/jamnola-april',
          comments: [
            { authorName: 'Trevor', status: 'approved' as const, contentPreview: 'Looks great, ship it.', captionPreview: 'Behind the scenes of the immersive room reveal', createdAt: new Date().toISOString() },
            { authorName: 'Trevor', status: 'changes_requested' as const, contentPreview: 'Tighten the first 3 seconds.', captionPreview: 'Customer reaction reel', createdAt: new Date().toISOString() },
          ],
        },
        {
          clientName: 'Anderson Test',
          dropUrl: 'https://cortex.nativz.io/c/ac-test',
          comments: [
            { authorName: 'Sam', status: 'comment' as const, contentPreview: 'Lead with the founder Q+A?', captionPreview: 'Founder spotlight short', createdAt: new Date().toISOString() },
          ],
        },
      ];
      const totalComments = groups.reduce((sum, g) => sum + g.comments.length, 0);
      const windowLabel = 'past 24 hours';
      const verbByStatus = { approved: 'approved', changes_requested: 'requested changes', comment: 'commented' };
      const sections = groups
        .map((g) => {
          const rows = g.comments
            .map(
              (c) => `
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
              <div style="font-size:13px;color:#fff;"><strong>${c.authorName}</strong> ${verbByStatus[c.status]}</div>
              <div style="font-size:12px;color:#9aa3b2;margin-top:2px;">on &ldquo;${c.captionPreview}&rdquo;</div>
              ${c.contentPreview ? `<div style="font-size:12px;color:#cbd2dd;margin-top:6px;font-style:italic;">&ldquo;${c.contentPreview}&rdquo;</div>` : ''}
            </td>
          </tr>`,
            )
            .join('');
          return `
        <div style="margin-bottom:24px;">
          <h2 style="font-size:15px;font-weight:600;color:#fff;margin:0 0 8px;">${g.clientName}</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
          <div style="margin-top:12px;"><a href="${g.dropUrl}" style="font-size:12px;color:#5eb6ff;text-decoration:none;">Open ${g.clientName}'s calendar &rarr;</a></div>
        </div>`;
        })
        .join('');
      return {
        subject: `${totalComments} content calendar comments, ${windowLabel}`,
        html: layout(
          `
      <p class="subtext">
        ${totalComments} comments across ${groups.length} clients, ${windowLabel}.
      </p>
      ${sections}
    `,
          agency,
          {
            eyebrow: `Calendar Digest · ${windowLabel}`,
            heroTitle: 'Yesterday&rsquo;s calendar activity',
          },
        ),
      };
    },
  },
  // 11 — Calendar no-open reminder
  {
    key: '11-calendar-no-open-reminder',
    label: 'Calendar reminder, not opened',
    category: 'transactional',
    render: (agency) => {
      const clientName = 'JAMNOLA';
      const shareUrl = 'https://cortex.nativz.io/c/sample';
      const hours = 24;
      const pending = 12;
      const total = 14;
      const noun = pending === 1 ? 'post' : 'posts';
      return {
        subject: `${pending} ${noun} still need your review`,
        html: layout(
          `
      <p class="subtext">Hey ${clientName}, we sent over your latest content calendar about ${hours} hours ago and haven't seen anyone open it yet. Take a quick look and either approve the posts or drop comments where anything needs to change.</p>
      <div class="button-wrap">
        <a href="${shareUrl}" class="btn">Open your calendar</a>
      </div>
    `,
          agency,
          {
            eyebrow: 'Calendar Reminder',
            heroTitle: `${pending} of ${total} ${pending === 1 ? 'post' : 'posts'} still need your review`,
          },
        ),
      };
    },
  },
  // 12 — Calendar no-action reminder
  {
    key: '12-calendar-no-action-reminder',
    label: 'Calendar reminder, no action',
    category: 'transactional',
    render: (agency) => {
      const clientName = 'JAMNOLA';
      const shareUrl = 'https://cortex.nativz.io/c/sample';
      const pending = 8;
      const total = 14;
      const noun = pending === 1 ? 'post' : 'posts';
      const partialAction = pending < total;
      const body = partialAction
        ? `Hey ${clientName}, you've reviewed some of the calendar already, thanks for that. ${pending} of ${total} ${noun} still need your eyes. Hit reply or drop comments directly on the posts.`
        : `Hey ${clientName}, you opened the calendar but the ${total} ${total === 1 ? 'post' : 'posts'} still need your review. Hit reply or drop comments directly on the posts.`;
      return {
        subject: `${pending} ${noun} still need your review`,
        html: layout(
          `
      <p class="subtext">${body}</p>
      <div class="button-wrap">
        <a href="${shareUrl}" class="btn">Review the posts</a>
      </div>
    `,
          agency,
          { eyebrow: 'Calendar Reminder', heroTitle: `${pending} of ${total} ${noun} still need your review` },
        ),
      };
    },
  },
  // 13 — Calendar followup
  {
    key: '13-calendar-followup',
    label: 'Calendar followup nudge',
    category: 'transactional',
    render: (agency) => {
      const pocFirstNames = ['Trevor', 'Sam'];
      const clientName = 'JAMNOLA';
      const shareUrl = 'https://cortex.nativz.io/c/sample';
      const greetingNames = pocFirstNames.length ? pocFirstNames.join(', ') : clientName;
      const message =
        `Hey ${greetingNames}, just circling back on the latest content calendar for ${clientName}. ` +
        `Whenever you have a few minutes, take a look and either approve the posts or drop comments where anything needs to change.\n\n` +
        `No rush, but the sooner we hear from you, the sooner the team can lock everything in.`;
      const bodyHtml = messageToHtmlParagraphs(message);
      return {
        subject: 'Checking in on your content calendar',
        html: layout(
          `
      ${bodyHtml}
      <div class="button-wrap">
        <a href="${shareUrl}" class="btn">Open the calendar</a>
      </div>
    `,
          agency,
          { eyebrow: 'Calendar Check-In', heroTitle: `Checking in on ${clientName}'s calendar` },
        ),
      };
    },
  },
  // 14 — Calendar final call
  {
    key: '14-calendar-final-call',
    label: 'Calendar final call',
    category: 'transactional',
    render: (agency) => {
      const clientName = 'JAMNOLA';
      const shareUrl = 'https://cortex.nativz.io/c/sample';
      const firstPostAt = 'tomorrow at 9am';
      const pending = 4;
      const total = 14;
      const noun = pending === 1 ? 'post' : 'posts';
      return {
        subject: `${pending} ${noun} still pending, first post goes live ${firstPostAt}`,
        html: layout(
          `
      <p class="subtext">Hey ${clientName}, your first scheduled post goes live ${firstPostAt}. ${pending} of ${total} ${noun} still ${pending === 1 ? 'needs' : 'need'} your sign-off, so unless you flag something we'll publish on the dates you saw in the calendar.</p>
      <p class="subtext" style="margin-top:10px;">If anything needs to change, drop a comment on the post or hit reply now.</p>
      <div class="button-wrap">
        <a href="${shareUrl}" class="btn">Open the calendar</a>
      </div>
    `,
          agency,
          { eyebrow: 'Final Call', heroTitle: 'Final call before we publish' },
        ),
      };
    },
  },
  // 15 — Calendar delivery (initial)
  {
    key: '15-calendar-delivery',
    label: 'Calendar delivery (single brand)',
    category: 'transactional',
    render: (agency) => {
      const isAC = agency === 'anderson';
      const teamShort = isAC ? 'the AC team' : 'the Nativz team';
      const replyTo = isAC ? 'jack@andersoncollaborative.com' : 'jack@nativz.io';
      const startDate = '2026-05-01';
      const endDate = '2026-05-31';
      const monthLabel = new Date(`${startDate}T00:00:00Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
      const greeting = `Hey ${humanizeNameList(['Trevor', 'Sam'])}`;
      const postCount = 14;
      const shareUrl = 'https://cortex.nativz.io/c/sample';
      const introBlock = `<p class="subtext" style="text-align:center; margin-top:12px;">
         Quick heads up: content calendars are now landing in your inbox so we can
         turn revisions around faster. Reply, comment on a post, or approve everything in one click.
       </p>`;
      return {
        subject: `Your ${monthLabel} content calendar from ${isAC ? 'Anderson Collaborative' : 'Nativz'} is ready`,
        html: layout(
          `
    <p class="subtext">
      ${greeting}, ${teamShort} just shipped <span class="highlight">${postCount} posts</span>
      for you to review, scheduled across ${formatDateLabel(startDate)} to ${formatDateLabel(endDate)}.
      Tap the button below to watch the videos, read the captions, and approve or
      request changes one post at a time.
    </p>
    ${introBlock}
    <div class="button-wrap">
      <a href="${shareUrl}" class="button">Open content calendar &rarr;</a>
    </div>
    <p class="small" style="text-align:center; margin-top:24px;">
      Questions or want to chat about a post? Just reply to this email and it'll come straight to ${replyTo}.
    </p>
  `,
          agency,
          { eyebrow: `${monthLabel} Calendar`, heroTitle: `Your ${monthLabel} content calendar is ready` },
        ),
      };
    },
  },
  // 16 — Combined calendar delivery
  {
    key: '16-calendar-delivery-combined',
    label: 'Calendar delivery (multi-brand)',
    category: 'transactional',
    render: (agency) => {
      const isAC = agency === 'anderson';
      const teamShort = isAC ? 'the AC team' : 'the Nativz team';
      const replyTo = isAC ? 'jack@andersoncollaborative.com' : 'jack@nativz.io';
      const calendars = [
        { clientName: 'JAMNOLA', postCount: 12, startDate: '2026-05-01', endDate: '2026-05-31', shareUrl: 'https://cortex.nativz.io/c/jam' },
        { clientName: 'Beaux', postCount: 8, startDate: '2026-05-01', endDate: '2026-05-28', shareUrl: 'https://cortex.nativz.io/c/beaux' },
      ];
      const monthLabel = new Date(`${calendars[0].startDate}T00:00:00Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
      const greeting = `Hey ${humanizeNameList(['Trevor', 'Sam'])}`;
      const brandList = humanizeNameList(calendars.map((c) => c.clientName));
      const introBlock = `<p class="subtext" style="text-align:center; margin-top:12px;">
         Quick heads up: content calendars are now landing in your inbox so we can
         turn revisions around faster. Reply, comment on a post, or approve everything in one click.
       </p>`;
      const calendarSections = calendars
        .map(
          (c) => `
        <div style="margin-top:18px;padding:18px 20px;border:1px solid #e8ecf0;border-radius:10px;background:#f7f9fb;">
          <h2 style="font-family:inherit;font-size:18px;font-weight:700;color:inherit;margin:0 0 6px;">${c.clientName}</h2>
          <p class="small" style="margin:0 0 12px;">
            <span class="highlight">${c.postCount} posts</span>
            scheduled ${formatDateLabel(c.startDate)} to ${formatDateLabel(c.endDate)}.
          </p>
          <div>
            <a href="${c.shareUrl}" class="button">Open ${c.clientName} calendar &rarr;</a>
          </div>
        </div>
      `,
        )
        .join('');
      return {
        subject: `Your ${monthLabel} content calendars from ${isAC ? 'Anderson Collaborative' : 'Nativz'} are ready`,
        html: layout(
          `
    <p class="subtext">
      ${greeting}, ${teamShort} just shipped fresh calendars for ${brandList}.
      Each one has its own button below, tap in to watch the videos, read the
      captions, and approve or request changes one post at a time.
    </p>
    ${introBlock}
    ${calendarSections}
    <p class="small" style="text-align:center;margin-top:24px;">
      Questions or want to chat about a post? Just reply to this email and it'll come straight to ${replyTo}.
    </p>
  `,
          agency,
          { eyebrow: `${monthLabel} Calendars`, heroTitle: `Your ${monthLabel} content calendars are ready` },
        ),
      };
    },
  },
  // 17 — Calendar share send (initial)
  {
    key: '17-calendar-share-initial',
    label: 'Calendar share send (initial)',
    category: 'transactional',
    render: (agency) => {
      const isAC = agency === 'anderson';
      const replyTo = isAC ? 'jack@andersoncollaborative.com' : 'jack@nativz.io';
      const monthLabel = 'May';
      const subject = `Your ${monthLabel} content calendar from ${isAC ? 'Anderson Collaborative' : 'Nativz'} is ready`;
      const message =
        `Hey Trevor, ${isAC ? 'the AC team' : 'the Nativz team'} just shipped 14 posts for you to review, scheduled across May 1 to May 31.\n\n` +
        `Tap the button below to watch the videos, read the captions, and approve or request changes one post at a time.`;
      const bodyHtml = messageToHtmlParagraphs(message);
      const shareUrl = 'https://cortex.nativz.io/c/sample';
      return {
        subject,
        html: layout(
          `
    ${bodyHtml}
    <div class="button-wrap" style="margin-top:24px;text-align:center;">
      <a href="${shareUrl}" class="button">Open content calendar &rarr;</a>
    </div>
    <p class="small" style="text-align:center;margin-top:24px;">
      Questions or want to chat about a post? Just reply to this email and it'll come straight to ${replyTo}.
    </p>
  `,
          agency,
          { eyebrow: 'Calendar Delivery', heroTitle: 'Your content calendar is ready' },
        ),
      };
    },
  },
  // 17b — Calendar share send (revised)
  {
    key: '17b-calendar-share-revised',
    label: 'Calendar share send (revised)',
    category: 'transactional',
    render: (agency) => {
      const isAC = agency === 'anderson';
      const replyTo = isAC ? 'jack@andersoncollaborative.com' : 'jack@nativz.io';
      const message =
        `Hey Trevor, ${isAC ? 'the AC team' : 'the Nativz team'} just made revisions to the May content calendar.\n\n` +
        `Tap the button below to re-review the 14 posts scheduled across May 1 to May 31, then approve or leave another comment if anything still needs to change.`;
      const bodyHtml = messageToHtmlParagraphs(message);
      const shareUrl = 'https://cortex.nativz.io/c/sample';
      return {
        subject: 'JAMNOLA: revised content calendar ready for review',
        html: layout(
          `
    ${bodyHtml}
    <div class="button-wrap" style="margin-top:24px;text-align:center;">
      <a href="${shareUrl}" class="button">Re-review the calendar &rarr;</a>
    </div>
    <p class="small" style="text-align:center;margin-top:24px;">
      Questions or want to chat about a post? Just reply to this email and it'll come straight to ${replyTo}.
    </p>
  `,
          agency,
          { eyebrow: 'Calendar Revised', heroTitle: 'Revised content calendar ready' },
        ),
      };
    },
  },
  // 18 — Calendar revisions complete
  {
    key: '18-calendar-revisions-complete',
    label: 'Calendar revisions complete',
    category: 'transactional',
    render: (agency) => {
      const clientName = 'JAMNOLA';
      const shareUrl = 'https://cortex.nativz.io/c/sample';
      return {
        subject: 'Your revisions are ready to review',
        html: layout(
          `
    <p class="subtext">Hey ${clientName}, we've worked through every change you flagged. Hop back in to take a final look and approve the posts you're happy with.</p>
    <div class="button-wrap">
      <a href="${shareUrl}" class="btn">Review the updated posts</a>
    </div>
  `,
          agency,
          { eyebrow: 'Revisions Complete', heroTitle: 'Revisions complete' },
        ),
      };
    },
  },
  // 19 — Calendar revised videos
  {
    key: '19-calendar-revised-videos',
    label: 'Calendar revised videos ready',
    category: 'transactional',
    render: (agency) => {
      const isAC = agency === 'anderson';
      const teamLabel = isAC ? 'AC editing team' : 'Nativz editing team';
      const replyTo = isAC ? 'jack@andersoncollaborative.com' : 'jack@nativz.io';
      const greeting = `Hey ${humanizeNameList(['Trevor', 'Sam'])}`;
      const revisedCount = 4;
      const word = revisedCount === 1 ? 'video' : 'videos';
      const summaryBullets = [
        'Tightened the opening 3 seconds on the immersive room reveal',
        'Re-cut the customer reaction reel with the new angle',
        'Swapped in the founder Q+A intro shot',
        'Fixed the audio drop on the hidden room walk-through',
      ];
      const summarySection =
        summaryBullets.length > 0
          ? `
        <p class="subtext" style="margin-top:18px;text-align:center;">Here's what we did:</p>
        <div style="text-align:center;">
          <ul style="margin:8px 0 0;padding:0 0 0 20px;display:inline-block;text-align:left;">
            ${summaryBullets
              .map((b) => `<li style="color:#cbd2dd;font-size:14px;line-height:1.55;margin:0 0 6px;">${escapeHtml(b)}</li>`)
              .join('')}
          </ul>
        </div>
      `
          : '';
      const shareUrl = 'https://cortex.nativz.io/c/sample';
      return {
        subject: `JAMNOLA: revised ${word} ready for review`,
        html: layout(
          `
    <p class="subtext">
      ${greeting},
    </p>
    <p class="subtext">
      The ${teamLabel} has implemented the requested changes and the revised
      calendar is ready for review.
    </p>
    ${summarySection}
    <div class="button-wrap" style="margin-top:24px;text-align:center;">
      <a href="${shareUrl}" class="button">Re-review the calendar &rarr;</a>
    </div>
    <p class="subtext" style="margin-top:24px;">
      If there's any more feedback please let us know, or mark each post as
      approved if it matches what you were looking for.
    </p>
    <p class="small" style="text-align:center;margin-top:24px;">
      Questions or want to chat about a post? Just reply to this email and it'll come straight to ${replyTo}.
    </p>
  `,
          agency,
          { eyebrow: 'Revised Cuts Ready', heroTitle: `Revised ${word} ready for review` },
        ),
      };
    },
  },
  // 20 — Post-health alert (Nativz only, internal)
  {
    key: '20-post-health-alert',
    label: 'Post health alert (ops)',
    category: 'system',
    render: (agency) => {
      // This sender hard-codes 'nativz', but we still render both brands so
      // Jack can see what it would look like if we ever surfaced AC variant.
      const failedPosts = [
        { postId: 'p1', clientName: 'JAMNOLA', caption: 'Behind the scenes immersive reveal', scheduledFor: '2026-05-01T14:00:00Z', failureReason: 'Connection reset by peer (TikTok upload)', retryCount: 2 },
      ];
      const disconnects = [
        { profileId: 'd1', clientName: 'Beaux', platform: 'instagram', username: 'beaux_official' },
      ];
      const failedSection = `
    <h2 style="color:#fff;font-size:16px;font-weight:700;margin:0 0 12px;">Failed posts (${failedPosts.length})</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
      ${failedPosts
        .map(
          (p) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #1f2937;">
            <p style="margin:0 0 4px;color:#fff;font-size:14px;font-weight:600;">${escapeHtml(p.clientName)}</p>
            <p style="margin:0 0 4px;color:#94a3b8;font-size:12px;">
              ${new Date(p.scheduledFor).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })} · retries: ${p.retryCount}
            </p>
            <p style="margin:0 0 6px;color:#cbd5e1;font-size:13px;line-height:1.5;">${escapeHtml(p.caption)}</p>
            <p style="margin:0;color:#fca5a5;font-size:12px;font-family:ui-monospace,Menlo,monospace;">${escapeHtml(p.failureReason)}</p>
          </td>
        </tr>
      `,
        )
        .join('')}
    </table>
  `;
      const disconnectSection = `
    <h2 style="color:#fff;font-size:16px;font-weight:700;margin:0 0 12px;">Disconnected accounts (${disconnects.length})</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
      ${disconnects
        .map(
          (d) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #1f2937;">
            <p style="margin:0 0 4px;color:#fff;font-size:14px;font-weight:600;">${escapeHtml(d.clientName)}</p>
            <p style="margin:0;color:#94a3b8;font-size:12px;">
              ${escapeHtml(d.platform)} · @${escapeHtml(d.username)}
            </p>
          </td>
        </tr>
      `,
        )
        .join('')}
    </table>
  `;
      const subjectParts = [`${failedPosts.length} failed post${failedPosts.length === 1 ? '' : 's'}`, `${disconnects.length} disconnect${disconnects.length === 1 ? '' : 's'}`];
      return {
        subject: `[Cortex] ${subjectParts.join(' · ')}`,
        html: layout(
          `
    <p class="subtext">
      The post-health cron picked up new issues. Each row fires once, re-posts and reconnects clear automatically.
    </p>
    ${failedSection}
    ${disconnectSection}
    <div class="button-wrap">
      <a href="https://cortex.nativz.io/admin/calendar" class="button">Open the calendar &rarr;</a>
    </div>
  `,
          agency,
          { eyebrow: `Health Alert · ${subjectParts.join(' · ')}`, heroTitle: 'Posting health alert' },
        ),
      };
    },
  },
  // 21 — Editing deliverable
  {
    key: '21-editing-deliverable',
    label: 'Editing deliverable (cuts ready)',
    category: 'transactional',
    render: (agency) => {
      const projectName = 'JAMNOLA April Wave 1';
      const greetingNames = 'Trevor, Sam';
      const message =
        `Hey ${greetingNames}, the latest cuts for ${projectName} are ready for your review. ` +
        `Tap the button below to watch each video and either approve it or drop comments where you'd like changes.\n\n` +
        `Once you've signed off we'll get everything packaged for delivery.`;
      const bodyHtml = messageToHtmlParagraphs(message);
      const shareUrl = 'https://cortex.nativz.io/c/edit/sample-token';
      return {
        subject: `Your ${projectName} cuts are ready for review`,
        html: layout(
          `
      ${bodyHtml}
      <div class="button-wrap">
        <a href="${shareUrl}" class="btn">Watch the cuts</a>
      </div>
    `,
          agency,
          { eyebrow: 'Cuts Delivered', heroTitle: `${projectName} cuts ready for review` },
        ),
      };
    },
  },
  // 22 — Editing rereview
  {
    key: '22-editing-rereview',
    label: 'Editing rereview (revisions ready)',
    category: 'transactional',
    render: (agency) => {
      const projectName = 'JAMNOLA April Wave 1';
      const greetingNames = 'Trevor, Sam';
      const pendingCount = 4;
      const cutWord = pendingCount === 1 ? 'cut' : 'cuts';
      const subject = pendingCount > 0 ? `Revised ${projectName} ${cutWord} ready for re-review` : `Re-review ready for ${projectName}`;
      const message =
        pendingCount > 0
          ? `Hey ${greetingNames}, we worked through the notes and re-uploaded ${pendingCount} revised ${cutWord} for ${projectName}. ` +
            `Tap the button below to watch the new versions and either approve them or drop more comments.\n\n` +
            `Thanks for the quick turn on the last round.`
          : `Hey ${greetingNames}, the revised ${projectName} cuts are ready for another look. ` +
            `Tap the button below to watch the new versions and either approve them or drop more comments.`;
      const bodyHtml = messageToHtmlParagraphs(message);
      const shareUrl = 'https://cortex.nativz.io/c/edit/sample-token';
      return {
        subject,
        html: layout(
          `
      ${bodyHtml}
      <div class="button-wrap">
        <a href="${shareUrl}" class="btn">Watch the revised cuts</a>
      </div>
    `,
          agency,
          { eyebrow: 'Revised Cuts Ready', heroTitle: `${projectName} revisions ready` },
        ),
      };
    },
  },
  // 23 — Shoot brief reminder (48h)
  {
    key: '23-shoot-brief-reminder',
    label: 'Shoot brief reminder (48h)',
    category: 'transactional',
    render: (agency) => {
      const memberFirstName = 'Trevor';
      const clientName = 'JAMNOLA';
      const shootTitle = 'JAMNOLA founder Q+A on-site';
      const shootDateISO = '2026-05-04T15:00:00Z';
      const location = 'JAMNOLA Studio, New Orleans';
      const contentLabUrl = 'https://cortex.nativz.io/admin/content-lab';
      const safeName = escapeHtml(memberFirstName);
      const when = escapeHtml(formatShootDateTime(shootDateISO));
      const safeLocation = escapeHtml(location);
      const subtext = `<span class="highlight">${escapeHtml(clientName)}</span> is on the calendar for <strong>${when}</strong> at ${safeLocation}. Open Content Lab, switch to ${escapeHtml(clientName)} in the brand pill, and put together a brief: script ideas, video angles, anything the crew needs to walk on set with.`;
      const heading = `${safeName}, you have a ${escapeHtml(clientName)} shoot in 48 hours.`;
      return {
        subject: `Shoot in 48 hours: ${clientName}, send a brief`,
        html: layout(
          `
      <p class="subtext">${subtext}</p>
      <div class="button-wrap">
        <a href="${contentLabUrl}" class="button">Open Content Lab &rarr;</a>
      </div>
      <hr class="divider" />
      <p class="small">
        This is an internal heads-up, no client sees it. Fired 48 hours before every shoot on the team calendar.
      </p>
    `,
          agency,
          { eyebrow: 'Shoot in 48 Hours', heroTitle: heading },
        ),
      };
    },
  },
  // 24 — Proposal review and sign
  {
    key: '24-proposal',
    label: 'Proposal review and sign',
    category: 'transactional',
    render: (agency) => {
      const firstName = 'Trevor';
      const proposalTitle = 'JAMNOLA Q3 Editing Package';
      const externalUrl = 'https://andersoncollab.github.io/proposals/sample';
      const brandName = agency === 'anderson' ? 'Anderson Collaborative' : 'Nativz';
      const cardHtml = `
      <p class="subtext">
        <strong>${escapeHtml(proposalTitle)}</strong> is ready for your review and signature.
        Pick your tier, fill in a few details, and sign. Payment runs on Stripe at the end.
      </p>
      <div class="button-wrap">
        <a href="${externalUrl}" class="button">Review and sign &rarr;</a>
      </div>
      <hr class="divider" />
      <p class="small">
        Or open: <a href="${externalUrl}" style="color:inherit;text-decoration:underline;">${externalUrl}</a>
      </p>
      <p class="small" style="margin-top:16px;">
        Questions? Reply to this email, it comes straight to the ${escapeHtml(brandName)} team.
      </p>`;
      return {
        subject: `Proposal · ${proposalTitle}`,
        html: layout(cardHtml, agency, {
          eyebrow: 'Proposal',
          heroTitle: `Your proposal is ready, ${firstName}.`,
        }),
      };
    },
  },
  // 25 — Onboarding POC invite
  {
    key: '25-onboarding-poc-invite',
    label: 'Onboarding POC invite',
    category: 'system',
    render: (agency) => {
      const clientName = 'JAMNOLA';
      const url = 'https://cortex.nativz.io/onboarding/sample';
      return {
        subject: `Welcome to ${clientName}, let's get you set up`,
        html: layout(
          `
    <p class="subtext">
      Your agreement is signed and the deposit cleared, thank you. The next
      step is a short setup checklist. It takes about 15 minutes and unlocks
      every single thing we'll do together.
    </p>
    <div class="button-wrap">
      <a class="button" href="${url}">Open your setup checklist &rarr;</a>
    </div>
    <hr class="divider" />
    <p class="small">
      Questions? Just reply to this email. We are watching, every box you
      tick lights up our dashboard in real time.
    </p>`,
          agency,
          { eyebrow: 'Onboarding Kickoff', heroTitle: `Welcome aboard, ${clientName}.` },
        ),
      };
    },
  },
  // 26 — Onboarding POC reminder
  {
    key: '26-onboarding-poc-reminder',
    label: 'Onboarding POC reminder',
    category: 'system',
    render: (agency) => {
      const clientName = 'JAMNOLA';
      const url = 'https://cortex.nativz.io/onboarding/sample';
      return {
        subject: `Quick nudge, your ${clientName} setup checklist`,
        html: layout(
          `
    <p class="subtext">
      Just bumping this to the top of your inbox. Your setup checklist
      still has a few open items. The faster you get them in, the
      faster we start producing for you.
    </p>
    <div class="button-wrap">
      <a class="button" href="${url}">Pick up where you left off &rarr;</a>
    </div>
    <hr class="divider" />
    <p class="small">
      Stuck on a step? Reply to this email and we'll jump on a call or
      screen-share whatever's blocking you.
    </p>`,
          agency,
          { eyebrow: 'Quick Nudge', heroTitle: `Hey ${clientName}, quick nudge.` },
        ),
      };
    },
  },
  // 27 — Onboarding stakeholder milestone (invoice paid)
  {
    key: '27-onboarding-milestone-invoice-paid',
    label: 'Onboarding milestone (invoice paid)',
    category: 'system',
    render: (agency) => {
      const stakeholderName = 'Trevor Anderson';
      const clientName = 'JAMNOLA';
      const headline = '$8,500.00 invoice paid';
      const flowUrl = 'https://cortex.nativz.io/admin/onboarding/sample';
      const firstName = stakeholderName.split(' ')[0];
      const subtext = `Hi ${firstName}, <strong>${clientName}</strong> just hit a milestone you opted into.`;
      const primaryCta = `<a class="button" href="${flowUrl}">Open the flow &rarr;</a>`;
      return {
        subject: `[${clientName}] ${headline}`,
        html: layout(
          `
    <p class="subtext">${subtext}</p>
    <div class="button-wrap">${primaryCta}</div>`,
          agency,
          { eyebrow: 'Invoice Paid', heroTitle: `${clientName}: ${headline}` },
        ),
      };
    },
  },
  // 28 — Onboarding stakeholder milestone (segment completed)
  {
    key: '28-onboarding-milestone-segment',
    label: 'Onboarding milestone (segment complete)',
    category: 'system',
    render: (agency) => {
      const stakeholderName = 'Trevor Anderson';
      const clientName = 'JAMNOLA';
      const headline = 'Brand profile completed';
      const flowUrl = 'https://cortex.nativz.io/admin/onboarding/sample';
      const firstName = stakeholderName.split(' ')[0];
      const subtext = `Hi ${firstName}, <strong>${clientName}</strong> just hit a milestone you opted into.`;
      const primaryCta = `<a class="button" href="${flowUrl}">Open the flow &rarr;</a>`;
      return {
        subject: `[${clientName}] ${headline}`,
        html: layout(
          `
    <p class="subtext">${subtext}</p>
    <div class="button-wrap">${primaryCta}</div>`,
          agency,
          { eyebrow: 'Segment Completed', heroTitle: `${clientName}: ${headline}` },
        ),
      };
    },
  },
  // 29 — Onboarding stakeholder milestone (onboarding complete + kickoff URL)
  {
    key: '29-onboarding-milestone-kickoff',
    label: 'Onboarding milestone (kickoff ready)',
    category: 'system',
    render: (agency) => {
      const stakeholderName = 'Trevor Anderson';
      const clientName = 'JAMNOLA';
      const headline = `Schedule kickoff with ${clientName}`;
      const flowUrl = 'https://cortex.nativz.io/admin/onboarding/sample';
      const kickoffShareUrl = 'https://cortex.nativz.io/kickoff/pick-time/sample';
      const firstName = stakeholderName.split(' ')[0];
      const subtext = `Hi ${firstName}, <strong>${clientName}</strong> finished onboarding. Pick a kickoff time when the team's free.`;
      const primaryCta = `<a class="button" href="${kickoffShareUrl}">Schedule kickoff &rarr;</a>`;
      const secondaryCta = `<p class="subtext" style="margin-top:16px;font-size:13px;"><a href="${flowUrl}">Or open the onboarding tracker &rarr;</a></p>`;
      return {
        subject: `[${clientName}] ${headline}`,
        html: layout(
          `
    <p class="subtext">${subtext}</p>
    <div class="button-wrap">${primaryCta}</div>
    ${secondaryCta}`,
          agency,
          { eyebrow: 'Onboarding Complete', heroTitle: `${clientName}: ${headline}` },
        ),
      };
    },
  },
  // 30 — Onboarding no-progress flag
  {
    key: '30-onboarding-no-progress',
    label: 'Onboarding no-progress flag (5d silence)',
    category: 'system',
    render: (agency) => {
      const clientName = 'JAMNOLA';
      const flowUrl = 'https://cortex.nativz.io/admin/onboarding/sample';
      return {
        subject: `[${clientName}] No progress in 5 days`,
        html: layout(
          `
    <p class="subtext">
      No POC activity on this onboarding flow for 5 days. Worth a personal
      nudge. The auto-reminders have already fired, but a real human
      message moves the needle.
    </p>
    <div class="button-wrap">
      <a class="button" href="${flowUrl}">Open the flow &rarr;</a>
    </div>`,
          agency,
          { eyebrow: 'No Progress · 5 Days', heroTitle: `${clientName} has gone quiet.` },
        ),
      };
    },
  },
];

// ── Main: render every preview × every brand and write to disk ──────────────

const ROOT = '/tmp/email-previews';

function ensureDir(p: string) {
  mkdirSync(p, { recursive: true });
}

function writePreview(agency: AgencyBrand, entry: PreviewEntry) {
  const { subject, html } = entry.render(agency);
  const dir = `${ROOT}/${agency}`;
  ensureDir(dir);
  const path = `${dir}/${entry.key}.html`;
  // Annotate the rendered file with subject so the index can show it.
  const annotated = `<!-- subject: ${subject.replace(/-->/g, '--&gt;')} -->\n${html}`;
  writeFileSync(path, annotated, 'utf-8');
  return { path, subject };
}

function buildIndex(agency: AgencyBrand, results: { entry: PreviewEntry; subject: string }[]) {
  const rows = results
    .map(({ entry, subject }) => {
      const safeSubject = subject.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<li><a href="./${entry.key}.html"><strong>${entry.label}</strong></a><br/><span class="subj">${safeSubject}</span><br/><span class="cat">${entry.category}</span></li>`;
    })
    .join('\n');
  const brandLabel = agency === 'anderson' ? 'Anderson Collaborative' : 'Nativz';
  const accent = agency === 'anderson' ? '#36D1C2' : '#00ADEF';
  const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>Email previews · ${brandLabel}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; color: #0a1628; background: #f4f6f9; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h1 .accent { color: ${accent}; }
  p.intro { color: #5b6478; margin: 0 0 24px; font-size: 14px; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { padding: 14px 16px; margin: 0 0 10px; background: #fff; border-radius: 10px; box-shadow: 0 1px 3px rgba(10,22,40,0.06); border-left: 3px solid ${accent}; }
  li a { color: #0a1628; text-decoration: none; font-size: 15px; }
  li a:hover { color: ${accent}; }
  .subj { color: #5b6478; font-size: 12px; }
  .cat { display: inline-block; margin-top: 4px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: ${accent}; font-weight: 600; }
  .switch { margin: 16px 0 28px; font-size: 13px; }
  .switch a { color: ${accent}; text-decoration: none; font-weight: 600; }
</style></head>
<body>
  <h1><span class="accent">${brandLabel}</span> · email previews</h1>
  <p class="intro">${results.length} email types rendered. Click any to open the full HTML in this tab.</p>
  <p class="switch">Switch brand: <a href="../${agency === 'anderson' ? 'nativz' : 'anderson'}/index.html">→ ${agency === 'anderson' ? 'Nativz' : 'Anderson Collaborative'}</a></p>
  <ul>${rows}</ul>
</body></html>`;
  writeFileSync(`${ROOT}/${agency}/index.html`, html, 'utf-8');
}

function buildRootIndex() {
  const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>Email previews</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 80px auto; padding: 0 20px; text-align: center; }
  h1 { font-size: 22px; margin: 0 0 24px; }
  a { display: block; padding: 18px 24px; margin: 12px 0; background: #fff; border-radius: 12px; text-decoration: none; font-size: 16px; color: #0a1628; box-shadow: 0 1px 4px rgba(10,22,40,0.08); }
  a:hover { transform: translateY(-1px); transition: transform 0.15s ease; }
  .nz { border-left: 4px solid #00ADEF; }
  .ac { border-left: 4px solid #36D1C2; }
</style></head>
<body>
  <h1>Email shell previews</h1>
  <a class="nz" href="./nativz/index.html">Nativz catalog →</a>
  <a class="ac" href="./anderson/index.html">Anderson Collaborative catalog →</a>
</body></html>`;
  writeFileSync(`${ROOT}/index.html`, html, 'utf-8');
}

function main() {
  ensureDir(ROOT);
  for (const agency of ['nativz', 'anderson'] as const) {
    const results: { entry: PreviewEntry; subject: string }[] = [];
    for (const entry of PREVIEWS) {
      const { path, subject } = writePreview(agency, entry);
      results.push({ entry, subject });
      console.log(`[${agency}] wrote ${path}`);
    }
    buildIndex(agency, results);
  }
  buildRootIndex();
  console.log(`\nDone. Open: ${ROOT}/index.html`);
}

main();

/**
 * Live "send every email type" smoke test. Wires up every sender in
 * `lib/email/resend.ts` plus the four onboarding system emails and the
 * connection-invite template, then fires each one through Resend with a
 * `[Test]` subject prefix so the recipient can audit the full Cortex email
 * surface end-to-end in their actual inbox.
 *
 * Volume: ~30 sends per agency × 2 agencies (nativz + anderson) = ~60 emails.
 * A 350 ms throttle keeps us under Resend's per-second limit.
 *
 *   TO=jack@nativz.io npx tsx scripts/test-send-all-emails.ts
 *   ONLY=nativz npx tsx scripts/test-send-all-emails.ts
 *   ONLY=anderson npx tsx scripts/test-send-all-emails.ts
 *   FILTER=calendar npx tsx scripts/test-send-all-emails.ts   # substring match on type key
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── env load (tsx doesn't auto-load .env.local for scripts) ────────────
const envPath = resolve(process.cwd(), '.env.local');
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq);
  let val = trimmed.slice(eq + 1);
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

if (!process.env.RESEND_API_KEY) {
  console.error('Missing RESEND_API_KEY in .env.local');
  process.exit(1);
}

import { Resend } from 'resend';
import {
  layout,
  getFromAddress,
  getReplyTo,
  sendTeamInviteEmail,
  sendClientInviteEmail,
  sendWelcomeEmail,
  sendAffiliateWeeklyReportEmail,
  sendWeeklySocialReportEmail,
  sendSearchCompletedEmail,
  sendOnboardingEmail,
  sendCompetitorReportEmail,
  sendDropCommentEmail,
  sendCalendarCommentDigestEmail,
  sendCalendarNoOpenReminderEmail,
  sendCalendarNoActionReminderEmail,
  sendCalendarFollowupEmail,
  sendCalendarFinalCallEmail,
  sendCalendarDeliveryEmail,
  sendCombinedCalendarDeliveryEmail,
  sendCalendarShareSendEmail,
  sendCalendarRevisionsCompleteEmail,
  sendCalendarRevisedVideosEmail,
  sendPostHealthAlertEmail,
  sendEditingDeliverableEmail,
  sendEditingRereviewEmail,
  sendShootBriefReminderEmail,
} from '@/lib/email/resend';
import type { AgencyBrand } from '@/lib/agency/detect';
import type { WeeklySocialReport } from '@/lib/reporting/weekly-social-report';
import type { CompetitorReportData } from '@/lib/reporting/competitor-report-types';

const TO = process.env.TO ?? 'jack@nativz.io';
const ONLY = process.env.ONLY?.toLowerCase();
const FILTER = process.env.FILTER?.toLowerCase();
const AGENCIES: AgencyBrand[] = ONLY === 'anderson'
  ? ['anderson']
  : ONLY === 'nativz'
  ? ['nativz']
  : ['nativz', 'anderson'];

const THROTTLE_MS = 350;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Real production refs pulled from Supabase so the [Test] emails link to live
// surfaces instead of dead /SAMPLE-TOKEN URLs. Refresh with:
//   select token from content_drop_share_links order by created_at desc limit 2;
//   select token from invite_tokens where expires_at > now() ...
//   select token from team_invite_tokens where expires_at > now() ...
//   select token from editing_project_share_links order by created_at desc;
//   select token from connection_invites where expires_at > now() ...
//   select id::text from topic_searches order by created_at desc limit 1;
// Onboarding flow refs stay as placeholders since no live flows exist yet.
const REFS = {
  teamInviteToken: '0d2dd491cc23e609f0963992114fb59d739886a07d4cb3cbacf52e34964a5bc9',
  clientInviteToken: 'ce4d4aecf393a1ae02c31ae7b469eb87e6f4b8d1f17eceb23efa46771efb3c82',
  searchId: '7bdb8ef4-8ba1-42b7-8e05-bfddaabcd1e2',
  calendarShareToken1: 'a8622471a4ab4e92388d1e3252b198453789dc61fb02103b68bcfb5a24b19c31',
  calendarShareToken2: 'a932d0ebf8d070192594c6f127faec373b9abd0d54a1fbfc2dc4f09bee64c9e5',
  editingShareToken: '7875af852723c9fbf590d0ce4398bb375d72aef47c2e9eaba0099f9b815a53b1',
  connectionInviteToken: 'OltTpvXNFNohIJXGmVkNoH4amqOFTvWV',
  // No live onboarding flows in prod yet, leave as placeholder UUID-ish so the
  // URL still parses and the recipient can eyeball the layout.
  onboardingFlowId: '00000000-0000-0000-0000-onboardingflow',
  onboardingPocToken: '00000000-0000-0000-0000-onboardingpoc',
  kickoffScheduleToken: '00000000-0000-0000-0000-kickoffsched',
} as const;

// ── shared fixtures ─────────────────────────────────────────────────────

function clientNameFor(agency: AgencyBrand): string {
  return agency === 'anderson' ? 'Riverwalk Hotel' : 'JAMNOLA';
}

function brandFor(agency: AgencyBrand): string {
  return agency === 'anderson' ? 'Anderson Collaborative' : 'Nativz';
}

function sampleSocialReport(agency: AgencyBrand): WeeklySocialReport {
  const clientName = clientNameFor(agency);
  return {
    clientId: '00000000-0000-0000-0000-000000000001',
    clientName,
    range: { start: '2026-04-25', end: '2026-05-01' },
    followers: {
      delta: 1248,
      perPlatform: [
        { platform: 'tiktok', delta: 612, current: 48210 },
        { platform: 'instagram', delta: 488, current: 26715 },
        { platform: 'youtube', delta: 102, current: 9210 },
        { platform: 'facebook', delta: 46, current: 3854 },
      ],
    },
    aggregates: {
      views: 412_390,
      engagement: 28_104,
      posts: 14,
    },
    topPosts: [
      {
        platform: 'tiktok',
        postUrl: 'https://www.tiktok.com/@example/video/123',
        thumbnailUrl: null,
        caption: 'Behind the scenes of our spring shoot, the team got real about what is hardest about touring six cities in nine days.',
        publishedAt: '2026-04-28T17:00:00Z',
        views: 184_000,
        engagement: 12_310,
      },
      {
        platform: 'instagram',
        postUrl: 'https://instagram.com/p/example',
        thumbnailUrl: null,
        caption: 'Three reasons our crowd kept growing this season (you only need the first one).',
        publishedAt: '2026-04-29T14:00:00Z',
        views: 96_400,
        engagement: 8_445,
      },
      {
        platform: 'youtube',
        postUrl: 'https://youtube.com/shorts/example',
        thumbnailUrl: null,
        caption: 'POV: opening night sound check.',
        publishedAt: '2026-04-30T20:00:00Z',
        views: 41_200,
        engagement: 3_201,
      },
    ],
    upcomingShoots: [
      { shootDate: '2026-05-04', notes: 'Outdoor BTS, 2 talents, 11am call time' },
      { shootDate: '2026-05-06', notes: 'Studio interview series, batch 3 of 5' },
    ],
  };
}

function sampleCompetitorData(agency: AgencyBrand): CompetitorReportData {
  const clientName = clientNameFor(agency);
  return {
    subscription_id: '00000000-0000-0000-0000-000000000002',
    client_id: '00000000-0000-0000-0000-000000000001',
    client_name: clientName,
    client_agency: agency,
    organization_id: null,
    cadence: 'weekly',
    period_start: '2026-04-25',
    period_end: '2026-05-01',
    competitors: [
      {
        username: 'rivalbrand',
        display_name: 'Rival Brand',
        platform: 'tiktok',
        profile_url: 'https://www.tiktok.com/@rivalbrand',
        followers: 124_500,
        followers_delta: 3_210,
        posts_count: 18,
        posts_count_delta: 4,
        avg_views: 86_200,
        avg_views_delta: -8_400,
        engagement_rate: 0.064,
        engagement_rate_delta: 0.012,
        posting_frequency: 'Daily',
        top_posts: [
          {
            description: 'Day in the life of our touring crew, why we still pack the same socks every single trip.',
            views: 184_000,
            likes: 12_410,
            comments: 821,
          },
          {
            description: 'Three pieces of gear we replaced this year and the one we will never replace.',
            views: 92_300,
            likes: 6_120,
            comments: 410,
          },
        ],
        follower_series: [],
        snapshot_captured_at: '2026-05-01T08:00:00Z',
        scrape_error: null,
      },
      {
        username: 'secondplace',
        display_name: 'Second Place',
        platform: 'instagram',
        profile_url: 'https://instagram.com/secondplace',
        followers: 58_900,
        followers_delta: -210,
        posts_count: 7,
        posts_count_delta: -2,
        avg_views: 28_400,
        avg_views_delta: 2_100,
        engagement_rate: 0.041,
        engagement_rate_delta: -0.004,
        posting_frequency: '3-4x per week',
        top_posts: [
          {
            description: 'A reminder that your weekend is a state of mind, not a calendar entry.',
            views: 41_200,
            likes: 2_310,
            comments: 187,
          },
        ],
        follower_series: [],
        snapshot_captured_at: '2026-05-01T08:00:00Z',
        scrape_error: 'Rate-limited on first attempt, retried successfully.',
      },
    ],
    generated_at: new Date().toISOString(),
  };
}

// ── runner ──────────────────────────────────────────────────────────────

interface TestSend {
  key: string;
  label: string;
  agency: AgencyBrand;
  fire: () => Promise<{ ok: boolean; id?: string | null; error?: string }>;
}

const sends: TestSend[] = [];

function pushBoth(
  key: string,
  label: string,
  build: (agency: AgencyBrand) => TestSend['fire'],
) {
  for (const agency of AGENCIES) {
    sends.push({ key, label, agency, fire: build(agency) });
  }
}

// ── transactional + system senders ──────────────────────────────────────

pushBoth('team_invite', 'Team invite', (agency) => async () => {
  const r = await sendTeamInviteEmail({
    to: TO,
    memberName: 'Jack',
    invitedBy: 'Trevor Anderson',
    inviteUrl: `https://cortex.nativz.io/accept-invite/${REFS.teamInviteToken}`,
    agency,
  });
  return { ok: r.ok, id: r.messageId, error: r.error };
});

pushBoth('client_invite', 'Client portal invite', (agency) => async () => {
  const r = await sendClientInviteEmail({
    to: TO,
    contactName: 'Jack',
    clientName: clientNameFor(agency),
    inviteUrl: `https://cortex.nativz.io/portal/join/${REFS.clientInviteToken}`,
    invitedBy: 'Trevor Anderson',
    agency,
  });
  return { ok: r.ok, id: r.messageId, error: r.error };
});

pushBoth('welcome', 'Welcome email', (agency) => async () => {
  const r = await sendWelcomeEmail({
    to: TO,
    name: 'Jack',
    role: 'admin',
    loginUrl: 'https://cortex.nativz.io/login',
    agency,
  });
  return { ok: r.ok, id: r.messageId, error: r.error };
});

pushBoth('affiliate_weekly_report', 'Affiliate weekly report', (agency) => async () => {
  const r = await sendAffiliateWeeklyReportEmail({
    to: [TO],
    clientName: clientNameFor(agency),
    rangeLabel: 'Apr 25 to May 1',
    kpis: {
      newAffiliates: 12,
      totalAffiliates: 184,
      activeAffiliates: 96,
      referralsInPeriod: 47,
      periodRevenue: 9_840,
      totalClicks: 12_410,
    },
    topAffiliates: [
      { name: 'Maya Chen', revenue: 2_410, referrals: 11 },
      { name: 'Diego Ramirez', revenue: 1_820, referrals: 9 },
      { name: 'Sophie Tran', revenue: 1_240, referrals: 6 },
    ],
    isTestOverride: true,
    agency,
  });
  return { ok: r.ok, id: r.messageId, error: r.error };
});

pushBoth('weekly_social_report', 'Weekly social report', (agency) => async () => {
  const r = await sendWeeklySocialReportEmail({
    to: [TO],
    report: sampleSocialReport(agency),
    rangeLabel: 'Apr 25 to May 1',
    isTestOverride: true,
    agency,
  });
  return { ok: r.ok, id: r.messageId, error: r.error };
});

pushBoth('search_completed', 'Research/search completed', (agency) => async () => {
  const r = await sendSearchCompletedEmail({
    to: TO,
    query: 'spring tour creative angles',
    clientName: clientNameFor(agency),
    summaryPreview:
      'Three angles are trending this week, behind-the-scenes touring footage, day-in-the-life crew content, and gear-pack reveals. The full report breaks each cluster down with example posts and suggested hooks.',
    resultsUrl: `https://cortex.nativz.io/research/${REFS.searchId}`,
    agency,
  });
  return { ok: r.ok, id: r.messageId, error: r.error };
});

pushBoth('onboarding_markdown', 'Onboarding (admin → client, markdown)', (agency) => async () => {
  const portalUrl = agency === 'anderson'
    ? 'https://cortex.andersoncollaborative.com/portal'
    : 'https://cortex.nativz.io/portal';
  const r = await sendOnboardingEmail({
    to: TO,
    subject: `[Test] Quick note from ${brandFor(agency)}`,
    bodyMarkdown: [
      `# Hi Jack,`,
      ``,
      `A quick checkpoint, wanted to make sure the kickoff packet landed and you have everything you need to get rolling. Below is a snapshot of where things stand.`,
      ``,
      `## Where we are`,
      ``,
      `Brand brief is in, first round of topic research is queued, and the shoot calendar is roughed in for the next four weeks. We're waiting on three small things from your side before we hit record.`,
      ``,
      `**Outstanding items:**`,
      `- Brand guidelines PDF (current version, even rough)`,
      `- Logo SVGs, light + dark variants`,
      `- Top three reference accounts you want us studying`,
      ``,
      `## What happens next`,
      ``,
      `Once the items above land, we'll lock the shoot dates and send the script outline for round one. You'll see drafts inside the portal before anything goes live, so nothing ships without your sign-off.`,
      ``,
      `[Open the client portal](${portalUrl})`,
      ``,
      `Happy to jump on a quick call if it's faster than email.`,
      ``,
      `Thanks,`,
      `- The ${brandFor(agency)} team`,
    ].join('\n'),
    agency,
  });
  return { ok: r.ok, id: r.ok ? r.id : null, error: r.ok ? undefined : r.error };
});

pushBoth('competitor_report', 'Competitor report', (agency) => async () => {
  const r = await sendCompetitorReportEmail({
    to: [TO],
    data: sampleCompetitorData(agency),
    analyticsUrl: 'https://cortex.nativz.io/analytics/competitors',
    isTestOverride: true,
    agency,
  });
  return { ok: r.ok, id: r.ok ? r.id : null, error: r.ok ? undefined : r.error };
});

for (const status of ['comment', 'approved', 'changes_requested'] as const) {
  pushBoth(`drop_comment_${status}`, `Calendar comment (${status})`, (agency) => async () => {
    const r = await sendDropCommentEmail({
      to: TO,
      authorName: 'Trevor Anderson',
      clientName: clientNameFor(agency),
      status,
      contentPreview:
        status === 'changes_requested'
          ? 'Can we swap the b-roll at 0:14 for a wider shot, this one feels cropped. Otherwise looks great.'
          : status === 'approved'
          ? 'Locked in, ship it.'
          : 'Quick thought, the hook lands harder if we cut the first second.',
      dropUrl: `https://cortex.nativz.io/c/${REFS.calendarShareToken1}`,
      agency,
    });
    return { ok: r.ok, id: r.messageId, error: r.error };
  });
}

pushBoth('calendar_comment_digest', 'Calendar comment digest', (agency) => async () => {
  const clientName = clientNameFor(agency);
  const r = await sendCalendarCommentDigestEmail({
    to: TO,
    windowLabel: 'last 24 hours',
    groups: [
      {
        clientName,
        dropUrl: `https://cortex.nativz.io/c/${REFS.calendarShareToken1}`,
        comments: [
          {
            authorName: 'Trevor Anderson',
            status: 'approved',
            contentPreview: '',
            captionPreview: 'Behind the scenes of our spring shoot...',
            createdAt: new Date().toISOString(),
          },
          {
            authorName: 'Sara Lee',
            status: 'changes_requested',
            contentPreview: 'Can we swap the b-roll at 0:14, feels too tight.',
            captionPreview: 'Three reasons our crowd kept growing...',
            createdAt: new Date().toISOString(),
          },
          {
            authorName: 'Diego R.',
            status: 'comment',
            contentPreview: 'Hook lands harder if we cut the first second.',
            captionPreview: 'POV: opening night sound check.',
            createdAt: new Date().toISOString(),
          },
        ],
      },
    ],
    agency,
  });
  return { ok: r.ok, id: r.messageId, error: r.error };
});

pushBoth('calendar_no_open_reminder', 'Calendar no-open reminder', (agency) => async () => {
  const r = await sendCalendarNoOpenReminderEmail({
    to: TO,
    pocFirstNames: ['Jack'],
    clientName: clientNameFor(agency),
    shareUrl: `https://cortex.nativz.io/c/${REFS.calendarShareToken1}`,
    hours: 18,
    pending: 9,
    total: 9,
    agency,
  });
  return { ok: r.ok, id: r.messageId, error: r.error };
});

pushBoth('calendar_no_action_reminder', 'Calendar no-action reminder', (agency) => async () => {
  const r = await sendCalendarNoActionReminderEmail({
    to: TO,
    pocFirstNames: ['Jack'],
    clientName: clientNameFor(agency),
    shareUrl: `https://cortex.nativz.io/c/${REFS.calendarShareToken1}`,
    hours: 36,
    pending: 4,
    total: 9,
    agency,
  });
  return { ok: r.ok, id: r.messageId, error: r.error };
});

pushBoth('calendar_followup', 'Calendar followup nudge', (agency) => async () => {
  const r = await sendCalendarFollowupEmail({
    to: TO,
    pocFirstNames: ['Jack', 'Trevor'],
    clientName: clientNameFor(agency),
    shareUrl: `https://cortex.nativz.io/c/${REFS.calendarShareToken1}`,
    agency,
  });
  return { ok: r.ok, id: r.messageId, error: r.error };
});

pushBoth('calendar_final_call', 'Calendar final call', (agency) => async () => {
  const r = await sendCalendarFinalCallEmail({
    to: TO,
    pocFirstNames: ['Jack'],
    clientName: clientNameFor(agency),
    shareUrl: `https://cortex.nativz.io/c/${REFS.calendarShareToken1}`,
    firstPostAt: 'Sunday at 9am',
    pending: 3,
    total: 9,
    agency,
  });
  return { ok: r.ok, id: r.messageId, error: r.error };
});

pushBoth('calendar_delivery', 'Calendar delivery (single)', (agency) => async () => {
  const r = await sendCalendarDeliveryEmail({
    to: TO,
    pocFirstNames: ['Jack'],
    clientName: clientNameFor(agency),
    postCount: 12,
    startDate: '2026-05-03',
    endDate: '2026-05-30',
    shareUrl: `https://cortex.nativz.io/c/${REFS.calendarShareToken1}`,
    firstRoundIntro: true,
    agency,
  });
  return { ok: r.ok, id: r.messageId, error: r.error };
});

pushBoth('combined_calendar_delivery', 'Calendar delivery (combined / multi-brand)', (agency) => async () => {
  const r = await sendCombinedCalendarDeliveryEmail({
    to: TO,
    pocFirstNames: ['Jack'],
    calendars: [
      {
        clientName: agency === 'anderson' ? 'Riverwalk Hotel' : 'JAMNOLA',
        postCount: 12,
        startDate: '2026-05-03',
        endDate: '2026-05-30',
        shareUrl: `https://cortex.nativz.io/c/${REFS.calendarShareToken1}`,
      },
      {
        clientName: agency === 'anderson' ? 'Lake Charles Visitors Bureau' : 'Beaux',
        postCount: 8,
        startDate: '2026-05-03',
        endDate: '2026-05-26',
        shareUrl: `https://cortex.nativz.io/c/${REFS.calendarShareToken2}`,
      },
    ],
    firstRoundIntro: false,
    agency,
  });
  return { ok: r.ok, id: r.messageId, error: r.error };
});

pushBoth('calendar_share_send_initial', 'Calendar share send (initial)', (agency) => async () => {
  const r = await sendCalendarShareSendEmail({
    to: TO,
    pocFirstNames: ['Jack'],
    clientName: clientNameFor(agency),
    shareUrl: `https://cortex.nativz.io/c/${REFS.calendarShareToken1}`,
    variant: 'initial',
    postCount: 12,
    startDate: '2026-05-03',
    endDate: '2026-05-30',
    agency,
  });
  return { ok: r.ok, id: r.messageId, error: r.error };
});

pushBoth('calendar_share_send_revised', 'Calendar share send (revised)', (agency) => async () => {
  const r = await sendCalendarShareSendEmail({
    to: TO,
    pocFirstNames: ['Jack'],
    clientName: clientNameFor(agency),
    shareUrl: `https://cortex.nativz.io/c/${REFS.calendarShareToken1}`,
    variant: 'revised',
    postCount: 12,
    startDate: '2026-05-03',
    endDate: '2026-05-30',
    agency,
  });
  return { ok: r.ok, id: r.messageId, error: r.error };
});

pushBoth('calendar_revisions_complete', 'Calendar revisions complete', (agency) => async () => {
  const r = await sendCalendarRevisionsCompleteEmail({
    to: TO,
    pocFirstNames: ['Jack'],
    clientName: clientNameFor(agency),
    shareUrl: `https://cortex.nativz.io/c/${REFS.calendarShareToken1}`,
    agency,
  });
  return { ok: r.ok, id: r.messageId, error: r.error };
});

pushBoth('calendar_revised_videos', 'Calendar revised videos', (agency) => async () => {
  const r = await sendCalendarRevisedVideosEmail({
    to: TO,
    pocFirstNames: ['Jack'],
    clientName: clientNameFor(agency),
    shareUrl: `https://cortex.nativz.io/c/${REFS.calendarShareToken1}`,
    summaryBullets: [
      'Re-cut the opener to drop the first second so the hook lands harder.',
      'Swapped the 0:14 b-roll for a wider crew shot.',
      'Tightened the captions on three posts to match the tone of the others.',
    ],
    revisedCount: 4,
    isTestOverride: true,
    agency,
  });
  return { ok: r.ok, id: r.messageId, error: r.error };
});

// post_health_alert is hardcoded Nativz inside the sender — only run once.
if (AGENCIES.includes('nativz')) {
  sends.push({
    key: 'post_health_alert',
    label: 'Post health alert (ops)',
    agency: 'nativz',
    fire: async () => {
      const r = await sendPostHealthAlertEmail({
        to: TO,
        failedPosts: [
          {
            postId: 'p_001',
            clientName: 'JAMNOLA',
            caption: 'Behind the scenes of our spring shoot…',
            scheduledFor: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
            failureReason: 'TikTok 401: token expired',
            retryCount: 3,
          },
          {
            postId: 'p_002',
            clientName: 'Beaux',
            caption: null,
            scheduledFor: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
            failureReason: 'Instagram media upload timed out after 60s',
            retryCount: 2,
          },
        ],
        disconnects: [
          { profileId: 'd_001', clientName: 'Riverwalk Hotel', platform: 'tiktok', username: 'riverwalkhtl' },
        ],
      });
      if (!r) return { ok: false, error: 'sender returned null' };
      return { ok: r.ok, id: r.messageId, error: r.error };
    },
  });
}

pushBoth('editing_deliverable', 'Editing deliverable', (agency) => async () => {
  const r = await sendEditingDeliverableEmail({
    to: TO,
    pocFirstNames: ['Jack'],
    clientName: clientNameFor(agency),
    projectName: 'Spring Wave 1',
    shareUrl: `https://cortex.nativz.io/c/edit/${REFS.editingShareToken}`,
    agency,
  });
  return { ok: r.ok, id: r.messageId, error: r.error };
});

pushBoth('editing_rereview', 'Editing re-review', (agency) => async () => {
  const r = await sendEditingRereviewEmail({
    to: TO,
    pocFirstNames: ['Jack'],
    clientName: clientNameFor(agency),
    projectName: 'Spring Wave 1',
    shareUrl: `https://cortex.nativz.io/c/edit/${REFS.editingShareToken}`,
    pendingCount: 3,
    agency,
  });
  return { ok: r.ok, id: r.messageId, error: r.error };
});

pushBoth('shoot_brief_reminder', 'Shoot brief reminder (48h)', (agency) => async () => {
  const r = await sendShootBriefReminderEmail({
    to: TO,
    memberFirstName: 'Jack',
    clientName: clientNameFor(agency),
    shootTitle: 'Spring Tour BTS - Day 1',
    shootDateISO: new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString(),
    location: 'Dauphine Studios, New Orleans',
    contentLabUrl: 'https://cortex.nativz.io/admin/content-lab',
    agency,
  });
  return { ok: r.ok, id: r.messageId, error: r.error };
});

// ── proposal-style "review and sign" email ──────────────────────────────
//
// Mirrors lib/proposals/send.ts's payload exactly so the visual matches
// what real signers see. Goes through sendOnboardingEmail (HTML override).

pushBoth('proposal_review', 'Proposal review and sign', (agency) => async () => {
  const brandName = brandFor(agency);
  const externalUrl = agency === 'anderson'
    ? 'https://docs.andersoncollaborative.com/p/sample-proposal'
    : 'https://docs.nativz.io/p/sample-proposal';
  const cardHtml = `
      <p class="subtext">
        <strong>${clientNameFor(agency)} - Spring Editing Package</strong> is ready for your review and signature.
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
        Questions? Reply to this email, it comes straight to the ${brandName} team.
      </p>`;
  const r = await sendOnboardingEmail({
    to: TO,
    subject: `[Test] Proposal · ${clientNameFor(agency)} Spring Editing Package`,
    html: layout(cardHtml, agency, {
      eyebrow: 'Proposal',
      heroTitle: `Your proposal is ready, Jack.`,
    }),
    agency,
  });
  return { ok: r.ok, id: r.ok ? r.id : null, error: r.ok ? undefined : r.error };
});

// ── connection-invite (lib/social/connection-invites template) ──────────

pushBoth('connection_invite', 'Connection invite (reconnect socials)', (agency) => async () => {
  const clientName = clientNameFor(agency);
  const platforms = ['tiktok', 'instagram', 'youtube'] as const;
  const PLATFORM_LABEL: Record<string, string> = {
    tiktok: 'TikTok',
    instagram: 'Instagram',
    youtube: 'YouTube',
  };
  const platformRows = platforms
    .map(
      (p) =>
        `<tr><td class="k">${PLATFORM_LABEL[p]}</td><td class="v">Authorization expired</td></tr>`,
    )
    .join('');
  const accent = agency === 'anderson' ? '#36D1C2' : '#00ADEF';
  const accentDark = agency === 'anderson' ? '#2BB8AA' : '#0090CC';
  const text = agency === 'anderson' ? '#00161F' : '#0A1628';
  const muted = '#7b8794';
  const border = '#e8ecf0';
  const stepRows = [
    {
      n: '1',
      title: 'Open the secure link',
      body: 'Tap the button below. No login on your end, the link signs you in automatically and lands you on a single reconnect screen.',
    },
    {
      n: '2',
      title: 'Reauthorize each platform',
      body: 'You\'ll see a row for each expired account. Hit "Reconnect," accept the prompt from each platform, and the row turns green.',
    },
    {
      n: '3',
      title: 'Done',
      body: 'As soon as the last row is green, scheduled posts start flowing again on our end. Nothing else for you to do.',
    },
  ]
    .map(
      (s) => `
    <tr>
      <td style="vertical-align:top;width:34px;padding:14px 0 14px 0;border-bottom:1px solid ${border};">
        <div style="display:inline-block;width:24px;height:24px;line-height:24px;border-radius:999px;background:${accent};color:#ffffff;font-size:12px;font-weight:700;text-align:center;">${s.n}</div>
      </td>
      <td style="vertical-align:top;padding:14px 0 14px 12px;border-bottom:1px solid ${border};">
        <div style="font-size:13.5px;font-weight:700;color:${text};margin-bottom:3px;">${s.title}</div>
        <div style="font-size:13px;line-height:1.6;color:#3d4852;">${s.body}</div>
      </td>
    </tr>`,
    )
    .join('');
  const replyTo = getReplyTo(agency);
  const inner = `
    <p class="subtext" style="margin-top:0;">
      A few of <strong>${clientName}</strong>'s social authorizations have expired on our end, which means scheduled posts can't go out to those platforms until they're refreshed. Reconnecting takes about a minute and doesn't require a Cortex login.
    </p>
    <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${muted};margin:22px 0 8px;">Accounts that need attention</div>
    <div class="stats" style="margin:0 0 6px;"><table>${platformRows}</table></div>
    <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${muted};margin:26px 0 4px;">What happens next</div>
    <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="border-collapse:collapse;border-top:1px solid ${border};">${stepRows}</table>
    <div class="button-wrap" style="text-align:center;margin:26px 0 4px;">
      <a class="button" href="https://cortex.nativz.io/connect/invite/${REFS.connectionInviteToken}">Reconnect accounts &rarr;</a>
    </div>
    <p style="font-size:12px;color:${muted};margin:8px 0 0;line-height:1.55;text-align:center;">
      Link valid for 30 days &middot; ${platforms.length} accounts &middot; ${clientName}
    </p>
    <p style="font-size:11.5px;line-height:1.6;color:${muted};margin-top:22px;border-top:1px solid ${border};padding-top:16px;">
      Questions, or hit a snag? Reply to this email or write to <a href="mailto:${replyTo}" style="color:${accentDark};text-decoration:none;">${replyTo}</a>, we'll jump in.
    </p>`;
  const html = layout(inner, agency, {
    eyebrow: 'Action Required',
    heroTitle: `Reconnect ${clientName}'s social accounts`,
  });
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const { data, error } = await resend.emails.send({
    from: getFromAddress(agency),
    replyTo: getReplyTo(agency),
    to: TO,
    subject: `[Test] ${clientName}: connect your accounts`,
    html,
  });
  if (error) return { ok: false, error: String(error.message ?? error) };
  return { ok: true, id: data?.id ?? null };
});

// ── onboarding system emails (4 templates, sent via Resend directly) ────

pushBoth('flow_poc_invite', 'Onboarding · POC invite', (agency) => async () => {
  const clientName = clientNameFor(agency);
  const url = agency === 'anderson'
    ? `https://cortex.andersoncollaborative.com/onboarding/${REFS.onboardingFlowId}?token=${REFS.onboardingPocToken}`
    : `https://cortex.nativz.io/onboarding/${REFS.onboardingFlowId}?token=${REFS.onboardingPocToken}`;
  const inner = `
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
    </p>`;
  const html = layout(inner, agency, {
    eyebrow: 'Onboarding Kickoff',
    heroTitle: `Welcome aboard, ${clientName}.`,
  });
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const { data, error } = await resend.emails.send({
    from: getFromAddress(agency),
    replyTo: getReplyTo(agency),
    to: TO,
    subject: `[Test] Welcome to ${clientName} - let's get you set up`,
    html,
  });
  if (error) return { ok: false, error: String(error.message ?? error) };
  return { ok: true, id: data?.id ?? null };
});

pushBoth('flow_poc_reminder', 'Onboarding · POC reminder', (agency) => async () => {
  const clientName = clientNameFor(agency);
  const url = agency === 'anderson'
    ? `https://cortex.andersoncollaborative.com/onboarding/${REFS.onboardingFlowId}?token=${REFS.onboardingPocToken}`
    : `https://cortex.nativz.io/onboarding/${REFS.onboardingFlowId}?token=${REFS.onboardingPocToken}`;
  const inner = `
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
    </p>`;
  const html = layout(inner, agency, {
    eyebrow: 'Quick Nudge',
    heroTitle: `Hey ${clientName}, quick nudge.`,
  });
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const { data, error } = await resend.emails.send({
    from: getFromAddress(agency),
    replyTo: getReplyTo(agency),
    to: TO,
    subject: `[Test] Quick nudge - your ${clientName} setup checklist`,
    html,
  });
  if (error) return { ok: false, error: String(error.message ?? error) };
  return { ok: true, id: data?.id ?? null };
});

pushBoth('flow_stakeholder_milestone', 'Onboarding · Stakeholder milestone', (agency) => async () => {
  const clientName = clientNameFor(agency);
  const flowUrl = `https://cortex.nativz.io/admin/onboarding/${REFS.onboardingFlowId}`;
  const kickoffShareUrl = `https://cortex.nativz.io/schedule/${REFS.kickoffScheduleToken}`;
  // Match the production builder in lib/onboarding/system-emails.ts:
  // - headline drops the client name (the hero title already prefixes it)
  // - secondary CTA is an outline button, not a text link
  const headline = 'Schedule kickoff';
  const brand = agency === 'anderson'
    ? { accent: '#36D1C2', accentDark: '#1AAA9A' }
    : { accent: '#00ADEF', accentDark: '#0090C7' };
  const inner = `
    <p class="subtext">Hi Jack, <strong>${clientName}</strong> finished onboarding. Pick a kickoff time when the team's free.</p>
    <div class="button-wrap"><a class="button" href="${kickoffShareUrl}">Schedule kickoff &rarr;</a></div>
    <div class="button-wrap" style="margin-top:12px;">
      <a href="${flowUrl}" style="display:inline-block;background:transparent;color:${brand.accentDark};text-decoration:none;font-weight:700;padding:13px 31px;border:1px solid ${brand.accent};border-radius:10px;font-size:15px;letter-spacing:0.01em;">Open the onboarding tracker &rarr;</a>
    </div>`;
  const html = layout(inner, agency, {
    eyebrow: 'Onboarding Complete',
    heroTitle: `${clientName}: ${headline}`,
  });
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const { data, error } = await resend.emails.send({
    from: getFromAddress(agency),
    replyTo: getReplyTo(agency),
    to: TO,
    subject: `[Test] [${clientName}] ${headline}`,
    html,
  });
  if (error) return { ok: false, error: String(error.message ?? error) };
  return { ok: true, id: data?.id ?? null };
});

pushBoth('flow_no_progress', 'Onboarding · No-progress flag (5 days)', (agency) => async () => {
  const clientName = clientNameFor(agency);
  const flowUrl = `https://cortex.nativz.io/admin/onboarding/${REFS.onboardingFlowId}`;
  const inner = `
    <p class="subtext">
      No POC activity on this onboarding flow for 5 days. Worth a personal
      nudge. The auto-reminders have already fired, but a real human
      message moves the needle.
    </p>
    <div class="button-wrap">
      <a class="button" href="${flowUrl}">Open the flow &rarr;</a>
    </div>`;
  const html = layout(inner, agency, {
    eyebrow: 'No Progress · 5 Days',
    heroTitle: `${clientName} has gone quiet.`,
  });
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const { data, error } = await resend.emails.send({
    from: getFromAddress(agency),
    replyTo: getReplyTo(agency),
    to: TO,
    subject: `[Test] [${clientName}] No progress in 5 days`,
    html,
  });
  if (error) return { ok: false, error: String(error.message ?? error) };
  return { ok: true, id: data?.id ?? null };
});

// ── runner ──────────────────────────────────────────────────────────────

async function main() {
  const filtered = FILTER ? sends.filter((s) => s.key.toLowerCase().includes(FILTER)) : sends;

  console.log('━'.repeat(72));
  console.log(`Sending ${filtered.length} test emails to ${TO}`);
  if (FILTER) console.log(`Filter: type-key contains "${FILTER}"`);
  console.log(`Agencies: ${AGENCIES.join(', ')}`);
  console.log(`Throttle: ${THROTTLE_MS}ms between sends`);
  console.log('━'.repeat(72));

  let okCount = 0;
  let failCount = 0;
  const failures: Array<{ key: string; agency: string; error: string }> = [];

  for (let i = 0; i < filtered.length; i++) {
    const send = filtered[i];
    const idx = `[${String(i + 1).padStart(2, '0')}/${filtered.length}]`;
    const tag = `${send.agency.padEnd(8)} · ${send.key}`;
    process.stdout.write(`${idx} ${tag} ... `);
    try {
      const result = await send.fire();
      if (result.ok) {
        okCount++;
        console.log(`ok  (resend_id=${result.id ?? 'none'})`);
      } else {
        failCount++;
        const errMsg = result.error ?? 'unknown error';
        failures.push({ key: send.key, agency: send.agency, error: errMsg });
        console.log(`FAIL: ${errMsg}`);
      }
    } catch (err) {
      failCount++;
      const errMsg = err instanceof Error ? err.message : String(err);
      failures.push({ key: send.key, agency: send.agency, error: errMsg });
      console.log(`THREW: ${errMsg}`);
    }
    if (i < filtered.length - 1) await sleep(THROTTLE_MS);
  }

  console.log('━'.repeat(72));
  console.log(`Done. ${okCount} sent, ${failCount} failed.`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) {
      console.log(`  - ${f.agency} ${f.key}: ${f.error}`);
    }
  }
  console.log('━'.repeat(72));
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});

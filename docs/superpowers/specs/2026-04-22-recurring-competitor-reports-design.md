# Recurring competitor reports

**Date:** 2026-04-22
**Status:** approved (Jack, sight-unseen autonomous run)
**Linear:** new epic, builds on NAT-7 / NAT-8 (Competitor Spying + Benchmarking)

## TL;DR

Admins subscribe a client to a recurring competitor report. Every cadence (weekly / biweekly / monthly), Cortex generates a report from the latest `benchmark_snapshots`, emails it to the configured recipients (internal team + optionally portal users), and logs the generated report in-app for later re-reading. The UI lives at `/admin/competitor-intelligence/reports` (placeholder route from Spec 2).

This is the first Cortex feature that turns the one-shot audit into an ongoing **deliverable** the agency can show clients month over month. It's the reason Spec 2's UX matters — without recurring delivery, "Watch a competitor" is just a data collection exercise.

## Goals

1. **Close the loop.** Every watched competitor eventually becomes a report in a client's inbox. No dashboard-only insights.
2. **Reuse what we have.** The benchmark cron already captures deltas. The branded PDF shell (`lib/pdf/branded`) already renders Nativz/Anderson-themed documents. The email hub already sends via Resend. This feature *composes* those three — it does not re-build them.
3. **Agency-branded.** Reports use `BrandedDeliverableData` with the client's agency token (Nativz or Anderson Collaborative). The email uses the same branded shell pattern as `affiliate-weekly-report-html.ts`.
4. **In-app archive.** Every report generated is queryable from the Reports page. Admins can re-send an old report without regenerating.

## Non-goals

- Client self-serve subscription management. Admin-only for v1. (Portal surfacing is a future extension — the data model allows it via the existing `organization_id` scope.)
- Content-lab-style AI-written commentary on the data. v1 is: numbers, charts, deltas, screenshots. Commentary is a v2 experiment.
- Slack / Teams delivery. Email + in-app only for v1.

## Architecture

### Data model

Two new tables. Migration `130_competitor_report_subscriptions.sql`:

```sql
create table if not exists competitor_report_subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  created_by uuid references users(id),
  cadence text not null check (cadence in ('weekly','biweekly','monthly')),
  recipients text[] not null default '{}',          -- email addresses
  include_portal_users boolean not null default false,
  enabled boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_competitor_report_subs_due
  on competitor_report_subscriptions (next_run_at)
  where enabled = true;

create index idx_competitor_report_subs_client
  on competitor_report_subscriptions (client_id);

alter table competitor_report_subscriptions enable row level security;
create policy cr_subs_admin_all on competitor_report_subscriptions
  for all using (
    exists (select 1 from users where users.id = auth.uid() and users.role in ('admin','super_admin'))
  );
create policy cr_subs_portal_read on competitor_report_subscriptions
  for select using (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.organization_id = competitor_report_subscriptions.organization_id
    )
  );

create table if not exists competitor_reports (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references competitor_report_subscriptions(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  generated_at timestamptz not null default now(),
  period_start timestamptz not null,
  period_end timestamptz not null,
  report_html text,                        -- rendered HTML body of the email
  report_json jsonb not null,              -- structured data for re-rendering
  pdf_storage_path text,                   -- Supabase storage path
  email_resend_id text,                    -- Resend message ID for traceability
  email_status text default 'pending'      -- 'pending' | 'sent' | 'failed'
    check (email_status in ('pending','sent','failed')),
  email_error text
);

create index idx_competitor_reports_subscription
  on competitor_reports (subscription_id, generated_at desc);
create index idx_competitor_reports_client
  on competitor_reports (client_id, generated_at desc);

alter table competitor_reports enable row level security;
create policy cr_reports_admin_all on competitor_reports
  for all using (
    exists (select 1 from users where users.id = auth.uid() and users.role in ('admin','super_admin'))
  );
create policy cr_reports_portal_read on competitor_reports
  for select using (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.organization_id = competitor_reports.organization_id
    )
  );
```

### Cron

New route at `app/api/cron/competitor-reports/route.ts`. Auth: `Bearer $CRON_SECRET`. Triggered daily by Vercel cron (`vercel.json` addition).

Pseudocode:

```ts
export async function GET(req: NextRequest) {
  authCron(req);
  const now = new Date();

  const due = await admin
    .from('competitor_report_subscriptions')
    .select('*')
    .eq('enabled', true)
    .lte('next_run_at', now.toISOString());

  for (const sub of due.data ?? []) {
    try {
      const reportData = await buildReportData(sub);  // reads benchmark_snapshots
      const html = renderReportEmailHtml(reportData);
      const pdfPath = await renderReportPdfAndUpload(reportData);
      const resendId = await sendEmail({ sub, html, pdfPath });

      await admin.from('competitor_reports').insert({
        subscription_id: sub.id,
        client_id: sub.client_id,
        organization_id: sub.organization_id,
        period_start: sub.last_run_at ?? thirtyDaysAgo(now, sub.cadence),
        period_end: now.toISOString(),
        report_html: html,
        report_json: reportData,
        pdf_storage_path: pdfPath,
        email_resend_id: resendId,
        email_status: 'sent',
      });

      await admin
        .from('competitor_report_subscriptions')
        .update({
          last_run_at: now.toISOString(),
          next_run_at: nextRunAt(now, sub.cadence).toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', sub.id);
    } catch (err) {
      // Log row with email_status = 'failed', advance next_run_at so we don't thrash
      await admin.from('competitor_reports').insert({ ...errorRow });
      await admin
        .from('competitor_report_subscriptions')
        .update({ next_run_at: nextRunAt(now, sub.cadence).toISOString() })
        .eq('id', sub.id);
    }
  }

  await recordCronRun({ route: '/api/cron/competitor-reports', ... }); // from Spec 1
  return NextResponse.json({ processed: due.data?.length ?? 0 });
}
```

`buildReportData` reads `client_benchmarks` + `benchmark_snapshots` for the subscription's client, builds per-competitor rows with:
- headline: followers, avg views, engagement rate, posting frequency
- delta vs. previous snapshot (absolute + %)
- top 3 new posts in the period (URL + description + views)
- sparkline series (12 most recent follower counts)

Shape matches a new `CompetitorReportData` type in `lib/reporting/competitor-report-types.ts`.

### Email template

New template: `lib/email/templates/competitor-report-html.ts`.

Pattern matches `affiliate-weekly-report-html.ts` — a single-file server-rendered HTML string with inline styles (Resend-compatible), built around a `CompetitorReportData` payload.

Structure top-to-bottom:

1. **Header band:** agency logo (Nativz or Anderson depending on client's agency) + brand line (cyan-underlined H1 "Competitor update").
2. **Period summary card:** "Week of Apr 15 – Apr 22" + "Watching N competitors for <client_name>".
3. **Per-competitor blocks** (one per competitor):
   - Platform mark (mini color SVG).
   - Handle + display name.
   - 4-up stat row: Followers (with delta chip), Avg views, Engagement rate, Posts this period.
   - Top 3 posts as clickable cards (thumb + first 120 chars of caption + views).
4. **Footer:** "View full benchmarking history →" (deep-links to `/admin/analytics?tab=benchmarking&client=<id>`), plus standard Nativz footer.

Colors + type read from the client's agency tokens (Nativz: cyan `#00AEEF`, Jost display, Poppins body; Anderson: teal + Rubik/Roboto). No hex codes hardcoded — everything from `lib/branding`.

### PDF template

New adapter in `lib/pdf/branded/adapters.ts`: `mapCompetitorReportToBranded(data: CompetitorReportData): BrandedDeliverableData`. Renders via the existing `@react-pdf` shell — just another deliverable type.

PDF gets uploaded to Supabase Storage bucket `competitor-reports` at path `<client_id>/<yyyy-mm-dd>-<report_id>.pdf`. Bucket policy: admin read/write; portal users can read their own-org paths only (matches existing storage RLS pattern).

### API surface (new)

| Method + path | Purpose |
| --- | --- |
| `GET /api/competitor-reports/subscriptions` | List subscriptions. Admin: all. Portal: org-scoped. |
| `POST /api/competitor-reports/subscriptions` | Create subscription. Admin only. Zod body: `{ client_id, cadence, recipients, include_portal_users }`. |
| `PATCH /api/competitor-reports/subscriptions/[id]` | Edit. Admin only. |
| `DELETE /api/competitor-reports/subscriptions/[id]` | Hard delete. Admin only. Cascades via FK. |
| `POST /api/competitor-reports/subscriptions/[id]/run-now` | Bypass schedule, generate + email immediately. Admin only. Reuses cron handler internals. |
| `GET /api/competitor-reports` | List generated reports. Query params: `?client_id=` `&subscription_id=` `&limit=`. Admin: all. Portal: org-scoped. |
| `GET /api/competitor-reports/[id]` | Return single report incl. HTML. Admin: any. Portal: own org. |
| `POST /api/competitor-reports/[id]/resend` | Re-send an already-generated report to the subscription's recipients. Admin only. |

All routes use Zod, proper auth guards, org-scoping where portal-accessible. Follows `.claude/rules/api-routes.md`.

### UI

Landing page at `/admin/competitor-intelligence/reports` — the route the Spec 2 footer already links to.

Layout top-to-bottom (Impeccable treatment, dark, cyan brand accent, pill CTAs, full-circle icon tiles):

1. **Header:** eyebrow `Automation` + H1 `<u>Recurring</u> reports.` + subhead "Schedule branded competitor updates for any client."
2. **Primary CTA row:** "New subscription" pill (purple). Opens a modal wizard (3 short steps — client → cadence+recipients → confirm). Same visual language as the Spec 2 watch wizard.
3. **Active subscriptions table:** one row per subscription. Columns: Client · Cadence · Next run · Recipients (count + truncated list) · Last run · Actions menu (Edit, Run now, Pause, Delete). Status pill per row.
4. **Report history feed:** grouped by client; each row is a generated report (Date · Period covered · Status pill · Download PDF · View email).
5. **Clicking a history row** opens a slide-over panel on the right that renders `report_html` in a sandboxed iframe + "Resend" action + "Download PDF" link.

### Sidebar

No change. Reports is accessible from Competitor Intelligence landing page and `/admin/competitor-intelligence/reports` directly. If Jack decides later it deserves top-level navigation, that's a one-line sidebar change.

## Cron schedule

Add to `vercel.json` crons:

```json
{ "path": "/api/cron/competitor-reports", "schedule": "0 14 * * *" }
```

14:00 UTC daily (09:00 ET / 06:00 PT) — fires once a day regardless of cadence. The `next_run_at` check is what gates actual report generation per subscription.

## Error handling

- If `benchmark_snapshots` is empty for the period (e.g., scrape failures), the report still generates but each competitor block shows "No fresh snapshots this period" instead of empty charts. Email still sends. Admins see the gap.
- If Resend fails: row written with `email_status='failed'`. Admin UI surfaces the red state and "Retry send" button.
- If PDF upload fails: report still emailed with HTML; PDF link in email/UI shows "PDF unavailable — retry" instead of a broken link. Row `pdf_storage_path = null`.
- `recordCronRun` (Spec 1) wraps the whole handler, so infrastructure page shows the last run status.

## Testing / QA

### Unit / integration
- Zod schemas for every API route (runtime validation covers most of the surface).
- A tiny `lib/reporting/competitor-report-types.test.ts` exercising `buildReportData` against a fixture of `benchmark_snapshots` rows.

### Manual QA (Jack)
1. Create a subscription for any active client with ≥ 1 watched competitor.
2. Click "Run now" → confirm email lands in inbox, PDF attachment opens, report body looks native.
3. Open `/admin/competitor-intelligence/reports` → find the new row in history → click → sidecar renders the HTML.
4. Resend → new Resend ID, same content.
5. Edit cadence → confirm `next_run_at` updates.
6. Pause → next cron run skips; Resume → runs.
7. Delete → subscription + history rows gone (cascade).

## Rollout

Single commit, single deploy, single migration. The `vercel.json` cron schedule is additive — existing crons unaffected. If the `run-now` endpoint has a bug, admins can disable individual subscriptions or delete them while we fix it; daily cron is idempotent (guards on `next_run_at`).

## File list

**New:**
- `supabase/migrations/130_competitor_report_subscriptions.sql`
- `lib/reporting/competitor-report-types.ts`
- `lib/reporting/build-competitor-report.ts`
- `lib/email/templates/competitor-report-html.ts`
- `lib/pdf/branded/adapters.ts` — add `mapCompetitorReportToBranded` (file exists; modify).
- `app/api/cron/competitor-reports/route.ts`
- `app/api/competitor-reports/route.ts` (GET list)
- `app/api/competitor-reports/[id]/route.ts` (GET one)
- `app/api/competitor-reports/[id]/resend/route.ts`
- `app/api/competitor-reports/subscriptions/route.ts` (GET list + POST)
- `app/api/competitor-reports/subscriptions/[id]/route.ts` (PATCH + DELETE)
- `app/api/competitor-reports/subscriptions/[id]/run-now/route.ts`
- `app/admin/competitor-intelligence/reports/page.tsx`
- `components/competitor-intelligence/subscriptions-table.tsx`
- `components/competitor-intelligence/new-subscription-modal.tsx`
- `components/competitor-intelligence/report-history-feed.tsx`
- `components/competitor-intelligence/report-sidecar.tsx`

**Modified:**
- `vercel.json` (cron schedule)
- `lib/pdf/branded/adapters.ts` (new adapter)
- Storage bucket created via Supabase MCP during rollout: `competitor-reports` (private, admin R/W + org-scoped read).

## Dependencies between specs

- **Depends on Spec 1** only for `recordCronRun` helper (optional — if Spec 1 isn't shipped, replace with a console.log).
- **Depends on Spec 2** for the Reports landing page route to live inside `/admin/competitor-intelligence`. If Spec 2 isn't shipped, the page can temporarily live at `/admin/competitor-reports` and be moved once the landing page exists.

Ship order (if they go in separately): Spec 1 → Spec 3 → Spec 2. Each is functional on its own.

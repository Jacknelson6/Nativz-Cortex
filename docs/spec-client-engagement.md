# Nativz Cortex — Product Specification & Strategic Blueprint

**Version:** 1.0  
**Date:** February 20, 2026  
**Author:** Jack / Nativz  
**Status:** Pre-Launch (Sprint 2+)

---

## 1. Product Vision

Nativz Cortex is an AI-powered content ideation and client collaboration platform purpose-built for social media marketing agencies serving franchise brands. The core problem it solves is simple but expensive: videographers show up on set without clear direction, content strategy is driven by gut feel rather than real data, and clients feel disconnected from the creative process until they see a final deliverable they didn't ask for.

Cortex fixes this by running AI-powered topic research ahead of shoots, generating structured video concepts backed by real search and social data, and giving clients a portal where they feel like active collaborators in the strategy — without exposing raw performance metrics or analytics.

The platform serves two distinct audiences through two interfaces: the **Admin Dashboard** for the Nativz team (research, ideation, approval, client management) and the **Client Portal** for brand owners (reports, idea submissions, brand preferences, content calendar visibility). The philosophy behind the client portal is **involvement without overwhelm** — clients should feel like co-creators, not spectators, but they should never feel like they need a marketing degree to use the tool.

---

## 2. Target Users & First Clients

### 2.1 Primary Users

**Nativz Internal Team (Admin Users):** Media buyers, content strategists, videographers, editors, and VAs. These users need Cortex to eliminate guesswork before shoots, generate data-informed content pillars, and maintain a living library of approved ideas per client. The tool should feel like a creative command center — not a reporting dashboard.

**Franchise Brand Clients (Portal Users):** Brand owners and marketing managers at franchise operations. These users are typically not deeply technical. They want to feel informed, heard, and confident that their agency is thinking strategically about their brand. They are not looking for analytics dashboards — they get those elsewhere. What they want from Cortex is a window into the creative strategy and a way to contribute ideas without disrupting the production workflow.

### 2.2 Client Stack & Rollout Strategy

Cortex is being built for the entire Nativz client stack, not a single pilot brand. The platform needs to work across every industry vertical Nativz serves — from food and wellness franchises to education brands to service-based businesses. This means the system must be industry-agnostic at its core, with all brand-specific behavior driven by the per-client configuration in the Brand Preference Center rather than hardcoded into the platform.

The rollout strategy should onboard all current Nativz clients in a short window rather than trickling them in one at a time. A staggered rollout creates an uneven client experience where some brands get the tool and others don't, which is hard to manage operationally. The recommended approach is to configure all clients in Cortex (brand preferences, content pillars, tone settings) in a single onboarding sprint, then flip the switch for everyone at once. This also gives the team more data faster — running test searches across multiple verticals reveals prompt quality issues that a single-client test would miss.

The current client stack spans a range of verticals, including franchise QSR and health/wellness brands like Toastique, education franchises like Kumon, and other franchise and service-based operations. This diversity is a strength for Cortex development because it forces the AI prompts, content breakdown categories, and ideation engine to be flexible enough to serve any brand rather than over-fitting to one industry.

### 2.3 Implications for Default Configuration

Because Cortex serves a multi-vertical client stack, the default configuration must be industry-neutral. Placeholder examples, sample content pillars, and AI prompt templates should use generic language that applies across verticals (e.g., "brand story," "community spotlight," "seasonal content," "educational/how-to," "behind the scenes") rather than skewing toward any single industry like food or education.

The real specificity should come from the Brand Preference Center. During onboarding, each client's preferences should be configured with enough detail that the AI produces results tailored to their vertical. The platform's job is to provide a clean, flexible framework — the client configuration is what makes it feel personalized. This also means the AI website analysis feature (which auto-fills client fields during setup) becomes even more important, as it accelerates the per-client configuration step across the entire stack.

---

## 3. Defining "Done" for V1 Launch

V1 is ready for real client use when the following conditions are met. These are grouped by criticality.

### 3.1 Must-Have for V1 (Launch Blockers)

**Brand Preferences Wired Into AI Prompts:** This is the single most important gap to close. The Brand Preference Center already stores tone keywords, topics to lean into or avoid, competitor accounts, and seasonal priorities — but none of this data currently feeds into the search prompts sent to Claude. Until this is connected, every search returns generic results that don't reflect the client's specific brand identity. The fix is to inject the client's stored preferences into the system prompt as context before the AI generates its structured response. This should include tone keywords as style guidance, "lean into" topics as priority signals, "avoid" topics as exclusion filters, and competitor accounts as reference points for differentiation. This is the difference between the tool being a novelty and being genuinely useful.

**Content Calendar View:** Clients need a visual timeline of what's planned, what's in progress, and what's been published. This doesn't need to be a full-blown project management tool — it's a read-mostly calendar that the Nativz team populates (either manually or via the approval flow) and clients can see. The calendar should show approved concepts with their planned publish dates, status indicators (planned, in production, published), and the ability to click into a concept to see the full brief. This is the single biggest feature for reducing "what are you guys working on?" messages from clients.

**Client Portal Polish:** The portal dashboard needs to feel finished and professional. Right now it's functional but light. For V1, it should include a welcome message with the client's brand name and logo, a count of pending items needing their attention (ideas to review, preferences to update), recent reports, and the content calendar preview. This is the first thing clients see when they log in, so it needs to communicate professionalism and value immediately.

**Stable Search Pipeline:** The Brave Search → Claude pipeline needs to be reliable and produce consistently useful results. This means the AI-generated video ideas need to be specific enough that a videographer can read one and know what to film, what the hook is, and what emotional angle to lead with. If the output quality isn't there yet, prompt tuning should be prioritized over new features.

### 3.2 Should-Have for V1 (High Priority but Not Blockers)

**Idea Pipeline Status Tracking:** The content_ideas table already has the status progression (idea → approved → in_production → published). This should be surfaced in the admin dashboard as a simple kanban or pipeline view so the team can see where every idea sits. For V1, full production tracking (assigning editors, tracking shoot dates, etc.) should remain in Monday.com — Cortex's job is ideation and strategy, not project management. The connection point is that when an idea moves to "in_production," the team knows to pick it up in Monday.com. A future integration could automate this handoff, but for V1, it's a manual step.

**Approval Workflow Notifications:** When a report is approved and sent to the client portal, the client should receive an email notification. Similarly, when a client submits an idea, the admin team should get a notification (email or in-app). Without notifications, the feedback loop depends on people remembering to check the platform, which kills engagement.

**Search Scheduling (72-Hour Workflow):** The "72 hours before a shoot" workflow should be semi-automated for V1. This means the admin can set a recurring search schedule per client (e.g., "run a brand intel search for Client X every Monday at 6 AM") and the system executes it automatically, stores the results, and flags them for admin review. Full automation (auto-approve and auto-send) can come later, but scheduled execution removes the biggest friction point in the current manual workflow.

### 3.3 Nice-to-Have for V1 (Post-Launch Iteration)

These features add value but should not delay launch: weekly email digests to clients summarizing new reports and pending items, trend-over-time charts showing how a client's topic landscape is shifting, sentiment history per client over multiple searches, a "best performing topics" view based on which approved ideas actually made it to production, and collaborative mood boards for sharing visual references.

### 3.4 The Three Things Blocking Launch

If forced to pick exactly three items that must be completed before putting Cortex in front of a paying client, they are:

1. **Wire brand preferences into the AI prompts.** Without this, the tool produces generic output that doesn't justify its existence as a client-facing product. This is the highest-leverage change in the entire codebase.

2. **Build the content calendar view.** This is what clients will open the portal to check most frequently. It's the heartbeat of the client experience.

3. **Tune the AI output quality across multiple client verticals.** Run 10 or more test searches spread across different clients in the stack and evaluate whether a videographer could take those results directly to a shoot. If not, iterate on the prompt until the video ideas are specific, actionable, and emotionally grounded regardless of industry. This is not a feature — it's quality assurance on the core product.

---

## 4. Feature Specifications

### 4.1 Brand Preferences → AI Integration

**Current State:** The Brand Preference Center stores tone keywords, topics to lean into, topics to avoid, competitor accounts, and seasonal priorities in Supabase. This data is not used anywhere in the search or AI pipeline.

**Target State:** When a search is executed for a client (either brand intel or topic research), the system should retrieve that client's stored preferences and inject them into the Claude prompt as structured context. The prompt should instruct the AI to prioritize topics the client wants to lean into, explicitly avoid topics the client has flagged, adopt the tone described by the client's tone keywords, reference competitor accounts as differentiation context (not as templates to copy), and weight seasonal priorities if the current date falls within a relevant season.

**Implementation Notes:** The preferences should be formatted as a clearly labeled section within the system prompt, not mixed into the user query. This keeps the prompt clean and makes it easy to debug when output quality doesn't match expectations. A good pattern is to wrap the preferences in a `<brand_context>` block that the AI can reference without it bleeding into the search query itself.

**Validation:** After implementation, run the same topic search for a client with and without preferences enabled. The results should be noticeably different — more specific, more on-brand, and more aligned with the client's stated priorities. If the difference isn't obvious, the prompt integration needs more work.

### 4.2 Content Calendar

**Purpose:** Give clients a visual timeline of their content strategy without exposing performance data. Give the Nativz team a planning surface that complements (but doesn't replace) Monday.com.

**Client Portal View:** A monthly calendar grid showing approved content concepts placed on their planned publish dates. Each item displays a title, content pillar tag, and status badge (planned / in production / published). Clicking an item opens a detail panel with the full concept brief, including the video idea, emotional angle, hook, and any notes from the Nativz team. Clients can leave comments on individual calendar items to provide feedback or ask questions. Clients cannot move, add, or delete items — the calendar is managed by the admin team.

**Admin Dashboard View:** The same calendar with full edit capabilities. Admins can drag approved ideas onto specific dates, assign content pillars, update statuses, and add internal notes that are not visible to clients. The admin view should also show a "backlog" sidebar of approved ideas that haven't been scheduled yet, making it easy to drag them onto the calendar.

**Data Model Extension:** The existing `content_ideas` table should be extended with the following fields: `scheduled_date` (date, nullable — null means unscheduled/backlog), `content_pillar` (text, references the client's configured pillars), `client_visible_notes` (text, shown in the client portal), `internal_notes` (text, admin-only), and `calendar_status` (enum: backlog, scheduled, in_production, published).

### 4.3 Approval & Feedback Workflow

**Current State:** Admins can approve reports and send them to the client portal. Clients can submit ideas that admins triage with accept/review/archive.

**Target State for V1:** The approval workflow should be extended to support lightweight feedback loops on individual content concepts, not just full reports. When the admin sends a batch of video concepts to the client, the client should be able to react to each one individually with an approve (thumbs up), request revision (with a text comment), or star/favorite (to signal "I love this, prioritize it"). This feedback flows back to the admin dashboard as a prioritized queue, with starred items at the top, approved items in the middle, and revision requests flagged for attention.

**Why This Matters:** The current flow is binary — the client sees a report or they don't. Adding per-concept feedback turns the portal from a read-only report viewer into an interactive collaboration surface. This is where stickiness comes from. Every time a client stars an idea or leaves a comment, they're investing in the platform and reinforcing the value of the agency relationship.

### 4.4 Idea Submission Pipeline

**Current State:** Clients can submit ideas, and admins can triage them with accept/review/archive.

**Enhancement for V1:** The idea submission form should be expanded to capture more structured input. Instead of just a freeform text field, the form should prompt clients for the core idea or topic (freeform text), why they think this would resonate (optional, freeform — this gives the team insight into client thinking), any reference links (URLs to content they saw and liked), urgency or timeliness (is this tied to a specific date or event?), and which content pillar this relates to (dropdown of the client's configured pillars, with an "other/not sure" option).

On the admin side, triaged ideas should flow into the same pipeline as AI-generated ideas. When an admin accepts a client-submitted idea, it should appear in the content backlog alongside AI-generated concepts, tagged with a "client-submitted" badge so the team knows its origin. This creates a unified pipeline where the best ideas rise to the top regardless of whether they came from the AI or the client.

### 4.5 Client Portal Dashboard

**Current State:** Functional but light.

**Target State for V1:** The dashboard should serve as a personalized home screen that gives the client three things at a glance: what needs their attention, what's coming up, and what's been delivered recently.

The layout should include a greeting header with the client's brand name and logo, an action items section showing counts of concepts awaiting their feedback and any unread reports, a content calendar preview showing the next 2 weeks of scheduled content in a compact timeline format, a recent reports section showing the last 3 approved reports with one-line summaries, and a quick idea submission widget (a single text input with a "submit idea" button that opens the full form — this reduces friction for capturing quick thoughts).

**Design Note:** This dashboard should feel clean and focused, not busy. The goal is that a client can log in, see what's new in under 10 seconds, take any needed actions, and log out feeling informed. Every element should either require action or provide reassurance that work is happening.

### 4.6 Notification System

**V1 Scope:** Email notifications only. In-app notifications can come in V2.

**Triggers:** A notification should be sent to the client when a new report is approved and published to their portal, when new content concepts are ready for their review, and as a weekly digest (optional, configurable) summarizing activity on their account. A notification should be sent to the admin team when a client submits a new idea, when a client leaves feedback on a concept (especially revision requests), and when a client updates their brand preferences.

**Implementation:** Use Supabase Edge Functions or a lightweight cron job (Vercel Cron) to check for notification triggers and send emails via a transactional email service (Resend is a solid choice for this stack — it has a generous free tier, great developer experience, and works well with Next.js/Vercel). Each notification should include a direct link to the relevant item in the platform so the recipient can take action with one click.

### 4.7 Search Scheduling (Automated 72-Hour Workflow)

**V1 Scope:** Admin-configured recurring searches per client.

**How It Works:** In the client settings page (admin side), the admin can enable a recurring search schedule. The configuration should include search type (brand intel, topic research, or both), frequency (weekly, biweekly, or custom), day of week and time to run, and specific topics or keywords to include (in addition to the brand name).

The system executes the search automatically at the scheduled time, stores results in `topic_searches` with a status of "pending_review," and notifies the admin that new results are ready for review. The admin reviews the results, optionally edits or curates them, and then approves them for the client portal.

**Why Not Full Automation:** For V1, it's important that a human reviews AI output before it reaches the client. The quality bar for client-facing content is high, and automated searches can occasionally produce off-brand or irrelevant results. The automation saves time on the execution side (no one has to remember to run searches manually), but the quality gate remains human.

**Future State (V2+):** Once the team has confidence in the AI output quality for a given client, they could enable auto-approve for routine searches, with only flagged or unusual results requiring manual review.

---

## 5. Reporting & Analytics Strategy

### 5.1 Philosophy

Cortex is not an analytics platform. Clients should not see engagement metrics, impression counts, or performance data in the Cortex portal. That data lives in Meta Business Suite, Google Ads dashboards, and the agency's reporting tools. Cortex's job is to inform the creative strategy, not measure its outcomes.

However, there are forms of "analytics" that serve the ideation mission without crossing into performance metrics.

### 5.2 Client-Facing (Portal)

**Content Pillar Balance Wheel:** A simple visual showing how the client's content mix is distributed across their configured pillars for the current month. This communicates strategic diversity without showing any performance numbers. For example, if a client has 4 pillars (recipes, franchise stories, community, seasonal promos) and 80% of their scheduled content is recipes, the wheel makes that imbalance visible — prompting a conversation about diversification.

**Idea Activity Summary:** A lightweight "your impact" section showing how many ideas the client has submitted, how many were accepted and moved to production, and how many are currently in the pipeline. This reinforces that the client's input matters and is being acted on.

**Search Topic Trends:** A simple word cloud or tag frequency view showing what topics have been researched for their brand over the past 30, 60, or 90 days. This gives clients a sense of strategic coverage without exposing any metrics.

### 5.3 Admin-Facing (Internal)

**Search Quality Tracker:** For each client, track how many AI-generated ideas were approved vs. rejected or edited before approval. This is a proxy for prompt quality — if the approval rate is low, the prompts need tuning. Over time, this metric should trend upward as the brand preferences and prompt engineering improve.

**Client Engagement Metrics:** Track how often each client logs into the portal, how many ideas they've submitted, how quickly they respond to feedback requests, and which features they use most. This data helps the Nativz team identify disengaged clients before they churn and understand which portal features are actually driving stickiness.

**Usage & Cost Dashboard:** Surface the existing `tokens_used` and `estimated_cost` data in a simple admin view showing cost per client per month, cost per search, and total platform costs. Include configurable alerts (e.g., "notify me if any client exceeds $50/month in search costs") so budget surprises don't happen. For V1, hard usage limits per client are not necessary — the human approval gate naturally throttles usage — but alerts are important.

---

## 6. Design & UX Direction

### 6.1 Tailark Components

Tailark blocks should be applied to the following pages in priority order:

1. **Client Portal Dashboard:** This is the page clients see first and most often. It should feel premium and polished. Tailark's card-based layouts, stat widgets, and clean typography would immediately elevate the current dashboard from functional to impressive.

2. **Landing/Marketing Page:** If Cortex is going to be presented to prospective clients or used as a sales tool ("here's the platform you'll get access to as our client"), the marketing page needs to look excellent. Tailark's hero sections, feature grids, and testimonial blocks would work well here.

3. **Search Results Page:** The results page has a lot of information density (executive summary, metrics, emotions, trending topics, pillars, etc.). Tailark's card and grid components could help organize this information more clearly and make the page feel less overwhelming.

4. **Admin Dashboard:** Lower priority since only the internal team sees this, but a cleaner admin experience improves team efficiency and morale. Tailark's table components and navigation patterns would be particularly useful here.

### 6.2 Mobile Experience

**Client Portal:** Mobile should be a priority. Franchise brand owners are busy and frequently on the move. They're checking their phone between meetings, between locations, during commutes. The client portal should be fully responsive and feel natural on a phone. The most critical mobile flows are viewing reports, approving/starring concepts, submitting quick ideas, and checking the content calendar.

**Admin Dashboard:** Mobile is lower priority for the admin side. The Nativz team primarily works at desks, and the admin workflows (running searches, reviewing results, managing clients) involve enough information density that a desktop experience is more appropriate. The admin dashboard should be responsive enough not to break on mobile, but it doesn't need to be optimized for mobile-first use.

### 6.3 Design System

For V1, the design system should be built iteratively in-browser rather than maintained in a separate Figma file. The Tailark component library provides enough of a design foundation that a separate design tool would create more overhead than value at this stage. The important thing is consistency: establish a small set of design tokens (colors, spacing scale, typography scale, border radius, shadow depth) and apply them uniformly across the platform. These tokens should be defined as Tailwind CSS custom properties so they can be adjusted globally.

**Color palette recommendation:** A neutral base (slate or zinc grays) with a single strong brand accent color for interactive elements and status indicators. Avoid using multiple bright colors — the content and data should be the visual focus, not the UI chrome.

---

## 7. Technical Specifications

### 7.1 Architecture Overview

The existing architecture is sound for V1. Next.js 15 with App Router provides the routing and server-side rendering foundation, Supabase handles auth, database, and storage, and the Brave Search → Claude pipeline powers the AI features. No major architectural changes are needed — the focus should be on filling feature gaps and improving quality.

### 7.2 Data Model Extensions

The following schema changes support the features described in this spec.

**Extend `content_ideas` table:**

```sql
ALTER TABLE content_ideas ADD COLUMN IF NOT EXISTS scheduled_date DATE;
ALTER TABLE content_ideas ADD COLUMN IF NOT EXISTS content_pillar TEXT;
ALTER TABLE content_ideas ADD COLUMN IF NOT EXISTS client_visible_notes TEXT;
ALTER TABLE content_ideas ADD COLUMN IF NOT EXISTS internal_notes TEXT;
ALTER TABLE content_ideas ADD COLUMN IF NOT EXISTS calendar_status TEXT DEFAULT 'backlog' 
  CHECK (calendar_status IN ('backlog', 'scheduled', 'in_production', 'published'));
ALTER TABLE content_ideas ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'ai' 
  CHECK (source IN ('ai', 'client', 'team'));
ALTER TABLE content_ideas ADD COLUMN IF NOT EXISTS client_reaction TEXT 
  CHECK (client_reaction IN ('approved', 'starred', 'revision_requested', NULL));
ALTER TABLE content_ideas ADD COLUMN IF NOT EXISTS client_feedback TEXT;
ALTER TABLE content_ideas ADD COLUMN IF NOT EXISTS urgency TEXT 
  CHECK (urgency IN ('normal', 'timely', 'urgent'));
ALTER TABLE content_ideas ADD COLUMN IF NOT EXISTS reference_urls TEXT[];
```

**New `search_schedules` table:**

```sql
CREATE TABLE search_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  search_type TEXT NOT NULL CHECK (search_type IN ('brand_intel', 'topic_research', 'both')),
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
  day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
  time_utc TIME NOT NULL,
  additional_keywords TEXT[],
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**New `notifications` table:**

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'report_published', 'concepts_ready', 'idea_submitted', 
    'feedback_received', 'preferences_updated', 'weekly_digest'
  )),
  title TEXT NOT NULL,
  body TEXT,
  link_path TEXT,
  is_read BOOLEAN DEFAULT false,
  email_sent BOOLEAN DEFAULT false,
  email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**New `concept_comments` table:**

```sql
CREATE TABLE concept_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_idea_id UUID REFERENCES content_ideas(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 7.3 API Routes (New)

The following API routes should be added to support the new features:

`/api/calendar/[orgId]` — GET: Retrieve all scheduled content ideas for a given organization within a date range. PATCH: Update a content idea's scheduled date or calendar status (admin only).

`/api/notifications/[userId]` — GET: Retrieve unread notifications for a user. PATCH: Mark notifications as read.

`/api/notifications/send` — POST: Trigger a notification (called by internal processes, not exposed to clients). Handles both in-app creation and email dispatch.

`/api/schedules/[orgId]` — GET/POST/PATCH/DELETE: CRUD for search schedules (admin only).

`/api/concepts/[ideaId]/react` — POST: Submit a client reaction (approve/star/revision) on a specific content idea.

`/api/concepts/[ideaId]/comments` — GET/POST: Retrieve and add comments on a content idea.

### 7.4 Prompt Engineering — Brand Preference Injection

The following template demonstrates how brand preferences should be injected into the Claude prompt. This is the most critical technical change for V1.

```
<brand_context>
You are generating content ideas for {{client_name}}, a {{industry}} brand.

<tone_and_voice>
The brand's tone should reflect these keywords: {{tone_keywords | join(", ")}}
</tone_and_voice>

<content_priorities>
Topics to lean into and prioritize: {{lean_into_topics | join(", ")}}
Topics to explicitly avoid: {{avoid_topics | join(", ")}}
</content_priorities>

<competitive_landscape>
The brand watches these competitor accounts for differentiation (do NOT copy their content — use them as context for what the market is doing): {{competitor_accounts | join(", ")}}
</competitive_landscape>

<seasonal_context>
Current seasonal priorities: {{seasonal_priorities | join(", ")}}
Today's date: {{current_date}}
</seasonal_context>

<content_pillars>
The brand's content is organized around these pillars: {{content_pillars | join(", ")}}
Ensure generated ideas are distributed across these pillars rather than clustering in one area.
</content_pillars>
</brand_context>
```

This block should be inserted into the system prompt before the main instruction set. The AI should be instructed to treat this context as hard constraints — particularly the "avoid" topics, which should function as strict exclusion filters.

### 7.5 Cost & Usage Management

For V1, implement the following:

**Per-Search Cost Logging:** Already in place via `tokens_used` and `estimated_cost`. No changes needed.

**Admin Cost Dashboard:** A simple page in the admin dashboard showing total spend this month (across all clients), spend per client this month (sorted highest to lowest), average cost per search, and a sparkline trend of daily spend over the last 30 days.

**Alerts:** Configurable thresholds that send an email to the admin when a client's monthly spend exceeds a set amount (e.g., $50) or when total platform spend exceeds a set amount (e.g., $500). These should be stored in a `cost_alerts` table and checked after each search execution.

**Hard Limits:** Not needed for V1. The human approval gate and scheduled search system naturally limit usage. If Cortex scales to self-serve clients in the future, per-client rate limits would become important.

---

## 8. V1 Launch Roadmap

### Sprint 2: Core Integration (Estimated 1–2 weeks)

Wire brand preferences into AI prompts, including retrieval, injection, and quality validation with test searches across multiple clients in the stack. Run at least 10 test searches spread across different verticals and evaluate output quality against the bar of "could a videographer use this on set tomorrow?" Tune the prompt until the answer is consistently yes regardless of industry. Implement per-concept client reactions (approve/star/request revision) on the results page.

### Sprint 3: Calendar & Pipeline (Estimated 1–2 weeks)

Build the content calendar view for both admin (full edit) and client portal (read-only with commenting). Extend the content_ideas table with the new fields. Create the backlog sidebar in admin view for dragging unscheduled ideas onto dates. Connect the idea submission form enhancements (structured input fields).

### Sprint 4: Notifications & Scheduling (Estimated 1 week)

Set up the notification system with email dispatch via Resend. Implement search scheduling (admin configuration UI, Vercel Cron execution, pending_review flow). Build the admin cost dashboard and alert system.

### Sprint 5: Polish & Launch Prep (Estimated 1 week)

Redesign the client portal dashboard using Tailark components. Ensure full mobile responsiveness on the client portal. Implement the content pillar balance wheel and idea activity summary for the portal. Conduct end-to-end testing across multiple client accounts with real data. Configure all current Nativz clients in the system (brand preferences, content pillars, tone settings). Prepare onboarding flow and documentation.

---

## 9. Success Metrics

The following metrics should be tracked after launch to determine whether Cortex is delivering on its promise.

**Client Engagement:** Portal login frequency per client (target: at least once per week), idea submissions per client per month (target: at least 2), feedback/reaction rate on concepts (target: above 70% of concepts receive a reaction within 48 hours).

**Team Efficiency:** Time from search to approved report (target: under 24 hours), percentage of AI-generated ideas that pass admin review without major edits (target: above 60% within 30 days of launch), reduction in "what are we filming?" messages before shoots (qualitative, tracked via team feedback).

**Retention Signal:** Client portal usage should trend upward, not downward, over the first 90 days. If a client stops logging in, that's a churn risk signal that should trigger outreach.

---

## 10. Open Questions for Active Decision

These items require input before implementation can proceed.

1. **Client onboarding sprint:** Has the Brand Preference Center been filled out for all current Nativz clients? If not, a dedicated onboarding sprint should be scheduled before launch so every client has their tone keywords, content pillars, and preferences configured and the AI integration can be tested with real data across the full stack.

2. **Content pillar taxonomy:** Are content pillars defined per client during onboarding, or should Cortex suggest default pillars based on the client's industry? A hybrid approach (AI-suggested defaults that the client can edit) would reduce onboarding friction, and this becomes especially important when configuring many clients at once.

3. **Monday.com handoff:** When an idea moves to "in_production" in Cortex, should there be a manual copy step to Monday.com, or should a future integration automate this? The answer determines whether the `calendar_status` field needs to support bidirectional sync.

4. **Pricing model:** Is Cortex included in the Nativz retainer, or is it an add-on that clients pay for separately? This affects how the platform is positioned during onboarding and whether usage limits become necessary — especially relevant when scaling across the entire client stack.

5. **Multi-location franchise support:** For franchise clients with multiple locations, should each location have its own portal login and preferences, or does the brand owner manage all locations through a single account? Different locations may have different seasonal priorities or community events, so this decision affects the data model and the Brand Preference Center design.

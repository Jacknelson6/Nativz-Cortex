# Nativz Cortex — Product Development Roadmap (PDR)

## Vision
Make Nativz Cortex the indispensable tool that ensures every videographer shows up on set with a clear shot list, trending angles, and ready-to-film video ideas — delivered automatically before every shoot.

---

## Sprint 1: Make Ideas Actionable (Current)

### 1.1 Copy-to-clipboard on video ideas
**Problem:** Videographers can't quickly grab ideas from the report into their shot list.
**Solution:** Add a copy button to each video idea card that copies a formatted block (title, hook, format, why it works) to clipboard. Also add copy on topic names.
**Files:** `components/results/video-idea-card.tsx`, `components/results/topic-row-expanded.tsx`

### 1.2 Improved video idea cards
**Problem:** Video idea cards are compact and don't emphasize the most useful info (hook, why it works).
**Solution:** Redesign cards to lead with the hook, make "why it works" more prominent, add virality badge with color coding, and add the copy button.
**Files:** `components/results/video-idea-card.tsx`

### 1.3 Admin dashboard improvements
**Problem:** Dashboard shows basic stats but no actionable insights.
**Solution:** Add "searches this week" count, "reports pending send" quick link, and improve the recent searches list with client names inline.
**Files:** `app/admin/dashboard/page.tsx`

### 1.4 Report PDF export
**Problem:** No way to download or share reports offline.
**Solution:** Add "Download PDF" button on results page. Generate a clean PDF with executive summary, metrics, trending topics, and video ideas.
**Files:** New `components/results/export-pdf-button.tsx`, `app/api/search/[id]/pdf/route.ts`

---

## Sprint 2: Shoot Date Scheduling

### 2.1 Shoot dates system
**Problem:** Reports aren't tied to actual shoot dates — the core use case.
**Solution:** Admin can create shoot dates per client. System auto-generates research 72 hours before. Reports land in the client portal on time.
**Tables:** New `shoot_dates` table, add `shoot_date_id` FK to `topic_searches`
**Files:** New `/admin/clients/[slug]/shoots` page, cron job via Vercel

### 2.2 Email notifications
**Problem:** When a report is "sent" to a client, they don't know until they log in.
**Solution:** Integrate Resend for transactional email. Send notification when report is sent. Include direct link to the report.
**Dependencies:** Resend API key

### 2.3 Shareable report links
**Problem:** External stakeholders (freelance videographers, producers) can't see reports without a portal login.
**Solution:** Generate expiring share links (7-day default). Read-only access, no login required.
**Tables:** New `shared_links` table

---

## Sprint 3: Instagram Intelligence

### 3.1 Meta Instagram integration
**Problem:** The team manually reviews Instagram posts to find winning content patterns.
**Solution:** Connect Meta Graph API to pull post data. Analyze engagement, extract transcripts from video posts, identify winning formats and hooks.
**Tables:** `meta_page_snapshots`, `meta_posts` (already in schema)

### 3.2 Winning content decoder
**Problem:** No systematic way to identify what makes a client's top posts succeed.
**Solution:** AI analysis of top-performing posts — extract hooks, formats, themes, posting times. Generate "do more of this" recommendations.

### 3.3 Content calendar
**Problem:** No way to plan content output across clients.
**Solution:** Calendar view showing scheduled shoots, when research was run, when reports were sent, and upcoming deadlines.

---

## Sprint 4: Competitive Intelligence

### 4.1 Competitor tracking
**Problem:** Clients want to know what competitors are doing.
**Solution:** Track competitor Instagram/social accounts, surface their top-performing content, identify gaps the client can exploit.
**Tables:** `competitors` (already in schema)

### 4.2 Side-by-side report comparison
**Problem:** No way to see how a topic evolved between searches.
**Solution:** Select 2-3 reports and compare trending topics, sentiment shifts, and new video ideas.

---

## Technical Debt

- Remove unused DB tables if not planned for Sprint 2-4
- Add pagination to search history (currently capped at 100)
- Mobile responsiveness pass on sidebar and filter chips
- Keep filter state in URL params for shareable links

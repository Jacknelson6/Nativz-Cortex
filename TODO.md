# TODO — Nativz Cortex (Dual-Dashboard Platform)

## Current state

The platform is live on Vercel with both admin and portal dashboards fully functional. Search flow (Brave SERP → Claude AI → structured results) is working end-to-end. Performance has been optimized with caching at multiple layers. The Obsidian vault integration syncs search results and client profiles to GitHub.

### What's done

#### Core platform
- [x] **Brave Search API integration** — 3 parallel calls (web, discussions, videos) with SERP metrics computation
- [x] **Admin dashboard** — layout, sidebar with floating dock, header, login, dashboard with stats, client list, client detail, client settings with feature toggles
- [x] **Client portal** — layout, sidebar, login, dashboard, search, results (read-only), reports list, settings, preferences
- [x] **Search flow** — Brave SERP data → Claude prompt → structured JSON → stored in `topic_searches`
- [x] **Dual search modes** — "Brand intel" (client_strategy) and "Topic research" (general) with split-card selector UI
- [x] **Approval system** — approve/reject on admin results page, portal sees approved only
- [x] **Client API routes** — GET/POST `/api/clients`, PATCH `/api/clients/[id]`, URL analysis, logo upload
- [x] **Role-based middleware** — admins → `/admin/*`, viewers → `/portal/*`, with cached role cookie
- [x] **Database** — `topic_searches`, `clients`, `users`, `invite_tokens`, `ideas` tables with RLS
- [x] **Legacy cleanup** — old standalone pages redirect to admin

#### Search page redesign
- [x] **Search mode selector** — dual-card layout: Brand intel (client dropdown) + Topic research (text input)
- [x] **Glass button** — liquid glass effect with backdrop-blur, semi-transparent accent, glow on hover
- [x] **Glow button** — animated gradient border button (blue/purple palette)
- [x] **Search processing page** — animated progress indicator while AI processes results

#### Client management
- [x] **Client detail pages** — vault-powered profiles with industry, brand voice, target audience, topic keywords
- [x] **Client settings** — feature toggles, industry, brand info, logo upload with image-upload component
- [x] **Client preferences** — brand preferences form (portal-editable)
- [x] **URL auto-fill** — analyze client website URL to auto-populate profile fields
- [x] **Portal invite system** — admin generates invite link → client signs up at `/portal/join/[token]` → auto-linked to org
- [x] **Invite tokens** — 7-day expiry, one-time use, admin-only management

#### Content ideation
- [x] **Ideas system** — idea submissions with triage (pending/approved/rejected), filtering, admin review
- [x] **Video idea cards** — expandable cards with hook, format, why-it-works for each trending topic
- [x] **Send-to-client flow** — mark ideas for client delivery

#### Integrations
- [x] **Obsidian vault** — GitHub-backed vault with client profiles, search results, strategy notes
- [x] **Vault sync** — auto-syncs completed searches to vault (non-blocking)
- [x] **Vault reader** — reads client profiles from vault for enriched client detail pages
- [x] **Monday.com** — webhook + sync integration for project management

#### Performance
- [x] **Vault caching** — GitHub API fetches cached with `next: { revalidate: 300 }` (5 min)
- [x] **Middleware role caching** — user role stored in httpOnly cookie (10 min), skips DB query
- [x] **Layout user caching** — `unstable_cache()` on user data fetch in admin/portal layouts (5 min)
- [x] **Vault N+1 fix** — direct slug lookup instead of fetching all client profiles

#### Bug fixes
- [x] **Search crash fix** — added null safety (`?? []`, `?? ''`, `?? 0`) for AI responses with missing fields
- [x] **Optional chaining** — `topic.video_ideas?.length` and `(topic.video_ideas ?? []).map()` throughout results components

#### UI polish
- [x] **Nativz logo centered** over sidebar nav button
- [x] **Contact badge** — "Contact" label on client point-of-contact (was "Email")
- [x] **Removed lightbulb** icon from Ideas page header
- [x] **Removed "Reviewed" filter** from Ideas triage
- [x] **Removed "New research" button** from dashboard header
- [x] **Blue/purple glow** — gradient uses only brand blue + purple (no green)
- [x] **Rounded square logo** — image upload uses `rounded-2xl` matching brand shape
- [x] 0 TypeScript errors, clean production build

---

## What's left

### Priority 1 — Immediate
- [ ] Test invite flow end-to-end (generate invite → sign up → verify portal access)
- [ ] Add toast notifications for key actions (approve, reject, copy, invite sent)
- [ ] Client portal: check `feature_flags.can_search` before allowing search
- [ ] Client portal: check `feature_flags.can_view_reports` before showing reports

### Priority 2 — Feature gaps
- [ ] Admin search history: filters by client, status, date range
- [ ] Admin "create client" page (`/admin/clients/new`) — currently only API exists
- [ ] Points of contact management — add/edit multiple contacts per client
- [ ] Notification system polish — bell icon exists but needs full implementation
- [ ] Portal ideas tab — client-facing idea submissions

### Priority 3 — Polish
- [ ] Add loading skeletons for all pages (some have them, not all)
- [ ] Add Suspense boundaries for streaming
- [ ] Mobile responsive: test sidebar collapse, filter chips, card layouts on small screens
- [ ] Empty states on all list pages with guidance text
- [ ] Error boundaries with friendly messages

### Priority 4 — Future features
- [ ] Export results as PDF
- [ ] Share results via link
- [ ] Compare multiple topic searches side-by-side
- [ ] Scheduled searches (72 hours before shoots — cron job)
- [ ] Email notifications for approved reports
- [ ] Client onboarding wizard (guided setup after invite)
- [ ] Search result versioning (re-run and compare)

---

## Environment setup

### Required env vars (all configured in `.env.local`)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL` (default: `anthropic/claude-sonnet-4-5`)
- `BRAVE_SEARCH_API_KEY`
- `NEXT_PUBLIC_APP_URL`
- `VAULT_GITHUB_TOKEN` (for Obsidian vault GitHub sync)
- `VAULT_GITHUB_OWNER` / `VAULT_GITHUB_REPO`

### Database tables
- `topic_searches` — search queries and AI-generated results
- `clients` — client records with feature_flags, preferences, organization_id
- `users` — auth users with role (admin/viewer), organization_id
- `invite_tokens` — portal invite links with expiry and usage tracking
- `ideas` — video idea submissions with status tracking

### Deployment
- [x] Deployed to Vercel
- [x] Env vars configured
- [ ] Custom domain setup

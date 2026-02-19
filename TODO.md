# TODO — Nativz Cortex (Dual-Dashboard Platform)

## Current state

The dual-dashboard architecture is fully implemented and building cleanly. First successful end-to-end search completed (Brave Search → Claude → results page).

### What's done

- [x] **Brave Search API integration** — 3 parallel calls (web, discussions, videos) replace OpenRouter's webSearch plugin
- [x] **Admin dashboard** — layout, sidebar, header, login, dashboard with stats, client list, client detail, client settings with feature toggles
- [x] **Client portal** — layout, sidebar, login, dashboard, search, results (read-only), reports list, settings (read-only)
- [x] **Search flow** — Brave SERP data → Claude prompt → structured JSON → stored in `topic_searches`
- [x] **Approval system** — PATCH endpoint on `/api/search/[id]`, approve/reject buttons on admin results page
- [x] **Client API routes** — GET/POST `/api/clients`, PATCH `/api/clients/[id]`
- [x] **Role-based middleware** — admins → `/admin/*`, viewers → `/portal/*`, legacy routes redirect
- [x] **Database** — `topic_searches` table created with `approved_at`/`approved_by`, `feature_flags` on clients, RLS policies
- [x] **Legacy cleanup** — old standalone pages (`/`, `/login`, `/history`, `/search/[id]`) redirect to admin
- [x] **SearchForm** updated with `redirectPrefix`, `fixedClientId`, `hideClientSelector` props
- [x] **Loading message** — "Gathering search data and generating your report — this usually takes 1-2 minutes."
- [x] 0 TypeScript errors, clean production build

---

## What's left

### Priority 1 — User has change requests and questions (pending)
- [ ] User mentioned they have change requests and questions — waiting for them to list them out
- [ ] Test full admin flow: login → create client → run search → approve → verify portal sees it
- [ ] Test portal flow: login as viewer → see approved reports → run own search

### Priority 2 — Known gaps
- [ ] No "create client" page yet (only API route exists) — need `/admin/clients/new` page with form
- [ ] Admin search results page doesn't show which client the search is for
- [ ] Portal search: should check `feature_flags.can_search` before allowing search
- [ ] Portal reports: should check `feature_flags.can_view_reports` before showing reports
- [ ] No error/loading states on admin dashboard and client pages
- [ ] Admin search history: no filters (by client, by status, by date)
- [ ] Mobile responsive: sidebar doesn't collapse on mobile

### Priority 3 — Polish
- [ ] Add toast notifications for approve/reject actions
- [ ] Add loading skeletons for admin/portal pages
- [ ] Add "new search" quick action from results page
- [ ] Mobile responsive adjustments for filter chips and sidebar
- [ ] Add Suspense boundaries for streaming

### Priority 4 — Future features
- [ ] Export results as PDF
- [ ] Share results via link
- [ ] Compare multiple topic searches
- [ ] Scheduled searches (72 hours before shoots)
- [ ] Dark mode

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

### Database
- `topic_searches` table — created and working
- `feature_flags` column on `clients` — added
- RLS policies — admin full access, portal sees approved only

### Deployment
- [ ] Deploy to Vercel
- [ ] Set env vars in Vercel dashboard
- [ ] Set `NEXT_PUBLIC_APP_URL` to production URL

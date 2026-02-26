# API Patterns

## Route Conventions

- All API routes live under `app/api/`
- Routes validate input with Zod schemas and check auth before processing
- Admin pages use `createAdminClient()` (service role) for unrestricted data access
- Portal pages scope data to the user's organization via `organization_id`
- Dynamic route params in Next.js 15 use `params: Promise<{ id: string }>` pattern (must `await params`)

## Core API Routes

### Search
- `POST /api/search/start` — Create topic search record, returns ID
- `POST /api/search/[id]/process` — Execute search (Brave → Claude → store)
- `GET /api/search/[id]` — Retrieve stored search result
- `PATCH /api/search/[id]` — Approve/reject search (admin only)
- `POST /api/search/[id]/share` — Generate share token

### Clients
- `GET /api/clients` — List clients (admin) or get own org's clients (portal)
- `POST /api/clients` — Create client (admin)
- `PATCH /api/clients/[id]` — Update client settings (admin)
- `POST /api/clients/upload-logo` — Upload client logo image
- `POST /api/clients/analyze-url` — Analyze website URL to auto-fill profile
- `GET/PATCH /api/clients/preferences` — Client brand preferences
- `POST /api/clients/onboard` — Client onboarding flow
- `GET /api/clients/[id]/strategy` — Client strategy data

### Invites
- `POST /api/invites` — Generate portal invite token (admin)
- `GET /api/invites/validate` — Check if invite token is valid
- `POST /api/invites/accept` — Accept invite and create portal user

### Ideas
- `GET/POST /api/ideas` — Idea submissions CRUD
- `PATCH /api/ideas/[id]` — Update idea status (approve/reject)

### Moodboard
- `GET/POST /api/moodboard/boards` — Board CRUD
- `GET/PATCH/DELETE /api/moodboard/boards/[id]` — Single board operations
- `POST /api/moodboard/boards/[id]/share` — Share board
- `POST /api/moodboard/boards/[id]/duplicate` — Duplicate board
- `GET/POST /api/moodboard/items` — Item CRUD
- `POST /api/moodboard/items/[id]/process` — Process item (AI analysis)
- `POST /api/moodboard/items/[id]/analyze` — Analyze item
- `POST /api/moodboard/items/[id]/transcribe` — Transcribe video
- `POST /api/moodboard/items/[id]/rescript` — Rescript content
- `POST /api/moodboard/chat` — AI chat within moodboard

### Shoots
- `GET/POST /api/shoots` — Shoot CRUD
- `GET/PATCH /api/shoots/[id]` — Single shoot operations
- `POST /api/shoots/schedule` — Schedule a shoot
- `POST /api/shoots/ideate` — Generate shoot ideas
- `POST /api/shoots/[id]/plan` — Generate shoot plan
- `POST /api/shoots/content-calendar` — Content calendar generation

### Other
- `POST /api/auth/logout` — Sign out
- `/api/vault/*` — Vault provisioning, sync, search, indexing
- `/api/monday/*` — Monday.com webhook + sync
- `/api/calendar/*` — Google Calendar integration
- `/api/instagram/*` — Instagram insights and media
- `/api/analytics/meta` — Meta analytics
- `GET /api/dashboard/stats` — Dashboard statistics
- `GET/POST /api/notifications` — Notification management

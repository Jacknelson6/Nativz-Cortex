# External API & API Key System Design

**Date:** 2026-03-10
**Status:** Approved
**Purpose:** Enable AI agents (Claude, n8n, custom GPTs, scripts) to read/write Cortex data via bearer token auth.

## API Key Model

### Database: `api_keys` table

```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  name TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_hash ON api_keys (key_hash) WHERE is_active = true;
CREATE INDEX idx_api_keys_user ON api_keys (user_id);
```

### Key format

- Pattern: `ntvz_` + 40 random hex chars
- Example: `ntvz_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2`
- Storage: SHA-256 hash stored in `key_hash`, first 12 chars in `key_prefix`
- Plaintext shown once on creation, never again

### Available scopes

`tasks`, `clients`, `shoots`, `scheduler`, `search`, `team`, `calendar`

## Authentication Flow

```
Request: Authorization: Bearer ntvz_xxx

1. Extract token from header
2. SHA-256 hash the token
3. Look up key_hash in api_keys WHERE is_active = true
4. Check expires_at (if set)
5. Check scopes against requested resource
6. Update last_used_at (fire-and-forget)
7. Execute request as the key's user_id
```

Rate limit: 100 requests/minute per key (in-memory counter).

## API Endpoints

All routes under `/api/v1/`. Auth via bearer token. Responses match internal API shapes.

### Tasks (`tasks` scope)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/tasks` | List tasks (supports ?status, ?client_id, ?assignee_id) |
| GET | `/api/v1/tasks/:id` | Get single task |
| POST | `/api/v1/tasks` | Create task |
| PATCH | `/api/v1/tasks/:id` | Update task |
| DELETE | `/api/v1/tasks/:id` | Archive task |

### Clients (`clients` scope)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/clients` | List all clients |
| GET | `/api/v1/clients/:id` | Get client details |
| POST | `/api/v1/clients` | Onboard new client (runs onboard wizard flow) |

### Shoots (`shoots` scope)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/shoots` | List shoots |
| GET | `/api/v1/shoots/:id` | Get shoot details |

### Scheduler (`scheduler` scope)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/posts` | List scheduled posts |
| GET | `/api/v1/posts/:id` | Get post details |
| POST | `/api/v1/posts` | Create scheduled post |

### Search (`search` scope)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/search` | Trigger AI topic search for a client |

### Team (`team` scope)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/team` | List team members |
| POST | `/api/v1/team` | Create team member |

### Calendar (`calendar` scope)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/calendar/events` | List calendar events |
| POST | `/api/v1/calendar/events` | Create calendar event |

## Implementation Architecture

### Files to create

```
lib/api-keys/
  generate.ts        — Key generation + hashing utilities
  validate.ts        — Auth middleware for v1 routes
  rate-limit.ts      — In-memory rate limiter

app/api/v1/
  tasks/route.ts
  tasks/[id]/route.ts
  clients/route.ts
  clients/[id]/route.ts
  shoots/route.ts
  shoots/[id]/route.ts
  posts/route.ts
  posts/[id]/route.ts
  search/route.ts
  team/route.ts
  calendar/events/route.ts

app/api/api-keys/
  route.ts            — GET (list), POST (create)
  [id]/route.ts       — DELETE (revoke)

app/admin/nerd/api/
  page.tsx            — API documentation page
```

### Files to modify

```
app/admin/settings/page.tsx  — Add API Keys section
components/tasks/types.ts    — No changes (reuse existing types)
```

## Settings UI

New "API keys" section in Settings between Todoist and Calendar:

- List active keys: name, prefix, scopes (as badges), last used, created date
- "Create key" button → dialog: name input + scope checkboxes
- After creation: show full key once with copy button + warning
- Revoke button per key (sets is_active = false)

## API Docs Page

`/admin/nerd/api` — reference page with:

- Base URL and auth header format
- Endpoint table with method, path, description
- Request/response shapes per endpoint
- Example curl commands
- No separate markdown — rendered from code

## Security

- Keys hashed with SHA-256 (plaintext never stored)
- Rate limiting: 100 req/min per key
- Scopes restrict which resources a key can access
- Keys tied to user — inherits that user's permission level
- Optional expiry date
- Revocation is immediate (is_active = false)
- last_used_at tracking for auditing stale keys

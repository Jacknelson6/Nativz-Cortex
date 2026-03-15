# External API & API Key System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add bearer token auth and `/api/v1/` endpoints so AI agents can read/write Cortex data.

**Architecture:** New `api_keys` table stores hashed tokens with scopes. A shared `validateApiKey()` function authenticates all `/api/v1/` routes. Each v1 route delegates to the same DB queries as internal routes but authenticates via bearer token instead of session. Settings UI manages key lifecycle.

**Tech Stack:** Next.js 15 App Router, Supabase, Node `crypto` (SHA-256 + randomBytes), Zod, Tailwind.

---

### Task 1: Database migration — `api_keys` table

**Files:**
- Create: `supabase/migrations/033_create_api_keys.sql`

**Step 1: Apply migration**

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

Use `mcp__supabase__apply_migration` with name `create_api_keys`.

**Step 2: Verify**

Run: `mcp__supabase__list_tables` — confirm `api_keys` appears.

---

### Task 2: Key generation and hashing utilities

**Files:**
- Create: `lib/api-keys/generate.ts`

**Step 1: Write utility**

```typescript
import { randomBytes, createHash } from 'crypto';

const KEY_PREFIX = 'ntvz_';

export function generateApiKey(): { plaintext: string; hash: string; prefix: string } {
  const raw = randomBytes(20).toString('hex'); // 40 hex chars
  const plaintext = `${KEY_PREFIX}${raw}`;
  const hash = createHash('sha256').update(plaintext).digest('hex');
  const prefix = plaintext.slice(0, 20); // "ntvz_" + first 12 hex
  return { plaintext, hash, prefix };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
```

---

### Task 3: API key validation middleware

**Files:**
- Create: `lib/api-keys/validate.ts`
- Create: `lib/api-keys/rate-limit.ts`

**Step 1: Write rate limiter**

```typescript
// lib/api-keys/rate-limit.ts
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 100;

const counters = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(keyId: string): boolean {
  const now = Date.now();
  const entry = counters.get(keyId);

  if (!entry || now > entry.resetAt) {
    counters.set(keyId, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  entry.count++;
  return entry.count <= MAX_REQUESTS;
}
```

**Step 2: Write validation function**

```typescript
// lib/api-keys/validate.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hashApiKey } from './generate';
import { checkRateLimit } from './rate-limit';

interface ApiKeyContext {
  userId: string;
  keyId: string;
  scopes: string[];
}

const SCOPE_MAP: Record<string, string> = {
  tasks: 'tasks',
  clients: 'clients',
  shoots: 'shoots',
  posts: 'scheduler',
  search: 'search',
  team: 'team',
  calendar: 'calendar',
};

function getScopeFromPath(pathname: string): string | null {
  // /api/v1/tasks/... → "tasks"
  const segment = pathname.replace('/api/v1/', '').split('/')[0];
  return SCOPE_MAP[segment] ?? null;
}

export async function validateApiKey(
  request: NextRequest,
): Promise<{ ctx: ApiKeyContext } | { error: NextResponse }> {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 }) };
  }

  const token = auth.slice(7);
  if (!token.startsWith('ntvz_')) {
    return { error: NextResponse.json({ error: 'Invalid API key format' }, { status: 401 }) };
  }

  const hash = hashApiKey(token);
  const admin = createAdminClient();

  const { data: key } = await admin
    .from('api_keys')
    .select('id, user_id, scopes, expires_at')
    .eq('key_hash', hash)
    .eq('is_active', true)
    .single();

  if (!key) {
    return { error: NextResponse.json({ error: 'Invalid or revoked API key' }, { status: 401 }) };
  }

  if (key.expires_at && new Date(key.expires_at) < new Date()) {
    return { error: NextResponse.json({ error: 'API key expired' }, { status: 401 }) };
  }

  // Check scope
  const requiredScope = getScopeFromPath(request.nextUrl.pathname);
  if (requiredScope && !key.scopes.includes(requiredScope)) {
    return { error: NextResponse.json({ error: `Missing scope: ${requiredScope}` }, { status: 403 }) };
  }

  // Rate limit
  if (!checkRateLimit(key.id)) {
    return { error: NextResponse.json({ error: 'Rate limit exceeded (100/min)' }, { status: 429 }) };
  }

  // Update last_used_at (fire-and-forget)
  admin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id).then(() => {});

  return { ctx: { userId: key.user_id, keyId: key.id, scopes: key.scopes } };
}
```

---

### Task 4: API key management endpoints

**Files:**
- Create: `app/api/api-keys/route.ts`
- Create: `app/api/api-keys/[id]/route.ts`

**Step 1: Write GET + POST**

`app/api/api-keys/route.ts`:
- GET: List all keys for current user (return id, name, prefix, scopes, is_active, last_used_at, created_at, expires_at — never return hash)
- POST: Create key — validate name + scopes with Zod, generate key, insert, return the full plaintext key once

Auth: session-based (admin only), uses `createServerSupabaseClient()` + `createAdminClient()`.

**Step 2: Write DELETE**

`app/api/api-keys/[id]/route.ts`:
- DELETE: Set `is_active = false` on the key (soft revoke). Only the key's owner or an `is_owner` user can revoke.

---

### Task 5: V1 API routes — Tasks

**Files:**
- Create: `app/api/v1/tasks/route.ts`
- Create: `app/api/v1/tasks/[id]/route.ts`

**Pattern for all v1 routes:**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-keys/validate';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if ('error' in auth) return auth.error;

  const admin = createAdminClient();
  // ... same query logic as internal route, using auth.ctx.userId for scoping
}
```

**Tasks routes mirror `app/api/tasks/route.ts` and `app/api/tasks/[id]/route.ts`:**

- GET `/api/v1/tasks` — list with filters (status, client_id, assignee_id, due_date_from, due_date_to)
- POST `/api/v1/tasks` — create task (Zod validation, auto-assign to creator)
- GET `/api/v1/tasks/:id` — single task
- PATCH `/api/v1/tasks/:id` — update fields
- DELETE `/api/v1/tasks/:id` — soft archive

Include Todoist push on create/update/delete (same as internal routes).

---

### Task 6: V1 API routes — Clients

**Files:**
- Create: `app/api/v1/clients/route.ts`
- Create: `app/api/v1/clients/[id]/route.ts`

- GET `/api/v1/clients` — list clients (select: id, name, slug, abbreviation, agency, services, health_score, is_active)
- GET `/api/v1/clients/:id` — full client detail with contacts
- POST `/api/v1/clients` — onboard new client (mirror `app/api/clients/onboard/route.ts` logic: create org + client, sync vault, create Monday item)

---

### Task 7: V1 API routes — Shoots, Posts, Search

**Files:**
- Create: `app/api/v1/shoots/route.ts`
- Create: `app/api/v1/shoots/[id]/route.ts`
- Create: `app/api/v1/posts/route.ts`
- Create: `app/api/v1/posts/[id]/route.ts`
- Create: `app/api/v1/search/route.ts`

Each mirrors its internal counterpart:

- **Shoots**: GET list (filter by client_id, status, date range), GET single
- **Posts**: GET list (filter by client_id, status), GET single, POST create
- **Search**: POST triggers topic search for a client_id

---

### Task 8: V1 API routes — Team, Calendar

**Files:**
- Create: `app/api/v1/team/route.ts`
- Create: `app/api/v1/calendar/events/route.ts`

- **Team**: GET list active members, POST create member (name, email, role)
- **Calendar**: GET events (query: start, end), POST create event

---

### Task 9: Middleware update — bypass session auth for /api/v1/

**Files:**
- Modify: `middleware.ts`

Add `/api/v1/` to the public routes bypass so the middleware doesn't redirect API key requests to login:

```typescript
// Add to public routes check at the top of middleware:
if (pathname.startsWith('/api/v1/')) {
  return supabaseResponse;
}
```

Also update the matcher to include `/api/v1/:path*`.

---

### Task 10: Settings UI — API Keys section

**Files:**
- Modify: `app/admin/settings/page.tsx`

Add new section between Todoist and Calendar:
- SECTIONS array: add `{ id: 'api-keys', label: 'API keys', icon: Key }`
- `ApiKeysSection` component:
  - Fetches keys via GET `/api/api-keys`
  - List: name, prefix (`ntvz_abc1...`), scope badges, last used date, revoke button
  - "Create key" button opens dialog: name input, scope checkboxes (tasks, clients, shoots, scheduler, search, team, calendar)
  - After creation: modal showing full key with copy button + "You won't see this again" warning
  - Revoke: confirmation → DELETE `/api/api-keys/:id`

---

### Task 11: API documentation page

**Files:**
- Create: `app/admin/nerd/api/page.tsx`

Server component page at `/admin/nerd/api` containing:
- Base URL display (auto-detected from request or env)
- Auth header format with example
- Endpoint table: method badges (GET green, POST blue, PATCH yellow, DELETE red), path, description
- Expandable sections per scope showing request/response shapes
- Example curl commands per endpoint
- Link to Settings → API Keys for key management

---

### Task 12: Type-check and verify

**Step 1:** Run `npx tsc --noEmit` — fix any errors

**Step 2:** Test end-to-end:
1. Create API key via Settings UI
2. Copy the key
3. `curl -H "Authorization: Bearer ntvz_xxx" http://localhost:3000/api/v1/tasks`
4. Verify response matches internal API shape
5. Test scope restriction: create key with only `tasks` scope, try hitting `/api/v1/clients` — expect 403
6. Test rate limit: send 101 requests in 1 minute — expect 429 on the 101st

**Step 3:** Commit all changes

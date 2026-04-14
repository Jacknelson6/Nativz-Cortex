# Portal Content Lab — Build Brief

**Status:** Not started. Ready to execute.
**Scope:** Expose the Content Lab (what we were calling Strategy Lab) to portal users (role=`viewer`), with hard org/client scoping at every boundary.
**Owner of existing code:** Admin-only today. See `components/strategy-lab/*`, `app/admin/strategy-lab/*`, `lib/nerd/strategy-lab-scripting-context.ts`.

---

## Why this exists as a dedicated brief

The Content Lab pipeline is fully working for admins — `extract_topic_signals` → `search_knowledge_base` → `create_topic_plan` → branded PDF download, all grounded in real search data (see `scripts/qa-topic-plan.ts` for end-to-end coverage). But four gaps block safe portal exposure:

1. **Tool ownership guards missing.** `create_topic_plan` and `extract_topic_signals` only validate UUID format — they don't verify the caller has access to the `client_id` or `search_ids`. A portal user could pass any UUID and read/write data cross-org.
2. **No portal route.** Only `/admin/strategy-lab/*` exists, gated by admin middleware.
3. **General (no-client) chat is cross-portfolio.** The `/admin/strategy-lab` index opens a chat whose session hint literally says "reason across the whole agency portfolio." That can't exist on portal — portal users must be locked to their one org-bound client.
4. **Addendum leaks admin framing.** `lib/nerd/strategy-lab-scripting-context.ts` appends admin-style "full portfolio access" rules on top of whichever base prompt is active. Needs a portal variant that drops the cross-client framing.

All 4 must ship together. Partial exposure (e.g. tool scoping alone without route/UI/prompt work) is still leaky.

---

## Reference — what's already built (don't rebuild these)

- **Signals extraction & matching:** `lib/topic-plans/signals.ts` — `loadTopicSignals(search_ids)` + `matchSignal(source, signals)`. Pure data-layer, agency-agnostic.
- **Tools:** `lib/nerd/tools/topic-signals.ts` (read) + `lib/nerd/tools/topic-plans.ts` (write, with server-side enrichment + 50% grounding threshold).
- **Topic plan schema:** `lib/topic-plans/types.ts` — `topicPlanSchema`, `normalizeResonance`, `formatAudience`.
- **PDF:** `components/topic-plans/topic-plan-pdf.tsx` (branded per agency via `agency: AgencyBrand` prop). Route: `app/api/topic-plans/[id]/pdf/route.ts` — already has RLS check (`me.role !== 'admin' && row.organization_id !== me.organization_id` → 403).
- **Topic plans table RLS:** `supabase/migrations/099_topic_plans.sql` — `topic_plans_admin_all` + `topic_plans_viewer_read` (scoped to `organization_id`). Already applied.
- **Existing portal pattern:** `/portal/nerd/portal-nerd-client.tsx` uses `portalMode: true` on `/api/nerd/chat`. Follow that pattern.
- **Portal client helper:** `lib/portal/get-portal-client.ts` — call `getPortalClient()` in portal server components to resolve the user's single org-bound client.
- **Tool allowlist:** `app/api/nerd/chat/route.ts` has `PORTAL_ALLOWED_TOOLS = new Set([...])` (around line 195). Add new tools here.
- **QA harness:** `scripts/qa-topic-plan.ts` + `npm run test:topic-plan`. Extend with portal-scope tests.

---

## Build steps

Execute in order. Each step ends with a typecheck + verification before moving on.

### Step 1 — Tool ownership guards (DEPLOY FIRST, before any portal UI)

Patch both tool handlers to verify the caller's access before touching the DB. Use the `userId` the handler already receives.

**File: `lib/nerd/tools/topic-plans.ts`**

Inside `create_topic_plan.handler`, immediately after the `admin = createAdminClient()` + `client` lookup:

```ts
// Role + org scoping. Viewers can only create plans for clients their org
// has access to; admins can create for any client.
const { data: me } = await admin
  .from('users')
  .select('role, organization_id')
  .eq('id', userId)
  .single();
if (!me) {
  return { success: false, error: 'User not found', cardType: 'topic_plan' as const };
}
if (me.role !== 'admin') {
  if (!me.organization_id || client.organization_id !== me.organization_id) {
    return {
      success: false,
      error: 'You do not have access to this client.',
      cardType: 'topic_plan' as const,
    };
  }
}
```

**File: `lib/nerd/tools/topic-signals.ts`**

In `extract_topic_signals.handler`, before calling `loadTopicSignals`:

```ts
const admin = createAdminClient();
const { data: me } = await admin
  .from('users')
  .select('role, organization_id')
  .eq('id', userId)
  .single();

// For viewers, filter search_ids to only those belonging to clients in
// the user's organization. Admins see everything.
let scopedIds = search_ids;
if (me && me.role !== 'admin') {
  if (!me.organization_id) {
    return { success: true, cardType: 'search' as const, data: { total: 0, signals: [] } };
  }
  const { data: rows } = await admin
    .from('topic_searches')
    .select('id, clients!inner(organization_id)')
    .in('id', search_ids);
  scopedIds = (rows ?? [])
    .filter((r) => {
      const org = Array.isArray(r.clients) ? r.clients[0]?.organization_id : (r.clients as { organization_id: string } | null)?.organization_id;
      return org === me.organization_id;
    })
    .map((r) => r.id as string);
}

const signals = await loadTopicSignals(scopedIds);
```

Import `createAdminClient` at the top of `topic-signals.ts`.

**Verification:**

- `npx tsc --noEmit` clean
- Run `npm run test:topic-plan` — existing checks still pass (admin path unchanged)
- Add a new test in `scripts/qa-topic-plan.ts` (see Step 6)

**Commit message:** `fix(security): scope topic-plan + topic-signals tools to caller's organization`

---

### Step 2 — Portal-flavored addendum

**File: `lib/nerd/strategy-lab-scripting-context.ts`**

Currently `buildStrategyLabSystemAddendum(clientId?)` returns one addendum. Add a `portalMode` flag and branch the framing.

Changes inside the addendum string:

1. Drop language like "full access to every client in the Nativz portfolio" (belongs in admin system prompt only — rule 0 language).
2. Rule 2 (knowledge-base grounding) — keep as-is.
3. Rule 7 (tool order: `extract_topic_signals` → `search_knowledge_base` → `create_topic_plan`) — keep as-is, works both surfaces.
4. Add a portal-only rule at the top: "You are working inside {clientName}'s own portal. Never reference other clients — you only have access to this one."

Simplest path: keep one builder, accept `portalMode: boolean`, swap the first two paragraphs.

```ts
export function buildStrategyLabSystemAddendum(opts: { clientId?: string; portalMode?: boolean }): string {
  const intro = opts.portalMode
    ? `You are working inside this client's portal Content Lab. You are scoped to this client only — you have no visibility into any other client in the agency. Treat every reference as being about THIS client.`
    : `You are the in-house strategist for an agency. You have visibility across the full client portfolio and can reference cross-client patterns when helpful. In Strategy Lab you are focused on the @mentioned client, but may reason off other clients' knowledge where relevant.`;
  return `${intro}\n\n${NON_PORTAL_AGNOSTIC_RULES}`;
}
```

**File: `app/api/nerd/chat/route.ts`**

Find the call to `buildStrategyLabSystemAddendum` (around the mode handling) and pass `portalMode` through. Propagate from the request body (`portalMode` already exists on the chat schema).

**Verification:** `tsc --noEmit` + smoke test via the existing `/admin/strategy-lab` (should still work identically).

---

### Step 3 — Tool allowlist

**File: `app/api/nerd/chat/route.ts`**

Locate `PORTAL_ALLOWED_TOOLS` (around line 195). Add:

```ts
'extract_topic_signals',
'create_topic_plan',
'search_knowledge_base',  // verify this is already there; required for the grounding flow
```

**Verification:** When `portalMode: true` is sent, both new tools should appear in `getToolsForAPI()` output for that request. No direct test needed — wires up for the portal chat component in Step 5.

---

### Step 4 — Portal Content Lab route

**New file: `app/portal/content-lab/[clientId]/page.tsx`**

Server component. Pattern off the existing per-client Strategy Lab page.

```ts
import { notFound, redirect } from 'next/navigation';
import { getPortalClient } from '@/lib/portal/get-portal-client';
import { createAdminClient } from '@/lib/supabase/admin';
import { PortalContentLab } from '@/components/portal/portal-content-lab';

export default async function PortalContentLabPage({
  params,
}: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const portal = await getPortalClient();
  if (!portal) redirect('/portal/login');
  // Enforce: the :clientId in the URL MUST match the user's bound client.
  if (portal.client.id !== clientId) notFound();

  const admin = createAdminClient();
  const { data: topicRows } = await admin
    .from('topic_searches')
    .select('id, query, status, created_at, completed_at')
    .eq('client_id', clientId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <PortalContentLab
      clientId={portal.client.id}
      clientName={portal.client.name}
      clientSlug={portal.client.slug}
      topicSearches={topicRows ?? []}
    />
  );
}
```

Also add a redirect at `/portal/content-lab` (no clientId) → the user's bound client. In `app/portal/content-lab/page.tsx`:

```ts
export default async function PortalContentLabRedirect() {
  const portal = await getPortalClient();
  if (!portal) redirect('/portal/login');
  redirect(`/portal/content-lab/${portal.client.id}`);
}
```

---

### Step 5 — Portal Content Lab chat component

**New file: `components/portal/portal-content-lab.tsx`**

Stripped-down variant of `StrategyLabNerdChat`:

- Accepts `{ clientId, clientName, clientSlug, topicSearches }`
- **No** `ClientPickerButton` in the header — render the client name as static text (or show the client's logo + name)
- **No** cross-client history rail — show this client's prior Content Lab conversations only (query `nerd_conversations` by `client_id === clientId`)
- **No** tabs (`mainTabs` prop from admin) — portal has no Analytics/Knowledge Base tabs in this view
- **Attachment chip bar** stays — portal users still select which topic searches to attach
- **Composer** stays identical, including the `+` research button
- Sends `mode: 'strategy-lab', portalMode: true` on every `/api/nerd/chat` call
- Artifact card + PDF download path is already org-scoped via the existing RLS — works without changes

Name the page surface "Content Lab" in the UI (matches the renamed admin surface per commit `fc5f8c9`).

Empty state: use `AgencyClientAvatar` / the wide logo × client-name lockup pattern already in `strategy-lab-nerd-chat.tsx`.

Suggestion pills (client-appropriate):
- Generate video ideas
- Generate scripts
- Explain this topic search
- What does [term] mean?

---

### Step 6 — Extend QA harness

**File: `scripts/qa-topic-plan.ts`**

Add new test section after section 3:

```
5. Portal scoping
   - create cross-org user (viewer) with organization_id ≠ test client's org
   - call create_topic_plan with the test client_id → expect rejection ("access")
   - call extract_topic_signals with the test search_id → expect signals=[] (or total=0)
   - call create_topic_plan with an in-org client_id (happy path) → expect success
```

Approach: mint a synthetic viewer user via the auth admin API, or query an existing viewer from a different org. Clean up the test user after.

Acceptance for this section: test passes locally AND passes on CI if there's a prod-against integration runner.

---

### Step 7 — Navigation

**File: wherever portal sidebar lives** (likely `components/portal/portal-shell.tsx` or similar).

Add nav link "Content Lab" → `/portal/content-lab` (the redirect page handles client resolution). Place it near Research / Nerd in the portal nav.

---

## Acceptance criteria

All of the following must be true before this is safe to ship:

- [ ] `npm run test:topic-plan` green with new portal-scoping tests added
- [ ] Cross-org `client_id` passed to `create_topic_plan` returns `{ success: false, error: /access/i }` — never writes a row
- [ ] Cross-org `search_ids` passed to `extract_topic_signals` return `{ total: 0, signals: [] }` — never exposes data
- [ ] Portal viewer at `/portal/content-lab/<their-client-id>` sees the chat, can attach topic searches, can trigger a topic plan, can download the PDF
- [ ] Portal viewer at `/portal/content-lab/<some-other-client-id>` gets 404
- [ ] Portal chat replies do not reference any client other than the user's own (manual spot-check: 5 chats, scan for other client names)
- [ ] Addendum `buildStrategyLabSystemAddendum({ portalMode: true })` does not contain the strings "portfolio", "every client", "cross-client"
- [ ] Admin Content Lab at `/admin/strategy-lab/*` still works identically (regression check — run the admin flow end-to-end once)
- [ ] PDF branded per domain: cortex.nativz.io → Nativz mark; cortex.andersoncollaborative.com → AC mark
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run build` passes

---

## Out of scope for this brief

- Rebranding "Strategy Lab" → "Content Lab" everywhere in admin (partial work already done in `fc5f8c9`; finish in a separate commit if noticed)
- Per-client permission granularity inside an org (current model: all viewers in an org see all that org's clients — fine for now)
- Email notifications on plan creation
- Plan versioning / history UI
- Deleting or archiving plans

---

## Single commit per step, push directly to main

Per the project's `feedback_push_main_only` preference. Each step compiles, typechecks, and leaves the tree green before the next begins.

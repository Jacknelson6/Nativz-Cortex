# Users-Page Email Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a template-driven email composer on `/admin/users` that sends now or schedules for later, logs every send to `activity_log`, and supports full template CRUD from inside the composer.

**Architecture:** Resend (already installed) is the transport, reused via `lib/email/resend.ts`'s existing `layout()` wrapper + brand-aware `from`/`reply-to`. Two new tables (`email_templates`, `scheduled_emails`) with admin-only RLS. A 1-minute Vercel cron drains due scheduled sends. Merge fields resolve at send/schedule time in a pure, tested helper. UI is one modal component with send / template-edit / schedule modes. Preview renders Markdown as React elements (no `dangerouslySetInnerHTML`) to avoid XSS.

**Tech Stack:** Next.js 15 App Router · TypeScript · Vitest · Supabase Postgres + RLS · Resend · Tailwind v4 · Vercel Cron.

**Spec:** `docs/superpowers/specs/2026-04-13-users-page-email-design.md`

---

## File Structure

**Migrations (new):**
- `supabase/migrations/100_email_templates.sql`
- `supabase/migrations/101_scheduled_emails.sql`

**Server lib (new):**
- `lib/email/types.ts`
- `lib/email/merge-fields.ts` + `lib/email/merge-fields.test.ts`
- `lib/email/send-user-email.ts`
- `lib/email/templates/user-email.ts` (Markdown-to-HTML for the outgoing email)
- `lib/email/resolve-merge-context.ts`
- `lib/api/require-admin.ts`

**API routes (new):**
- `app/api/admin/email-templates/route.ts` — GET + POST
- `app/api/admin/email-templates/[id]/route.ts` — PATCH + DELETE
- `app/api/admin/users/[id]/send-email/route.ts` — POST (single-recipient immediate)
- `app/api/admin/users/bulk-email/route.ts` — POST (multi-recipient immediate)
- `app/api/admin/users/[id]/schedule-email/route.ts` — POST (single-recipient schedule)
- `app/api/admin/users/bulk-schedule-email/route.ts` — POST (multi-recipient schedule)
- `app/api/admin/scheduled-emails/route.ts` — GET list
- `app/api/admin/scheduled-emails/[id]/route.ts` — PATCH + DELETE (cancel)
- `app/api/cron/send-scheduled-emails/route.ts` — GET cron handler

**Cron config:**
- `vercel.json` (modify) — add cron entry

**UI components (new):**
- `components/users/email-composer-modal.tsx` — root modal; send + template-edit + schedule modes
- `components/users/email-template-rail.tsx` — left rail with hover edit/delete
- `components/users/email-body-preview.tsx` — React-node Markdown preview (no innerHTML)
- `components/users/scheduled-emails-tab.tsx` — tab content

**Page edits:**
- `app/admin/users/page.tsx` — tab nav (All users / Scheduled emails) + per-user Send email in kebab + bulk Send email button

---

## Task 1: Migrations

**Files:**
- Create: `supabase/migrations/100_email_templates.sql`
- Create: `supabase/migrations/101_scheduled_emails.sql`

- [ ] **Step 1: Write `100_email_templates.sql`**

```sql
-- 100_email_templates.sql
-- Admin-shared email template library for the Users page composer.

create table if not exists email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('followup', 'reminder', 'calendar', 'welcome', 'general')),
  subject text not null,
  body_markdown text not null,
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists email_templates_category_idx on email_templates (category);

alter table email_templates enable row level security;

create policy email_templates_admin_read on email_templates for select
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
create policy email_templates_admin_write on email_templates for all
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- Seed 6 starter templates
insert into email_templates (name, category, subject, body_markdown) values
  (
    'Follow-up — day 3',
    'followup',
    'Quick follow-up, {{user.first_name}}',
    'Hey {{user.first_name}},

Checking in a few days after we talked. Any questions on the proposal?

Happy to jump on a call or answer anything here.

– {{sender.name}}'
  ),
  (
    'Follow-up — day 7',
    'followup',
    'Bumping this up, {{user.first_name}}',
    'Hey {{user.first_name}},

Just bumping this back to the top of your inbox. No rush, but I wanted to make sure it didn''t get buried.

Let me know if you want to keep the conversation going.

– {{sender.name}}'
  ),
  (
    'Reminder — audit ready to review',
    'reminder',
    'Your social analysis is ready',
    'Hi {{user.first_name}},

Your social analysis is ready to walk through. It covers your content performance vs competitors across TikTok, Instagram, Facebook, and YouTube.

Want to book a time this week to go through it?

– {{sender.name}}'
  ),
  (
    'Welcome — new client portal access',
    'welcome',
    'Welcome to {{client.name}} on Cortex',
    'Hi {{user.first_name}},

You''ve been added to the {{client.name}} client portal. Log in at cortex.nativz.io to see strategy, research, and analytics we''re tracking for you.

Let me know if anything looks off.

– {{sender.name}}'
  ),
  (
    'Meeting confirmation',
    'calendar',
    'Confirming our meeting',
    'Hi {{user.first_name}},

Confirming our time together. Add the meeting link to your calendar so you don''t miss it.

Meeting link: [scheduling link goes here]

– {{sender.name}}'
  ),
  (
    'Generic',
    'general',
    '',
    'Hi {{user.first_name}},

– {{sender.name}}'
  );
```

- [ ] **Step 2: Write `101_scheduled_emails.sql`**

```sql
-- 101_scheduled_emails.sql
-- Pending + historical scheduled email sends drained by a 1-minute Vercel cron.

create table if not exists scheduled_emails (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.users(id) on delete cascade,
  template_id uuid references email_templates(id) on delete set null,
  subject text not null,
  body_markdown text not null,
  send_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  sent_at timestamptz,
  resend_id text,
  failure_reason text,
  scheduled_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists scheduled_emails_pending_idx on scheduled_emails (send_at) where status = 'pending';
create index if not exists scheduled_emails_recipient_idx on scheduled_emails (recipient_id);

alter table scheduled_emails enable row level security;

create policy scheduled_emails_admin_all on scheduled_emails for all
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));
```

- [ ] **Step 3: Apply locally**

Run: `npm run supabase:migrate`
Expected: both migrations applied OR the runner logs `Database unreachable — skip migrations` if `SUPABASE_DB_URL` isn't set. The latter is fine — they'll apply in CI / prod.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/100_email_templates.sql supabase/migrations/101_scheduled_emails.sql
git commit -m "feat(email): email_templates + scheduled_emails tables (migrations 100/101)"
```

---

## Task 2: Types + merge-fields pure function (TDD)

**Files:**
- Create: `lib/email/types.ts`
- Create: `lib/email/merge-fields.ts`
- Create: `lib/email/merge-fields.test.ts`

- [ ] **Step 1: Create the types module**

`lib/email/types.ts`:

```ts
export type EmailTemplateCategory = 'followup' | 'reminder' | 'calendar' | 'welcome' | 'general';

export interface EmailTemplate {
  id: string;
  name: string;
  category: EmailTemplateCategory;
  subject: string;
  body_markdown: string;
  updated_at: string;
  created_by: string | null;
}

export interface ScheduledEmail {
  id: string;
  recipient_id: string;
  template_id: string | null;
  subject: string;
  body_markdown: string;
  send_at: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  sent_at: string | null;
  resend_id: string | null;
  failure_reason: string | null;
  scheduled_by: string;
  created_at: string;
}

export interface MergeContext {
  recipient: {
    full_name: string | null;
    email: string | null;
  };
  sender: {
    full_name: string | null;
    email: string | null;
  };
  client: {
    name: string | null;
  };
}
```

- [ ] **Step 2: Write failing tests**

`lib/email/merge-fields.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { resolveMergeFields } from './merge-fields';
import type { MergeContext } from './types';

const fullCtx: MergeContext = {
  recipient: { full_name: 'Jack Nelson', email: 'jack@nativz.io' },
  sender: { full_name: 'Alex Rivera', email: 'alex@nativz.io' },
  client: { name: 'Toastique' },
};

describe('resolveMergeFields', () => {
  it('replaces every documented token', () => {
    const tpl = 'Hi {{user.first_name}} ({{user.full_name}}, {{user.email}}) — from {{sender.name}} <{{sender.email}}> about {{client.name}}';
    expect(resolveMergeFields(tpl, fullCtx)).toBe(
      'Hi Jack (Jack Nelson, jack@nativz.io) — from Alex Rivera <alex@nativz.io> about Toastique',
    );
  });

  it('derives first_name from full_name first token', () => {
    const ctx: MergeContext = { ...fullCtx, recipient: { full_name: '  Jack  Allen  Nelson', email: 'j@x.com' } };
    expect(resolveMergeFields('Hi {{user.first_name}}', ctx)).toBe('Hi Jack');
  });

  it('renders unknown placeholders as empty string', () => {
    expect(resolveMergeFields('Hi {{user.phone}} — {{nonsense}}', fullCtx)).toBe('Hi  — ');
  });

  it('handles missing recipient name as empty string', () => {
    const ctx: MergeContext = { ...fullCtx, recipient: { full_name: null, email: 'j@x.com' } };
    expect(resolveMergeFields('Hi {{user.first_name}}', ctx)).toBe('Hi ');
    expect(resolveMergeFields('Hi {{user.full_name}}', ctx)).toBe('Hi ');
  });

  it('handles empty-ish context without throwing', () => {
    const ctx: MergeContext = {
      recipient: { full_name: null, email: null },
      sender: { full_name: null, email: null },
      client: { name: null },
    };
    expect(resolveMergeFields('Hi {{user.first_name}}, from {{sender.name}}', ctx)).toBe('Hi , from ');
  });

  it('is idempotent on strings with no placeholders', () => {
    expect(resolveMergeFields('Hello world', fullCtx)).toBe('Hello world');
  });
});
```

- [ ] **Step 3: Run tests, confirm they fail**

Run: `npm test -- merge-fields`
Expected: all fail with "Cannot find module './merge-fields'".

- [ ] **Step 4: Implement `lib/email/merge-fields.ts`**

```ts
import type { MergeContext } from './types';

const TOKEN_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

export function resolveMergeFields(template: string, ctx: MergeContext): string {
  return template.replace(TOKEN_RE, (_match, token: string) => {
    switch (token) {
      case 'user.full_name':
        return ctx.recipient.full_name ?? '';
      case 'user.first_name': {
        const fn = ctx.recipient.full_name?.trim();
        if (!fn) return '';
        const parts = fn.split(/\s+/);
        return parts[0] ?? '';
      }
      case 'user.email':
        return ctx.recipient.email ?? '';
      case 'sender.name':
        return ctx.sender.full_name ?? '';
      case 'sender.email':
        return ctx.sender.email ?? '';
      case 'client.name':
        return ctx.client.name ?? '';
      default:
        return '';
    }
  });
}
```

- [ ] **Step 5: Run tests, confirm they pass**

Run: `npm test -- merge-fields`
Expected: 6/6 PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/email/types.ts lib/email/merge-fields.ts lib/email/merge-fields.test.ts
git commit -m "feat(email): merge-fields helper + EmailTemplate/ScheduledEmail types (TDD)"
```

---

## Task 3: Shared `sendUserEmail` helper

**Files:**
- Create: `lib/email/templates/user-email.ts`
- Create: `lib/email/send-user-email.ts`

- [ ] **Step 1: Create the Markdown-to-HTML template wrapper**

`lib/email/templates/user-email.ts`:

```ts
import { layout } from '@/lib/email/resend';
import type { AgencyBrand } from '@/lib/agency/detect';

/**
 * Convert a Markdown body (already merge-resolved) to the HTML shell Resend accepts.
 * Minimal on purpose — double newlines become <p>, single newlines become <br>.
 * Escapes HTML special chars so admin-typed content can never inject into the markup.
 */
function markdownToHtml(markdown: string): string {
  const escaped = markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px 0;line-height:1.6;color:#0f172a;">${p.replace(/\n/g, '<br/>')}</p>`)
    .join('\n');
}

export function buildUserEmailHtml(bodyMarkdown: string, agency: AgencyBrand): string {
  return layout(markdownToHtml(bodyMarkdown), agency);
}
```

- [ ] **Step 2: Create the shared send helper**

`lib/email/send-user-email.ts`:

```ts
import { Resend } from 'resend';
import { getFromAddress, getReplyTo } from '@/lib/email/resend';
import { buildUserEmailHtml } from '@/lib/email/templates/user-email';
import { resolveMergeFields } from '@/lib/email/merge-fields';
import type { MergeContext } from '@/lib/email/types';
import type { AgencyBrand } from '@/lib/agency/detect';

let _resend: Resend | null = null;
function client(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export interface SendUserEmailInput {
  to: string;
  subject: string;
  bodyMarkdown: string;
  mergeContext: MergeContext;
  agency: AgencyBrand;
}

export interface SendUserEmailSuccess {
  ok: true;
  id: string;
  resolvedSubject: string;
  resolvedBody: string;
}

export interface SendUserEmailFailure {
  ok: false;
  error: string;
}

export async function sendUserEmail(input: SendUserEmailInput): Promise<SendUserEmailSuccess | SendUserEmailFailure> {
  if (!input.to.trim()) {
    return { ok: false, error: 'recipient has no email' };
  }
  const resolvedSubject = resolveMergeFields(input.subject, input.mergeContext);
  const resolvedBody = resolveMergeFields(input.bodyMarkdown, input.mergeContext);
  const html = buildUserEmailHtml(resolvedBody, input.agency);

  try {
    const res = await client().emails.send({
      from: getFromAddress(input.agency),
      replyTo: getReplyTo(input.agency),
      to: input.to,
      subject: resolvedSubject,
      html,
    });
    if (res.error) {
      return { ok: false, error: res.error.message || 'resend error' };
    }
    const id = res.data?.id;
    if (!id) return { ok: false, error: 'resend returned no id' };
    return { ok: true, id, resolvedSubject, resolvedBody };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown send error' };
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/email/templates/user-email.ts lib/email/send-user-email.ts
git commit -m "feat(email): shared sendUserEmail helper + Markdown → HTML wrapper"
```

---

## Task 4: Admin auth helper

**Files:**
- Create: `lib/api/require-admin.ts`

- [ ] **Step 1: Create the helper**

A private `requireAdmin()` already exists inside `app/api/team/[id]/invite/route.ts`. Every new route in this plan uses the same gate — extract it.

`lib/api/require-admin.ts`:

```ts
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { User } from '@supabase/supabase-js';

export type AdminAuthResult =
  | {
      ok: true;
      user: User;
      adminRow: { id: string; full_name: string | null; email: string | null; role: string };
    }
  | { ok: false; response: NextResponse };

/**
 * Requires an authenticated caller with role='admin' in the public users table.
 * Returns the auth user + their admin row on success, or a NextResponse on failure.
 */
export async function requireAdmin(): Promise<AdminAuthResult> {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const admin = createAdminClient();
  const { data: adminRow } = await admin
    .from('users')
    .select('id, full_name, email, role')
    .eq('id', user.id)
    .single();

  if (!adminRow || adminRow.role !== 'admin') {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, user, adminRow };
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add lib/api/require-admin.ts
git commit -m "feat(api): shared requireAdmin helper"
```

---

## Task 5: Merge-context resolver

**Files:**
- Create: `lib/email/resolve-merge-context.ts`

- [ ] **Step 1: Create the helper**

`lib/email/resolve-merge-context.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MergeContext } from '@/lib/email/types';

export interface RecipientRow {
  id: string;
  email: string | null;
  full_name: string | null;
}

export interface SenderRow {
  id: string;
  email: string | null;
  full_name: string | null;
}

/**
 * Pull the merge context for one recipient. `client.name` is populated only when
 * the recipient has exactly one user_client_access row (zero or many → null so we
 * don't pick arbitrarily).
 */
export async function resolveMergeContext(
  admin: SupabaseClient,
  recipient: RecipientRow,
  sender: SenderRow,
): Promise<MergeContext> {
  const { data: access } = await admin
    .from('user_client_access')
    .select('client_id, clients(name)')
    .eq('user_id', recipient.id);

  let clientName: string | null = null;
  if (Array.isArray(access) && access.length === 1) {
    const rel = access[0] as { clients: { name: string | null } | { name: string | null }[] | null };
    const clients = rel.clients;
    if (Array.isArray(clients)) clientName = clients[0]?.name ?? null;
    else clientName = clients?.name ?? null;
  }

  return {
    recipient: { full_name: recipient.full_name, email: recipient.email },
    sender: { full_name: sender.full_name, email: sender.email },
    client: { name: clientName },
  };
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add lib/email/resolve-merge-context.ts
git commit -m "feat(email): resolveMergeContext helper (pulls client name when exactly one)"
```

---

## Task 6: Email templates CRUD routes

**Files:**
- Create: `app/api/admin/email-templates/route.ts`
- Create: `app/api/admin/email-templates/[id]/route.ts`

- [ ] **Step 1: List + create route**

`app/api/admin/email-templates/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 15;

const CategoryEnum = z.enum(['followup', 'reminder', 'calendar', 'welcome', 'general']);

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  category: CategoryEnum,
  subject: z.string().max(200).default(''),
  body_markdown: z.string().max(10000).default(''),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('email_templates')
    .select('id, name, category, subject, body_markdown, updated_at, created_by')
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.warn('[email-templates] list failed:', error);
    return NextResponse.json({ error: 'Failed to load templates' }, { status: 500 });
  }
  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('email_templates')
    .insert({
      name: parsed.data.name,
      category: parsed.data.category,
      subject: parsed.data.subject,
      body_markdown: parsed.data.body_markdown,
      created_by: auth.user.id,
    })
    .select('id, name, category, subject, body_markdown, updated_at, created_by')
    .single();

  if (error || !data) {
    console.warn('[email-templates] create failed:', error);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
  return NextResponse.json({ template: data }, { status: 201 });
}
```

- [ ] **Step 2: Update + delete route**

`app/api/admin/email-templates/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 15;

const CategoryEnum = z.enum(['followup', 'reminder', 'calendar', 'welcome', 'general']);

const PatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  category: CategoryEnum.optional(),
  subject: z.string().max(200).optional(),
  body_markdown: z.string().max(10000).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('email_templates')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, name, category, subject, body_markdown, updated_at, created_by')
    .single();

  if (error || !data) {
    console.warn('[email-templates] update failed:', error);
    return NextResponse.json({ error: 'Template not found or update failed' }, { status: 404 });
  }
  return NextResponse.json({ template: data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const admin = createAdminClient();
  const { error } = await admin.from('email_templates').delete().eq('id', id);
  if (error) {
    console.warn('[email-templates] delete failed:', error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add app/api/admin/email-templates/
git commit -m "feat(email): email_templates CRUD API"
```

---

## Task 7: Send-email routes (single + bulk, immediate)

**Files:**
- Create: `app/api/admin/users/[id]/send-email/route.ts`
- Create: `app/api/admin/users/bulk-email/route.ts`

- [ ] **Step 1: Single-recipient send route**

`app/api/admin/users/[id]/send-email/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendUserEmail } from '@/lib/email/send-user-email';
import { resolveMergeContext } from '@/lib/email/resolve-merge-context';
import { detectAgencyFromHostname } from '@/lib/agency/detect';

export const maxDuration = 30;

const Body = z.object({
  subject: z.string().min(1).max(200),
  body_markdown: z.string().min(1).max(10000),
  template_id: z.string().uuid().nullable().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id: recipientId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: recipient } = await admin
    .from('users')
    .select('id, email, full_name')
    .eq('id', recipientId)
    .single();

  if (!recipient) return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
  if (!recipient.email) return NextResponse.json({ error: 'Recipient has no email address' }, { status: 400 });

  const mergeContext = await resolveMergeContext(admin, recipient, {
    id: auth.adminRow.id,
    email: auth.adminRow.email,
    full_name: auth.adminRow.full_name,
  });

  const agency = detectAgencyFromHostname(request.headers.get('host') ?? '');

  const send = await sendUserEmail({
    to: recipient.email,
    subject: parsed.data.subject,
    bodyMarkdown: parsed.data.body_markdown,
    mergeContext,
    agency,
  });

  if (!send.ok) {
    console.warn('[send-email] failed for recipient', recipientId, send.error);
    return NextResponse.json({ error: send.error }, { status: 502 });
  }

  await admin.from('activity_log').insert({
    actor_id: auth.user.id,
    action: 'user_email_sent',
    entity_type: 'user',
    entity_id: recipientId,
    metadata: {
      template_id: parsed.data.template_id ?? null,
      subject: send.resolvedSubject,
      resend_id: send.id,
    },
  });

  return NextResponse.json({ ok: true, resend_id: send.id });
}
```

- [ ] **Step 2: Bulk send route**

`app/api/admin/users/bulk-email/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendUserEmail } from '@/lib/email/send-user-email';
import { resolveMergeContext } from '@/lib/email/resolve-merge-context';
import { detectAgencyFromHostname } from '@/lib/agency/detect';

export const maxDuration = 60;

const Body = z.object({
  user_ids: z.array(z.string().uuid()).min(1).max(100),
  subject: z.string().min(1).max(200),
  body_markdown: z.string().min(1).max(10000),
  template_id: z.string().uuid().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: recipients } = await admin
    .from('users')
    .select('id, email, full_name')
    .in('id', parsed.data.user_ids);

  if (!recipients || recipients.length === 0) {
    return NextResponse.json({ error: 'No recipients found' }, { status: 404 });
  }

  const agency = detectAgencyFromHostname(request.headers.get('host') ?? '');
  const sent: { user_id: string; resend_id: string }[] = [];
  const failed: { user_id: string; error: string }[] = [];

  for (const recipient of recipients) {
    if (!recipient.email) {
      failed.push({ user_id: recipient.id, error: 'recipient has no email' });
      continue;
    }
    const mergeContext = await resolveMergeContext(admin, recipient, {
      id: auth.adminRow.id,
      email: auth.adminRow.email,
      full_name: auth.adminRow.full_name,
    });
    const send = await sendUserEmail({
      to: recipient.email,
      subject: parsed.data.subject,
      bodyMarkdown: parsed.data.body_markdown,
      mergeContext,
      agency,
    });
    if (send.ok) {
      sent.push({ user_id: recipient.id, resend_id: send.id });
      await admin.from('activity_log').insert({
        actor_id: auth.user.id,
        action: 'user_email_sent',
        entity_type: 'user',
        entity_id: recipient.id,
        metadata: {
          template_id: parsed.data.template_id ?? null,
          subject: send.resolvedSubject,
          resend_id: send.id,
        },
      });
    } else {
      failed.push({ user_id: recipient.id, error: send.error });
    }
  }

  return NextResponse.json({ sent, failed });
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add app/api/admin/users/
git commit -m "feat(email): single + bulk send-email routes with activity_log"
```

---

## Task 8: Schedule-email routes (single + bulk)

Shared pattern: validate `send_at > now() + 60s`, resolve merge context NOW, freeze the resolved subject + body into `scheduled_emails`. Template edits and recipient name changes between schedule-time and send-time don't silently rewrite pending sends.

**Files:**
- Create: `app/api/admin/users/[id]/schedule-email/route.ts`
- Create: `app/api/admin/users/bulk-schedule-email/route.ts`

- [ ] **Step 1: Single-recipient schedule route**

`app/api/admin/users/[id]/schedule-email/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveMergeContext } from '@/lib/email/resolve-merge-context';
import { resolveMergeFields } from '@/lib/email/merge-fields';

export const maxDuration = 15;

const Body = z.object({
  subject: z.string().min(1).max(200),
  body_markdown: z.string().min(1).max(10000),
  template_id: z.string().uuid().nullable().optional(),
  send_at: z.string().datetime(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id: recipientId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const sendAt = new Date(parsed.data.send_at);
  if (sendAt.getTime() < Date.now() + 60_000) {
    return NextResponse.json(
      { error: 'send_at must be at least 1 minute in the future; use /send-email to send now' },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: recipient } = await admin
    .from('users')
    .select('id, email, full_name')
    .eq('id', recipientId)
    .single();

  if (!recipient) return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
  if (!recipient.email) return NextResponse.json({ error: 'Recipient has no email address' }, { status: 400 });

  const mergeContext = await resolveMergeContext(admin, recipient, {
    id: auth.adminRow.id,
    email: auth.adminRow.email,
    full_name: auth.adminRow.full_name,
  });

  const frozenSubject = resolveMergeFields(parsed.data.subject, mergeContext);
  const frozenBody = resolveMergeFields(parsed.data.body_markdown, mergeContext);

  const { data, error } = await admin
    .from('scheduled_emails')
    .insert({
      recipient_id: recipientId,
      template_id: parsed.data.template_id ?? null,
      subject: frozenSubject,
      body_markdown: frozenBody,
      send_at: sendAt.toISOString(),
      scheduled_by: auth.user.id,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.warn('[schedule-email] insert failed:', error);
    return NextResponse.json({ error: 'Failed to schedule' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data.id });
}
```

- [ ] **Step 2: Bulk schedule route**

`app/api/admin/users/bulk-schedule-email/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveMergeContext } from '@/lib/email/resolve-merge-context';
import { resolveMergeFields } from '@/lib/email/merge-fields';

export const maxDuration = 30;

const Body = z.object({
  user_ids: z.array(z.string().uuid()).min(1).max(100),
  subject: z.string().min(1).max(200),
  body_markdown: z.string().min(1).max(10000),
  template_id: z.string().uuid().nullable().optional(),
  send_at: z.string().datetime(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const sendAt = new Date(parsed.data.send_at);
  if (sendAt.getTime() < Date.now() + 60_000) {
    return NextResponse.json({ error: 'send_at must be at least 1 minute in the future' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: recipients } = await admin
    .from('users')
    .select('id, email, full_name')
    .in('id', parsed.data.user_ids);

  if (!recipients || recipients.length === 0) {
    return NextResponse.json({ error: 'No recipients found' }, { status: 404 });
  }

  const scheduled: { user_id: string; id: string }[] = [];
  const failed: { user_id: string; error: string }[] = [];

  for (const recipient of recipients) {
    if (!recipient.email) {
      failed.push({ user_id: recipient.id, error: 'recipient has no email' });
      continue;
    }
    const mergeContext = await resolveMergeContext(admin, recipient, {
      id: auth.adminRow.id,
      email: auth.adminRow.email,
      full_name: auth.adminRow.full_name,
    });
    const frozenSubject = resolveMergeFields(parsed.data.subject, mergeContext);
    const frozenBody = resolveMergeFields(parsed.data.body_markdown, mergeContext);

    const { data, error } = await admin
      .from('scheduled_emails')
      .insert({
        recipient_id: recipient.id,
        template_id: parsed.data.template_id ?? null,
        subject: frozenSubject,
        body_markdown: frozenBody,
        send_at: sendAt.toISOString(),
        scheduled_by: auth.user.id,
      })
      .select('id')
      .single();

    if (error || !data) {
      failed.push({ user_id: recipient.id, error: error?.message ?? 'insert failed' });
    } else {
      scheduled.push({ user_id: recipient.id, id: data.id });
    }
  }

  return NextResponse.json({ scheduled, failed });
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add app/api/admin/users/
git commit -m "feat(email): single + bulk schedule-email routes with frozen subject/body"
```

---

## Task 9: Scheduled-emails list / edit / cancel routes

**Files:**
- Create: `app/api/admin/scheduled-emails/route.ts`
- Create: `app/api/admin/scheduled-emails/[id]/route.ts`

- [ ] **Step 1: List route**

`app/api/admin/scheduled-emails/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 15;

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('scheduled_emails')
    .select(`
      id, recipient_id, template_id, subject, body_markdown, send_at,
      status, sent_at, resend_id, failure_reason, scheduled_by, created_at,
      recipient:recipient_id ( id, email, full_name )
    `)
    .order('send_at', { ascending: true })
    .limit(500);

  if (error) {
    console.warn('[scheduled-emails] list failed:', error);
    return NextResponse.json({ error: 'Failed to load scheduled emails' }, { status: 500 });
  }
  return NextResponse.json({ scheduled: data ?? [] });
}
```

- [ ] **Step 2: Patch + cancel route**

`app/api/admin/scheduled-emails/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/api/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 15;

const PatchSchema = z.object({
  subject: z.string().min(1).max(200).optional(),
  body_markdown: z.string().min(1).max(10000).optional(),
  send_at: z.string().datetime().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }
  if (parsed.data.send_at && new Date(parsed.data.send_at).getTime() < Date.now() + 60_000) {
    return NextResponse.json({ error: 'send_at must be at least 1 minute in the future' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('scheduled_emails')
    .select('status')
    .eq('id', id)
    .single();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.status !== 'pending') {
    return NextResponse.json({ error: `Cannot edit ${existing.status} email` }, { status: 400 });
  }

  const { data, error } = await admin
    .from('scheduled_emails')
    .update(parsed.data)
    .eq('id', id)
    .select('id, recipient_id, subject, body_markdown, send_at, status')
    .single();

  if (error || !data) {
    console.warn('[scheduled-emails] update failed:', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
  return NextResponse.json({ scheduled: data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const admin = createAdminClient();

  // Soft delete — flip status to cancelled so the audit trail survives.
  const { error } = await admin
    .from('scheduled_emails')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('status', 'pending');

  if (error) {
    console.warn('[scheduled-emails] cancel failed:', error);
    return NextResponse.json({ error: 'Cancel failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add app/api/admin/scheduled-emails/
git commit -m "feat(email): scheduled-emails list + edit + cancel routes"
```

---

## Task 10: Cron — drain scheduled sends

**Files:**
- Create: `app/api/cron/send-scheduled-emails/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Create the cron handler**

Vercel Cron sends an `Authorization: Bearer <CRON_SECRET>` header. In local dev without `CRON_SECRET` set the endpoint allows unauthenticated calls (so you can manually curl it during QA).

`app/api/cron/send-scheduled-emails/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendUserEmail } from '@/lib/email/send-user-email';
import { detectAgencyFromHostname } from '@/lib/agency/detect';

export const maxDuration = 60;

const BATCH_SIZE = 50;

function isAuthorisedCron(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') ?? '';
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // local dev — allow
  return auth === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await admin
    .from('scheduled_emails')
    .select(`
      id, recipient_id, template_id, subject, body_markdown, send_at, scheduled_by,
      recipient:recipient_id ( id, email, full_name ),
      scheduler:scheduled_by ( id, email, full_name )
    `)
    .eq('status', 'pending')
    .lte('send_at', nowIso)
    .order('send_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error('[cron send-scheduled-emails] select failed:', error);
    return NextResponse.json({ error: 'Select failed' }, { status: 500 });
  }

  const rows = due ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const agency = detectAgencyFromHostname(request.headers.get('host') ?? '');
  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const row of rows) {
    const recipient = (Array.isArray(row.recipient) ? row.recipient[0] : row.recipient) as
      | { id: string; email: string | null; full_name: string | null }
      | null;
    const scheduler = (Array.isArray(row.scheduler) ? row.scheduler[0] : row.scheduler) as
      | { id: string; email: string | null; full_name: string | null }
      | null;

    if (!recipient || !recipient.email) {
      await admin
        .from('scheduled_emails')
        .update({ status: 'failed', failure_reason: 'recipient missing email' })
        .eq('id', row.id);
      results.push({ id: row.id, ok: false, error: 'recipient missing email' });
      continue;
    }

    // Subject + body are frozen (merge-resolved at schedule time). We still pass
    // the merge context because sendUserEmail's signature requires it — but the
    // resolver is a no-op because there are no tokens left to replace.
    const send = await sendUserEmail({
      to: recipient.email,
      subject: row.subject,
      bodyMarkdown: row.body_markdown,
      mergeContext: {
        recipient: { full_name: recipient.full_name, email: recipient.email },
        sender: { full_name: scheduler?.full_name ?? null, email: scheduler?.email ?? null },
        client: { name: null },
      },
      agency,
    });

    if (send.ok) {
      await admin
        .from('scheduled_emails')
        .update({ status: 'sent', sent_at: new Date().toISOString(), resend_id: send.id })
        .eq('id', row.id);

      await admin.from('activity_log').insert({
        actor_id: row.scheduled_by,
        action: 'user_email_sent',
        entity_type: 'user',
        entity_id: row.recipient_id,
        metadata: {
          template_id: row.template_id,
          subject: row.subject,
          resend_id: send.id,
          scheduled_email_id: row.id,
        },
      });
      results.push({ id: row.id, ok: true });
    } else {
      await admin
        .from('scheduled_emails')
        .update({ status: 'failed', failure_reason: send.error })
        .eq('id', row.id);
      console.warn('[cron send-scheduled-emails] send failed', row.id, send.error);
      results.push({ id: row.id, ok: false, error: send.error });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
```

- [ ] **Step 2: Add the cron entry to `vercel.json`**

Open `vercel.json`. Inside the existing `"crons": [ ... ]` array, append this entry (keep all existing entries in place):

```json
{
  "path": "/api/cron/send-scheduled-emails",
  "schedule": "*/1 * * * *"
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add app/api/cron/send-scheduled-emails/ vercel.json
git commit -m "feat(email): 1-min cron drains pending scheduled_emails"
```

---

## Task 11: EmailComposerModal — send mode (XSS-safe preview)

**Files:**
- Create: `components/users/email-body-preview.tsx`
- Create: `components/users/email-template-rail.tsx`
- Create: `components/users/email-composer-modal.tsx`

- [ ] **Step 1: Create the preview component — renders React nodes (no innerHTML)**

`components/users/email-body-preview.tsx`:

```tsx
'use client';

import React from 'react';

/**
 * XSS-safe Markdown preview. Renders the body as React elements (p/br) so admin
 * input can never inject HTML. Mirrors markdownToHtml's logic in
 * lib/email/templates/user-email.ts — double newlines become paragraphs,
 * single newlines become <br/>.
 */
export function EmailBodyPreview({ body }: { body: string }) {
  const paragraphs = body.split(/\n{2,}/).filter((p) => p.length > 0);
  return (
    <div className="rounded-lg border border-nativz-border bg-background/40 p-6 text-base">
      {paragraphs.length === 0 ? (
        <p className="italic text-text-muted">No body yet.</p>
      ) : (
        paragraphs.map((p, i) => {
          const lines = p.split('\n');
          return (
            <p key={i} className="mb-4 leading-relaxed text-text-secondary last:mb-0">
              {lines.map((line, j) => (
                <React.Fragment key={j}>
                  {line}
                  {j < lines.length - 1 ? <br /> : null}
                </React.Fragment>
              ))}
            </p>
          );
        })
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the template rail**

`components/users/email-template-rail.tsx`:

```tsx
'use client';

import { Pencil, Trash2, Plus } from 'lucide-react';
import type { EmailTemplate, EmailTemplateCategory } from '@/lib/email/types';
import { cn } from '@/lib/utils/cn';

const CATEGORY_LABELS: Record<EmailTemplateCategory, string> = {
  followup: 'Follow-up',
  reminder: 'Reminders',
  calendar: 'Calendar',
  welcome: 'Welcome',
  general: 'General',
};

const CATEGORY_ORDER: EmailTemplateCategory[] = ['followup', 'reminder', 'calendar', 'welcome', 'general'];

export function EmailTemplateRail({
  templates,
  activeId,
  onPick,
  onEdit,
  onDelete,
  onNew,
}: {
  templates: EmailTemplate[];
  activeId: string | null;
  onPick: (t: EmailTemplate) => void;
  onEdit: (t: EmailTemplate) => void;
  onDelete: (t: EmailTemplate) => void;
  onNew: () => void;
}) {
  const byCategory = new Map<EmailTemplateCategory, EmailTemplate[]>();
  for (const cat of CATEGORY_ORDER) byCategory.set(cat, []);
  for (const t of templates) {
    const list = byCategory.get(t.category) ?? [];
    list.push(t);
    byCategory.set(t.category, list);
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-nativz-border bg-surface/50">
      <div className="flex-1 overflow-y-auto p-3">
        <button
          type="button"
          onClick={() =>
            onPick({
              id: '',
              name: 'Blank',
              category: 'general',
              subject: '',
              body_markdown: '',
              updated_at: '',
              created_by: null,
            })
          }
          className={cn(
            'mb-3 w-full rounded-md border border-dashed border-nativz-border px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary',
            activeId === '' && 'border-accent/50 bg-accent/10 text-text-primary',
          )}
        >
          Blank
        </button>

        {CATEGORY_ORDER.map((cat) => {
          const list = byCategory.get(cat) ?? [];
          if (list.length === 0) return null;
          return (
            <div key={cat} className="mb-3">
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-text-muted">{CATEGORY_LABELS[cat]}</p>
              <ul className="space-y-0.5">
                {list.map((t) => (
                  <li
                    key={t.id}
                    className={cn(
                      'group flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-surface-hover',
                      activeId === t.id && 'bg-accent/10',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onPick(t)}
                      className="min-w-0 flex-1 truncate text-left text-sm text-text-secondary hover:text-text-primary"
                    >
                      {t.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(t)}
                      className="hidden h-6 w-6 shrink-0 items-center justify-center rounded text-text-muted hover:bg-surface hover:text-text-primary group-hover:flex"
                      title="Edit template"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(t)}
                      className="hidden h-6 w-6 shrink-0 items-center justify-center rounded text-text-muted hover:bg-surface hover:text-red-400 group-hover:flex"
                      title="Delete template"
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onNew}
        className="flex items-center justify-center gap-1.5 border-t border-nativz-border px-3 py-3 text-sm text-accent-text hover:bg-surface-hover"
      >
        <Plus size={14} /> New template
      </button>
    </aside>
  );
}
```

- [ ] **Step 3: Create the composer modal**

`components/users/email-composer-modal.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import type { EmailTemplate, EmailTemplateCategory } from '@/lib/email/types';
import { EmailTemplateRail } from './email-template-rail';
import { EmailBodyPreview } from './email-body-preview';
import { cn } from '@/lib/utils/cn';

export interface Recipient {
  id: string;
  email: string | null;
  full_name: string | null;
}

type Mode = 'send' | 'edit-template';

function defaultScheduleValue(): string {
  const d = new Date(Date.now() + 60 * 60_000); // +1h
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EmailComposerModal({
  open,
  onClose,
  recipients,
}: {
  open: boolean;
  onClose: () => void;
  recipients: Recipient[];
}) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);

  const [mode, setMode] = useState<Mode>('send');
  const [editTemplate, setEditTemplate] = useState<EmailTemplate | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<EmailTemplateCategory>('general');

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');

  useEffect(() => {
    if (!open) return;
    void fetch('/api/admin/email-templates')
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d: { templates: EmailTemplate[] }) => setTemplates(d.templates ?? []))
      .catch(() => setTemplates([]));
  }, [open]);

  useEffect(() => {
    if (scheduleOpen && !scheduleAt) setScheduleAt(defaultScheduleValue());
  }, [scheduleOpen, scheduleAt]);

  function pickTemplate(t: EmailTemplate) {
    setActiveTemplateId(t.id || '');
    setSubject(t.subject);
    setBody(t.body_markdown);
    setPreview(false);
    setMode('send');
    setEditTemplate(null);
  }

  function openEdit(t: EmailTemplate) {
    setMode('edit-template');
    setEditTemplate(t);
    setEditName(t.name);
    setEditCategory(t.category);
    setSubject(t.subject);
    setBody(t.body_markdown);
    setActiveTemplateId(t.id);
  }

  function openNew() {
    setMode('edit-template');
    setEditTemplate(null);
    setEditName('');
    setEditCategory('general');
    setSubject('');
    setBody('');
    setActiveTemplateId(null);
  }

  async function deleteTemplate(t: EmailTemplate) {
    if (!t.id) return;
    if (!confirm(`Delete template "${t.name}"? This can't be undone.`)) return;
    const r = await fetch(`/api/admin/email-templates/${t.id}`, { method: 'DELETE' });
    if (r.ok) {
      toast.success('Template deleted');
      setTemplates((prev) => prev.filter((x) => x.id !== t.id));
      if (activeTemplateId === t.id) {
        setActiveTemplateId(null);
        setSubject('');
        setBody('');
      }
    } else {
      toast.error('Delete failed');
    }
  }

  async function saveTemplate() {
    if (!editName.trim() || !subject.trim() || !body.trim()) {
      toast.error('Name, subject, and body are required');
      return;
    }
    const isNew = !editTemplate;
    const url = isNew ? '/api/admin/email-templates' : `/api/admin/email-templates/${editTemplate!.id}`;
    const method = isNew ? 'POST' : 'PATCH';
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editName,
        category: editCategory,
        subject,
        body_markdown: body,
      }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      toast.error(d.error ?? 'Save failed');
      return;
    }
    const d = (await r.json()) as { template: EmailTemplate };
    setTemplates((prev) => {
      const without = prev.filter((x) => x.id !== d.template.id);
      return [...without, d.template].sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.name.localeCompare(b.name);
      });
    });
    setActiveTemplateId(d.template.id);
    setMode('send');
    setEditTemplate(null);
    toast.success(isNew ? 'Template created' : 'Template saved');
  }

  async function handleSend() {
    if (!subject.trim() || !body.trim()) return;
    if (recipients.length === 0) {
      toast.error('No recipients');
      return;
    }
    setSending(true);
    try {
      if (recipients.length === 1) {
        const r = await fetch(`/api/admin/users/${recipients[0].id}/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject, body_markdown: body, template_id: activeTemplateId || null }),
        });
        if (r.ok) {
          toast.success(`Sent to ${recipients[0].email ?? recipients[0].full_name}`);
          onClose();
        } else {
          const d = await r.json().catch(() => ({}));
          toast.error(d.error ?? 'Send failed');
        }
      } else {
        const r = await fetch('/api/admin/users/bulk-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_ids: recipients.map((x) => x.id),
            subject,
            body_markdown: body,
            template_id: activeTemplateId || null,
          }),
        });
        const d = (await r.json().catch(() => ({}))) as {
          sent?: { user_id: string }[];
          failed?: { user_id: string; error: string }[];
        };
        const sentN = d.sent?.length ?? 0;
        const failedN = d.failed?.length ?? 0;
        if (sentN > 0) toast.success(`Sent to ${sentN} recipient${sentN === 1 ? '' : 's'}`);
        if (failedN > 0) toast.error(`${failedN} failed`);
        if (sentN > 0 && failedN === 0) onClose();
      }
    } finally {
      setSending(false);
    }
  }

  async function handleSchedule() {
    if (!subject.trim() || !body.trim() || !scheduleAt) return;
    const sendAtIso = new Date(scheduleAt).toISOString();
    if (new Date(sendAtIso).getTime() < Date.now() + 60_000) {
      toast.error('Pick a time at least 1 minute in the future');
      return;
    }
    setSending(true);
    try {
      if (recipients.length === 1) {
        const r = await fetch(`/api/admin/users/${recipients[0].id}/schedule-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject,
            body_markdown: body,
            template_id: activeTemplateId || null,
            send_at: sendAtIso,
          }),
        });
        if (r.ok) {
          toast.success('Scheduled');
          onClose();
        } else {
          const d = await r.json().catch(() => ({}));
          toast.error(d.error ?? 'Schedule failed');
        }
      } else {
        const r = await fetch('/api/admin/users/bulk-schedule-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_ids: recipients.map((x) => x.id),
            subject,
            body_markdown: body,
            template_id: activeTemplateId || null,
            send_at: sendAtIso,
          }),
        });
        const d = (await r.json().catch(() => ({}))) as {
          scheduled?: { user_id: string }[];
          failed?: { user_id: string; error: string }[];
        };
        const n = d.scheduled?.length ?? 0;
        const f = d.failed?.length ?? 0;
        if (n > 0) toast.success(`Scheduled ${n} send${n === 1 ? '' : 's'}`);
        if (f > 0) toast.error(`${f} failed`);
        if (n > 0 && f === 0) onClose();
      }
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex h-[85vh] w-full max-w-5xl overflow-hidden rounded-xl border border-nativz-border bg-background shadow-2xl">
        <EmailTemplateRail
          templates={templates}
          activeId={activeTemplateId}
          onPick={pickTemplate}
          onEdit={openEdit}
          onDelete={deleteTemplate}
          onNew={openNew}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-nativz-border px-5 py-3">
            {mode === 'send' ? (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <span className="text-text-muted">To:</span>
                {recipients.slice(0, 3).map((r) => (
                  <span key={r.id} className="rounded-full bg-surface-hover px-2.5 py-0.5 text-text-primary">
                    {r.email ?? r.full_name ?? r.id.slice(0, 6)}
                  </span>
                ))}
                {recipients.length > 3 && <span className="text-text-muted">+{recipients.length - 3} more</span>}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Template name"
                  className="rounded-md border border-nativz-border bg-transparent px-2.5 py-1 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none"
                />
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value as EmailTemplateCategory)}
                  className="rounded-md border border-nativz-border bg-transparent px-2 py-1 text-sm text-text-primary focus:border-accent/40 focus:outline-none"
                >
                  <option value="followup">Follow-up</option>
                  <option value="reminder">Reminder</option>
                  <option value="calendar">Calendar</option>
                  <option value="welcome">Welcome</option>
                  <option value="general">General</option>
                </select>
              </div>
            )}
            <button type="button" onClick={onClose} className="rounded p-1 text-text-muted hover:bg-surface-hover">
              <X size={18} />
            </button>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="w-full rounded-lg border border-nativz-border bg-transparent px-4 py-2.5 text-base text-text-primary placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setPreview((p) => !p)}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-text-muted hover:bg-surface-hover hover:text-text-primary"
              >
                {preview ? <EyeOff size={14} /> : <Eye size={14} />}
                {preview ? 'Edit' : 'Preview'}
              </button>
            </div>
            {preview ? (
              <EmailBodyPreview body={body} />
            ) : (
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your email here. Use merge fields like {{user.first_name}} or {{sender.name}}."
                className="h-80 w-full resize-y rounded-lg border border-nativz-border bg-transparent px-4 py-3 font-mono text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none"
              />
            )}
          </div>

          {scheduleOpen && mode === 'send' && (
            <div className="flex items-center gap-3 border-t border-nativz-border bg-surface/40 px-5 py-3">
              <label className="text-sm text-text-secondary">Schedule for</label>
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="rounded-md border border-nativz-border bg-transparent px-3 py-1.5 text-sm text-text-primary focus:border-accent/40 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSchedule}
                disabled={sending}
                className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {sending ? 'Scheduling…' : 'Schedule send'}
              </button>
              <button
                type="button"
                onClick={() => setScheduleOpen(false)}
                className="text-sm text-text-muted hover:text-text-primary"
              >
                Cancel
              </button>
            </div>
          )}

          <footer className="flex items-center justify-between gap-2 border-t border-nativz-border px-5 py-3">
            {mode === 'edit-template' ? (
              <button
                type="button"
                onClick={() => {
                  setMode('send');
                  setEditTemplate(null);
                }}
                className="rounded-lg px-4 py-2 text-sm text-text-muted hover:bg-surface-hover hover:text-text-primary"
              >
                Back to send
              </button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              >
                Cancel
              </button>
              {mode === 'send' ? (
                <div className="flex items-center overflow-hidden rounded-lg">
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending || !subject.trim() || !body.trim()}
                    className={cn(
                      'px-6 py-2.5 text-sm font-medium text-white transition-colors',
                      sending || !subject.trim() || !body.trim()
                        ? 'cursor-not-allowed bg-accent/50'
                        : 'bg-accent hover:bg-accent/90',
                    )}
                  >
                    {sending ? 'Sending…' : 'Send now'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleOpen((v) => !v)}
                    disabled={sending || !subject.trim() || !body.trim()}
                    className={cn(
                      'border-l border-white/20 px-3 py-2.5 text-sm text-white transition-colors',
                      sending || !subject.trim() || !body.trim()
                        ? 'cursor-not-allowed bg-accent/50'
                        : 'bg-accent hover:bg-accent/90',
                    )}
                    title="Schedule for later"
                  >
                    ▾
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={saveTemplate}
                  className="rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white hover:bg-accent/90"
                >
                  Save template
                </button>
              )}
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add components/users/
git commit -m "feat(email): EmailComposerModal with send + edit + schedule modes (XSS-safe preview)"
```

---

## Task 12: Scheduled emails tab

**Files:**
- Create: `components/users/scheduled-emails-tab.tsx`

- [ ] **Step 1: Create the component**

`components/users/scheduled-emails-tab.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';

interface ScheduledRow {
  id: string;
  recipient_id: string;
  subject: string;
  send_at: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  sent_at: string | null;
  failure_reason: string | null;
  recipient: { id: string; email: string | null; full_name: string | null } | null;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const STATUS_STYLES: Record<ScheduledRow['status'], string> = {
  pending: 'text-amber-400',
  sent: 'text-emerald-400',
  failed: 'text-red-400',
  cancelled: 'text-text-muted',
};

export function ScheduledEmailsTab() {
  const [rows, setRows] = useState<ScheduledRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const r = await fetch('/api/admin/scheduled-emails');
    if (!r.ok) {
      setLoading(false);
      return;
    }
    const d = (await r.json()) as { scheduled: ScheduledRow[] };
    setRows(d.scheduled ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      void load();
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  async function cancel(id: string) {
    if (!confirm('Cancel this scheduled send?')) return;
    const r = await fetch(`/api/admin/scheduled-emails/${id}`, { method: 'DELETE' });
    if (r.ok) {
      toast.success('Cancelled');
      setRows((prev) => prev.map((x) => (x.id === id ? { ...x, status: 'cancelled' } : x)));
    } else {
      toast.error('Cancel failed');
    }
  }

  if (loading) return <p className="p-4 text-sm text-text-muted">Loading scheduled emails…</p>;
  if (rows.length === 0) return <p className="p-4 text-sm text-text-muted">No scheduled emails.</p>;

  return (
    <div className="overflow-hidden rounded-xl border border-nativz-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-nativz-border bg-surface/40">
            <th className="px-4 py-2.5 text-left font-medium text-text-muted">Recipient</th>
            <th className="px-4 py-2.5 text-left font-medium text-text-muted">Subject</th>
            <th className="px-4 py-2.5 text-left font-medium text-text-muted">Send at</th>
            <th className="px-4 py-2.5 text-left font-medium text-text-muted">Status</th>
            <th className="px-4 py-2.5 text-right font-medium text-text-muted">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-nativz-border/60 last:border-b-0">
              <td className="px-4 py-2.5 text-text-primary">
                {r.recipient?.full_name ?? r.recipient?.email ?? '—'}
                {r.recipient?.email && r.recipient.full_name && (
                  <span className="ml-1.5 text-text-muted">({r.recipient.email})</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-text-secondary">{r.subject}</td>
              <td className="px-4 py-2.5 text-text-secondary">{formatDateTime(r.send_at)}</td>
              <td className={cn('px-4 py-2.5 capitalize', STATUS_STYLES[r.status])}>{r.status}</td>
              <td className="px-4 py-2.5 text-right">
                {r.status === 'pending' ? (
                  <button
                    type="button"
                    onClick={() => cancel(r.id)}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted hover:bg-surface-hover hover:text-red-400"
                  >
                    <X size={12} /> Cancel
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add components/users/scheduled-emails-tab.tsx
git commit -m "feat(email): ScheduledEmailsTab with 30s auto-refresh + cancel action"
```

---

## Task 13: Wire into `/admin/users` page

**Files:**
- Modify: `app/admin/users/page.tsx`

- [ ] **Step 1: Grep for the right insertion points**

Run: `grep -n "export default\|kebab\|selectedIds\|bulk\|tab" app/admin/users/page.tsx | head -30`

Open the file and locate:
- Top-of-component state hooks (for tab state + modal state)
- The per-user card kebab menu (usually a DropdownMenu or a set of action buttons) — new "Send email" item goes above Delete
- The bulk-select action bar (if one exists when users are checked) — new "Send email (N)" button there

- [ ] **Step 2: Add imports + state**

Near the top of the component:

```tsx
'use client';

import { useState } from 'react';
import { Mail } from 'lucide-react';
import { EmailComposerModal, type Recipient } from '@/components/users/email-composer-modal';
import { ScheduledEmailsTab } from '@/components/users/scheduled-emails-tab';
import { cn } from '@/lib/utils/cn';

// ... existing imports and code ...

type PageTab = 'users' | 'scheduled';
const [pageTab, setPageTab] = useState<PageTab>('users');
const [composerOpen, setComposerOpen] = useState(false);
const [composerRecipients, setComposerRecipients] = useState<Recipient[]>([]);

function openComposerFor(users: Recipient[]) {
  setComposerRecipients(users);
  setComposerOpen(true);
}
```

- [ ] **Step 3: Add tab nav above the users list**

Render this directly below the page title:

```tsx
<nav className="mb-4 flex items-center gap-1 border-b border-nativz-border">
  <button
    type="button"
    onClick={() => setPageTab('users')}
    className={cn(
      'border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
      pageTab === 'users'
        ? 'border-accent text-text-primary'
        : 'border-transparent text-text-muted hover:text-text-secondary',
    )}
  >
    All users
  </button>
  <button
    type="button"
    onClick={() => setPageTab('scheduled')}
    className={cn(
      'border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
      pageTab === 'scheduled'
        ? 'border-accent text-text-primary'
        : 'border-transparent text-text-muted hover:text-text-secondary',
    )}
  >
    Scheduled emails
  </button>
</nav>

{pageTab === 'scheduled' ? (
  <ScheduledEmailsTab />
) : (
  /* existing users list JSX stays here, unchanged */
  <>{/* ... */}</>
)}
```

- [ ] **Step 4: Add Send email to the per-user kebab menu**

Inside the per-user action menu (grep for "Delete" on a button or DropdownMenuItem and add this directly above it):

```tsx
<button
  type="button"
  onClick={() =>
    openComposerFor([{ id: user.id, email: user.email, full_name: user.full_name ?? null }])
  }
  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
>
  <Mail size={14} />
  Send email
</button>
```

(Match the surrounding markup — if the menu uses `<DropdownMenuItem>` from `@radix-ui/react-dropdown-menu`, wrap accordingly. Look at the neighbouring Delete item for the exact wrapper to use.)

- [ ] **Step 5: Add a bulk Send email button (only if the page already has bulk-select UI)**

If you see a selection state (e.g. `selectedIds` set + a floating action bar), add:

```tsx
<button
  type="button"
  disabled={selectedIds.size === 0}
  onClick={() => {
    const picked = users
      .filter((u) => selectedIds.has(u.id))
      .map((u) => ({ id: u.id, email: u.email, full_name: u.full_name ?? null }));
    openComposerFor(picked);
  }}
  className="flex items-center gap-1.5 rounded-lg border border-nativz-border bg-surface-hover/60 px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
>
  <Mail size={14} /> Send email ({selectedIds.size})
</button>
```

If the page has no existing bulk UI, skip this step — single-recipient send from the kebab is enough for v1.

- [ ] **Step 6: Render the modal at the bottom of the component**

```tsx
<EmailComposerModal
  open={composerOpen}
  onClose={() => setComposerOpen(false)}
  recipients={composerRecipients}
/>
```

- [ ] **Step 7: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add app/admin/users/page.tsx
git commit -m "feat(email): wire email composer into /admin/users (tabs + kebab)"
```

---

## Task 14: Manual QA

- [ ] **Step 1: Apply migrations against the dev Supabase instance**

Run: `npm run supabase:migrate`
Expected: 100 + 101 applied. If the runner logs "Database unreachable — skip migrations" locally, apply both SQL files manually via the Supabase SQL editor.

- [ ] **Step 2: Full flow — send now (single)**

- Start `npm run dev`.
- Open `/admin/users`, pick a row where you own the mailbox (e.g. yourself).
- Kebab → Send email. Modal opens; 6 seeded templates on the left.
- Pick "Follow-up — day 3" → subject + body populate with merge tokens.
- Toggle Preview → merge tokens resolved against your name/email.
- Send now → success toast.
- Check your inbox: branded Nativz / AC layout, correct `from`, correct `reply-to`, merge fields resolved.

- [ ] **Step 3: Full flow — schedule**

- Same modal, click the ▾ split-button, pick a time 2 minutes from now, click Schedule send.
- Modal closes. Scheduled emails tab shows one `pending` row.
- Locally, trigger the cron manually: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/send-scheduled-emails` once `send_at` has passed. (If `CRON_SECRET` isn't set locally, the endpoint allows unauthenticated GET.)
- Inbox gets the email; Scheduled tab row flips to `sent` within 30s (auto-refresh).

- [ ] **Step 4: Full flow — template CRUD**

- Hover a template in the rail → pencil + trash icons appear.
- Edit → modal switches to edit mode (name + category fields replace recipient chips, Send button → Save template). Change the body, Save → toast, rail shows the updated name.
- New template → empty form, fill in name + category + subject + body, Save → new row in rail.
- Delete → confirm dialog → row disappears.

- [ ] **Step 5: Full flow — bulk (only if bulk UI was added in Task 13)**

- Select 3 users, Send email (N) → modal opens with 3 chips.
- Pick Generic template, write a short body, Send now.
- Each real mailbox receives it. Any recipient with no `email` comes back as a failure in the toast.

- [ ] **Step 6: activity_log audit**

- In Supabase SQL editor: `select * from activity_log where action = 'user_email_sent' order by created_at desc limit 10`.
- One row per successful send, metadata includes `template_id`, `subject`, `resend_id`. Scheduled sends include `scheduled_email_id`.

- [ ] **Step 7: Commit an SRL note if everything passed**

```bash
printf '\n## 2026-04-13 Users-page email composer shipped\n- Templates CRUD in-modal (6 seeded rows)\n- Send now + schedule (1-min cron)\n- activity_log logs every successful send\n- XSS-safe preview via React nodes (no dangerouslySetInnerHTML)\n' >> SRL.md
git add SRL.md
git commit -m "docs: SRL — users-page email composer shipped end-to-end"
```

---

## Self-Review

**Spec coverage:**
- Template library (CRUD + 6 seeded rows) → Tasks 1, 6 ✓
- Merge fields resolver → Task 2 ✓
- Shared send helper via `layout()` → Task 3 ✓
- Admin auth gate → Task 4 ✓
- Merge context resolver → Task 5 ✓
- Single + bulk immediate send → Task 7 ✓
- Single + bulk schedule with frozen subject/body → Task 8 ✓
- Scheduled list / edit / cancel → Task 9 ✓
- 1-minute cron → Task 10 ✓
- Composer modal with send / edit / schedule → Task 11 ✓
- Scheduled emails tab → Task 12 ✓
- Wire into `/admin/users` → Task 13 ✓
- activity_log per send → Tasks 7 + 10 ✓
- Brand-aware `from` + `reply-to` → Task 3 (via `getFromAddress` / `getReplyTo`) ✓
- Missing-email recipients → Tasks 3, 7, 8 (400 / failure) ✓
- Empty or multi-client access → Task 5 (`client.name` stays null) ✓
- Frozen merge at schedule time → Task 8 ✓
- XSS-safe preview → Task 11 (`EmailBodyPreview` renders React nodes, no `dangerouslySetInnerHTML`) ✓

**Placeholder scan:** clean — no TBD/TODO, no "add appropriate error handling" without code, no references to types/functions not defined in an earlier task.

**Type consistency:**
- `EmailTemplate`, `EmailTemplateCategory`, `ScheduledEmail`, `MergeContext`, `Recipient` all defined in Task 2 / Task 11 and used consistently downstream.
- `resolveMergeFields(template, ctx)` signature matches between Task 2 and Tasks 3, 8, 10.
- `sendUserEmail` signature defined in Task 3, called in Tasks 7 + 10 with matching shape.
- `requireAdmin()` defined in Task 4, called in Tasks 6-9.

**Notes for the executor:**
- `app/admin/users/page.tsx` is large; grep first to find the right insertion points. Don't rewrite the whole file.
- The existing private `requireAdmin()` inside `app/api/team/[id]/invite/route.ts` can stay for now. Replace it with an import from `lib/api/require-admin.ts` as a follow-up — not in scope.
- Resend sends are billable; QA recipient should be yourself or a test mailbox.
- `CRON_SECRET` must be set in Vercel env for the cron endpoint to reject unauthorised callers in prod. Local dev allows unauthenticated GET when the env var is absent.

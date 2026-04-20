# Client contract deliverables — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins upload a signed contract, have GPT-5.4-mini extract monthly-recurring deliverables + service tags, review + save, and surface everything on a new **Contract** sidebar tab in the client workspace.

**Architecture:** Two new tables (`client_contracts`, `client_contract_deliverables`), one private Supabase Storage bucket (`client-contracts`), extraction via the existing `createCompletion()` helper in JSON mode, `clients.services` becomes a derived column (union of service tags across `status = 'active'` contracts).

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + Storage + Auth), Zod v4, OpenRouter via `lib/ai/client.ts`, `pdf-parse`, `mammoth`.

**Spec:** `docs/superpowers/specs/2026-04-20-client-contract-deliverables-design.md`

---

## File structure

**Create:**
- `supabase/migrations/125_client_contracts.sql`
- `lib/contracts/extract.ts` — text extraction + LLM call with Zod-validated output
- `lib/contracts/recompute-services.ts` — derives `clients.services` from active contracts
- `lib/contracts/types.ts` — shared Zod schemas + TS types used by lib + routes + UI
- `app/admin/clients/[slug]/contract/page.tsx` — server component
- `app/api/clients/[slug]/contracts/route.ts` — GET list, POST upload+parse
- `app/api/clients/[slug]/contracts/[id]/route.ts` — PATCH, DELETE
- `app/api/clients/[slug]/contracts/[id]/confirm/route.ts` — POST confirm draft
- `app/api/clients/[slug]/contracts/[id]/signed-url/route.ts` — GET signed download URL
- `components/clients/contract/contract-workspace.tsx` — top-level client UI
- `components/clients/contract/upload-contract-modal.tsx` — drag/drop + review
- `components/clients/contract/edit-contract-modal.tsx` — prefilled review form
- `components/clients/contract/deliverable-row.tsx` — editable row (shared)
- `lib/contracts/__tests__/extract.test.ts`
- `lib/contracts/__tests__/recompute-services.test.ts`
- `tests/e2e/contract.spec.ts`

**Modify:**
- `lib/clients/admin-workspace-modules.ts` — add `'contract'` toggle key
- `components/clients/client-admin-shell.tsx` — add Contract nav entry
- `package.json` — add `pdf-parse`, `mammoth`

---

## Task 1: Migration — tables, bucket, RLS, indexes

**Files:**
- Create: `supabase/migrations/125_client_contracts.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/125_client_contracts.sql
-- Client contract deliverables: two tables + private storage bucket + RLS.

begin;

create table if not exists client_contracts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  label text not null default 'Contract',
  file_path text,
  file_name text,
  file_size integer,
  file_mime text,
  status text not null default 'draft' check (status in ('draft','active','ended')),
  effective_start date,
  effective_end date,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  notes text,
  parse_meta jsonb
);

create index if not exists idx_client_contracts_client_status
  on client_contracts (client_id, status);

create table if not exists client_contract_deliverables (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references client_contracts(id) on delete cascade,
  service_tag text not null,
  name text not null,
  quantity_per_month integer not null check (quantity_per_month >= 0),
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_client_contract_deliverables_contract
  on client_contract_deliverables (contract_id);

-- RLS: admin only (role admin or super_admin). Viewer role denied.
alter table client_contracts enable row level security;
alter table client_contract_deliverables enable row level security;

drop policy if exists client_contracts_admin_all on client_contracts;
create policy client_contracts_admin_all on client_contracts
  for all to authenticated
  using (
    exists (
      select 1 from users u
      where u.id = auth.uid() and u.role in ('admin','super_admin')
    )
  )
  with check (
    exists (
      select 1 from users u
      where u.id = auth.uid() and u.role in ('admin','super_admin')
    )
  );

drop policy if exists client_contract_deliverables_admin_all on client_contract_deliverables;
create policy client_contract_deliverables_admin_all on client_contract_deliverables
  for all to authenticated
  using (
    exists (
      select 1 from users u
      where u.id = auth.uid() and u.role in ('admin','super_admin')
    )
  )
  with check (
    exists (
      select 1 from users u
      where u.id = auth.uid() and u.role in ('admin','super_admin')
    )
  );

-- Private storage bucket for contract files.
insert into storage.buckets (id, name, public)
values ('client-contracts', 'client-contracts', false)
on conflict (id) do nothing;

drop policy if exists client_contracts_storage_admin_rw on storage.objects;
create policy client_contracts_storage_admin_rw on storage.objects
  for all to authenticated
  using (
    bucket_id = 'client-contracts'
    and exists (
      select 1 from users u
      where u.id = auth.uid() and u.role in ('admin','super_admin')
    )
  )
  with check (
    bucket_id = 'client-contracts'
    and exists (
      select 1 from users u
      where u.id = auth.uid() and u.role in ('admin','super_admin')
    )
  );

commit;
```

- [ ] **Step 2: Apply the migration**

Run: `npm run supabase:migrate`
Expected: output mentions `125_client_contracts.sql` applied; no errors.

- [ ] **Step 3: Verify schema**

Run via psql or Supabase MCP:
```sql
select column_name, data_type from information_schema.columns
 where table_name = 'client_contracts' order by ordinal_position;
```
Expected: 13 columns matching the migration (id through parse_meta).

Also verify bucket:
```sql
select id, public from storage.buckets where id = 'client-contracts';
```
Expected: one row, `public = false`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/125_client_contracts.sql
git commit -m "feat(contracts): migration for client_contracts + deliverables + storage bucket"
```

---

## Task 2: Install deps

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install packages**

Run: `npm install pdf-parse mammoth`
Expected: both packages installed, no peer-dep errors.

- [ ] **Step 2: Install types**

Run: `npm install --save-dev @types/pdf-parse`
Expected: clean install.

- [ ] **Step 3: Typecheck stays clean**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add pdf-parse + mammoth for contract text extraction"
```

---

## Task 3: Shared types + Zod schemas

**Files:**
- Create: `lib/contracts/types.ts`

- [ ] **Step 1: Write types + schemas**

```ts
// lib/contracts/types.ts
import { z } from 'zod';

export const deliverableSchema = z.object({
  service_tag: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  quantity_per_month: z.number().int().min(0).max(1000),
  notes: z.string().max(500).optional().nullable(),
});

export const extractionResultSchema = z.object({
  services: z.array(z.string().min(1).max(50)).max(30),
  deliverables: z.array(deliverableSchema).max(100),
  effective_start: z.string().date().optional().nullable(),
  effective_end: z.string().date().optional().nullable(),
  suggested_label: z.string().max(80).optional().nullable(),
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;

export const confirmContractBodySchema = z.object({
  label: z.string().min(1).max(80),
  status: z.enum(['active', 'ended']),
  effective_start: z.string().date().nullable().optional(),
  effective_end: z.string().date().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  deliverables: z.array(deliverableSchema).max(100),
});

export type ConfirmContractBody = z.infer<typeof confirmContractBodySchema>;

export const patchContractBodySchema = confirmContractBodySchema.partial().extend({
  status: z.enum(['draft', 'active', 'ended']).optional(),
});

export type PatchContractBody = z.infer<typeof patchContractBodySchema>;

export const PARSE_PROMPT_VERSION = 'v1';
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/contracts/types.ts
git commit -m "feat(contracts): shared types + Zod schemas for extraction/confirm/patch"
```

---

## Task 4: Extraction helper — unit tests first

**Files:**
- Create: `lib/contracts/__tests__/extract.test.ts`
- Create: `lib/contracts/extract.ts`
- Test command: `npx vitest run lib/contracts/__tests__/extract.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// lib/contracts/__tests__/extract.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseExtractionText, extractTextFromFile } from '../extract';

describe('parseExtractionText', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parses a valid JSON extraction result', () => {
    const raw = JSON.stringify({
      services: ['Editing', 'SMM'],
      deliverables: [
        { service_tag: 'Editing', name: 'Short-form videos', quantity_per_month: 8 },
        { service_tag: 'SMM', name: 'Posts', quantity_per_month: 12, notes: 'across IG + TikTok' },
      ],
      effective_start: '2026-01-01',
      suggested_label: 'Retainer 2026',
    });
    const result = parseExtractionText(raw);
    expect(result.services).toEqual(['Editing', 'SMM']);
    expect(result.deliverables).toHaveLength(2);
    expect(result.deliverables[0].quantity_per_month).toBe(8);
  });

  it('strips code fences around JSON', () => {
    const raw = '```json\n{"services":[],"deliverables":[]}\n```';
    const result = parseExtractionText(raw);
    expect(result.services).toEqual([]);
  });

  it('returns empty draft on unparseable output', () => {
    const result = parseExtractionText('I cannot parse this contract.');
    expect(result.services).toEqual([]);
    expect(result.deliverables).toEqual([]);
  });

  it('drops deliverables that fail schema validation', () => {
    const raw = JSON.stringify({
      services: ['Editing'],
      deliverables: [
        { service_tag: 'Editing', name: 'Valid', quantity_per_month: 1 },
        { service_tag: '', name: 'Invalid', quantity_per_month: 2 }, // empty tag -> dropped
        { service_tag: 'SMM', name: 'Also valid', quantity_per_month: -5 }, // negative -> dropped
      ],
    });
    const result = parseExtractionText(raw);
    expect(result.deliverables).toHaveLength(1);
    expect(result.deliverables[0].name).toBe('Valid');
  });
});

describe('extractTextFromFile', () => {
  it('passes through txt content', async () => {
    const buf = Buffer.from('hello contract');
    const text = await extractTextFromFile(buf, 'text/plain');
    expect(text).toBe('hello contract');
  });

  it('throws on unsupported mime', async () => {
    await expect(extractTextFromFile(Buffer.from(''), 'image/png')).rejects.toThrow(/unsupported/i);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run lib/contracts/__tests__/extract.test.ts`
Expected: FAIL with "Cannot find module '../extract'" or similar.

- [ ] **Step 3: Write the implementation**

```ts
// lib/contracts/extract.ts
import { createCompletion } from '@/lib/ai/client';
import {
  extractionResultSchema,
  deliverableSchema,
  PARSE_PROMPT_VERSION,
  type ExtractionResult,
} from './types';

const SYSTEM_PROMPT = `You extract structured deliverables from service contracts.

Rules:
- Only include MONTHLY-RECURRING deliverables. Ignore one-time scoped work (e.g., "1 website rebuild", "initial brand DNA build").
- Normalize service_tag to short proper-case labels. Common ones: "Editing", "SMM", "Paid media", "Strategy", "Brand DNA", "Content Lab".
- quantity_per_month is a positive integer. If the contract specifies an annual number, convert to monthly (round down).
- If deliverables are bundled into a single line (e.g., "12 pieces of content per month"), create one row.
- If multiple deliverables are listed, create one row per deliverable.
- effective_start and effective_end are ISO dates (YYYY-MM-DD) if present in the contract.
- suggested_label is a short human label for the contract (e.g., "Retainer 2026", "Paid Media Addendum").

Return ONLY valid JSON matching this shape, nothing else:
{
  "services": string[],
  "deliverables": [{ "service_tag": string, "name": string, "quantity_per_month": number, "notes"?: string }],
  "effective_start"?: string,
  "effective_end"?: string,
  "suggested_label"?: string
}`;

export async function extractTextFromFile(buffer: Buffer, mime: string): Promise<string> {
  if (mime === 'application/pdf') {
    const pdfParse = (await import('pdf-parse')).default;
    const res = await pdfParse(buffer);
    return res.text ?? '';
  }
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/msword'
  ) {
    const mammoth = await import('mammoth');
    const res = await mammoth.extractRawText({ buffer });
    return res.value ?? '';
  }
  if (mime === 'text/plain' || mime === 'text/markdown') {
    return buffer.toString('utf-8');
  }
  throw new Error(`Unsupported contract file type: ${mime}`);
}

const EMPTY_RESULT: ExtractionResult = {
  services: [],
  deliverables: [],
  effective_start: null,
  effective_end: null,
  suggested_label: null,
};

export function parseExtractionText(raw: string): ExtractionResult {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return EMPTY_RESULT;
  }

  const parseObj = (parsed && typeof parsed === 'object') ? parsed as Record<string, unknown> : {};
  const rawDeliverables = Array.isArray(parseObj.deliverables) ? parseObj.deliverables : [];
  const deliverables = rawDeliverables
    .map((d) => {
      const r = deliverableSchema.safeParse(d);
      return r.success ? r.data : null;
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  const full = extractionResultSchema.safeParse({ ...parseObj, deliverables });
  return full.success ? full.data : { ...EMPTY_RESULT, deliverables };
}

export interface ExtractOptions {
  feature?: string;
  userId?: string;
  userEmail?: string;
}

export async function extractContractDeliverables(
  text: string,
  opts: ExtractOptions = {},
): Promise<{ result: ExtractionResult; parseMeta: Record<string, unknown> }> {
  const completion = await createCompletion({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text.slice(0, 60000) },
    ],
    maxTokens: 4000,
    jsonMode: true,
    timeoutMs: 60_000,
    feature: opts.feature ?? 'contract-extract',
    userId: opts.userId,
    userEmail: opts.userEmail,
  });

  const result = parseExtractionText(completion.text);
  return {
    result,
    parseMeta: {
      model: completion.modelUsed,
      prompt_version: PARSE_PROMPT_VERSION,
      raw_response: completion.text.slice(0, 20000),
      token_usage: completion.usage,
      estimated_cost: completion.estimatedCost,
    },
  };
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run lib/contracts/__tests__/extract.test.ts`
Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/contracts/extract.ts lib/contracts/__tests__/extract.test.ts
git commit -m "feat(contracts): extraction helper (text + LLM) with Zod-guarded output"
```

---

## Task 5: Recompute-services helper — unit tests first

**Files:**
- Create: `lib/contracts/__tests__/recompute-services.test.ts`
- Create: `lib/contracts/recompute-services.ts`

- [ ] **Step 1: Write failing tests**

```ts
// lib/contracts/__tests__/recompute-services.test.ts
import { describe, it, expect } from 'vitest';
import { computeServicesFromRows } from '../recompute-services';

describe('computeServicesFromRows', () => {
  it('returns sorted unique tags from active contracts', () => {
    expect(
      computeServicesFromRows([
        { status: 'active', service_tag: 'SMM' },
        { status: 'active', service_tag: 'Editing' },
        { status: 'active', service_tag: 'SMM' },
      ]),
    ).toEqual(['Editing', 'SMM']);
  });

  it('ignores non-active contracts', () => {
    expect(
      computeServicesFromRows([
        { status: 'active', service_tag: 'Editing' },
        { status: 'ended', service_tag: 'Paid media' },
        { status: 'draft', service_tag: 'Strategy' },
      ]),
    ).toEqual(['Editing']);
  });

  it('returns [] when nothing is active', () => {
    expect(
      computeServicesFromRows([
        { status: 'ended', service_tag: 'Editing' },
      ]),
    ).toEqual([]);
  });

  it('normalizes whitespace but preserves case', () => {
    expect(
      computeServicesFromRows([
        { status: 'active', service_tag: '  Editing ' },
        { status: 'active', service_tag: 'editing' }, // different case -> distinct
      ]),
    ).toEqual(['Editing', 'editing']);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run lib/contracts/__tests__/recompute-services.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Write the implementation**

```ts
// lib/contracts/recompute-services.ts
import { createAdminClient } from '@/lib/supabase/admin';

export interface DeliverableRow {
  status: 'draft' | 'active' | 'ended';
  service_tag: string;
}

export function computeServicesFromRows(rows: DeliverableRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.status !== 'active') continue;
    const trimmed = (r.service_tag ?? '').trim();
    if (trimmed) set.add(trimmed);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/**
 * Recompute clients.services as the union of service_tags across all active
 * contracts for the given client. Writes back to clients.services. Any other
 * writer of clients.services should be audited and removed.
 */
export async function recomputeClientServices(clientId: string): Promise<string[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('client_contract_deliverables')
    .select('service_tag, client_contracts!inner(status, client_id)')
    .eq('client_contracts.client_id', clientId);

  if (error) throw error;

  const rows: DeliverableRow[] = (data ?? []).map((row) => {
    const contract = (row as { client_contracts: { status: string } }).client_contracts;
    return {
      status: contract.status as DeliverableRow['status'],
      service_tag: (row as { service_tag: string }).service_tag,
    };
  });

  const services = computeServicesFromRows(rows);

  const { error: updateErr } = await admin
    .from('clients')
    .update({ services })
    .eq('id', clientId);
  if (updateErr) throw updateErr;

  return services;
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run lib/contracts/__tests__/recompute-services.test.ts`
Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/contracts/recompute-services.ts lib/contracts/__tests__/recompute-services.test.ts
git commit -m "feat(contracts): recomputeClientServices — union of active contract tags"
```

---

## Task 6: Register `contract` workspace module

**Files:**
- Modify: `lib/clients/admin-workspace-modules.ts`

- [ ] **Step 1: Add the key**

Edit `lib/clients/admin-workspace-modules.ts`: add `'contract'` to `ADMIN_WORKSPACE_TOGGLE_KEYS` and a meta entry:

```ts
export const ADMIN_WORKSPACE_TOGGLE_KEYS = [
  'brand-dna',
  'moodboard',
  'knowledge',
  'ad-creatives',
  'contract',
] as const;
```

Append to `ADMIN_WORKSPACE_TOGGLE_META`:
```ts
  contract: {
    label: 'Contract',
    description: 'When on, your team can upload contracts, review extracted deliverables, and see scope-of-work here.',
  },
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/clients/admin-workspace-modules.ts
git commit -m "feat(clients): add 'contract' workspace module toggle"
```

---

## Task 7: API route — GET list + POST upload+parse

**Files:**
- Create: `app/api/clients/[slug]/contracts/route.ts`

- [ ] **Step 1: Write the route**

```ts
// app/api/clients/[slug]/contracts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractTextFromFile, extractContractDeliverables } from '@/lib/contracts/extract';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
]);

async function requireAdmin(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('users')
    .select('role, email')
    .eq('id', userId)
    .single();
  const ok = data?.role === 'admin' || data?.role === 'super_admin';
  return { ok, email: data?.email ?? null };
}

async function resolveClient(slug: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('clients')
    .select('id, organization_id')
    .eq('slug', slug)
    .single();
  return data;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { ok } = await requireAdmin(user.id);
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const client = await resolveClient(slug);
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const { data: contracts } = await admin
    .from('client_contracts')
    .select('*')
    .eq('client_id', client.id)
    .order('uploaded_at', { ascending: false });

  const ids = (contracts ?? []).map((c) => c.id);
  const { data: deliverables } = ids.length
    ? await admin
        .from('client_contract_deliverables')
        .select('*')
        .in('contract_id', ids)
        .order('sort_order', { ascending: true })
    : { data: [] as never[] };

  return NextResponse.json({ contracts: contracts ?? [], deliverables: deliverables ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { ok, email } = await requireAdmin(user.id);
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const client = await resolveClient(slug);
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 20 MB)' }, { status: 413 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 415 });
  }

  const admin = createAdminClient();

  // 1. Insert draft contract row to mint id.
  const { data: draft, error: draftErr } = await admin
    .from('client_contracts')
    .insert({
      client_id: client.id,
      status: 'draft',
      file_name: file.name,
      file_size: file.size,
      file_mime: file.type,
      uploaded_by: user.id,
    })
    .select('id')
    .single();
  if (draftErr || !draft) {
    return NextResponse.json({ error: draftErr?.message ?? 'Failed to create draft' }, { status: 500 });
  }

  // 2. Upload file.
  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${client.organization_id ?? 'no-org'}/${client.id}/${draft.id}/${file.name}`;
  const { error: uploadErr } = await admin.storage
    .from('client-contracts')
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (uploadErr) {
    await admin.from('client_contracts').delete().eq('id', draft.id);
    return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });
  }

  // 3. Extract + parse.
  let result: Awaited<ReturnType<typeof extractContractDeliverables>>;
  try {
    const text = await extractTextFromFile(buffer, file.type);
    result = await extractContractDeliverables(text, {
      feature: 'contract-extract',
      userId: user.id,
      userEmail: email ?? undefined,
    });
  } catch (err) {
    result = {
      result: { services: [], deliverables: [], effective_start: null, effective_end: null, suggested_label: null },
      parseMeta: { error: err instanceof Error ? err.message : String(err) },
    };
  }

  // 4. Persist file_path + parse_meta on the draft row.
  await admin
    .from('client_contracts')
    .update({ file_path: storagePath, parse_meta: result.parseMeta })
    .eq('id', draft.id);

  return NextResponse.json({
    contract_id: draft.id,
    draft: result.result,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/clients/[slug]/contracts/route.ts
git commit -m "feat(contracts): GET list + POST upload-and-parse route"
```

---

## Task 8: API route — POST confirm

**Files:**
- Create: `app/api/clients/[slug]/contracts/[id]/confirm/route.ts`

- [ ] **Step 1: Write the route**

```ts
// app/api/clients/[slug]/contracts/[id]/confirm/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { confirmContractBodySchema } from '@/lib/contracts/types';
import { recomputeClientServices } from '@/lib/contracts/recompute-services';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (me?.role !== 'admin' && me?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: client } = await admin
    .from('clients')
    .select('id')
    .eq('slug', slug)
    .single();
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const { data: contract } = await admin
    .from('client_contracts')
    .select('id, client_id')
    .eq('id', id)
    .single();
  if (!contract || contract.client_id !== client.id) {
    return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = confirmContractBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });
  }

  const {
    label,
    status,
    effective_start,
    effective_end,
    notes,
    deliverables,
  } = parsed.data;

  // Replace deliverables + update contract atomically (best-effort sequential).
  const { error: delErr } = await admin
    .from('client_contract_deliverables')
    .delete()
    .eq('contract_id', id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (deliverables.length) {
    const rows = deliverables.map((d, i) => ({
      contract_id: id,
      service_tag: d.service_tag.trim(),
      name: d.name.trim(),
      quantity_per_month: d.quantity_per_month,
      notes: d.notes ?? null,
      sort_order: i,
    }));
    const { error: insErr } = await admin.from('client_contract_deliverables').insert(rows);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const { error: updErr } = await admin
    .from('client_contracts')
    .update({
      label,
      status,
      effective_start: effective_start ?? null,
      effective_end: effective_end ?? null,
      notes: notes ?? null,
    })
    .eq('id', id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  const services = await recomputeClientServices(client.id);
  return NextResponse.json({ ok: true, services });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/clients/[slug]/contracts/[id]/confirm/route.ts
git commit -m "feat(contracts): POST confirm — persists reviewed deliverables + recomputes services"
```

---

## Task 9: API route — PATCH + DELETE

**Files:**
- Create: `app/api/clients/[slug]/contracts/[id]/route.ts`

- [ ] **Step 1: Write the route**

```ts
// app/api/clients/[slug]/contracts/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { patchContractBodySchema } from '@/lib/contracts/types';
import { recomputeClientServices } from '@/lib/contracts/recompute-services';

export const dynamic = 'force-dynamic';

async function guard(
  slug: string,
  id: string,
  userId: string,
): Promise<{ status: number; error?: string; clientId?: string }> {
  const admin = createAdminClient();
  const { data: me } = await admin.from('users').select('role').eq('id', userId).single();
  if (me?.role !== 'admin' && me?.role !== 'super_admin') {
    return { status: 403, error: 'Forbidden' };
  }
  const { data: client } = await admin.from('clients').select('id').eq('slug', slug).single();
  if (!client) return { status: 404, error: 'Client not found' };
  const { data: contract } = await admin
    .from('client_contracts')
    .select('id, client_id, file_path')
    .eq('id', id)
    .single();
  if (!contract || contract.client_id !== client.id) {
    return { status: 404, error: 'Contract not found' };
  }
  return { status: 200, clientId: client.id };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const g = await guard(slug, id, user.id);
  if (g.status !== 200) return NextResponse.json({ error: g.error }, { status: g.status });

  const body = await req.json().catch(() => null);
  const parsed = patchContractBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });
  }

  const admin = createAdminClient();
  const updates: Record<string, unknown> = {};
  if (parsed.data.label !== undefined) updates.label = parsed.data.label;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.effective_start !== undefined) updates.effective_start = parsed.data.effective_start ?? null;
  if (parsed.data.effective_end !== undefined) updates.effective_end = parsed.data.effective_end ?? null;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes ?? null;

  if (Object.keys(updates).length) {
    const { error } = await admin.from('client_contracts').update(updates).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (parsed.data.deliverables) {
    await admin.from('client_contract_deliverables').delete().eq('contract_id', id);
    if (parsed.data.deliverables.length) {
      const rows = parsed.data.deliverables.map((d, i) => ({
        contract_id: id,
        service_tag: d.service_tag.trim(),
        name: d.name.trim(),
        quantity_per_month: d.quantity_per_month,
        notes: d.notes ?? null,
        sort_order: i,
      }));
      const { error } = await admin.from('client_contract_deliverables').insert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const services = await recomputeClientServices(g.clientId!);
  return NextResponse.json({ ok: true, services });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const g = await guard(slug, id, user.id);
  if (g.status !== 200) return NextResponse.json({ error: g.error }, { status: g.status });

  const admin = createAdminClient();
  const { data: contract } = await admin
    .from('client_contracts')
    .select('file_path')
    .eq('id', id)
    .single();

  if (contract?.file_path) {
    await admin.storage.from('client-contracts').remove([contract.file_path]);
  }

  const { error } = await admin.from('client_contracts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const services = await recomputeClientServices(g.clientId!);
  return NextResponse.json({ ok: true, services });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/clients/[slug]/contracts/[id]/route.ts
git commit -m "feat(contracts): PATCH + DELETE routes (storage cleanup + services recompute)"
```

---

## Task 10: API route — signed download URL

**Files:**
- Create: `app/api/clients/[slug]/contracts/[id]/signed-url/route.ts`

- [ ] **Step 1: Write the route**

```ts
// app/api/clients/[slug]/contracts/[id]/signed-url/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from('users').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin' && me?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: client } = await admin.from('clients').select('id').eq('slug', slug).single();
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const { data: contract } = await admin
    .from('client_contracts')
    .select('file_path, client_id, file_name')
    .eq('id', id)
    .single();
  if (!contract || contract.client_id !== client.id || !contract.file_path) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const { data, error } = await admin.storage
    .from('client-contracts')
    .createSignedUrl(contract.file_path, 60);
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Sign failed' }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl, file_name: contract.file_name });
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add app/api/clients/[slug]/contracts/[id]/signed-url/route.ts
git commit -m "feat(contracts): GET signed-url route for secure file download"
```

Expected: typecheck clean.

---

## Task 11: Sidebar nav entry

**Files:**
- Modify: `components/clients/client-admin-shell.tsx`

- [ ] **Step 1: Add the nav entry**

Import `FileText` from lucide-react:
```ts
import {
  ArrowLeft,
  BookOpen,
  Building2,
  Dna,
  FileText,
  Image as ImageIcon,
  LayoutDashboard,
  Settings2,
  StickyNote,
} from 'lucide-react';
```

Insert into the `NAV` array between `ad-creatives` and `settings`:
```ts
  { key: 'ad-creatives', label: 'Ad creatives', icon: ImageIcon, path: '/ad-creatives' },
  { key: 'contract', label: 'Contract', icon: FileText, path: '/contract' },
  { key: 'settings', label: 'Settings', icon: Settings2, path: '/settings' },
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit
git add components/clients/client-admin-shell.tsx
git commit -m "feat(contracts): Contract sidebar nav entry"
```

Expected: typecheck clean.

---

## Task 12: Contract page — server component

**Files:**
- Create: `app/admin/clients/[slug]/contract/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// app/admin/clients/[slug]/contract/page.tsx
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  isAdminWorkspaceNavVisible,
  normalizeAdminWorkspaceModules,
} from '@/lib/clients/admin-workspace-modules';
import { ContractWorkspace } from '@/components/clients/contract/contract-workspace';

export const dynamic = 'force-dynamic';

export default async function AdminClientContractPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  const isAdmin = me?.role === 'admin' || me?.role === 'super_admin';
  if (!isAdmin) notFound();

  const { data: client } = await admin
    .from('clients')
    .select('id, slug, name, services, admin_workspace_modules')
    .eq('slug', slug)
    .single();
  if (!client) notFound();

  const modules = normalizeAdminWorkspaceModules(
    (client as { admin_workspace_modules?: unknown }).admin_workspace_modules,
  );
  if (!isAdminWorkspaceNavVisible(modules, 'contract')) notFound();

  const { data: contracts } = await admin
    .from('client_contracts')
    .select('*')
    .eq('client_id', client.id)
    .order('uploaded_at', { ascending: false });

  const ids = (contracts ?? []).map((c) => c.id);
  const { data: deliverables } = ids.length
    ? await admin
        .from('client_contract_deliverables')
        .select('*')
        .in('contract_id', ids)
        .order('sort_order', { ascending: true })
    : { data: [] as never[] };

  return (
    <ContractWorkspace
      slug={slug}
      clientName={client.name ?? slug}
      services={Array.isArray(client.services) ? (client.services as string[]) : []}
      initialContracts={contracts ?? []}
      initialDeliverables={deliverables ?? []}
    />
  );
}
```

- [ ] **Step 2: Commit (UI comes next task, typecheck will fail until then — mark commit as WIP)**

Run: `npx tsc --noEmit`
Expected: error "Cannot find module '@/components/clients/contract/contract-workspace'" — that's OK, next task creates it. Do NOT commit yet.

---

## Task 13: Deliverable row + upload modal

**Files:**
- Create: `components/clients/contract/deliverable-row.tsx`
- Create: `components/clients/contract/upload-contract-modal.tsx`

- [ ] **Step 1: Write `deliverable-row.tsx`**

```tsx
// components/clients/contract/deliverable-row.tsx
'use client';

import { Trash2 } from 'lucide-react';
import type { z } from 'zod';
import { deliverableSchema } from '@/lib/contracts/types';

export type DeliverableInput = z.infer<typeof deliverableSchema>;

export function DeliverableRow({
  value,
  serviceSuggestions,
  onChange,
  onRemove,
}: {
  value: DeliverableInput;
  serviceSuggestions: string[];
  onChange: (next: DeliverableInput) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-[180px_1fr_90px_40px] gap-2 items-start">
      <input
        list="service-tags"
        value={value.service_tag}
        onChange={(e) => onChange({ ...value, service_tag: e.target.value })}
        placeholder="Service tag"
        className="px-2 py-1.5 text-sm bg-surface-hover border border-border rounded-md"
      />
      <input
        value={value.name}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
        placeholder="Deliverable name"
        className="px-2 py-1.5 text-sm bg-surface-hover border border-border rounded-md"
      />
      <input
        type="number"
        min={0}
        value={value.quantity_per_month}
        onChange={(e) => onChange({ ...value, quantity_per_month: Number(e.target.value) || 0 })}
        className="px-2 py-1.5 text-sm bg-surface-hover border border-border rounded-md text-right"
      />
      <button
        type="button"
        onClick={onRemove}
        className="p-1.5 text-text-muted hover:text-destructive"
        aria-label="Remove deliverable"
      >
        <Trash2 size={14} />
      </button>
      <datalist id="service-tags">
        {serviceSuggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
```

- [ ] **Step 2: Write `upload-contract-modal.tsx`**

```tsx
// components/clients/contract/upload-contract-modal.tsx
'use client';

import { useState } from 'react';
import { Upload, X, Plus } from 'lucide-react';
import { DeliverableRow, type DeliverableInput } from './deliverable-row';

interface UploadContractModalProps {
  slug: string;
  serviceSuggestions: string[];
  onClose: () => void;
  onSaved: () => void;
}

type Phase = 'idle' | 'uploading' | 'review' | 'saving';

export function UploadContractModal({ slug, serviceSuggestions, onClose, onSaved }: UploadContractModalProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [contractId, setContractId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [status, setStatus] = useState<'active' | 'ended'>('active');
  const [effectiveStart, setEffectiveStart] = useState<string>('');
  const [effectiveEnd, setEffectiveEnd] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [deliverables, setDeliverables] = useState<DeliverableInput[]>([]);

  async function handleFile(file: File) {
    setPhase('uploading');
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/clients/${slug}/contracts`, { method: 'POST', body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Upload failed');
      setContractId(body.contract_id);
      setLabel(body.draft.suggested_label ?? 'Contract');
      setEffectiveStart(body.draft.effective_start ?? '');
      setEffectiveEnd(body.draft.effective_end ?? '');
      setDeliverables(body.draft.deliverables ?? []);
      setPhase('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('idle');
    }
  }

  async function handleSave() {
    if (!contractId) return;
    setPhase('saving');
    setError(null);
    try {
      const res = await fetch(`/api/clients/${slug}/contracts/${contractId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          status,
          effective_start: effectiveStart || null,
          effective_end: effectiveEnd || null,
          notes: notes || null,
          deliverables,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Save failed');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('review');
    }
  }

  async function handleCancel() {
    if (contractId && phase === 'review') {
      await fetch(`/api/clients/${slug}/contracts/${contractId}`, { method: 'DELETE' });
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-surface rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Upload contract</h2>
          <button onClick={handleCancel} className="text-text-muted hover:text-text-primary">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && <div className="text-sm text-destructive">{error}</div>}

          {phase === 'idle' && (
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl py-12 cursor-pointer hover:bg-surface-hover">
              <Upload size={28} className="text-text-muted mb-2" />
              <span className="text-sm text-text-secondary">PDF, DOCX, TXT — up to 20 MB</span>
              <input
                type="file"
                accept=".pdf,.docx,.doc,.txt,.md"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </label>
          )}

          {phase === 'uploading' && (
            <div className="py-12 text-center text-sm text-text-secondary">
              Uploading and extracting deliverables...
            </div>
          )}

          {(phase === 'review' || phase === 'saving') && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm text-text-secondary">
                  Label
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    className="mt-1 w-full px-2 py-1.5 bg-surface-hover border border-border rounded-md"
                  />
                </label>
                <label className="text-sm text-text-secondary">
                  Status
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'active' | 'ended')}
                    className="mt-1 w-full px-2 py-1.5 bg-surface-hover border border-border rounded-md"
                  >
                    <option value="active">Active</option>
                    <option value="ended">Ended</option>
                  </select>
                </label>
                <label className="text-sm text-text-secondary">
                  Effective start
                  <input
                    type="date"
                    value={effectiveStart}
                    onChange={(e) => setEffectiveStart(e.target.value)}
                    className="mt-1 w-full px-2 py-1.5 bg-surface-hover border border-border rounded-md"
                  />
                </label>
                <label className="text-sm text-text-secondary">
                  Effective end
                  <input
                    type="date"
                    value={effectiveEnd}
                    onChange={(e) => setEffectiveEnd(e.target.value)}
                    className="mt-1 w-full px-2 py-1.5 bg-surface-hover border border-border rounded-md"
                  />
                </label>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium">Deliverables</h3>
                  <button
                    type="button"
                    onClick={() =>
                      setDeliverables([
                        ...deliverables,
                        { service_tag: '', name: '', quantity_per_month: 1 },
                      ])
                    }
                    className="text-xs text-accent-text flex items-center gap-1"
                  >
                    <Plus size={12} /> Add row
                  </button>
                </div>
                <div className="space-y-2">
                  {deliverables.length === 0 && (
                    <div className="text-sm text-text-muted py-4 text-center">
                      No deliverables detected — click "Add row" to enter manually.
                    </div>
                  )}
                  {deliverables.map((d, i) => (
                    <DeliverableRow
                      key={i}
                      value={d}
                      serviceSuggestions={serviceSuggestions}
                      onChange={(next) => {
                        const copy = [...deliverables];
                        copy[i] = next;
                        setDeliverables(copy);
                      }}
                      onRemove={() => setDeliverables(deliverables.filter((_, j) => j !== i))}
                    />
                  ))}
                </div>
              </div>

              <label className="text-sm text-text-secondary block">
                Notes
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="mt-1 w-full px-2 py-1.5 bg-surface-hover border border-border rounded-md"
                />
              </label>
            </>
          )}
        </div>

        {(phase === 'review' || phase === 'saving') && (
          <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary"
              disabled={phase === 'saving'}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={phase === 'saving' || !label.trim()}
              className="px-3 py-1.5 text-sm bg-accent text-white rounded-md disabled:opacity-50"
            >
              {phase === 'saving' ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add components/clients/contract/deliverable-row.tsx components/clients/contract/upload-contract-modal.tsx
git commit -m "feat(contracts): upload + review modal with editable deliverable rows"
```

Expected: typecheck clean (contract-workspace still missing — that's fine, next task fixes it).

---

## Task 14: Contract workspace (page UI) + edit modal

**Files:**
- Create: `components/clients/contract/contract-workspace.tsx`
- Create: `components/clients/contract/edit-contract-modal.tsx`

- [ ] **Step 1: Write `edit-contract-modal.tsx`**

```tsx
// components/clients/contract/edit-contract-modal.tsx
'use client';

import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { DeliverableRow, type DeliverableInput } from './deliverable-row';

interface EditContractModalProps {
  slug: string;
  contractId: string;
  initial: {
    label: string;
    status: 'draft' | 'active' | 'ended';
    effective_start: string | null;
    effective_end: string | null;
    notes: string | null;
    deliverables: DeliverableInput[];
  };
  serviceSuggestions: string[];
  onClose: () => void;
  onSaved: () => void;
}

export function EditContractModal({
  slug,
  contractId,
  initial,
  serviceSuggestions,
  onClose,
  onSaved,
}: EditContractModalProps) {
  const [label, setLabel] = useState(initial.label);
  const [status, setStatus] = useState(initial.status === 'draft' ? 'active' : initial.status);
  const [effectiveStart, setEffectiveStart] = useState(initial.effective_start ?? '');
  const [effectiveEnd, setEffectiveEnd] = useState(initial.effective_end ?? '');
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [deliverables, setDeliverables] = useState<DeliverableInput[]>(initial.deliverables);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${slug}/contracts/${contractId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          status,
          effective_start: effectiveStart || null,
          effective_end: effectiveEnd || null,
          notes: notes || null,
          deliverables,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'Save failed');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-surface rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Edit contract</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-text-secondary">
              Label
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="mt-1 w-full px-2 py-1.5 bg-surface-hover border border-border rounded-md"
              />
            </label>
            <label className="text-sm text-text-secondary">
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'active' | 'ended')}
                className="mt-1 w-full px-2 py-1.5 bg-surface-hover border border-border rounded-md"
              >
                <option value="active">Active</option>
                <option value="ended">Ended</option>
              </select>
            </label>
            <label className="text-sm text-text-secondary">
              Effective start
              <input
                type="date"
                value={effectiveStart}
                onChange={(e) => setEffectiveStart(e.target.value)}
                className="mt-1 w-full px-2 py-1.5 bg-surface-hover border border-border rounded-md"
              />
            </label>
            <label className="text-sm text-text-secondary">
              Effective end
              <input
                type="date"
                value={effectiveEnd}
                onChange={(e) => setEffectiveEnd(e.target.value)}
                className="mt-1 w-full px-2 py-1.5 bg-surface-hover border border-border rounded-md"
              />
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium">Deliverables</h3>
              <button
                type="button"
                onClick={() =>
                  setDeliverables([
                    ...deliverables,
                    { service_tag: '', name: '', quantity_per_month: 1 },
                  ])
                }
                className="text-xs text-accent-text flex items-center gap-1"
              >
                <Plus size={12} /> Add row
              </button>
            </div>
            <div className="space-y-2">
              {deliverables.map((d, i) => (
                <DeliverableRow
                  key={i}
                  value={d}
                  serviceSuggestions={serviceSuggestions}
                  onChange={(next) => {
                    const copy = [...deliverables];
                    copy[i] = next;
                    setDeliverables(copy);
                  }}
                  onRemove={() => setDeliverables(deliverables.filter((_, j) => j !== i))}
                />
              ))}
            </div>
          </div>

          <label className="text-sm text-text-secondary block">
            Notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full px-2 py-1.5 bg-surface-hover border border-border rounded-md"
            />
          </label>
        </div>
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !label.trim()}
            className="px-3 py-1.5 text-sm bg-accent text-white rounded-md disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `contract-workspace.tsx`**

```tsx
// components/clients/contract/contract-workspace.tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Download, MoreVertical, Plus } from 'lucide-react';
import { UploadContractModal } from './upload-contract-modal';
import { EditContractModal } from './edit-contract-modal';
import type { DeliverableInput } from './deliverable-row';

interface ContractRow {
  id: string;
  label: string;
  status: 'draft' | 'active' | 'ended';
  effective_start: string | null;
  effective_end: string | null;
  file_name: string | null;
  uploaded_at: string;
  notes: string | null;
}

interface DeliverableRowData {
  id: string;
  contract_id: string;
  service_tag: string;
  name: string;
  quantity_per_month: number;
  notes: string | null;
  sort_order: number;
}

interface ContractWorkspaceProps {
  slug: string;
  clientName: string;
  services: string[];
  initialContracts: ContractRow[];
  initialDeliverables: DeliverableRowData[];
}

export function ContractWorkspace({
  slug,
  clientName,
  services,
  initialContracts,
  initialDeliverables,
}: ContractWorkspaceProps) {
  const router = useRouter();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<ContractRow | null>(null);

  const activeContracts = initialContracts.filter((c) => c.status === 'active');
  const pastContracts = initialContracts.filter((c) => c.status !== 'active');

  const activeDeliverables = useMemo(() => {
    const activeIds = new Set(activeContracts.map((c) => c.id));
    return initialDeliverables.filter((d) => activeIds.has(d.contract_id));
  }, [activeContracts, initialDeliverables]);

  const groupedByTag = useMemo(() => {
    const groups = new Map<string, DeliverableRowData[]>();
    for (const d of activeDeliverables) {
      const list = groups.get(d.service_tag) ?? [];
      list.push(d);
      groups.set(d.service_tag, list);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [activeDeliverables]);

  function refresh() {
    setUploadOpen(false);
    setEditing(null);
    router.refresh();
  }

  async function handleDownload(contractId: string) {
    const res = await fetch(`/api/clients/${slug}/contracts/${contractId}/signed-url`);
    const body = await res.json();
    if (res.ok && body.url) window.open(body.url, '_blank', 'noopener');
  }

  async function handleDelete(contractId: string) {
    if (!confirm('Delete this contract? Deliverables will be removed and services recomputed.')) return;
    await fetch(`/api/clients/${slug}/contracts/${contractId}`, { method: 'DELETE' });
    router.refresh();
  }

  function deliverablesForContract(id: string): DeliverableInput[] {
    return initialDeliverables
      .filter((d) => d.contract_id === id)
      .map((d) => ({
        service_tag: d.service_tag,
        name: d.name,
        quantity_per_month: d.quantity_per_month,
        notes: d.notes ?? undefined,
      }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Contract</h1>
          <p className="text-sm text-text-muted mt-1">Deliverables and contract history for {clientName}</p>
        </div>
        <button
          onClick={() => setUploadOpen(true)}
          className="px-3 py-1.5 text-sm bg-accent text-white rounded-md flex items-center gap-1.5"
        >
          <Plus size={14} /> Upload contract
        </button>
      </div>

      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-medium mb-3">Active services</h2>
        {services.length === 0 ? (
          <p className="text-sm text-text-muted">No active services — upload a contract to populate.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {services.map((s) => (
              <span key={s} className="px-2.5 py-1 text-xs bg-accent/10 text-accent-text rounded-full">
                {s}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="bg-surface border border-border rounded-xl p-5">
        <h2 className="text-sm font-medium mb-3">Monthly deliverables</h2>
        {groupedByTag.length === 0 ? (
          <p className="text-sm text-text-muted">No deliverables yet.</p>
        ) : (
          <div className="space-y-4">
            {groupedByTag.map(([tag, rows]) => {
              const total = rows.reduce((sum, r) => sum + r.quantity_per_month, 0);
              return (
                <div key={tag}>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <h3 className="text-sm font-medium">{tag}</h3>
                    <span className="text-xs text-text-muted">{total}/mo total</span>
                  </div>
                  <ul className="space-y-1">
                    {rows.map((r) => (
                      <li key={r.id} className="flex justify-between text-sm">
                        <span className="text-text-secondary">{r.name}</span>
                        <span className="text-text-muted">{r.quantity_per_month}/mo</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ContractsList
        title="Active contracts"
        rows={activeContracts}
        onEdit={setEditing}
        onDownload={handleDownload}
        onDelete={handleDelete}
        emptyText="No active contracts."
      />

      {pastContracts.length > 0 && (
        <ContractsList
          title="Past contracts"
          rows={pastContracts}
          onEdit={setEditing}
          onDownload={handleDownload}
          onDelete={handleDelete}
          emptyText="None yet."
          collapsed
        />
      )}

      {uploadOpen && (
        <UploadContractModal
          slug={slug}
          serviceSuggestions={services}
          onClose={() => setUploadOpen(false)}
          onSaved={refresh}
        />
      )}
      {editing && (
        <EditContractModal
          slug={slug}
          contractId={editing.id}
          initial={{
            label: editing.label,
            status: editing.status,
            effective_start: editing.effective_start,
            effective_end: editing.effective_end,
            notes: editing.notes,
            deliverables: deliverablesForContract(editing.id),
          }}
          serviceSuggestions={services}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

function ContractsList({
  title,
  rows,
  emptyText,
  collapsed = false,
  onEdit,
  onDownload,
  onDelete,
}: {
  title: string;
  rows: ContractRow[];
  emptyText: string;
  collapsed?: boolean;
  onEdit: (c: ContractRow) => void;
  onDownload: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(!collapsed);
  return (
    <div className="bg-surface border border-border rounded-xl">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4"
      >
        <h2 className="text-sm font-medium">{title}</h2>
        <span className="text-xs text-text-muted">{rows.length}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-2">
          {rows.length === 0 && <p className="text-sm text-text-muted">{emptyText}</p>}
          {rows.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between px-3 py-2 rounded-md bg-surface-hover"
            >
              <div className="flex items-center gap-3">
                <FileText size={15} className="text-text-muted" />
                <div>
                  <div className="text-sm font-medium">{c.label}</div>
                  <div className="text-xs text-text-muted">
                    {c.file_name ?? 'No file'} · {c.effective_start ?? '—'} to {c.effective_end ?? 'ongoing'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onDownload(c.id)}
                  className="p-1.5 text-text-muted hover:text-text-primary"
                  aria-label="Download"
                >
                  <Download size={14} />
                </button>
                <button
                  onClick={() => onEdit(c)}
                  className="px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(c.id)}
                  className="p-1.5 text-text-muted hover:text-destructive"
                  aria-label="Delete"
                >
                  <MoreVertical size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add app/admin/clients/[slug]/contract/page.tsx components/clients/contract/contract-workspace.tsx components/clients/contract/edit-contract-modal.tsx
git commit -m "feat(contracts): Contract page — services, deliverables, active/past lists, edit flow"
```

Expected: typecheck clean.

---

## Task 15: E2E smoke test

**Files:**
- Create: `tests/e2e/contract.spec.ts`
- Create: `tests/e2e/fixtures/sample-contract.txt`

- [ ] **Step 1: Create fixture**

```text
// tests/e2e/fixtures/sample-contract.txt
Agency Retainer — 2026

Services covered: Editing, SMM, Paid media.

Monthly deliverables:
- 8 short-form videos per month (Editing)
- 12 social posts per month across IG + TikTok (SMM)
- 2 paid media campaign rotations per month (Paid media)

Effective: 2026-01-01 through 2026-12-31.
```

- [ ] **Step 2: Write the test (skipped when `E2E_ADMIN_EMAIL` unset)**

```ts
// tests/e2e/contract.spec.ts
import { test, expect } from '@playwright/test';
import path from 'node:path';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const CLIENT_SLUG = process.env.E2E_CLIENT_SLUG;

test.describe('Contract workspace', () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD || !CLIENT_SLUG,
    'Set E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_CLIENT_SLUG to run.',
  );

  test('upload, review, save, delete', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(ADMIN_EMAIL!);
    await page.getByLabel(/password/i).fill(ADMIN_PASSWORD!);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/admin/);

    await page.goto(`/admin/clients/${CLIENT_SLUG}/contract`);
    await expect(page.getByRole('heading', { name: 'Contract' })).toBeVisible();

    await page.getByRole('button', { name: /upload contract/i }).click();
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, 'fixtures/sample-contract.txt'));

    await expect(page.getByText(/deliverables/i).first()).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: /^save$/i }).click();

    await expect(page.getByText(/active services/i)).toBeVisible();
    await expect(page.getByText(/Editing/)).toBeVisible();

    // Clean up — delete the contract we just created (use dialog accept).
    page.on('dialog', (d) => d.accept());
    await page.getByLabel('Delete').first().click();
    await expect(page.getByText(/no active services/i)).toBeVisible({ timeout: 10_000 });
  });
});
```

- [ ] **Step 3: Run test (skips if env vars missing)**

Run: `npm run test:e2e -- contract.spec`
Expected: test runs or is marked skipped. No uncaught errors from playwright config.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/contract.spec.ts tests/e2e/fixtures/sample-contract.txt
git commit -m "test(contracts): e2e upload → review → save → delete"
```

---

## Task 16: Final verification

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors introduced by this work.

- [ ] **Step 3: Unit tests**

Run: `npx vitest run lib/contracts`
Expected: all tests pass.

- [ ] **Step 4: Manual smoke**

- Visit `/admin/clients/<any-slug>/contract` in dev server.
- Verify sidebar shows the Contract entry, page loads with empty states.
- Upload the `tests/e2e/fixtures/sample-contract.txt` file, confirm draft appears in the review step.
- Save, verify `clients.services` now contains the extracted tags (query via Supabase MCP).
- Upload a second contract, verify services union grows.
- End the first contract via Edit modal → verify services shrink.
- Delete the second contract → verify services are empty.

- [ ] **Step 5: Final commit if anything polished during smoke**

```bash
git status
git diff
# if any changes:
git add -p
git commit -m "fix(contracts): <describe any polish>"
```

---

## Self-review checklist (done during writing-plans)

**Spec coverage:**
- Sidebar tab `contract` → Task 6 + Task 11
- `client_contracts` + `client_contract_deliverables` tables → Task 1
- Private storage bucket `client-contracts` → Task 1
- Derived `clients.services` recompute → Task 5, invoked from Tasks 8, 9
- OpenRouter extraction with JSON mode → Task 4
- Upload → draft → review → save flow → Tasks 7, 8, 13
- Signed URL for downloads → Task 10
- Admin-only access (role + workspace toggle) → Tasks 6, 7, 8, 9, 10, 12
- Edit/end/delete → Tasks 9, 14
- Multiple concurrent active contracts aggregated → Task 14 (groupedByTag + union services)
- 20 MB cap + mime allowlist → Task 7

**Placeholder scan:** none of TBD/TODO/"implement later"/"similar to above". Every task has concrete code.

**Type consistency:** `DeliverableInput` is `z.infer<typeof deliverableSchema>` from `lib/contracts/types.ts`, used identically in `deliverable-row.tsx`, `upload-contract-modal.tsx`, `edit-contract-modal.tsx`, `contract-workspace.tsx`. API request/response shapes match Zod schemas in `types.ts`. `recomputeClientServices` returns `string[]`, routes use that return value consistently.

No further changes.

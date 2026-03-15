# Search Ideas Wizard Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a contextual 2-step modal wizard to the search results page for generating video ideas, pre-loaded with the search's `search_id` and attached client.

**Architecture:** New `SearchIdeasWizard` component using existing `WizardShell` pattern. Mirrors `IdeasWizard` functionality (same API, same reference video flow) but is scoped to the search context. One backend fix to the Zod validation, one new component, two file modifications.

**Tech Stack:** React, Next.js 15 App Router, Framer Motion (via WizardShell), Supabase, Zod

---

### Task 1: Fix API validation to accept `search_id` as valid source

**Files:**
- Modify: `app/api/ideas/generate/route.ts:19`

- [ ] **Step 1: Update the `.refine()` constraint**

In `app/api/ideas/generate/route.ts`, line 19, change:

```typescript
}).refine((d) => d.client_id || d.url, {
  message: 'Either client_id or url is required',
});
```

to:

```typescript
}).refine((d) => d.client_id || d.url || d.search_id, {
  message: 'Either client_id, url, or search_id is required',
});
```

- [ ] **Step 2: Handle search-only context gathering**

In the same file, after the URL-based scraping block (line ~116) and before the client-based context gathering (line ~119), add a block that fetches search data when only `search_id` is provided (no `client_id`, no `url`):

```typescript
// ── Search-only mode (no client, no url) ──
if (search_id && !client_id && !url) {
  const { data: searchData } = await admin
    .from('topic_searches')
    .select('query, summary, trending_topics, serp_data, raw_ai_response')
    .eq('id', search_id)
    .single();

  if (searchData) {
    const searchContext: string[] = [`Search query: ${searchData.query}`];
    if (searchData.summary) searchContext.push(`Research summary: ${searchData.summary}`);

    if (Array.isArray(searchData.trending_topics)) {
      const topics = (searchData.trending_topics as { name: string; resonance?: string; sentiment?: string }[])
        .map((t) => `- ${t.name} (resonance: ${t.resonance ?? 'unknown'}, sentiment: ${t.sentiment ?? 'unknown'})`)
        .join('\n');
      searchContext.push(`Trending topics:\n${topics}`);
    }

    const aiResponse = searchData.raw_ai_response as Record<string, unknown> | null;
    if (aiResponse?.key_findings) {
      searchContext.push(`Key findings: ${JSON.stringify(aiResponse.key_findings)}`);
    }
    if (aiResponse?.content_breakdown) {
      searchContext.push(`Content breakdown: ${JSON.stringify(aiResponse.content_breakdown)}`);
    }
    if (aiResponse?.action_items) {
      searchContext.push(`Action items: ${JSON.stringify(aiResponse.action_items)}`);
    }

    contextBlocks.push(`<research_data>\n${searchContext.join('\n\n')}\n</research_data>`);
  }
}
```

This mirrors the existing search data fetching inside the `client_id` branch (lines 213-241) but runs independently when there's no client.

- [ ] **Step 3: Commit**

```bash
git add app/api/ideas/generate/route.ts
git commit -m "fix: allow search_id as valid source for idea generation"
```

---

### Task 2: Create `SearchIdeasWizard` component

**Files:**
- Create: `components/research/search-ideas-wizard.tsx`
- Reference: `components/research/ideas-wizard.tsx` (mirror this pattern)
- Reference: `components/research/wizard-shell.tsx` (reuse)
- Reference: `components/ui/client-picker.tsx` (reuse `ClientPickerButton`, `ClientOption`)

- [ ] **Step 1: Create the component file**

Create `components/research/search-ideas-wizard.tsx`. This mirrors `IdeasWizard` with these differences:
- No `sourceMode` toggle (client/URL) — always client mode
- `searchId` prop always passed to API
- `clientId` prop pre-selects the client picker
- No `onStarted` callback — navigates away immediately
- Reference video input hidden when no client selected (same guard as IdeasWizard line 259)

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import { WizardShell } from './wizard-shell';
import { GlassButton } from '@/components/ui/glass-button';
import { ClientPickerButton, type ClientOption } from '@/components/ui/client-picker';

interface SearchIdeasWizardProps {
  open: boolean;
  onClose: () => void;
  searchId: string;
  clientId: string | null;
  clients: ClientOption[];
}

const COUNT_PRESETS = [5, 10, 15, 20] as const;

export function SearchIdeasWizard({ open, onClose, searchId, clientId: initialClientId, clients }: SearchIdeasWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [clientId, setClientId] = useState<string | null>(initialClientId);
  const [concept, setConcept] = useState('');
  const [count, setCount] = useState(10);
  const [customCount, setCustomCount] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [referenceIds, setReferenceIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setStep(1);
    setClientId(initialClientId);
    setConcept('');
    setCount(10);
    setCustomCount('');
    setReferenceUrl('');
    setReferenceIds([]);
    setLoading(false);
    setError('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function addReference() {
    if (!referenceUrl.trim() || !clientId) return;
    try {
      const res = await fetch('/api/reference-videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, url: referenceUrl.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        setReferenceIds((prev) => [...prev, data.id]);
        setReferenceUrl('');
      }
    } catch {
      // Reference videos are optional
    }
  }

  async function handleGenerate(overrides?: { concept?: string; count?: number; referenceIds?: string[] }) {
    setError('');
    setLoading(true);

    const finalConcept = overrides?.concept ?? concept;
    const finalCount = overrides?.count ?? count;
    const finalRefs = overrides?.referenceIds ?? referenceIds;

    try {
      const body: Record<string, unknown> = {
        search_id: searchId,
        concept: finalConcept.trim() || undefined,
        count: finalCount,
      };

      if (clientId) {
        body.client_id = clientId;
        if (finalRefs.length > 0) body.reference_video_ids = finalRefs;
      }

      const res = await fetch('/api/ideas/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Generation failed');
        setLoading(false);
        return;
      }

      toast.success('Generating ideas in the background');
      handleClose();
      router.push(`/admin/ideas/${data.id}`);
    } catch {
      setError('Something went wrong. Try again.');
      setLoading(false);
    }
  }

  function handleCustomCountChange(val: string) {
    setCustomCount(val);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num >= 1 && num <= 50) {
      setCount(num);
    }
  }

  return (
    <WizardShell
      open={open}
      onClose={handleClose}
      accentColor="#a855f7"
      totalSteps={2}
      currentStep={step}
    >
      {/* Step 1: Select client */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-1">Who are the ideas for?</h2>
        <p className="text-sm text-text-muted mb-5">Select a client or generate without one</p>

        <ClientPickerButton
          clients={clients}
          value={clientId}
          onChange={setClientId}
        />

        <div className="flex justify-end mt-6">
          <GlassButton onClick={() => setStep(2)} className="!text-purple-400 !bg-[rgba(168,85,247,0.12)] !border-[rgba(168,85,247,0.25)] hover:!bg-[rgba(168,85,247,0.2)] hover:!border-[rgba(168,85,247,0.4)] hover:!shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_0_20px_rgba(168,85,247,0.15)] active:!bg-[rgba(168,85,247,0.25)] focus-visible:!ring-purple-500">
            Next &rarr;
          </GlassButton>
        </div>
      </div>

      {/* Step 2: Shape ideas */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-1">Shape your ideas</h2>
        <p className="text-sm text-text-muted mb-5">Optional — skip to generate with defaults</p>

        {/* Concept */}
        <label className="text-xs text-text-muted mb-1.5 block">Concept or direction</label>
        <input
          type="text"
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          placeholder='e.g. "franchise growth", "behind the scenes"'
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 px-4 text-sm text-white placeholder-white/40 focus:border-purple-500/50 focus:outline-none focus-visible:outline-none focus:ring-1 focus:ring-purple-500/50 mb-4"
        />

        {/* Count presets */}
        <label className="text-xs text-text-muted mb-1.5 block">How many ideas?</label>
        <div className="flex items-center gap-2 mb-4">
          {COUNT_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => { setCount(n); setCustomCount(''); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                count === n && !customCount
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08]'
              }`}
            >
              {n}
            </button>
          ))}
          <input
            type="number"
            min={1}
            max={50}
            value={customCount}
            onChange={(e) => handleCustomCountChange(e.target.value)}
            placeholder="#"
            className={`w-16 px-3 py-2 rounded-lg text-sm font-medium text-center transition-colors focus:outline-none ${
              customCount
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                : 'bg-white/[0.04] text-text-muted border border-transparent hover:bg-white/[0.08]'
            }`}
          />
        </div>

        {/* Reference video URL — only when client selected */}
        {clientId && (
          <>
            <label className="text-xs text-text-muted mb-1.5 block">Reference video</label>
            <div className="flex gap-2 mb-2">
              <div className="relative flex-1">
                <LinkIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="url"
                  value={referenceUrl}
                  onChange={(e) => setReferenceUrl(e.target.value)}
                  placeholder="Paste a video URL"
                  className="w-full rounded-lg border border-white/10 bg-white/[0.04] py-2 pl-9 pr-3 text-sm text-white placeholder-white/40 focus:border-purple-500/50 focus:outline-none focus-visible:outline-none focus:ring-1 focus:ring-purple-500/50"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addReference(); } }}
                />
              </div>
              <button
                type="button"
                onClick={addReference}
                disabled={!referenceUrl.trim()}
                className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs text-text-muted hover:bg-white/[0.1] transition-colors disabled:opacity-40"
              >
                Add
              </button>
            </div>
            {referenceIds.length > 0 && (
              <p className="text-xs text-text-muted mb-4">{referenceIds.length} reference{referenceIds.length !== 1 ? 's' : ''} added</p>
            )}
          </>
        )}

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        <div className="flex justify-between mt-4">
          <button
            type="button"
            onClick={() => setStep(1)}
            className="text-sm text-text-muted hover:text-text-secondary transition-colors"
          >
            &larr; Back
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleGenerate({ concept: '', count: 10, referenceIds: [] })}
              disabled={loading}
              className="rounded-xl border border-purple-500/30 px-5 py-2.5 text-sm font-medium text-purple-400 hover:bg-purple-500/10 transition-colors disabled:opacity-40"
            >
              Skip &amp; generate
            </button>
            <GlassButton onClick={() => handleGenerate()} loading={loading} disabled={loading} className="!bg-[rgba(168,85,247,0.12)] !border-[rgba(168,85,247,0.25)] !text-purple-400 hover:!bg-[rgba(168,85,247,0.2)]">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Generating...</> : error ? 'Retry' : 'Generate'}
            </GlassButton>
          </div>
        </div>
      </div>
    </WizardShell>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/research/search-ideas-wizard.tsx
git commit -m "feat: add SearchIdeasWizard component"
```

---

### Task 3: Wire up the wizard in both server and client components

**Files:**
- Modify: `app/admin/search/[id]/page.tsx:33-44` (add clients query)
- Modify: `app/admin/search/[id]/page.tsx:94` (pass clients prop)
- Modify: `app/admin/search/[id]/results-client.tsx:33-37` (props interface)
- Modify: `app/admin/search/[id]/results-client.tsx:133-138` (button)
- Modify: `app/admin/search/[id]/results-client.tsx:1-31` (imports)

- [ ] **Step 1: Fetch clients in the server component**

In `app/admin/search/[id]/page.tsx`, after the `clientInfo` fetch block (after line 44), add:

```typescript
// Fetch all active clients for the ideas wizard picker
const { data: allClients } = await adminClient
  .from('clients')
  .select('id, name, logo_url, agency')
  .eq('is_active', true)
  .order('name');
```

- [ ] **Step 2: Pass clients to ResultsClient**

Update line 94 to pass the new prop:

```typescript
<AdminResultsClient
  search={search as TopicSearch}
  clientInfo={clientInfo}
  recipients={recipients}
  clients={(allClients ?? []).map((c) => ({ id: c.id, name: c.name, logo_url: c.logo_url, agency: c.agency }))}
/>
```

- [ ] **Step 3: Add imports to results-client.tsx**

At the top of `results-client.tsx`, add:

```typescript
import { SearchIdeasWizard } from '@/components/research/search-ideas-wizard';
import type { ClientOption } from '@/components/ui/client-picker';
```

- [ ] **Step 4: Update props interface**

Change `AdminResultsClientProps` (line 33) to include `clients`:

```typescript
interface AdminResultsClientProps {
  search: TopicSearch;
  clientInfo?: { id: string; name: string; slug: string } | null;
  recipients?: Recipient[];
  clients: ClientOption[];
}
```

- [ ] **Step 5: Add state and destructure new prop**

Update the component signature and add wizard state (line 39-43):

```typescript
export function AdminResultsClient({ search, clientInfo, recipients = [], clients }: AdminResultsClientProps) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showIdeasWizard, setShowIdeasWizard] = useState(false);
```

- [ ] **Step 6: Replace the "Create video ideas" Link with a button**

Replace lines 133-138:

```typescript
<Link href={`/admin/ideas?search_id=${search.id}`}>
  <Button variant="outline" size="sm">
    <Sparkles size={14} />
    Create video ideas
  </Button>
</Link>
```

with:

```typescript
<Button variant="outline" size="sm" onClick={() => setShowIdeasWizard(true)}>
  <Sparkles size={14} />
  Create video ideas
</Button>
```

- [ ] **Step 7: Add the wizard component**

After the `<SendReportModal />` (line 241), add:

```typescript
<SearchIdeasWizard
  open={showIdeasWizard}
  onClose={() => setShowIdeasWizard(false)}
  searchId={search.id}
  clientId={search.client_id ?? null}
  clients={clients}
/>
```

- [ ] **Step 8: Commit**

```bash
git add app/admin/search/[id]/page.tsx app/admin/search/[id]/results-client.tsx
git commit -m "feat: wire SearchIdeasWizard into search results page"
```

---

### Task 5: Verify

- [ ] **Step 1: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: Successful build

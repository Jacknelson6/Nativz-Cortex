# Unified Research Hub Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Combine brand research, topic research, and video idea generation into a single page with wizard-driven modals and a unified history feed.

**Architecture:** Evolve the existing `/admin/search/new` page. Replace the `SearchModeSelector` component with a new `ResearchHub` client component that renders two SpotlightCard launch cards and a unified history feed. Each card opens a wizard modal (research or ideas) that walks through inputs step-by-step. The history feed merges `topic_searches` and `idea_generations` into one filterable list.

**Tech Stack:** Next.js 15 App Router, React, motion/react (Framer Motion), Tailwind CSS v4, Supabase, ReactBits SpotlightCard, sonner (toast)

**Spec:** `docs/superpowers/specs/2026-03-12-unified-research-hub-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `components/ui/spotlight-card.tsx` | Create | ReactBits SpotlightCard adapted to project theme |
| `components/ui/client-picker.tsx` | Create | Shared ClientPickerButton + ClientPickerModal (extracted from search-mode-selector.tsx pattern) |
| `components/research/wizard-shell.tsx` | Create | Shared modal shell: backdrop, step progress bar, animated step transitions, close behavior |
| `components/research/research-wizard.tsx` | Create | Research wizard: brand/topic toggle, client picker or URL input, confirm+run |
| `components/research/ideas-wizard.tsx` | Create | Ideas wizard: client picker, concept/count/reference options, generate |
| `components/research/history-feed.tsx` | Create | Unified history list with type/client filters, used both inline and in modal |
| `components/research/history-modal.tsx` | Create | Full history modal wrapper with infinite scroll |
| `components/research/research-hub.tsx` | Create | Main client component: header, two cards, history feed, wizard state management |
| `app/admin/search/new/page.tsx` | Modify | Replace SearchModeSelector with ResearchHub, add idea_generations to data fetch |
| `lib/research/history.ts` | Create | Server-side utility: merged history query across both tables |

---

## Chunk 1: Foundation components

### Task 1: SpotlightCard component

**Files:**
- Create: `components/ui/spotlight-card.tsx`

- [ ] **Step 1: Create SpotlightCard component**

Adapt the ReactBits SpotlightCard to use project theme tokens instead of hardcoded neutral colors.

```tsx
// components/ui/spotlight-card.tsx
'use client';

import { useRef, useState } from 'react';

interface SpotlightCardProps extends React.PropsWithChildren {
  className?: string;
  spotlightColor?: string;
}

export function SpotlightCard({
  children,
  className = '',
  spotlightColor = 'rgba(91, 163, 230, 0.15)',
}: SpotlightCardProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!divRef.current || isFocused) return;
    const rect = divRef.current.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onFocus={() => { setIsFocused(true); setOpacity(0.6); }}
      onBlur={() => { setIsFocused(false); setOpacity(0); }}
      onMouseEnter={() => setOpacity(0.6)}
      onMouseLeave={() => setOpacity(0)}
      className={`relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] transition-colors hover:border-white/[0.12] ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-500 ease-in-out"
        style={{
          opacity,
          background: `radial-gradient(circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 80%)`,
        }}
      />
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Verify it renders**

Add a quick visual check — import into any page temporarily or verify with `npx tsc --noEmit`.

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to spotlight-card

- [ ] **Step 3: Commit**

```bash
git add components/ui/spotlight-card.tsx
git commit -m "feat: add SpotlightCard component from ReactBits"
```

### Task 2: Wizard shell (shared modal with animated steps)

**Files:**
- Create: `components/research/wizard-shell.tsx`

- [ ] **Step 1: Create the wizard shell component**

This is the shared modal that both wizards use. It provides: backdrop with blur, step progress bar, animated slide transitions between steps, escape/backdrop close. Adapted from ReactBits Stepper animation patterns but with custom UI.

```tsx
// components/research/wizard-shell.tsx
'use client';

import { useEffect, useRef, useLayoutEffect, useState, Children, type ReactNode } from 'react';
import { motion, AnimatePresence, type Variants } from 'motion/react';

// ── Step progress bar ──────────────────────────────────────────────────────
function StepBar({ total, current, accentColor }: { total: number; current: number; accentColor: string }) {
  return (
    <div className="flex gap-1.5 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <motion.div
          key={i}
          className="h-1 flex-1 rounded-full"
          animate={{
            backgroundColor: i < current ? accentColor : 'rgba(255,255,255,0.08)',
          }}
          transition={{ duration: 0.3 }}
        />
      ))}
    </div>
  );
}

// ── Slide transition (from ReactBits Stepper) ─────────────────────────────
const stepVariants: Variants = {
  enter: (dir: number) => ({ x: dir >= 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: '0%', opacity: 1 },
  exit: (dir: number) => ({ x: dir >= 0 ? '-50%' : '50%', opacity: 0 }),
};

function SlideTransition({
  children,
  direction,
  onHeightReady,
}: {
  children: ReactNode;
  direction: number;
  onHeightReady: (h: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (ref.current) onHeightReady(ref.current.offsetHeight);
  }, [children, onHeightReady]);

  return (
    <motion.div
      ref={ref}
      custom={direction}
      variants={stepVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ type: 'spring', duration: 0.4, bounce: 0.1 }}
      style={{ position: 'absolute', left: 0, right: 0, top: 0 }}
    >
      {children}
    </motion.div>
  );
}

// ── WizardShell ────────────────────────────────────────────────────────────
interface WizardShellProps {
  open: boolean;
  onClose: () => void;
  accentColor: string;
  totalSteps: number;
  currentStep: number;
  children: ReactNode;
}

export function WizardShell({ open, onClose, accentColor, totalSteps, currentStep, children }: WizardShellProps) {
  const [direction, setDirection] = useState(1);
  const [contentHeight, setContentHeight] = useState(0);
  const prevStep = useRef(currentStep);

  useEffect(() => {
    setDirection(currentStep > prevStep.current ? 1 : -1);
    prevStep.current = currentStep;
  }, [currentStep]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const stepsArray = Children.toArray(children);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-surface shadow-2xl"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
          >
            <div className="p-7">
              <StepBar total={totalSteps} current={currentStep} accentColor={accentColor} />

              {/* Step content with animated height */}
              <motion.div
                style={{ position: 'relative', overflow: 'hidden' }}
                animate={{ height: contentHeight }}
                transition={{ type: 'spring', duration: 0.4, bounce: 0 }}
              >
                <AnimatePresence initial={false} mode="sync" custom={direction}>
                  <SlideTransition
                    key={currentStep}
                    direction={direction}
                    onHeightReady={setContentHeight}
                  >
                    {stepsArray[currentStep - 1]}
                  </SlideTransition>
                </AnimatePresence>
              </motion.div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to wizard-shell

- [ ] **Step 3: Commit**

```bash
git add components/research/wizard-shell.tsx
git commit -m "feat: add wizard shell with animated step transitions"
```

### Task 3: History data utility

**Files:**
- Create: `lib/research/history.ts`

- [ ] **Step 1: Create the merged history query utility**

```tsx
// lib/research/history.ts
import { createAdminClient } from '@/lib/supabase/admin';

export type HistoryItemType = 'brand_intel' | 'topic' | 'ideas';

export interface HistoryItem {
  id: string;
  type: HistoryItemType;
  title: string;
  status: string;
  clientName: string | null;
  clientId: string | null;
  createdAt: string;
  href: string;
}

interface FetchHistoryOptions {
  limit?: number;
  type?: HistoryItemType | null;
  clientId?: string | null;
  cursor?: string | null; // created_at cursor for pagination
}

export async function fetchHistory({
  limit = 10,
  type = null,
  clientId = null,
  cursor = null,
}: FetchHistoryOptions = {}): Promise<HistoryItem[]> {
  const supabase = createAdminClient();
  const items: HistoryItem[] = [];

  // Only fetch searches if type filter allows
  if (!type || type === 'brand_intel' || type === 'topic') {
    let query = supabase
      .from('topic_searches')
      .select('id, query, search_mode, status, created_at, client_id, clients(name)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (cursor) query = query.lt('created_at', cursor);
    if (clientId) query = query.eq('client_id', clientId);
    if (type === 'brand_intel') query = query.eq('search_mode', 'client_strategy');
    if (type === 'topic') query = query.eq('search_mode', 'general');

    const { data: searches } = await query;

    for (const s of searches ?? []) {
      const client = Array.isArray(s.clients) ? s.clients[0] : s.clients;
      items.push({
        id: s.id,
        type: s.search_mode === 'client_strategy' ? 'brand_intel' : 'topic',
        title: s.query,
        status: s.status,
        clientName: (client as { name: string } | null)?.name ?? null,
        clientId: s.client_id,
        createdAt: s.created_at,
        href: `/admin/search/${s.id}`,
      });
    }
  }

  // Only fetch idea generations if type filter allows
  if (!type || type === 'ideas') {
    let query = supabase
      .from('idea_generations')
      .select('id, concept, count, status, created_at, client_id, clients(name)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (cursor) query = query.lt('created_at', cursor);
    if (clientId) query = query.eq('client_id', clientId);

    const { data: generations } = await query;

    for (const g of generations ?? []) {
      const client = Array.isArray(g.clients) ? g.clients[0] : g.clients;
      const concept = g.concept ? `"${g.concept}"` : '';
      items.push({
        id: g.id,
        type: 'ideas',
        title: `${g.count ?? 10} video ideas${concept ? ` — ${concept}` : ''}`,
        status: g.status,
        clientName: (client as { name: string } | null)?.name ?? null,
        clientId: g.client_id,
        createdAt: g.created_at,
        href: `/admin/ideas/${g.id}`,
      });
    }
  }

  // Sort merged list by date, take limit
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return items.slice(0, limit);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to history.ts

- [ ] **Step 3: Commit**

```bash
git add lib/research/history.ts
git commit -m "feat: add merged history query for research hub"
```

---

## Chunk 2: Research wizard

### Task 4: Research wizard component

**Files:**
- Create: `components/research/research-wizard.tsx`

- [ ] **Step 1: Create the research wizard**

Two-step wizard: (1) mode toggle + client/URL input, (2) confirm and run. Reuses the existing `ClientPickerTrigger` pattern from `search-mode-selector.tsx` but extracted into a shared component.

```tsx
// components/research/research-wizard.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Search, Link as LinkIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { WizardShell } from './wizard-shell';
import { GlassButton } from '@/components/ui/glass-button';

interface ClientOption {
  id: string;
  name: string;
  logo_url?: string | null;
  agency?: string | null;
}

interface ResearchWizardProps {
  open: boolean;
  onClose: () => void;
  clients: ClientOption[];
  onStarted?: (item: { id: string; query: string; mode: string; clientName: string | null }) => void;
}

export function ResearchWizard({ open, onClose, clients, onStarted }: ResearchWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<'client_strategy' | 'general'>('client_strategy');
  const [clientId, setClientId] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<'client' | 'url'>('client');
  const [url, setUrl] = useState('');
  const [topicQuery, setTopicQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedClient = clients.find((c) => c.id === clientId);
  const isBrand = mode === 'client_strategy';

  // Determine if step 1 is valid
  const step1Valid = isBrand
    ? (inputMode === 'client' ? !!clientId : url.trim().length > 0)
    : topicQuery.trim().length > 0;

  function reset() {
    setStep(1);
    setMode('client_strategy');
    setClientId(null);
    setInputMode('client');
    setUrl('');
    setTopicQuery('');
    setLoading(false);
    setError('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    setError('');
    setLoading(true);

    try {
      const query = isBrand
        ? (inputMode === 'client' ? selectedClient?.name ?? '' : url.trim())
        : topicQuery.trim();

      const body = {
        query,
        source: 'all',
        time_range: 'last_3_months',
        language: 'all',
        country: 'us',
        client_id: isBrand && inputMode === 'client' ? clientId : null,
        search_mode: mode,
      };

      const res = await fetch('/api/search/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Search failed');
        setLoading(false);
        return;
      }

      // Kick off processing
      fetch(`/api/search/${data.id}/process`, { method: 'POST' }).catch(() => {});

      toast.success('Research started');
      onStarted?.({
        id: data.id,
        query,
        mode,
        clientName: selectedClient?.name ?? null,
      });
      handleClose();
      router.refresh();
    } catch {
      setError('Something went wrong. Try again.');
      setLoading(false);
    }
  }

  // Summary text for step 2
  const summaryLabel = isBrand
    ? (inputMode === 'client' ? `Analyzing ${selectedClient?.name}` : `Analyzing ${url}`)
    : `Researching "${topicQuery}"`;

  return (
    <WizardShell
      open={open}
      onClose={handleClose}
      accentColor="#5ba3e6"
      totalSteps={2}
      currentStep={step}
    >
      {/* Step 1: Mode + target */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-1">What would you like to research?</h2>
        <p className="text-sm text-text-muted mb-5">Choose a mode to get started</p>

        {/* Toggle */}
        <div className="flex bg-white/[0.04] rounded-lg p-1 mb-4">
          <button
            type="button"
            onClick={() => setMode('client_strategy')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              isBrand ? 'bg-accent-surface text-accent-text' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Brand intel
          </button>
          <button
            type="button"
            onClick={() => setMode('general')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              !isBrand ? 'bg-accent-surface text-accent-text' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            Topic research
          </button>
        </div>

        {isBrand ? (
          <>
            {inputMode === 'client' ? (
              <>
                {/* Client picker trigger — reuse existing bento modal pattern */}
                <ClientPickerButton
                  clients={clients}
                  value={clientId}
                  onChange={(id) => { setClientId(id); setUrl(''); }}
                />
                <button
                  type="button"
                  onClick={() => { setInputMode('url'); setClientId(null); }}
                  className="mt-2 block mx-auto text-xs text-accent-text/70 hover:text-accent-text transition-colors"
                >
                  or paste a link instead
                </button>
              </>
            ) : (
              <>
                <div className="relative">
                  <LinkIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-10 pr-4 text-sm text-white placeholder-white/40 focus:border-accent focus:outline-none"
                    autoFocus
                  />
                </div>
                <button
                  type="button"
                  onClick={() => { setInputMode('client'); setUrl(''); }}
                  className="mt-2 block mx-auto text-xs text-accent-text/70 hover:text-accent-text transition-colors"
                >
                  or select a client
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={topicQuery}
                onChange={(e) => setTopicQuery(e.target.value)}
                placeholder="Search a topic..."
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-10 pr-4 text-sm text-white placeholder-white/40 focus:border-accent focus:outline-none"
                autoFocus
              />
            </div>
            <ClientPickerButton
              clients={clients}
              value={clientId}
              onChange={setClientId}
              placeholder="Attach to a client (optional)"
            />
          </>
        )}

        <div className="flex justify-end mt-6">
          <GlassButton onClick={() => setStep(2)} disabled={!step1Valid}>
            Next &rarr;
          </GlassButton>
        </div>
      </div>

      {/* Step 2: Confirm + run */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-1">Ready to go</h2>
        <p className="text-sm text-text-muted mb-6">{summaryLabel}</p>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-surface">
              {isBrand ? <Building2 size={18} className="text-accent-text" /> : <Search size={18} className="text-accent-text" />}
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">
                {isBrand ? (inputMode === 'client' ? selectedClient?.name : url) : topicQuery}
              </p>
              <p className="text-xs text-text-muted">
                {isBrand ? 'Brand intelligence analysis' : 'Topic research'}
                {clientId && !isBrand && selectedClient ? ` · ${selectedClient.name}` : ''}
              </p>
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        <div className="flex justify-between">
          <button
            type="button"
            onClick={() => setStep(1)}
            className="text-sm text-text-muted hover:text-text-secondary transition-colors"
          >
            &larr; Back
          </button>
          <GlassButton onClick={handleSubmit} loading={loading} disabled={loading}>
            {loading ? <><Loader2 size={16} className="animate-spin" /> Running...</> : 'Run research'}
          </GlassButton>
        </div>
      </div>
    </WizardShell>
  );
}

// ── ClientPickerButton ─────────────────────────────────────────────────────
// Simplified trigger that opens the bento client picker modal.
// The modal itself is imported from search-mode-selector or extracted to shared.
// For now, inline a minimal version matching the existing pattern.

function ClientPickerButton({
  clients,
  value,
  onChange,
  placeholder = 'Select a client',
}: {
  clients: ClientOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = clients.find((c) => c.id === value);

  return (
    <>
      {value && selected ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="flex w-full items-center gap-2.5 rounded-xl border border-accent/40 bg-accent-surface/50 px-4 py-3 text-sm font-medium text-accent-text hover:bg-accent-surface/70 transition-colors"
        >
          <Building2 size={16} />
          <span className="flex-1 text-left">{selected.name}</span>
          <svg className="h-3.5 w-3.5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/40 hover:border-white/[0.12] hover:text-white/60 transition-colors"
        >
          <Building2 size={16} />
          <span className="flex-1 text-left">{placeholder}</span>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {open && (
        <ClientPickerModal
          clients={clients}
          value={value}
          onSelect={(id) => { onChange(id); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ── ClientPickerModal ──────────────────────────────────────────────────────
// Extracted from search-mode-selector.tsx — same bento grid pattern.
// NOTE: In implementation, consider extracting this to a shared file
// (components/ui/client-picker-modal.tsx) to avoid duplication with
// search-mode-selector.tsx. For this plan, it's inlined for self-containment.

import { useRef, useEffect } from 'react';

function ClientPickerModal({
  clients,
  value,
  onSelect,
  onClose,
}: {
  clients: ClientOption[];
  value: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const filtered = search.trim()
    ? clients.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : clients;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-xl border border-white/[0.06] bg-surface shadow-2xl animate-modal-pop-in">
        <div className="p-5 pb-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Select a client</h3>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white/60 transition-colors">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients..."
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-colors"
            />
          </div>
        </div>
        <div className="px-5 pb-5 max-h-[50vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Search size={20} className="text-white/30 mb-2" />
              <p className="text-sm text-white/40">No clients match &ldquo;{search}&rdquo;</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filtered.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => onSelect(client.id)}
                  className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left text-sm transition-all hover:scale-[1.02] active:scale-[0.98] ${
                    client.id === value
                      ? 'border-accent/50 bg-accent-surface text-accent-text font-medium shadow-[0_0_12px_rgba(4,107,210,0.15)]'
                      : 'border-white/[0.06] bg-white/[0.03] text-white/70 hover:border-white/[0.12] hover:bg-white/[0.06]'
                  }`}
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg overflow-hidden ${
                    client.id === value ? 'bg-accent/20' : 'bg-white/[0.04]'
                  }`}>
                    {client.logo_url ? (
                      <img src={client.logo_url} alt={client.name} className="h-full w-full object-cover" />
                    ) : (
                      <Building2 size={14} className={client.id === value ? 'text-accent-text' : 'text-white/40'} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-white/90">{client.name}</p>
                    {client.agency && (
                      <p className={`text-[9px] font-bold uppercase tracking-wider ${
                        client.agency.toLowerCase().includes('anderson') || client.agency.toLowerCase() === 'ac'
                          ? 'text-emerald-400' : 'text-blue-400'
                      }`}>
                        {client.agency.toLowerCase().includes('anderson') || client.agency.toLowerCase() === 'ac' ? 'Anderson Collaborative' : 'Nativz'}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/research/research-wizard.tsx
git commit -m "feat: add research wizard with brand/topic toggle"
```

---

## Chunk 3: Ideas wizard

### Task 5: Ideas wizard component

**Files:**
- Create: `components/research/ideas-wizard.tsx`

- [ ] **Step 1: Create the ideas wizard**

Two-step wizard: (1) select client, (2) optional concept/count/references. Uses the same WizardShell and ClientPickerButton/Modal patterns.

```tsx
// components/research/ideas-wizard.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Search, Loader2, Link as LinkIcon, X } from 'lucide-react';
import { toast } from 'sonner';
import { WizardShell } from './wizard-shell';
import { GlassButton } from '@/components/ui/glass-button';

interface ClientOption {
  id: string;
  name: string;
  logo_url?: string | null;
  agency?: string | null;
}

interface IdeasWizardProps {
  open: boolean;
  onClose: () => void;
  clients: ClientOption[];
}

const COUNT_PRESETS = [5, 10, 15, 20] as const;

export function IdeasWizard({ open, onClose, clients }: IdeasWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [clientId, setClientId] = useState<string | null>(null);
  const [concept, setConcept] = useState('');
  const [count, setCount] = useState(10);
  const [referenceUrl, setReferenceUrl] = useState('');
  const [referenceIds, setReferenceIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedClient = clients.find((c) => c.id === clientId);

  function reset() {
    setStep(1);
    setClientId(null);
    setConcept('');
    setCount(10);
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
      // Silently fail — reference videos are optional
    }
  }

  async function handleGenerate() {
    if (!clientId) return;
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/ideas/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          concept: concept.trim() || undefined,
          count,
          reference_video_ids: referenceIds.length > 0 ? referenceIds : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Generation failed');
        setLoading(false);
        return;
      }

      toast.success(`${data.ideas?.length ?? count} ideas generated`);
      handleClose();
      router.push(`/admin/ideas/${data.id}`);
    } catch {
      setError('Something went wrong. Try again.');
      setLoading(false);
    }
  }

  return (
    <WizardShell
      open={open}
      onClose={handleClose}
      accentColor="#eab308"
      totalSteps={2}
      currentStep={step}
    >
      {/* Step 1: Select client */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-1">Who are the ideas for?</h2>
        <p className="text-sm text-text-muted mb-5">Select a client to generate ideas for</p>

        <ClientPickerButton
          clients={clients}
          value={clientId}
          onChange={setClientId}
        />

        <div className="flex justify-end mt-6">
          <GlassButton onClick={() => setStep(2)} disabled={!clientId}>
            Next &rarr;
          </GlassButton>
        </div>
      </div>

      {/* Step 2: Shape ideas (all optional) */}
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
          className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 px-4 text-sm text-white placeholder-white/40 focus:border-accent focus:outline-none mb-4"
        />

        {/* Count presets */}
        <label className="text-xs text-text-muted mb-1.5 block">How many ideas?</label>
        <div className="flex gap-2 mb-4">
          {COUNT_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCount(n)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                count === n
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'bg-white/[0.04] text-text-muted hover:bg-white/[0.08]'
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        {/* Reference video URL */}
        <label className="text-xs text-text-muted mb-1.5 block">Reference video</label>
        <div className="flex gap-2 mb-2">
          <div className="relative flex-1">
            <LinkIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="url"
              value={referenceUrl}
              onChange={(e) => setReferenceUrl(e.target.value)}
              placeholder="Paste a video URL"
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] py-2 pl-9 pr-3 text-sm text-white placeholder-white/40 focus:border-accent focus:outline-none"
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
            <GlassButton
              onClick={() => { setConcept(''); setCount(10); setReferenceIds([]); handleGenerate(); }}
              disabled={loading}
              className="border-yellow-500/30"
            >
              Skip &amp; generate
            </GlassButton>
            <GlassButton onClick={handleGenerate} loading={loading} disabled={loading}>
              {loading ? <><Loader2 size={16} className="animate-spin" /> Generating...</> : 'Generate'}
            </GlassButton>
          </div>
        </div>
      </div>
    </WizardShell>
  );
}

// ── ClientPickerButton + ClientPickerModal ──────────────────────────────────
// Same as research-wizard.tsx — these should be extracted to a shared file
// during implementation. The plan inlines them for clarity but the implementer
// should create components/ui/client-picker.tsx with both components and
// import from there in both wizards.

import { Building2 as B2, Search as S } from 'lucide-react';

function ClientPickerButton({
  clients,
  value,
  onChange,
  placeholder = 'Select a client',
}: {
  clients: ClientOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = clients.find((c) => c.id === value);

  return (
    <>
      {value && selected ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="flex w-full items-center gap-2.5 rounded-xl border border-accent/40 bg-accent-surface/50 px-4 py-3 text-sm font-medium text-accent-text hover:bg-accent-surface/70 transition-colors"
        >
          <Building2 size={16} />
          <span className="flex-1 text-left">{selected.name}</span>
          <X size={14} className="text-white/40" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/40 hover:border-white/[0.12] hover:text-white/60 transition-colors"
        >
          <Building2 size={16} />
          <span className="flex-1 text-left">{placeholder}</span>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {/* NOTE: Implementer should import ClientPickerModal from shared file */}
      {open && (
        <ClientPickerModal
          clients={clients}
          value={value}
          onSelect={(id) => { onChange(id); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ClientPickerModal — same implementation as research-wizard.tsx
// Implementer: extract to components/ui/client-picker.tsx
function ClientPickerModal({ clients, value, onSelect, onClose }: {
  clients: ClientOption[]; value: string | null; onSelect: (id: string) => void; onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { searchRef.current?.focus(); }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h);
  }, [onClose]);
  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);
  const filtered = search.trim() ? clients.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())) : clients;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-xl border border-white/[0.06] bg-surface shadow-2xl animate-modal-pop-in">
        <div className="p-5 pb-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Select a client</h3>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-white/40 hover:bg-white/[0.06] transition-colors">
              <X size={20} />
            </button>
          </div>
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input ref={searchRef} type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search clients..."
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-accent focus:outline-none" />
          </div>
        </div>
        <div className="px-5 pb-5 max-h-[50vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filtered.map((c) => (
              <button key={c.id} type="button" onClick={() => onSelect(c.id)}
                className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left text-sm transition-all hover:scale-[1.02] active:scale-[0.98] ${
                  c.id === value ? 'border-accent/50 bg-accent-surface text-accent-text font-medium' : 'border-white/[0.06] bg-white/[0.03] text-white/70 hover:border-white/[0.12]'
                }`}>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg overflow-hidden ${c.id === value ? 'bg-accent/20' : 'bg-white/[0.04]'}`}>
                  {c.logo_url ? <img src={c.logo_url} alt={c.name} className="h-full w-full object-cover" /> : <Building2 size={14} className={c.id === value ? 'text-accent-text' : 'text-white/40'} />}
                </div>
                <p className="truncate text-white/90">{c.name}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/research/ideas-wizard.tsx
git commit -m "feat: add ideas wizard with concept, count, and reference options"
```

---

## Chunk 4: History feed and hub assembly

### Task 6: (Moved to Chunk 1 as Task 2.5 — see note below)

> **NOTE:** The ClientPicker extraction was moved earlier in the build order. Both wizards import from `components/ui/client-picker.tsx` — the implementer should create this shared component **before** building the wizards (Tasks 4 and 5). Extract `ClientPickerButton`, `ClientPickerModal`, and `ClientOption` interface from the existing `search-mode-selector.tsx` pattern into `components/ui/client-picker.tsx` and export all three. Both wizard files should `import { ClientPickerButton, type ClientOption } from '@/components/ui/client-picker'` instead of inlining these components.

### Task 7: History feed component

**Files:**
- Create: `components/research/history-feed.tsx`

- [ ] **Step 1: Create the history feed component**

Renders the unified history list with type pills and client filter. Accepts data as props (server-fetched). Uses staggered entrance animations.

```tsx
// components/research/history-feed.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, Sparkles, Building2, Clock, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRelativeTime } from '@/lib/utils/format';
import type { HistoryItem, HistoryItemType } from '@/lib/research/history';

interface ClientOption {
  id: string;
  name: string;
}

interface HistoryFeedProps {
  items: HistoryItem[];
  clients: ClientOption[];
  onViewAll?: () => void;
}

const TYPE_FILTERS: { label: string; value: HistoryItemType | null }[] = [
  { label: 'All', value: null },
  { label: 'Brand intel', value: 'brand_intel' },
  { label: 'Topic', value: 'topic' },
  { label: 'Ideas', value: 'ideas' },
];

const TYPE_BADGE_CONFIG: Record<HistoryItemType, { variant: 'purple' | 'default' | 'warning'; label: string }> = {
  brand_intel: { variant: 'purple', label: 'Brand intel' },
  topic: { variant: 'default', label: 'Topic' },
  ideas: { variant: 'warning', label: 'Ideas' },
};

function TypeIcon({ type }: { type: HistoryItemType }) {
  if (type === 'ideas') return <Sparkles size={14} className="text-yellow-400 shrink-0" />;
  if (type === 'brand_intel') return <Building2 size={14} className="text-purple-400 shrink-0" />;
  return <Search size={14} className="text-text-muted shrink-0" />;
}

export function HistoryFeed({ items, clients, onViewAll }: HistoryFeedProps) {
  const [typeFilter, setTypeFilter] = useState<HistoryItemType | null>(null);
  const [clientFilter, setClientFilter] = useState<string | null>(null);

  const filtered = items.filter((item) => {
    if (typeFilter && item.type !== typeFilter) return false;
    if (clientFilter && item.clientId !== clientFilter) return false;
    return true;
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <Clock size={18} className="text-accent-text" />
          Recent history
        </h2>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-sm text-text-muted hover:text-text-secondary transition-colors"
          >
            View all history
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        {/* Type pills */}
        <div className="flex bg-white/[0.04] rounded-lg p-0.5 gap-0.5">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setTypeFilter(f.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                typeFilter === f.value
                  ? 'bg-white/[0.08] text-text-primary'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Client filter */}
        <select
          value={clientFilter ?? ''}
          onChange={(e) => setClientFilter(e.target.value || null)}
          className="ml-auto rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-text-muted focus:outline-none focus:border-accent"
        >
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Items */}
      {filtered.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-8">No results yet</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((item, index) => {
            const badge = TYPE_BADGE_CONFIG[item.type];
            const isProcessing = item.status === 'processing' || item.status === 'pending';

            const content = (
              <Card
                interactive={!isProcessing}
                className={`flex items-center justify-between py-3 px-4 animate-stagger-in ${isProcessing ? 'opacity-70' : ''}`}
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <TypeIcon type={item.type} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-text-primary truncate">{item.title}</p>
                      <Badge variant={badge.variant} className="text-[10px] px-1.5 py-0">{badge.label}</Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-text-muted flex items-center gap-1">
                        <Clock size={10} />
                        {formatRelativeTime(item.createdAt)}
                      </span>
                      {item.clientName && (
                        <span className="text-[11px] text-text-muted flex items-center gap-1">
                          <Building2 size={10} />
                          {item.clientName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {isProcessing && <Loader2 size={16} className="animate-spin text-text-muted shrink-0" />}
                {item.status === 'failed' && <Badge variant="danger">Failed</Badge>}
              </Card>
            );

            if (isProcessing) return <div key={item.id}>{content}</div>;
            return <Link key={item.id} href={item.href}>{content}</Link>;
          })}
        </div>
      )}
    </div>
  );
}
```

Note: The `Badge` component may need a `'warning'` variant added for the amber/yellow Ideas badge. Check during implementation — if it doesn't exist, add it to `components/ui/badge.tsx` with `bg-yellow-500/15 text-yellow-400` styling.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors (may need to add warning variant to Badge)

- [ ] **Step 3: Commit**

```bash
git add components/research/history-feed.tsx
git commit -m "feat: add unified history feed with type and client filters"
```

### Task 8: History modal

**Files:**
- Create: `components/research/history-modal.tsx`

- [ ] **Step 1: Create history modal**

Full-screen modal for viewing all history with infinite scroll. Fetches paginated data client-side.

```tsx
// components/research/history-modal.tsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import { HistoryFeed } from './history-feed';
import type { HistoryItem, HistoryItemType } from '@/lib/research/history';

interface ClientOption {
  id: string;
  name: string;
}

interface HistoryModalProps {
  open: boolean;
  onClose: () => void;
  initialItems: HistoryItem[];
  clients: ClientOption[];
}

export function HistoryModal({ open, onClose, initialItems, clients }: HistoryModalProps) {
  // Escape to close
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[80vh] rounded-xl border border-white/[0.06] bg-surface shadow-2xl animate-modal-pop-in flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-0">
          <h2 className="text-lg font-semibold text-text-primary">All history</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white/60 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-5">
          <HistoryFeed items={initialItems} clients={clients} />
        </div>
      </div>
    </div>
  );
}
```

Note: For v1, the server component passes up to 50 items (update `fetchHistory({ limit: 50 })` in the page for the modal data). Full infinite scroll with cursor-based pagination is a fast-follow once history volume warrants it — the `fetchHistory` utility already supports the `cursor` parameter.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add components/research/history-modal.tsx
git commit -m "feat: add full history modal with close behavior"
```

### Task 9: ResearchHub main component

**Files:**
- Create: `components/research/research-hub.tsx`

- [ ] **Step 1: Create the main hub component**

Orchestrates everything: two SpotlightCards, wizard state, history feed, history modal.

```tsx
// components/research/research-hub.tsx
'use client';

import { useState } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { ResearchWizard } from './research-wizard';
import { IdeasWizard } from './ideas-wizard';
import { HistoryFeed } from './history-feed';
import { HistoryModal } from './history-modal';
import type { HistoryItem } from '@/lib/research/history';
import type { ClientOption } from '@/components/ui/client-picker';

interface ResearchHubProps {
  clients: ClientOption[];
  historyItems: HistoryItem[];
}

export function ResearchHub({ clients, historyItems }: ResearchHubProps) {
  const [researchOpen, setResearchOpen] = useState(false);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [optimisticItems, setOptimisticItems] = useState<HistoryItem[]>([]);

  // Merge optimistic items with server-fetched items
  const allItems = [...optimisticItems, ...historyItems];

  return (
    <div className="p-6 space-y-12">
      {/* Header + Cards */}
      <div className="flex flex-col items-center justify-center pt-8">
        <div className="w-full max-w-3xl">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-white">What would you like to research today?</h1>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Research card */}
            <SpotlightCard spotlightColor="rgba(91, 163, 230, 0.15)" className="p-7">
              <button
                type="button"
                onClick={() => setResearchOpen(true)}
                className="w-full text-left"
              >
                <div className="flex flex-col items-center text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-surface mb-3">
                    <Search size={18} className="text-accent-text" />
                  </div>
                  <h2 className="text-base font-semibold text-text-primary mb-1">Research</h2>
                  <p className="text-sm text-text-muted mb-5">
                    What are people saying about a brand or topic?
                  </p>
                  <div className="w-full rounded-xl bg-accent-surface/50 border border-accent/25 py-2.5 text-center">
                    <span className="text-sm font-semibold text-accent-text">Start research</span>
                  </div>
                </div>
              </button>
            </SpotlightCard>

            {/* Ideas card */}
            <SpotlightCard spotlightColor="rgba(234, 179, 8, 0.15)" className="p-7">
              <button
                type="button"
                onClick={() => setIdeasOpen(true)}
                className="w-full text-left"
              >
                <div className="flex flex-col items-center text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-500/10 mb-3">
                    <Sparkles size={18} className="text-yellow-400" />
                  </div>
                  <h2 className="text-base font-semibold text-text-primary mb-1">Video ideas</h2>
                  <p className="text-sm text-text-muted mb-5">
                    Generate content ideas powered by AI + knowledge
                  </p>
                  <div className="w-full rounded-xl bg-yellow-500/10 border border-yellow-500/25 py-2.5 text-center">
                    <span className="text-sm font-semibold text-yellow-400">Generate ideas</span>
                  </div>
                </div>
              </button>
            </SpotlightCard>
          </div>
        </div>
      </div>

      {/* History feed */}
      <div className="max-w-3xl mx-auto w-full">
        <HistoryFeed
          items={allItems}
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          onViewAll={() => setHistoryModalOpen(true)}
        />
      </div>

      {/* Wizards */}
      <ResearchWizard
        open={researchOpen}
        onClose={() => setResearchOpen(false)}
        clients={clients}
        onStarted={(item) => {
          setOptimisticItems((prev) => [{
            id: item.id,
            type: item.mode === 'client_strategy' ? 'brand_intel' as const : 'topic' as const,
            title: item.query,
            status: 'processing',
            clientName: item.clientName,
            clientId: null,
            createdAt: new Date().toISOString(),
            href: `/admin/search/${item.id}`,
          }, ...prev]);
        }}
      />
      <IdeasWizard
        open={ideasOpen}
        onClose={() => setIdeasOpen(false)}
        clients={clients}
      />

      {/* History modal */}
      <HistoryModal
        open={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        initialItems={historyItems}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add components/research/research-hub.tsx
git commit -m "feat: add ResearchHub main component with cards, wizards, and history"
```

### Task 10: Update the page server component

**Files:**
- Modify: `app/admin/search/new/page.tsx`

- [ ] **Step 1: Replace SearchModeSelector with ResearchHub**

Update the server component to fetch both search history and idea generations, merge them, and pass to the new `ResearchHub` component.

```tsx
// app/admin/search/new/page.tsx
import { createAdminClient } from '@/lib/supabase/admin';
import { getVaultClients } from '@/lib/vault/reader';
import { ResearchHub } from '@/components/research/research-hub';
import { fetchHistory } from '@/lib/research/history';

export default async function AdminNewSearchPage() {
  const supabase = createAdminClient();

  // Fetch clients with logos and agencies
  const [vaultClients, { data: dbClients }] = await Promise.all([
    getVaultClients(),
    supabase
      .from('clients')
      .select('id, slug, logo_url, is_active')
      .eq('is_active', true),
  ]);

  const clients = (dbClients || []).map((db) => {
    const vault = vaultClients.find((v) => v.slug === db.slug);
    return {
      id: db.id,
      name: vault?.name || db.slug,
      logo_url: db.logo_url,
      agency: vault?.agency,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  // Fetch merged history
  const historyItems = await fetchHistory({ limit: 10 });

  return <ResearchHub clients={clients} historyItems={historyItems} />;
}
```

- [ ] **Step 2: Type-check and run dev server**

Run: `npx tsc --noEmit 2>&1 | head -20`
Then: `npm run dev` — navigate to `/admin/search/new` and verify:
- Two cards render with spotlight hover effect
- Clicking "Start research" opens research wizard
- Clicking "Generate ideas" opens ideas wizard
- History feed shows merged searches + idea generations
- Wizard step transitions animate smoothly
- Research wizard submits and closes, toast appears
- Ideas wizard submits and redirects to results page

- [ ] **Step 3: Commit**

```bash
git add app/admin/search/new/page.tsx
git commit -m "feat: wire up unified research hub page"
```

### Task 11: Add warning Badge variant (if needed)

**Files:**
- Modify: `components/ui/badge.tsx` (only if `warning` variant doesn't exist)

- [ ] **Step 1: Check Badge variants**

Read `components/ui/badge.tsx` and check if a `warning` or `yellow` variant exists.

**If variant exists:** Skip to Task 12.

**If variant does NOT exist:** Add to the variant map:

```tsx
warning: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
```

- [ ] **Step 2: Commit (only if changed)**

```bash
git add components/ui/badge.tsx
git commit -m "feat: add warning variant to Badge component"
```

### Task 12: Final verification

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors in app code

- [ ] **Step 2: Lint check**

Run: `npm run lint`
Expected: No new warnings/errors

- [ ] **Step 3: Visual verification**

Open `http://localhost:3000/admin/search/new` and verify:
1. Two SpotlightCards with hover effect
2. Research wizard: toggle works, client picker opens, URL swap works, submit creates search
3. Ideas wizard: client picker, concept input, count presets, generate submits and redirects
4. History feed: shows mixed items, type pills filter correctly, client dropdown filters
5. "View all history" opens modal with X close
6. Animations: smooth step transitions, staggered list entrance, modal open/close

- [ ] **Step 4: Final commit**

```bash
git add components/research/ components/ui/spotlight-card.tsx components/ui/client-picker.tsx components/ui/badge.tsx lib/research/ app/admin/search/new/page.tsx
git commit -m "feat: unified research hub — complete implementation"
```

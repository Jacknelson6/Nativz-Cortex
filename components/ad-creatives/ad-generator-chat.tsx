'use client';

import { useCallback, useRef, useState } from 'react';
import Image from 'next/image';
import {
  Loader2,
  Minus,
  Plus,
  Lightbulb,
  ArrowRight,
  Image as ImageIcon,
  Video,
  Layers,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { AdConcept } from './ad-concept-gallery';
import type { AdAgentEvent } from '@/lib/ad-creatives/ad-agent';
import { parseSseFrames } from '@/lib/ad-creatives/parse-sse-frames';

const SETTINGS_PATH = '/admin/settings';
const DISPLAY_FONT = 'var(--font-nz-display), system-ui, sans-serif';

const COUNT_MIN = 1;
const COUNT_MAX = 30;
const COUNT_DEFAULT = 20;

const SUGGESTIONS: ReadonlyArray<string> = [
  'This month’s 20 gift ads. Match the brand to proven reference ads, then vary testimonial, offer, comparison, and problem-solution angles.',
  'Polished monthly drop for client review. Lean on Brand DNA + Cortex memory; borrow only the layout mechanics from the reference library.',
  'Focus on the current offer. Keep the batch diverse, render each concept with ChatGPT Image, and queue everything to the gallery for approval.',
];

type FriendlyError = {
  assistant: string;
  toast: string;
};

function friendlyErrorFor(
  code: string | undefined,
  fallback: string,
): FriendlyError {
  switch (code) {
    case 'openai_key_missing':
      return {
        assistant: `OpenAI API key isn’t set. Add it in Cortex settings → AI credentials (${SETTINGS_PATH}) and try the brief again.`,
        toast: 'Set your OpenAI API key in settings → AI credentials.',
      };
    case 'openai_auth_failed':
      return {
        assistant: `OpenAI rejected the API key. Check that the key in Cortex settings → AI credentials (${SETTINGS_PATH}) is current and has image-generation access.`,
        toast: 'OpenAI rejected the key. Update it in settings.',
      };
    case 'openai_quota_exhausted':
      return {
        assistant:
          'OpenAI account is out of credits. Top up billing at platform.openai.com/billing, then retry the brief — no concepts were charged.',
        toast: 'OpenAI is out of credits. Top up billing.',
      };
    case 'openai_rate_limited':
      return {
        assistant:
          'OpenAI is rate-limiting image requests right now. Wait a minute and retry — partial concepts may have rendered.',
        toast: 'OpenAI rate-limited. Wait and retry.',
      };
    case 'openai_content_blocked':
      return {
        assistant:
          'OpenAI’s content policy blocked one of the prompts. Soften the brief (avoid sensitive claims, real people, or specific brands) and retry.',
        toast: 'Content policy blocked the prompt.',
      };
    case 'openai_bad_request':
      return {
        assistant: `OpenAI rejected the request format. ${fallback}`,
        toast: 'OpenAI rejected the request.',
      };
    case 'openai_timeout':
      return {
        assistant:
          'Image generation timed out. The brief is fine — OpenAI just took too long. Retry to pick up where it left off.',
        toast: 'Image generation timed out. Retry.',
      };
    case 'concept_not_found':
      return {
        assistant: 'That concept no longer exists. It may have been deleted from the gallery.',
        toast: 'Concept not found.',
      };
    case 'concept_no_prompt':
      return {
        assistant:
          'That concept has no image prompt to render. Edit the concept and add an image prompt before regenerating.',
        toast: 'Concept has no image prompt.',
      };
    default:
      return { assistant: fallback, toast: fallback.slice(0, 120) };
  }
}

interface LiveStream {
  narration: string;
  activity: string | null;
  progress: { current: number; total: number; slug: string | null } | null;
  failures: number;
}

interface Props {
  clientId: string;
  clientName: string;
  clientLogoUrl?: string | null;
  onBatchComplete: (concepts: AdConcept[]) => void;
  onConceptsChanged: (updated: AdConcept[], deletedIds: string[]) => void;
}

/**
 * Floating composer for the ad generator. The full-page transcript is gone;
 * what remains is a centered card that mimics a creative-tool generate bar
 * — format pills, brand avatar, suggestions popover, count stepper, and a
 * single Generate CTA. While a brief is in flight, a live status panel
 * slides in above the composer and is replaced by a final toast when the
 * batch completes.
 */
export function AdGeneratorChat({
  clientId,
  clientName,
  clientLogoUrl = null,
  onBatchComplete,
  onConceptsChanged,
}: Props) {
  const [input, setInput] = useState('');
  const [count, setCount] = useState(COUNT_DEFAULT);
  const [submitting, setSubmitting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [liveStream, setLiveStream] = useState<LiveStream | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const trimmed = input.trim();
  const isCommand = trimmed.startsWith('/');
  const canSubmit = trimmed.length > 0 && !submitting;

  const incCount = useCallback(() => setCount((c) => Math.min(c + 1, COUNT_MAX)), []);
  const decCount = useCallback(() => setCount((c) => Math.max(c - 1, COUNT_MIN)), []);

  const handleSubmit = useCallback(async () => {
    const value = input.trim();
    if (value.length < 1) return;

    setSubmitting(true);
    setShowSuggestions(false);
    try {
      if (value.startsWith('/')) {
        const res = await fetch('/api/ad-creatives/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, input: value }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: string; code?: string }
            | null;
          const fallback = body?.error ?? `Command failed (${res.status})`;
          const friendly = friendlyErrorFor(body?.code, fallback);
          toast.error(friendly.toast);
          return;
        }
        const data = (await res.json()) as {
          summary: string;
          affectedConcepts: AdConcept[];
        };
        if (data.affectedConcepts.length > 0) {
          const deletedIds = data.affectedConcepts
            .filter((c) => (c as { status?: unknown }).status === 'deleted')
            .map((c) => (c as { id: string }).id);
          const updated = data.affectedConcepts.filter(
            (c) => (c as { status?: unknown }).status !== 'deleted',
          ) as AdConcept[];
          onConceptsChanged(updated, deletedIds);
        }
        toast.success(data.summary.slice(0, 120));
        setInput('');
        return;
      }

      // Brief → SSE stream from the agent run
      setLiveStream({
        narration: '',
        activity: 'Starting agent…',
        progress: null,
        failures: 0,
      });

      const res = await fetch('/api/ad-creatives/agent-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, prompt: value, count }),
      });
      if (!res.ok || !res.body) {
        setLiveStream(null);
        const body = (await res.json().catch(() => null)) as
          | { error?: string; code?: string }
          | null;
        const fallback = body?.error ?? `Generation failed (${res.status})`;
        const friendly = friendlyErrorFor(body?.code, fallback);
        toast.error(friendly.toast);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let lastNarration = '';
      // These vars are mutated inside `handleEvent` (a closure). TS flow
      // analysis can't see those writes, so reads after the SSE loop narrow
      // back to `null`. Annotate as a wider union and cast on read.
      type BatchComplete = Extract<AdAgentEvent, { type: 'batch_complete' }>;
      type BatchError = { code: string; message: string };
      let finalEvent: BatchComplete | null = null;
      let terminalError: BatchError | null = null;

      const handleEvent = (event: AdAgentEvent) => {
        switch (event.type) {
          case 'agent_started':
            setLiveStream({
              narration: '',
              activity: 'Reading the brief…',
              progress: null,
              failures: 0,
            });
            break;
          case 'tool_started':
            setLiveStream((prev) => ({
              narration: prev?.narration ?? '',
              activity: event.label,
              progress: prev?.progress ?? null,
              failures: prev?.failures ?? 0,
            }));
            break;
          case 'context_loaded':
            setLiveStream((prev) => ({
              narration: prev?.narration ?? '',
              activity: `Matched ${event.referenceAdCount} reference ad${event.referenceAdCount === 1 ? '' : 's'} for ${event.brandName}.`,
              progress: prev?.progress ?? null,
              failures: prev?.failures ?? 0,
            }));
            break;
          case 'concepts_composed':
            setLiveStream((prev) => ({
              narration: prev?.narration ?? '',
              activity: `Composed ${event.concepts.length} concept${event.concepts.length === 1 ? '' : 's'}. Rendering…`,
              progress: { current: 0, total: event.concepts.length, slug: null },
              failures: prev?.failures ?? 0,
            }));
            break;
          case 'concept_rendering':
            setLiveStream((prev) => ({
              narration: prev?.narration ?? '',
              activity: 'Rendering image',
              progress: {
                current: Math.max(event.index - 1, 0),
                total: event.total,
                slug: event.slug,
              },
              failures: prev?.failures ?? 0,
            }));
            break;
          case 'concept_rendered':
            setLiveStream((prev) => ({
              narration: prev?.narration ?? '',
              activity: 'Rendering image',
              progress: {
                current: event.index,
                total: event.total,
                slug: event.concept.slug,
              },
              failures: prev?.failures ?? 0,
            }));
            break;
          case 'concept_render_failed':
            setLiveStream((prev) => ({
              narration: prev?.narration ?? '',
              activity: `Skipped ${event.slug}: ${event.message}`,
              progress: prev?.progress
                ? { ...prev.progress, current: event.index }
                : null,
              failures: (prev?.failures ?? 0) + 1,
            }));
            break;
          case 'agent_message':
            lastNarration = event.text;
            setLiveStream((prev) => ({
              narration: event.text,
              activity: prev?.activity ?? null,
              progress: prev?.progress ?? null,
              failures: prev?.failures ?? 0,
            }));
            break;
          case 'batch_complete':
            finalEvent = event;
            break;
          case 'batch_error':
            terminalError = { code: event.code, message: event.message };
            break;
          case 'tool_finished':
            setLiveStream((prev) => ({
              narration: prev?.narration ?? '',
              activity: null,
              progress: prev?.progress ?? null,
              failures: prev?.failures ?? 0,
            }));
            break;
        }
      };

      try {
        while (true) {
          const { value: chunk, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(chunk, { stream: true });
          const { events, rest } = parseSseFrames<AdAgentEvent>(buffer);
          buffer = rest;
          for (const event of events) handleEvent(event);
        }
      } finally {
        setLiveStream(null);
      }

      const error = terminalError as BatchError | null;
      if (error) {
        const friendly = friendlyErrorFor(error.code, error.message);
        toast.error(friendly.toast);
        return;
      }

      const final = finalEvent as BatchComplete | null;
      if (final) {
        onBatchComplete(final.concepts as AdConcept[]);
        const summary = lastNarration || final.summary;
        toast.success(
          `Generated ${final.concepts.length} ad${final.concepts.length === 1 ? '' : 's'}${final.status === 'partial' ? ' (partial)' : ''}.`,
          { description: summary.slice(0, 140) },
        );
        setInput('');
        return;
      }

      toast.error('Stream closed unexpectedly.');
    } finally {
      setSubmitting(false);
    }
  }, [input, clientId, count, onBatchComplete, onConceptsChanged]);

  return (
    <div className="space-y-3">
      {liveStream && <LiveStreamCard stream={liveStream} />}

      {showSuggestions && !submitting && (
        <SuggestionsPanel
          onPick={(p) => {
            setInput(p);
            setShowSuggestions(false);
            requestAnimationFrame(() => textareaRef.current?.focus());
          }}
          onClose={() => setShowSuggestions(false)}
        />
      )}

      <div className="overflow-hidden rounded-2xl border border-nativz-border bg-surface/95 shadow-elevated backdrop-blur-md">
        {/* Top row — format pills + suggestions toggle */}
        <div className="flex items-center justify-between gap-3 border-b border-nativz-border/50 px-3.5 py-2.5">
          <FormatPills />
          <button
            type="button"
            onClick={() => setShowSuggestions((v) => !v)}
            aria-pressed={showSuggestions}
            className={`inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[11px] font-medium transition-colors ${
              showSuggestions
                ? 'border-accent/40 bg-accent/10 text-accent-text'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            <Lightbulb size={12} />
            Suggestions
          </button>
        </div>

        {/* Middle row — brand avatar + textarea */}
        <div className="flex items-start gap-3 px-3.5 py-3">
          <BrandAvatar logoUrl={clientLogoUrl} name={clientName} />
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            rows={1}
            disabled={submitting}
            placeholder={
              isCommand
                ? 'Slash command…'
                : `Describe this drop for ${clientName || 'this brand'}…`
            }
            className="min-h-[40px] w-full resize-none bg-transparent py-1.5 text-[14px] leading-relaxed text-text-primary placeholder:text-text-muted/70 focus:outline-none disabled:cursor-not-allowed"
            style={{ maxHeight: 200 }}
          />
        </div>

        {/* Bottom row — count stepper + Generate CTA */}
        <div className="flex items-center justify-between gap-3 border-t border-nativz-border/50 bg-background/40 px-3.5 py-2.5">
          {isCommand ? (
            <span
              className="text-[11px] italic text-text-muted"
              style={{ fontFamily: DISPLAY_FONT }}
            >
              Slash command — runs against {clientName || 'this brand'}.
            </span>
          ) : (
            <CountStepper
              value={count}
              onInc={incCount}
              onDec={decCount}
              disabled={submitting}
            />
          )}
          <GenerateButton
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            count={isCommand ? null : count}
            submitting={submitting}
            isCommand={isCommand}
          />
        </div>
      </div>

      <p className="text-center font-mono text-[10px] uppercase tracking-wider text-text-muted/60">
        ⌘↵ to send · /help for slash commands
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

const FORMAT_OPTIONS: ReadonlyArray<{
  id: 'image' | 'video' | 'carousel';
  label: string;
  Icon: typeof ImageIcon;
  available: boolean;
}> = [
  { id: 'image', label: 'Image', Icon: ImageIcon, available: true },
  { id: 'video', label: 'Video', Icon: Video, available: false },
  { id: 'carousel', label: 'Carousel', Icon: Layers, available: false },
];

function FormatPills() {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-background/60 p-0.5">
      {FORMAT_OPTIONS.map(({ id, label, Icon, available }) => {
        const active = id === 'image';
        const className = active
          ? 'bg-surface text-text-primary shadow-sm ring-1 ring-nativz-border/60'
          : available
            ? 'text-text-muted hover:text-text-primary'
            : 'cursor-not-allowed text-text-muted/40';
        return (
          <button
            key={id}
            type="button"
            disabled={!available}
            title={available ? label : `${label} — coming soon`}
            className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium transition-colors ${className}`}
          >
            <Icon size={12} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function BrandAvatar({
  logoUrl,
  name,
}: {
  logoUrl: string | null;
  name: string;
}) {
  const initials = name.trim().slice(0, 2).toUpperCase() || 'NZ';
  return (
    <span className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-nativz-border/60">
      {logoUrl ? (
        <Image
          src={logoUrl}
          alt={name}
          width={32}
          height={32}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="bg-accent/15 text-[10px] font-semibold uppercase tracking-wider text-accent-text">
          {initials}
        </span>
      )}
    </span>
  );
}

function CountStepper({
  value,
  onInc,
  onDec,
  disabled,
}: {
  value: number;
  onInc: () => void;
  onDec: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface px-1 py-1">
      <StepButton onClick={onDec} disabled={disabled || value <= COUNT_MIN} label="Decrease count">
        <Minus size={11} />
      </StepButton>
      <span className="min-w-[2ch] text-center font-mono text-[11px] tabular-nums text-text-primary">
        {String(value).padStart(2, '0')}
      </span>
      <StepButton onClick={onInc} disabled={disabled || value >= COUNT_MAX} label="Increase count">
        <Plus size={11} />
      </StepButton>
      <span className="ml-1.5 mr-1 text-[10px] uppercase tracking-wider text-text-muted/70">
        ads
      </span>
    </div>
  );
}

function StepButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function GenerateButton({
  onClick,
  disabled,
  count,
  submitting,
  isCommand,
}: {
  onClick: () => void;
  disabled: boolean;
  count: number | null;
  submitting: boolean;
  isCommand: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full bg-accent px-4 text-[13px] font-semibold text-white transition-colors hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {submitting ? (
        <Loader2 size={13} className="animate-spin" />
      ) : isCommand ? (
        <Sparkles size={13} />
      ) : (
        <ArrowRight size={13} />
      )}
      {submitting ? 'Working…' : isCommand ? 'Run' : 'Generate'}
      {!isCommand && count !== null && (
        <span className="ml-0.5 inline-flex h-5 min-w-[1.75rem] items-center justify-center rounded-full bg-white/15 px-1.5 font-mono text-[10px] font-medium tabular-nums">
          {String(count).padStart(2, '0')}
        </span>
      )}
    </button>
  );
}

function SuggestionsPanel({
  onPick,
  onClose,
}: {
  onPick: (p: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-nativz-border bg-surface shadow-elevated">
      <div className="flex items-center justify-between border-b border-nativz-border/50 px-4 py-2.5">
        <span
          className="text-[11px] italic tracking-wide text-text-muted"
          style={{ fontFamily: DISPLAY_FONT }}
        >
          Direction starters
        </span>
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
          aria-label="Close suggestions"
        >
          <X size={12} />
        </button>
      </div>
      <ul>
        {SUGGESTIONS.map((p) => (
          <li key={p}>
            <button
              type="button"
              onClick={() => onPick(p)}
              className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left text-[13px] leading-relaxed text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              <span aria-hidden className="mt-1 select-none text-text-muted/40">
                —
              </span>
              <span>{p}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LiveStreamCard({ stream }: { stream: LiveStream }) {
  const pct = stream.progress
    ? Math.min(
        100,
        Math.round(
          (stream.progress.current / Math.max(stream.progress.total, 1)) * 100,
        ),
      )
    : 0;
  return (
    <div className="space-y-2 rounded-2xl border border-accent/30 bg-surface/95 px-4 py-3 shadow-elevated backdrop-blur-md">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent"
        />
        <span
          className="text-[11px] italic tracking-wide text-accent-text"
          style={{ fontFamily: DISPLAY_FONT }}
        >
          Cortex · drafting
        </span>
        {stream.progress && (
          <span className="ml-auto font-mono text-[10px] tabular-nums text-text-muted">
            {String(stream.progress.current).padStart(2, '0')} /{' '}
            {String(stream.progress.total).padStart(2, '0')}
            {stream.failures > 0 && (
              <span className="ml-2 text-red-400/80">
                · {stream.failures} skipped
              </span>
            )}
          </span>
        )}
      </div>
      {stream.narration && (
        <p className="line-clamp-2 text-[13px] leading-relaxed text-text-secondary">
          {stream.narration}
        </p>
      )}
      {stream.activity && (
        <p
          className="text-[11px] italic text-text-muted"
          style={{ fontFamily: DISPLAY_FONT }}
        >
          {stream.activity}
        </p>
      )}
      {stream.progress && (
        <div className="h-px w-full overflow-hidden bg-nativz-border/50">
          <div
            className="h-full bg-accent transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

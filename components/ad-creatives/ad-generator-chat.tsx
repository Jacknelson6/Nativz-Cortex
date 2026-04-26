'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AdConcept } from './ad-concept-gallery';
import { CHAT_COMMAND_HELP } from '@/lib/ad-creatives/chat-commands';
import type { AdAgentEvent } from '@/lib/ad-creatives/ad-agent';
import { parseSseFrames } from '@/lib/ad-creatives/parse-sse-frames';

// Maps the wire-format codes from /api/ad-creatives/{generate,command,
// concepts/[id]/render} into a friendly assistant slip + a short toast. The
// goal is that whichever surface hits an OpenAI wall, the operator gets the
// same actionable instruction ("set your key", "top up billing"). Anything
// not in this map falls back to the raw provider message.
type FriendlyError = {
  /** Multi-line markdown-ish string for the assistant transcript slip. */
  assistant: string;
  /** Short single-line for the toast. */
  toast: string;
};

const SETTINGS_PATH = '/admin/settings';

function friendlyErrorFor(
  code: string | undefined,
  fallback: string,
): FriendlyError {
  switch (code) {
    case 'openai_key_missing':
      return {
        assistant: `OpenAI API key isn't set. Add it in Cortex settings → AI credentials (${SETTINGS_PATH}) and try the brief again.`,
        toast: 'Set your OpenAI API key in settings → AI credentials.',
      };
    case 'openai_auth_failed':
      return {
        assistant: `OpenAI rejected the API key. Check that the key in Cortex settings → AI credentials (${SETTINGS_PATH}) is current and has image-generation access.`,
        toast: 'OpenAI rejected the key. Update it in settings.',
      };
    case 'openai_quota_exhausted':
      return {
        assistant: `OpenAI account is out of credits. Top up billing at platform.openai.com/billing, then retry the brief — no concepts were charged.`,
        toast: 'OpenAI is out of credits. Top up billing.',
      };
    case 'openai_rate_limited':
      return {
        assistant: `OpenAI is rate-limiting image requests right now. Wait a minute and retry — partial concepts may have rendered.`,
        toast: 'OpenAI rate-limited. Wait and retry.',
      };
    case 'openai_content_blocked':
      return {
        assistant: `OpenAI's content policy blocked one of the prompts. Soften the brief (avoid sensitive claims, real people, or specific brands) and retry.`,
        toast: 'Content policy blocked the prompt.',
      };
    case 'openai_bad_request':
      return {
        assistant: `OpenAI rejected the request format. ${fallback}`,
        toast: 'OpenAI rejected the request.',
      };
    case 'openai_timeout':
      return {
        assistant: `Image generation timed out. The brief is fine — OpenAI just took too long. Retry to pick up where it left off.`,
        toast: 'Image generation timed out. Retry.',
      };
    case 'concept_not_found':
      return {
        assistant: `That concept no longer exists. It may have been deleted from the gallery.`,
        toast: 'Concept not found.',
      };
    case 'concept_no_prompt':
      return {
        assistant: `That concept has no image prompt to render. Edit the concept and add an image prompt before regenerating.`,
        toast: 'Concept has no image prompt.',
      };
    default:
      return { assistant: fallback, toast: fallback.slice(0, 120) };
  }
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  command: string | null;
  metadata: Record<string, unknown>;
  batch_id: string | null;
  created_at: string;
}

/**
 * Transient state for an in-flight agent run. Replaced (not appended) on
 * every event so the slip below the transcript stays a single live row,
 * not a wall of intermediate steps. Cleared on `batch_complete` /
 * `batch_error` once the persistent assistant slip takes over.
 */
interface LiveStream {
  narration: string;
  activity: string | null;
  progress: { current: number; total: number; slug: string | null } | null;
  failures: number;
}

interface Props {
  clientId: string;
  onBatchComplete: (concepts: AdConcept[]) => void;
  onConceptsChanged: (updatedConcepts: AdConcept[], deletedIds: string[]) => void;
  onSwitchToGallery: () => void;
}

const COUNT_PRESETS = [5, 10, 20, 30];
const DEFAULT_COUNT = 20;

const EXAMPLE_PROMPTS: string[] = [
  'Generate this month’s 20 gift ads. Match the brand to proven reference ads, then vary testimonial, offer, comparison, and problem-solution angles.',
  'Build a polished monthly drop for client review. Use Brand DNA and Cortex memory first, then borrow only the layout mechanics from the reference library.',
  'Focus on the current offer, but keep the batch diverse. Render every ad with ChatGPT Image and make each concept ready for the gallery.',
];

const DISPLAY_FONT = 'var(--font-nz-display), system-ui, sans-serif';

/**
 * Multi-turn chat intake. Hydrates persisted messages on mount, renders
 * them as a scrollable transcript, and routes input to one of two
 * backends depending on content:
 *
 *   - `/`-prefixed input → /api/ad-creatives/command (slash commands)
 *   - Anything else      → /api/ad-creatives/generate (reference-matched ad batch)
 *
 * Both endpoints write their own user/assistant pair to
 * ad_generator_messages, so the history stays truthful even on refresh.
 */
export function AdGeneratorChat({
  clientId,
  onBatchComplete,
  onConceptsChanged,
  onSwitchToGallery,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [count, setCount] = useState<number>(DEFAULT_COUNT);
  const [submitting, setSubmitting] = useState(false);
  const [liveStream, setLiveStream] = useState<LiveStream | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isCommand = input.trim().startsWith('/');

  // Hydrate persisted history. The endpoint returns ASC-sorted messages
  // so we can render top-to-bottom without extra work.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/ad-creatives/messages?clientId=${clientId}`,
          { cache: 'no-store' },
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { messages: ChatMessage[] };
        if (!cancelled) setMessages(data.messages ?? []);
      } finally {
        if (!cancelled) setHistoryLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  // Scroll to bottom on new messages or live-stream updates. The transcript
  // is a bounded height flex child; scrollTo on the inner container keeps
  // the composer fixed. We watch the progress counter so each rendered ad
  // nudges the slip back into view, and the narration so longer agent
  // messages don't get cut off behind the composer.
  const liveProgressCurrent = liveStream?.progress?.current ?? null;
  const liveNarrationLen = liveStream?.narration.length ?? 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, liveProgressCurrent, liveNarrationLen]);

  const handleSubmit = useCallback(async () => {
    const trimmed = input.trim();
    if (trimmed.length < 1) return;

    const optimisticUserId = `tmp-u-${Date.now()}`;
    const optimisticUser: ChatMessage = {
      id: optimisticUserId,
      role: 'user',
      content: trimmed,
      command: trimmed.startsWith('/') ? trimmed.split(/\s+/)[0]!.slice(1) : null,
      metadata: {},
      batch_id: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setInput('');
    setSubmitting(true);

    try {
      if (trimmed.startsWith('/')) {
        const res = await fetch('/api/ad-creatives/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, input: trimmed }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: string; code?: string }
            | null;
          const fallback = body?.error ?? `Command failed (${res.status})`;
          const friendly = friendlyErrorFor(body?.code, fallback);
          appendAssistant(setMessages, friendly.assistant, null);
          toast.error(friendly.toast);
          return;
        }
        const data = (await res.json()) as {
          summary: string;
          affectedConcepts: AdConcept[];
          metadata: Record<string, unknown>;
          assistantMessageId: string | null;
        };
        appendAssistant(setMessages, data.summary, null, data.metadata);
        if (data.affectedConcepts.length > 0) {
          const deletedIds = data.affectedConcepts
            .filter((c) => (c as { status?: unknown }).status === 'deleted')
            .map((c) => (c as { id: string }).id);
          const updated = data.affectedConcepts.filter(
            (c) => (c as { status?: unknown }).status !== 'deleted',
          ) as AdConcept[];
          onConceptsChanged(updated, deletedIds);
          if (updated.length > 0 || deletedIds.length > 0) {
            toast.success(data.summary.slice(0, 120));
          }
        } else {
          toast.success(data.summary.slice(0, 120));
        }
      } else {
        // Open the SSE stream from the agent run. Auth/validation errors
        // come back as a normal JSON body (status !== 200); a 200 response
        // is always a streaming `text/event-stream` body.
        setLiveStream({
          narration: '',
          activity: 'Starting agent…',
          progress: null,
          failures: 0,
        });

        const res = await fetch('/api/ad-creatives/agent-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, prompt: trimmed, count }),
        });
        if (!res.ok || !res.body) {
          setLiveStream(null);
          const body = (await res.json().catch(() => null)) as
            | { error?: string; code?: string }
            | null;
          const fallback = body?.error ?? `Generation failed (${res.status})`;
          const friendly = friendlyErrorFor(body?.code, fallback);
          appendAssistant(setMessages, friendly.assistant, null);
          toast.error(friendly.toast);
          return;
        }

        // Stream consumer. We accumulate a UTF-8 buffer because a single
        // network chunk can contain a partial frame OR several frames,
        // and SSE frames are delimited by a blank line (`\n\n`).
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let lastNarration = '';
        // These vars are mutated inside `handleEvent` (a closure). TS flow
        // analysis can't see those writes, so reads after the SSE loop
        // narrow back to `null`. Annotate as a wider union and cast on read.
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
              // Clear the activity line so it doesn't show a stale label
              // (e.g. "Loading brand DNA…") under fresh agent narration.
              // The next tool_started or progress event sets it again.
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
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
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
          appendAssistant(setMessages, friendly.assistant, null);
          toast.error(friendly.toast);
          return;
        }

        const final = finalEvent as BatchComplete | null;
        if (final) {
          const summary = lastNarration || final.summary;
          appendAssistant(setMessages, summary, final.batchId, {
            batch_status: final.status,
            concept_count: final.concepts.length,
            reference_ads_used: final.referenceAdsUsed,
          });
          onBatchComplete(final.concepts as AdConcept[]);
          toast.success(
            `Generated ${final.concepts.length} ad${final.concepts.length === 1 ? '' : 's'}${final.status === 'partial' ? ' (partial)' : ''}.`,
          );
          onSwitchToGallery();
          return;
        }

        // Stream closed without a terminal event. Treat as a hung run.
        appendAssistant(
          setMessages,
          'The agent stream ended without a final result. Try the brief again.',
          null,
        );
        toast.error('Stream closed unexpectedly.');
      }
    } finally {
      setSubmitting(false);
    }
  }, [input, clientId, count, onBatchComplete, onConceptsChanged, onSwitchToGallery]);

  // Pre-compute reply numbers so each Cortex slip can reference its index
  // in the conversation. User briefs aren't numbered — they're the prompt,
  // not the report.
  const replyIndexes = useMemo(() => {
    const map = new Map<string, number>();
    let n = 0;
    for (const m of messages) {
      if (m.role === 'assistant') {
        n += 1;
        map.set(m.id, n);
      }
    }
    return map;
  }, [messages]);

  const transcript = useMemo(() => {
    if (!historyLoaded) {
      return (
        <div className="flex items-center gap-2 py-12 text-xs text-text-muted">
          <Loader2 size={12} className="animate-spin" />
          <span style={{ fontFamily: DISPLAY_FONT, fontStyle: 'italic' }}>
            Loading transcript…
          </span>
        </div>
      );
    }
    if (messages.length === 0 && !liveStream) {
      return <EmptyStateHint />;
    }
    return (
      <ol className="space-y-7 py-2">
        {messages.map((m) => (
          <MessageSlip
            key={m.id}
            message={m}
            replyIndex={replyIndexes.get(m.id) ?? null}
          />
        ))}
        {liveStream && <LiveStreamSlip stream={liveStream} />}
      </ol>
    );
  }, [historyLoaded, messages, replyIndexes, liveStream]);

  return (
    <div className="flex h-[calc(100vh-300px)] min-h-[520px] flex-col gap-0 overflow-hidden">
      {/* Transcript — flat surface, scrolls inside flexbox */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pb-6 pr-1">
        {transcript}
      </div>

      {/* Composer — separated from transcript by a thin rule, no boxed
          chrome. The eyebrow flips between Brief / Slash command based on
          input, and ⌘↵ hint sits opposite as a monospace caption. */}
      <div className="shrink-0 space-y-3 border-t border-nativz-border/60 pt-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="nz-eyebrow">{isCommand ? 'Slash command' : 'Brief'}</p>
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted/70">
            ⌘↵ to send
          </span>
        </div>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          rows={3}
          disabled={submitting}
          placeholder="Describe this month’s ad drop, or type /help for slash commands."
          className="w-full resize-y rounded-lg border border-nativz-border/70 bg-background/60 px-3.5 py-2.5 text-[14px] leading-relaxed text-text-primary placeholder:text-text-muted/80 focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/20"
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {isCommand ? (
            <p
              className="text-[12px] italic text-text-muted"
              style={{ fontFamily: DISPLAY_FONT }}
            >
              Cortex will run this command and reply with the result.
            </p>
          ) : (
            <CountSelector value={count} onChange={setCount} />
          )}

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || input.trim().length < 1}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            {submitting
              ? 'Working…'
              : isCommand
                ? 'Run command'
                : `Generate ${count} ads`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function appendAssistant(
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  content: string,
  batchId: string | null,
  metadata: Record<string, unknown> = {},
) {
  setMessages((prev) => [
    ...prev,
    {
      id: `tmp-a-${Date.now()}`,
      role: 'assistant',
      content,
      command: null,
      metadata,
      batch_id: batchId,
      created_at: new Date().toISOString(),
    },
  ]);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * One transcript row. User briefs are styled in cyan to claim authorship;
 * Cortex replies are neutral and numbered. No bubbles, no avatars — the
 * eyebrow alone carries the speaker.
 */
function MessageSlip({
  message,
  replyIndex,
}: {
  message: ChatMessage;
  replyIndex: number | null;
}) {
  const isUser = message.role === 'user';
  const time = formatTime(message.created_at);
  return (
    <li className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span
          className={`font-mono text-[10px] tabular-nums ${
            isUser ? 'text-accent-text' : 'text-text-muted/70'
          }`}
        >
          {time}
        </span>
        <span
          className={`text-[12px] italic tracking-wide ${
            isUser ? 'text-accent-text' : 'text-text-muted'
          }`}
          style={{ fontFamily: DISPLAY_FONT }}
        >
          {isUser
            ? 'Brief'
            : `Cortex · ${String(replyIndex ?? 0).padStart(2, '0')}`}
        </span>
      </div>
      <p
        className={`whitespace-pre-wrap text-[14px] leading-relaxed ${
          isUser ? 'text-text-primary' : 'text-text-secondary'
        }`}
      >
        {message.content}
      </p>
    </li>
  );
}

/**
 * In-flight agent run, shown below the persisted transcript while the
 * SSE stream is open. One slip — narration on top (refreshed on each
 * `agent_message`), then the current activity, then a hairline progress
 * bar tied to per-image render events. Cleared when the stream ends.
 */
function LiveStreamSlip({ stream }: { stream: LiveStream }) {
  const pct = stream.progress
    ? Math.min(
        100,
        Math.round((stream.progress.current / Math.max(stream.progress.total, 1)) * 100),
      )
    : 0;
  return (
    <li className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[10px] tabular-nums text-text-muted/70">
          live
        </span>
        <span
          className="inline-flex items-baseline gap-2 text-[12px] italic tracking-wide text-accent-text"
          style={{ fontFamily: DISPLAY_FONT }}
        >
          Cortex · drafting
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent"
          />
        </span>
      </div>
      {stream.narration && (
        <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-text-secondary">
          {stream.narration}
        </p>
      )}
      {stream.activity && (
        <p
          className="text-[12px] italic text-text-muted"
          style={{ fontFamily: DISPLAY_FONT }}
        >
          {stream.activity}
        </p>
      )}
      {stream.progress && (
        <div className="space-y-1.5 pt-0.5">
          <div className="flex items-baseline justify-between gap-3 font-mono text-[11px] tabular-nums text-text-muted">
            <span>
              {String(stream.progress.current).padStart(2, '0')} /{' '}
              {String(stream.progress.total).padStart(2, '0')}
              {stream.failures > 0 && (
                <span className="ml-2 text-red-400/80">
                  · {stream.failures} skipped
                </span>
              )}
            </span>
            {stream.progress.slug && (
              <span className="truncate text-[10px] text-text-muted/70">
                {stream.progress.slug}
              </span>
            )}
          </div>
          <div className="h-px w-full overflow-hidden bg-nativz-border/50">
            <div
              className="h-full bg-accent transition-[width] duration-300 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </li>
  );
}

function CountSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="text-[11px] italic tracking-wide text-text-muted"
        style={{ fontFamily: DISPLAY_FONT }}
      >
        Count
      </span>
      <div className="flex items-center gap-2 font-mono text-[12px] tabular-nums">
        {COUNT_PRESETS.map((n, i) => {
          const active = value === n;
          return (
            <span key={n} className="flex items-center gap-2">
              {i > 0 && (
                <span aria-hidden className="text-text-muted/30">
                  ·
                </span>
              )}
              <button
                type="button"
                onClick={() => onChange(n)}
                aria-pressed={active}
                className={`cursor-pointer transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/60 ${
                  active
                    ? 'font-semibold text-accent-text underline decoration-accent decoration-2 underline-offset-4'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {n}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function EmptyStateHint() {
  return (
    <div className="max-w-2xl space-y-9 py-8">
      <div className="space-y-3">
        <p className="nz-eyebrow">Direction examples</p>
        <ul className="space-y-3">
          {EXAMPLE_PROMPTS.map((p) => (
            <li
              key={p}
              className="flex gap-3 text-[13px] leading-relaxed text-text-secondary"
            >
              <span aria-hidden className="select-none text-text-muted/40">
                —
              </span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-3">
        <p className="nz-eyebrow">Slash commands</p>
        <pre className="whitespace-pre-wrap font-mono text-[11px] leading-snug text-text-secondary">
          {CHAT_COMMAND_HELP}
        </pre>
      </div>
    </div>
  );
}

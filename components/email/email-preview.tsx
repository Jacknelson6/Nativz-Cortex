'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Monitor, Smartphone } from 'lucide-react';

/**
 * Inline email preview. Renders the exact HTML Resend would deliver for
 * the given kind + inputs, by calling /api/email/preview and dropping the
 * returned HTML into a sandboxed iframe. Desktop / mobile toggle swaps the
 * iframe's max-width so admins can sanity-check both reading contexts.
 *
 * The iframe is sandboxed with `allow-same-origin` only — no script execution.
 * Our email HTML contains no scripts, so this is strictly a defense in depth.
 *
 * Props are serialized to JSON and used as the debounce key so every input
 * change schedules exactly one refetch 350ms after typing stops. Aborts
 * in-flight requests when inputs change — avoids flashing stale HTML.
 */
type OnboardingInput = {
  kind: 'onboarding';
  subject: string;
  body: string;
  trackerId?: string | null;
};

type WeeklySocialInput = {
  kind: 'weekly_social';
  clientId: string;
};

type WeeklyAffiliateInput = {
  kind: 'weekly_affiliate';
  clientId: string;
};

export type EmailPreviewInput =
  | OnboardingInput
  | WeeklySocialInput
  | WeeklyAffiliateInput;

type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; subject: string; html: string; unresolved: string[] }
  | { status: 'error'; message: string };

export function EmailPreview({
  input,
  className = '',
  showSubject = true,
  debounceMs = 350,
}: {
  input: EmailPreviewInput;
  className?: string;
  showSubject?: boolean;
  debounceMs?: number;
}) {
  const [state, setState] = useState<PreviewState>({ status: 'idle' });
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const abortRef = useRef<AbortController | null>(null);

  // Serialize the full input object as the debounce key — any change
  // (subject edit, client swap, kind flip) triggers a fresh render.
  const payloadKey = useMemo(() => JSON.stringify(input), [input]);

  useEffect(() => {
    setState({ status: 'loading' });
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const body = mapToApiBody(input);
      fetch('/api/email/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ac.signal,
      })
        .then(async (res) => {
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error((d as { error?: string }).error || 'Failed to render preview');
          }
          return res.json() as Promise<{ subject: string; html: string; unresolved: string[] }>;
        })
        .then((d) => {
          setState({ status: 'ready', subject: d.subject, html: d.html, unresolved: d.unresolved ?? [] });
        })
        .catch((err: Error) => {
          if (err.name === 'AbortError') return;
          setState({ status: 'error', message: err.message });
        });
    }, debounceMs);
    return () => clearTimeout(timer);
    // payloadKey captures every relevant change — intentionally not listing raw input fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadKey, debounceMs]);

  const maxWidth = device === 'desktop' ? 640 : 375;
  const loading = state.status === 'loading';

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Header: subject + device toggle */}
      <div className="flex items-center justify-between gap-3 flex-wrap pb-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            Live preview
          </p>
          {showSubject && state.status === 'ready' && (
            <p className="text-[13px] text-text-primary truncate" title={state.subject}>
              {state.subject || <span className="text-text-muted italic">Subject will appear here</span>}
            </p>
          )}
        </div>
        <DeviceToggle value={device} onChange={setDevice} />
      </div>

      {/* Progress bar — indeterminate cyan sliver while rebuilding */}
      <div className="relative h-0.5 w-full bg-transparent overflow-hidden">
        {loading && (
          <div className="absolute inset-y-0 left-0 w-1/3 bg-accent-text/70 animate-[progressSlide_1.2s_ease-in-out_infinite] rounded-full" />
        )}
      </div>

      {/* Preview frame */}
      <div className="flex-1 min-h-[500px] bg-[#000C11] rounded-b-[10px] rounded-tr-[10px] overflow-auto flex justify-center items-start p-4 border border-nativz-border border-t-0">
        {state.status === 'error' ? (
          <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/30 p-4 text-[13px] text-red-300 max-w-md">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Failed to render preview</p>
              <p className="mt-0.5 text-red-300/80">{state.message}</p>
            </div>
          </div>
        ) : (
          <iframe
            key={device} /* Re-mount on width change so inner layout recomputes. */
            title="Email preview"
            srcDoc={state.status === 'ready' ? state.html : undefined}
            sandbox="allow-same-origin"
            className="w-full bg-white rounded-md shadow-[0_6px_24px_rgba(0,0,0,0.35)] transition-[max-width] duration-200"
            style={{ maxWidth, height: 700, border: 'none' }}
          />
        )}
      </div>

      {/* Unresolved placeholder warning row */}
      {state.status === 'ready' && state.unresolved.length > 0 && (
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2">
          <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-400" />
          <div className="text-[12px] text-amber-300 leading-relaxed">
            Unresolved placeholders will ship to the recipient as-is:{' '}
            {state.unresolved.map((p, i) => (
              <span key={p}>
                {i > 0 && ', '}
                <code className="font-mono text-amber-200">{`{{${p}}}`}</code>
              </span>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes progressSlide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────

function mapToApiBody(input: EmailPreviewInput): Record<string, unknown> {
  switch (input.kind) {
    case 'onboarding':
      return {
        kind: 'onboarding',
        subject: input.subject,
        body: input.body,
        tracker_id: input.trackerId ?? null,
      };
    case 'weekly_social':
      return { kind: 'weekly_social', client_id: input.clientId };
    case 'weekly_affiliate':
      return { kind: 'weekly_affiliate', client_id: input.clientId };
  }
}

function DeviceToggle({
  value,
  onChange,
}: {
  value: 'desktop' | 'mobile';
  onChange: (v: 'desktop' | 'mobile') => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-nativz-border bg-surface p-0.5" role="tablist" aria-label="Preview viewport">
      <button
        type="button"
        role="tab"
        aria-selected={value === 'desktop'}
        onClick={() => onChange('desktop')}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
          value === 'desktop'
            ? 'bg-accent-surface text-accent-text'
            : 'text-text-muted hover:text-text-primary'
        }`}
      >
        <Monitor size={11} />
        Desktop
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === 'mobile'}
        onClick={() => onChange('mobile')}
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
          value === 'mobile'
            ? 'bg-accent-surface text-accent-text'
            : 'text-text-muted hover:text-text-primary'
        }`}
      >
        <Smartphone size={11} />
        Mobile
      </button>
    </div>
  );
}

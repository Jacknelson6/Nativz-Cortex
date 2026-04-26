'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  Loader2,
  Quote,
  Sparkles,
} from 'lucide-react';
import { SelfAuditSentimentDonut } from '@/components/spying/self-audit-sentiment-donut';
import { cn } from '@/lib/utils/cn';
import type { BrandAuditResponse, BrandAuditRow } from '@/lib/brand-audits/types';

interface SelfAuditDetailProps {
  audit: BrandAuditRow;
}

export function SelfAuditDetail({ audit: initialAudit }: SelfAuditDetailProps) {
  const router = useRouter();
  const [audit, setAudit] = useState<BrandAuditRow>(initialAudit);

  // Poll while the audit is still running so the detail page lights up
  // automatically once the run engine finishes. Stops as soon as we
  // reach a terminal state.
  useEffect(() => {
    if (audit.status !== 'running' && audit.status !== 'pending') return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const res = await fetch(`/api/brand-audits/${audit.id}`, { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json?.audit) {
          setAudit(json.audit as BrandAuditRow);
          if (json.audit.status === 'completed' || json.audit.status === 'failed') {
            router.refresh();
            return;
          }
        }
      } catch {
        // swallow — next tick will retry
      } finally {
        if (!cancelled) timer = setTimeout(poll, 4000);
      }
    };

    timer = setTimeout(poll, 4000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [audit.id, audit.status, router]);

  if (audit.status === 'running' || audit.status === 'pending') {
    return <RunningState audit={audit} />;
  }

  if (audit.status === 'failed') {
    return <FailedState audit={audit} />;
  }

  return <CompletedState audit={audit} />;
}

function RunningState({ audit }: { audit: BrandAuditRow }) {
  const promptCount = audit.prompts.length || 3;
  const modelCount = audit.models.length || 3;
  const total = promptCount * modelCount;
  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-10 text-center">
      <Loader2 size={28} className="mx-auto animate-spin text-accent-text" />
      <h2 className="mt-4 font-display text-lg font-semibold text-text-primary">
        Running audit for {audit.brand_name}
      </h2>
      <p className="mt-1 text-sm text-text-muted">
        Asking {modelCount} model{modelCount === 1 ? '' : 's'} {promptCount} question
        {promptCount === 1 ? '' : 's'} each ({total} call{total === 1 ? '' : 's'} total).
        This usually takes 30–60 seconds.
      </p>
    </div>
  );
}

function FailedState({ audit }: { audit: BrandAuditRow }) {
  return (
    <div className="rounded-xl border border-coral-500/30 bg-coral-500/5 p-6">
      <div className="flex items-start gap-3">
        <CircleAlert size={20} className="mt-0.5 flex-shrink-0 text-coral-300" />
        <div>
          <h2 className="font-display text-base font-semibold text-coral-200">
            Audit failed
          </h2>
          <p className="mt-1 text-sm text-coral-200/80">
            {audit.error_message ?? 'Something went wrong. Try running it again.'}
          </p>
        </div>
      </div>
    </div>
  );
}

function CompletedState({ audit }: { audit: BrandAuditRow }) {
  const totalCells = audit.responses.length;
  const visibility = audit.visibility_score ?? 0;
  const sentiment = audit.sentiment_score;
  const sentimentLabel = sentiment === null ? '—' : sentiment.toFixed(2);
  const sentimentTone =
    sentiment === null
      ? 'text-text-muted'
      : sentiment > 0.2
        ? 'text-emerald-300'
        : sentiment < -0.2
          ? 'text-coral-300'
          : 'text-amber-300';

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat
          label="Visibility"
          value={`${Math.round(visibility)}%`}
          sub={`${audit.responses.filter((r) => r.mentioned).length} of ${totalCells} responses mentioned the brand`}
        />
        <Stat
          label="Sentiment score"
          value={sentimentLabel}
          sub="Mean across mentioned responses, −1 to +1"
          valueClass={sentimentTone}
        />
        <Stat
          label="Coverage"
          value={`${audit.models.length} × ${audit.prompts.length}`}
          sub={`${audit.models.length} models · ${audit.prompts.length} prompts`}
        />
      </section>

      <section
        className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.2fr]"
      >
        <div className="rounded-xl border border-nativz-border bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-text-primary">
              Sentiment breakdown
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
              {totalCells} responses
            </span>
          </div>
          <SelfAuditSentimentDonut
            breakdown={audit.sentiment_breakdown}
            centerLabel={{
              value: `${Math.round(visibility)}%`,
              sub: 'Mention rate',
            }}
          />
        </div>

        <div className="rounded-xl border border-nativz-border bg-surface p-5">
          <h2 className="mb-4 font-display text-sm font-semibold text-text-primary">
            Per-model breakdown
          </h2>
          <ModelBreakdown audit={audit} />
        </div>
      </section>

      <section className="rounded-xl border border-nativz-border bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-text-primary">
            Top sources cited
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
            {audit.top_sources.length} unique
          </span>
        </div>
        <SourcesList sources={audit.top_sources} />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="ui-eyebrow text-accent-text/80">Raw responses</p>
            <h2 className="mt-1 font-display text-base font-semibold text-text-primary">
              What each model actually said
            </h2>
          </div>
        </div>
        <ResponsesByPrompt audit={audit} />
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-nativz-border bg-surface p-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">{label}</div>
      <div className={cn('mt-1.5 font-display text-2xl font-semibold text-text-primary', valueClass)}>
        {value}
      </div>
      <div className="mt-1.5 text-[11px] text-text-muted">{sub}</div>
    </div>
  );
}

function ModelBreakdown({ audit }: { audit: BrandAuditRow }) {
  if (audit.model_summary.length === 0) {
    return <p className="text-sm text-text-muted">No model data.</p>;
  }
  return (
    <ul className="space-y-3">
      {audit.model_summary.map((row) => {
        const visibility = row.total > 0 ? Math.round((row.mentioned / row.total) * 100) : 0;
        const sentTone =
          row.sentiment_avg === null
            ? 'text-text-muted'
            : row.sentiment_avg > 0.2
              ? 'text-emerald-300'
              : row.sentiment_avg < -0.2
                ? 'text-coral-300'
                : 'text-amber-300';
        return (
          <li
            key={row.model}
            className="rounded-lg border border-nativz-border bg-surface-hover/30 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Bot size={14} className="text-accent-text" />
                <span className="font-mono text-xs text-text-primary">{prettyModel(row.model)}</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-text-muted">
                  {row.mentioned}/{row.total} mentioned
                </span>
                <span className={cn('font-mono', sentTone)}>
                  {row.sentiment_avg === null ? '—' : row.sentiment_avg.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full bg-accent"
                style={{ width: `${visibility}%` }}
                aria-label={`Visibility ${visibility}%`}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function SourcesList({ sources }: { sources: BrandAuditRow['top_sources'] }) {
  if (sources.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        Models didn&apos;t cite any sources for this brand.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {sources.map((s) => (
        <li
          key={s.url}
          className="flex items-center justify-between gap-3 rounded-lg border border-nativz-border bg-surface-hover/30 px-3 py-2"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-text-primary">{s.title || s.url}</div>
            <div className="truncate text-[11px] text-text-muted">{cleanHost(s.url)}</div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-text-muted">×{s.count}</span>
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="text-text-muted/70 hover:text-accent-text"
              aria-label={`Open ${cleanHost(s.url)} in a new tab`}
            >
              <ExternalLink size={14} />
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ResponsesByPrompt({ audit }: { audit: BrandAuditRow }) {
  const grouped = new Map<string, BrandAuditResponse[]>();
  for (const r of audit.responses) {
    const arr = grouped.get(r.prompt) ?? [];
    arr.push(r);
    grouped.set(r.prompt, arr);
  }

  return (
    <div className="space-y-3">
      {[...grouped.entries()].map(([prompt, rows]) => (
        <PromptGroup key={prompt} prompt={prompt} rows={rows} />
      ))}
    </div>
  );
}

function PromptGroup({ prompt, rows }: { prompt: string; rows: BrandAuditResponse[] }) {
  const [open, setOpen] = useState(false);
  const mentioned = rows.filter((r) => r.mentioned).length;
  return (
    <div className="rounded-xl border border-nativz-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-surface-hover/30"
      >
        <Quote size={16} className="mt-0.5 flex-shrink-0 text-accent-text/70" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-text-primary">{prompt}</p>
          <p className="mt-1 text-[11px] text-text-muted">
            {mentioned}/{rows.length} model{rows.length === 1 ? '' : 's'} mentioned the brand
          </p>
        </div>
        {open ? (
          <ChevronDown size={16} className="mt-0.5 flex-shrink-0 text-text-muted" />
        ) : (
          <ChevronRight size={16} className="mt-0.5 flex-shrink-0 text-text-muted" />
        )}
      </button>
      {open ? (
        <div className="space-y-3 border-t border-nativz-border p-4">
          {rows.map((r, i) => (
            <ResponseCard key={`${r.model}-${i}`} response={r} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ResponseCard({ response }: { response: BrandAuditResponse }) {
  const tone =
    response.sentiment === 'positive'
      ? 'border-emerald-500/30 bg-emerald-500/5'
      : response.sentiment === 'negative'
        ? 'border-coral-500/30 bg-coral-500/5'
        : response.sentiment === 'neutral'
          ? 'border-amber-500/30 bg-amber-500/5'
          : 'border-nativz-border bg-surface-hover/30';

  return (
    <div className={cn('rounded-lg border p-3', tone)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bot size={12} className="text-accent-text" />
          <span className="font-mono text-[11px] text-text-secondary">
            {prettyModel(response.model)}
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
          {response.error
            ? 'Error'
            : response.mentioned
              ? response.sentiment.replace('_', ' ')
              : 'Not mentioned'}
        </span>
      </div>
      {response.error ? (
        <p className="mt-2 text-[11px] text-coral-300/90">{response.error}</p>
      ) : (
        <>
          {response.summary ? (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-text-secondary">
              <Sparkles size={11} className="mt-0.5 flex-shrink-0 text-accent-text/70" />
              {response.summary}
            </p>
          ) : null}
          <details className="mt-2">
            <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted/80 hover:text-accent-text">
              Show full response
            </summary>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-text-secondary">
              {response.text || '(empty)'}
            </p>
          </details>
          {response.sources.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {response.sources.slice(0, 6).map((s) => (
                <li key={s.url} className="truncate text-[11px]">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-text-muted hover:text-accent-text"
                  >
                    {s.title || cleanHost(s.url)}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}

function prettyModel(model: string): string {
  // openrouter slugs look like 'anthropic/claude-sonnet-4.5' — keep the
  // tail, drop the vendor prefix for compactness in tight UIs.
  const idx = model.indexOf('/');
  return idx === -1 ? model : model.slice(idx + 1);
}

function cleanHost(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

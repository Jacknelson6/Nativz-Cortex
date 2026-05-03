'use client';

/**
 * Per-screen step_state renderer for the admin onboarding detail.
 *
 * Each onboarding screen owns one JSONB slot in `step_state`. The original
 * detail panel rendered every slot as a raw `<pre>{JSON.stringify(...)}</pre>`,
 * which read like a dev-tools dump in a surface clients' team accounts also
 * look at. This component turns the structured payload into a labeled
 * key/value list with bullet support for arrays and ISO-date pretty printing.
 *
 * It deliberately does NOT try to be exhaustive: unknown shapes fall through
 * to a compact JSON line so we never silently drop data, but the common
 * payload shapes (strings, string lists, deliverable arrays, ISO timestamps)
 * get a polished, sentence-cased render.
 */

interface Props {
  screenKey: string;
  value: Record<string, unknown>;
}

function humanLabel(key: string): string {
  // Convert "what_we_sell" -> "What we sell"
  const spaced = key.replace(/_/g, ' ').trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function isIsoDate(value: string): boolean {
  if (!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

function formatIso(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function renderScalar(v: unknown): React.ReactNode {
  if (v === null || v === undefined || v === '') {
    return <span className="text-text-muted/60 italic">empty</span>;
  }
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    if (isIsoDate(v)) return formatIso(v);
    if (/^https?:\/\//i.test(v)) {
      return (
        <a
          href={v}
          target="_blank"
          rel="noreferrer"
          className="text-accent-text underline-offset-2 hover:underline break-all"
        >
          {v}
        </a>
      );
    }
    return v;
  }
  // Fallback: compact JSON for unknown shapes.
  return (
    <code className="font-mono text-[11px] text-text-muted">
      {JSON.stringify(v)}
    </code>
  );
}

function renderValue(v: unknown): React.ReactNode {
  if (Array.isArray(v)) {
    if (v.length === 0) {
      return <span className="text-text-muted/60 italic">none</span>;
    }
    return (
      <ul className="list-disc space-y-0.5 pl-4 text-sm text-foreground marker:text-text-secondary">
        {v.map((item, i) => (
          <li key={i}>{renderScalar(item)}</li>
        ))}
      </ul>
    );
  }
  if (v && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length === 0) {
      return <span className="text-text-muted/60 italic">empty</span>;
    }
    return (
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
        {entries.map(([k, vv]) => (
          <div key={k} className="contents">
            <dt className="text-[11px] uppercase tracking-wide text-text-secondary pt-0.5">
              {humanLabel(k)}
            </dt>
            <dd className="text-foreground break-words">{renderScalar(vv)}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span className="text-sm text-text-secondary">{renderScalar(v)}</span>;
}

export function StepStateView({ value }: Props) {
  const entries = Object.entries(value);
  if (entries.length === 0) return null;

  return (
    <div className="mt-2 rounded-lg border border-border/60 bg-background/60 p-3">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2">
        {entries.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-[11px] uppercase tracking-wide text-text-secondary pt-0.5 whitespace-nowrap">
              {humanLabel(k)}
            </dt>
            <dd className="min-w-0 text-foreground">{renderValue(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Cable,
  CheckCircle2,
  Circle,
  Hand,
  RefreshCcw,
  Search,
} from 'lucide-react';
import { Facebook, Instagram, Linkedin, Music2, Youtube } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClientLogo } from '@/components/clients/client-logo';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * Connections tab.
 *
 * Per-brand × per-platform matrix of Zernio connection status. Replaces
 * the old infrastructure-probe layout (Resend / Supabase / OpenRouter)
 * because what the agency actually needs to see is which brand is
 * missing a TikTok login or whose Instagram token Zernio just revoked.
 *
 * One row per active brand. Five columns, in posting-priority order:
 * TikTok, Instagram, Facebook, YouTube, LinkedIn. LinkedIn sits
 * alongside the Zernio four on purpose: Zernio has no LinkedIn flow,
 * so the column always reads "Manual" or "Missing", and keeping it
 * visible signals that to the operator at a glance.
 *
 * Each cell renders one of:
 *
 *   ●  green  CheckCircle2  Connected     (Zernio-authed, can post)
 *   ●  blue   Hand          Manual        (client granted access by hand)
 *   ●  red    AlertTriangle Disconnected  (Zernio token revoked, re-auth)
 *   ○  gray   Circle        Missing       (no profile row at all)
 *
 * The data comes from /api/admin/content-tools/connections-matrix which
 * reads `social_profiles` server-side and returns a per-client slot for
 * every platform.
 */

const PLATFORMS = [
  { key: 'tiktok', label: 'TikTok', Icon: Music2 },
  { key: 'instagram', label: 'Instagram', Icon: Instagram },
  { key: 'facebook', label: 'Facebook', Icon: Facebook },
  { key: 'youtube', label: 'YouTube', Icon: Youtube },
  { key: 'linkedin', label: 'LinkedIn', Icon: Linkedin },
] as const;

type PlatformKey = (typeof PLATFORMS)[number]['key'];

type SlotStatus = 'connected' | 'manual' | 'disconnected' | 'missing';

interface PlatformSlot {
  status: SlotStatus;
  username: string | null;
  disconnectedAt: string | null;
}

interface ClientRow {
  id: string;
  name: string;
  slug: string | null;
  logoUrl: string | null;
  /**
   * Active services from `clients.services` (text[]). Used for the
   * "Active production only" filter chip; canonical values are 'SMM',
   * 'Paid Media', 'Editing', 'Affiliates'.
   */
  services: string[];
  profiles: Record<PlatformKey, PlatformSlot>;
}

/** Services that count as "active production" for the filter chip. */
const PRODUCTION_SERVICES = ['SMM', 'Editing'] as const;

function hasActiveProduction(c: ClientRow): boolean {
  return c.services.some((s) =>
    (PRODUCTION_SERVICES as readonly string[]).includes(s),
  );
}

interface MatrixResponse {
  clients: ClientRow[];
  totals: {
    connected: number;
    manual: number;
    disconnected: number;
    missing: number;
  };
}

export function ConnectionsTab() {
  const [data, setData] = useState<MatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  /**
   * "Active production only" hides brands without SMM or Editing on
   * their service list. Useful when the matrix grows past ~30 brands
   * and the operator only cares about who we're posting / cutting for
   * right now.
   */
  const [activeOnly, setActiveOnly] = useState(false);

  async function load(silent = false) {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch('/api/admin/content-tools/connections-matrix', {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to load connections');
      const next = (await res.json()) as MatrixResponse;
      setData(next);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to load connections',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.clients.filter((c) => {
      if (activeOnly && !hasActiveProduction(c)) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.slug ?? '').toLowerCase().includes(q)
      );
    });
  }, [data, query, activeOnly]);

  const activeCount = useMemo(
    () => (data ? data.clients.filter(hasActiveProduction).length : 0),
    [data],
  );

  return (
    <div className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-nativz-border px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent-text/10 text-accent-text">
            <Cable className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-text-primary">
              Connections
            </div>
            <div className="mt-0.5 text-xs text-text-muted">
              {loading
                ? 'Checking accounts...'
                : data
                  ? summarize(data.totals)
                  : 'No data'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveOnly((v) => !v)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${
              activeOnly
                ? 'border-accent-text/40 bg-accent-text/10 text-accent-text'
                : 'border-nativz-border bg-background text-text-muted hover:text-text-primary'
            }`}
            aria-pressed={activeOnly}
            title="Filter to brands with SMM or Editing on their service list"
          >
            <span>Active production</span>
            <span
              className={`rounded px-1 text-[10px] tabular-nums ${
                activeOnly
                  ? 'bg-accent-text/20'
                  : 'bg-surface-hover text-text-muted'
              }`}
            >
              {activeCount}
            </span>
          </button>
          <SearchInput value={query} onChange={setQuery} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void load(true)}
            disabled={refreshing || loading}
            aria-label="Re-check connections"
          >
            <RefreshCcw
              size={14}
              className={refreshing ? 'animate-spin' : ''}
            />
          </Button>
        </div>
      </div>

      {loading ? (
        <MatrixSkeleton />
      ) : filtered.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-text-muted">
          {query ? 'No brands match that search.' : 'No brands yet.'}
        </div>
      ) : (
        <MatrixTable rows={filtered} />
      )}

      <Legend />
    </div>
  );
}

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-muted"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Find a brand"
        className="h-8 w-44 rounded-md border border-nativz-border bg-background pl-7 pr-2 text-xs text-text-primary placeholder:text-text-muted focus:border-accent-text focus:outline-none focus:ring-1 focus:ring-accent-text/40"
      />
    </div>
  );
}

function MatrixTable({ rows }: { rows: ClientRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-nativz-border bg-background/40">
            <th className="px-5 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-text-muted">
              Brand
            </th>
            {PLATFORMS.map(({ key, label, Icon }) => (
              <th
                key={key}
                className="px-3 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-text-muted"
              >
                <div className="inline-flex items-center gap-1.5">
                  <Icon className="size-3.5" />
                  <span>{label}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-nativz-border/60 transition-colors hover:bg-surface-hover/40"
            >
              <td className="px-5 py-3">
                <div className="flex items-center gap-2.5">
                  <ClientLogo
                    name={row.name}
                    src={row.logoUrl}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-text-primary">
                      {row.name}
                    </div>
                  </div>
                </div>
              </td>
              {PLATFORMS.map(({ key }) => (
                <td key={key} className="px-3 py-3 text-center">
                  <SlotCell slot={row.profiles[key]} platformKey={key} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SlotCell({
  slot,
  platformKey,
}: {
  slot: PlatformSlot;
  platformKey: PlatformKey;
}) {
  const meta = STATUS_META[slot.status];
  const Icon = meta.Icon;
  const tooltip = describeSlot(slot, platformKey);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center justify-center rounded-full border ${meta.chip}`}
          style={{ height: 26, width: 26 }}
          aria-label={`${platformKey} ${meta.label}`}
        >
          <Icon className="size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="w-56">
        <div className="font-medium text-text-primary">{meta.label}</div>
        <div className="mt-0.5 text-text-muted">{tooltip}</div>
      </TooltipContent>
    </Tooltip>
  );
}

function describeSlot(slot: PlatformSlot, platform: PlatformKey): string {
  const noun = PLATFORMS.find((p) => p.key === platform)?.label ?? platform;
  switch (slot.status) {
    case 'connected':
      return slot.username
        ? `Posting as @${slot.username} via Zernio.`
        : `${noun} is connected via Zernio.`;
    case 'manual':
      if (platform === 'linkedin') {
        return 'Zernio has no LinkedIn flow. Posting goes through the client account by hand.';
      }
      return `${noun} access was confirmed manually. Re-run onboarding to wire up Zernio.`;
    case 'disconnected': {
      const when = slot.disconnectedAt
        ? new Date(slot.disconnectedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })
        : null;
      return when
        ? `Zernio reported the token revoked on ${when}. Reconnect to resume posting.`
        : 'Zernio reported the token is revoked. Reconnect to resume posting.';
    }
    case 'missing':
      return `No ${noun} profile on file. Onboarding has not been started.`;
  }
}

const STATUS_META: Record<
  SlotStatus,
  {
    label: string;
    Icon: typeof CheckCircle2;
    chip: string;
  }
> = {
  connected: {
    label: 'Connected',
    Icon: CheckCircle2,
    chip: 'border-status-success/40 bg-status-success/10 text-status-success',
  },
  manual: {
    label: 'Manual access',
    Icon: Hand,
    // Amber instead of teal so it reads as "halfway there" rather than
    // "all good" - the agency still has to log in by hand on these.
    chip: 'border-status-warning/40 bg-status-warning/10 text-status-warning',
  },
  disconnected: {
    label: 'Disconnected',
    Icon: AlertTriangle,
    chip: 'border-status-danger/40 bg-status-danger/10 text-status-danger',
  },
  missing: {
    label: 'Not connected',
    Icon: Circle,
    chip: 'border-nativz-border bg-background text-text-tertiary',
  },
};

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-nativz-border bg-background/40 px-5 py-3 text-[11px] text-text-muted">
      {(Object.keys(STATUS_META) as SlotStatus[]).map((status) => {
        const meta = STATUS_META[status];
        const Icon = meta.Icon;
        return (
          <div key={status} className="inline-flex items-center gap-1.5">
            <span
              className={`inline-flex size-4 items-center justify-center rounded-full border ${meta.chip}`}
              aria-hidden
            >
              <Icon className="size-2.5" />
            </span>
            <span>{meta.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function summarize(totals: MatrixResponse['totals']): string {
  const parts: string[] = [];
  parts.push(`${totals.connected} connected`);
  if (totals.disconnected > 0) parts.push(`${totals.disconnected} disconnected`);
  if (totals.manual > 0) parts.push(`${totals.manual} manual`);
  if (totals.missing > 0) parts.push(`${totals.missing} missing`);
  return parts.join(' · ');
}

function MatrixSkeleton() {
  return (
    <div className="space-y-1 p-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-md border border-nativz-border/60 bg-background/40 px-3 py-3"
        >
          <div className="size-7 animate-pulse rounded-md bg-nativz-border" />
          <div className="h-3 w-32 animate-pulse rounded bg-nativz-border" />
          <div className="ml-auto flex items-center gap-2">
            {Array.from({ length: 5 }).map((_, j) => (
              <div
                key={j}
                className="size-6 animate-pulse rounded-full bg-nativz-border/70"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

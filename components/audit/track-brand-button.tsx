'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, Eye, Loader2, Search } from 'lucide-react';
import { ClientLogo } from '@/components/clients/client-logo';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import type { PlatformReport } from '@/lib/audit/types';

interface MentionClient {
  id: string;
  name: string;
  avatarUrl?: string | null;
  logo_url?: string | null;
}

interface TrackBrandButtonProps {
  auditId: string;
  brandName: string;
  platforms: PlatformReport[];
  /** When the audit was pre-attached to a client, default-select that
   *  client in the picker so the common case is one click. */
  defaultClientId?: string | null;
}

/**
 * Header CTA on the audit report — adds the audited brand's own
 * platforms (TT/IG/YT) to a chosen client's weekly benchmark snapshot.
 * Reuses /api/benchmarks/track-competitor (which is a misnomer — it
 * appends any social profile to `competitors_snapshot`, regardless of
 * whether it's "the brand" or "a competitor"). One call per platform.
 */
export function TrackBrandButton({
  auditId,
  brandName,
  platforms,
  defaultClientId = null,
}: TrackBrandButtonProps) {
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<MentionClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [tracked, setTracked] = useState(false);

  // Skip linkedin (not in the snapshot enum) and rows missing the
  // baseline identity fields the cron needs to re-scrape next week.
  const trackable = useMemo(
    () =>
      platforms.filter(
        (p) =>
          p.platform !== 'linkedin' &&
          p.profile?.username?.trim() &&
          p.profile?.profileUrl?.trim(),
      ),
    [platforms],
  );
  const disabled = trackable.length === 0;

  useEffect(() => {
    if (!open || clients.length > 0) return;
    let cancelled = false;
    async function loadClients() {
      setClientsLoading(true);
      try {
        const r = await fetch('/api/nerd/mentions');
        const data: { clients?: MentionClient[] } = r.ok ? await r.json() : { clients: [] };
        if (!cancelled) setClients(data.clients ?? []);
      } catch {
        if (!cancelled) setClients([]);
      } finally {
        if (!cancelled) setClientsLoading(false);
      }
    }
    void loadClients();
    return () => {
      cancelled = true;
    };
  }, [open, clients.length]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...clients].sort((a, b) => {
      if (defaultClientId) {
        if (a.id === defaultClientId) return -1;
        if (b.id === defaultClientId) return 1;
      }
      return a.name.localeCompare(b.name);
    });
    if (!q) return sorted;
    return sorted.filter((c) => c.name.toLowerCase().includes(q));
  }, [clients, query, defaultClientId]);

  async function handleTrack(clientId: string) {
    setSubmitting(true);
    try {
      const clientName = clients.find((c) => c.id === clientId)?.name ?? 'client';
      type TrackResponse = { ok: boolean; body: { needs_baseline?: boolean; message?: string; error?: string } };
      const results = await Promise.allSettled(
        trackable.map((p) =>
          fetch('/api/benchmarks/track-competitor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: clientId,
              audit_id: auditId,
              competitor: {
                username: p.profile.username,
                displayName: p.profile.displayName?.trim() || p.profile.username,
                platform: p.platform,
                profileUrl: p.profile.profileUrl,
                avatarUrl: p.profile.avatarUrl ?? null,
                baselineFollowers: p.profile.followers ?? null,
                baselineAvgViews: p.avgViews ?? null,
                baselineEngagementRate: p.engagementRate ?? null,
                baselinePostingFrequency: p.postingFrequency ?? null,
              },
            }),
          }).then(async (r): Promise<TrackResponse> => ({ ok: r.ok, body: await r.json().catch(() => ({})) })),
        ),
      );

      const fulfilled = results.filter(
        (r): r is PromiseFulfilledResult<TrackResponse> => r.status === 'fulfilled',
      );

      // The baseline check is per-client, not per-platform — so if any
      // response flags missing baseline, every response will. Treat the
      // first one we see as authoritative for routing the user.
      const needsBaseline = fulfilled.find((r) => r.value.body.needs_baseline);
      if (needsBaseline) {
        toast.error(
          needsBaseline.value.body.message ?? `Run the Spy baseline for ${clientName} before tracking competitors.`,
          {
            action: { label: 'Open Spy', onClick: () => { window.location.href = '/spying'; } },
          },
        );
        return;
      }

      const successes = fulfilled.filter((r) => r.value.ok);
      if (successes.length === trackable.length) {
        const platformsLabel = trackable.length === 1 ? 'platform' : 'platforms';
        toast.success(`Added ${brandName} to ${clientName}'s competitor list (${trackable.length} ${platformsLabel})`);
        setTracked(true);
        setOpen(false);
      } else if (successes.length === 0) {
        toast.error(`Failed to add ${brandName} to ${clientName}'s competitor list`);
      } else {
        toast.success(
          `Added ${brandName} on ${successes.length}/${trackable.length} platforms to ${clientName}'s competitor list`,
        );
        setTracked(true);
        setOpen(false);
      }
    } catch {
      toast.error(`Failed to add ${brandName} to competitor list`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          title={
            disabled
              ? 'No trackable platforms scraped'
              : tracked
                ? 'Added to competitor list'
                : 'Add to a brand’s competitor list'
          }
          className={cn(
            tracked && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300',
          )}
        >
          {tracked ? <Check size={14} /> : <Eye size={14} />}
          {tracked ? 'Added' : 'Add to competitor list'}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        matchAnchorWidth={false}
        className="w-[min(20rem,calc(100vw-2rem))] border-nativz-border bg-surface p-0 text-text-primary shadow-[var(--shadow-dropdown)]"
      >
        <div className="border-b border-nativz-border p-3">
          <p className="text-xs font-medium text-text-muted">
            Add {brandName} on {trackable.length} platform{trackable.length === 1 ? '' : 's'} to…
          </p>
          <div className="relative mt-2">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clients…"
              className="w-full rounded-lg border border-nativz-border bg-background py-2 pl-8 pr-3 text-sm text-foreground placeholder:text-text-muted focus:border-accent focus:outline-none"
              autoComplete="off"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto p-2" role="listbox" aria-label="Clients">
          {clientsLoading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-text-muted">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-text-muted">
              {clients.length === 0 ? 'No accessible clients' : 'No matches'}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((c) => {
                const isDefault = c.id === defaultClientId;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isDefault}
                      onClick={() => void handleTrack(c.id)}
                      disabled={submitting}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-hover',
                        isDefault && 'bg-accent/5',
                        submitting && 'cursor-wait opacity-60',
                      )}
                    >
                      <ClientLogo
                        src={c.logo_url ?? c.avatarUrl ?? null}
                        name={c.name}
                        size="sm"
                        className="h-7 w-7 shrink-0 rounded-md"
                      />
                      <span className="min-w-0 flex-1 truncate text-text-primary">{c.name}</span>
                      {isDefault && (
                        <span className="shrink-0 rounded-full border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-text">
                          attached
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t border-nativz-border px-3 py-2">
          <p className="text-[11px] text-text-muted">
            Cron snapshots followers + engagement weekly.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

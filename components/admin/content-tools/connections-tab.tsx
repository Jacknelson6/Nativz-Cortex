'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Cable,
  CheckCircle2,
  Circle,
  Copy,
  Plus,
  RefreshCcw,
  Search,
  Send,
} from 'lucide-react';
import {
  Bookmark,
  Camera,
  Facebook,
  Globe,
  Instagram,
  Linkedin,
  Music2,
  Twitter,
  Youtube,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ClientLogo } from '@/components/clients/client-logo';
import { Dialog } from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * Connections tab.
 *
 * Per-brand × per-platform matrix of Zernio connection status. The
 * brand cell opens an Invite Builder modal where the admin picks the
 * platforms a client needs to (re)connect, picks recipients off the
 * brand's `contacts` table, and emails a `/connect/invite/{token}`
 * link via Resend. The client lands on a no-auth page, taps Connect
 * per platform, and the OAuth callback marks each one done +
 * optionally pings the team via Google Chat / email.
 *
 * Three statuses (after the April 2026 simplification — "manual" was
 * dropped because having a profile URL on file does not equal access):
 *
 *   ●  green  CheckCircle2  Connected     (Zernio token, can post)
 *   ●  red    AlertTriangle Disconnected  (Zernio reported revoke)
 *   ○  gray   Circle        Not connected (no Zernio token)
 *
 * Five core columns (TikTok, Instagram, Facebook, YouTube, LinkedIn)
 * are always visible. The "Show all platforms" toggle adds the rest of
 * Zernio's supported set (Google Business, Pinterest, X, Threads,
 * Bluesky) on demand.
 */

const CORE_PLATFORMS = [
  { key: 'tiktok', label: 'TikTok', Icon: Music2 },
  { key: 'instagram', label: 'Instagram', Icon: Instagram },
  { key: 'facebook', label: 'Facebook', Icon: Facebook },
  { key: 'youtube', label: 'YouTube', Icon: Youtube },
  { key: 'linkedin', label: 'LinkedIn', Icon: Linkedin },
] as const;

const EXTRA_PLATFORMS = [
  { key: 'googlebusiness', label: 'Google Business', Icon: Globe },
  { key: 'pinterest', label: 'Pinterest', Icon: Bookmark },
  { key: 'x', label: 'X (Twitter)', Icon: Twitter },
  { key: 'threads', label: 'Threads', Icon: Camera },
  { key: 'bluesky', label: 'Bluesky', Icon: Globe },
] as const;

const ALL_PLATFORMS = [...CORE_PLATFORMS, ...EXTRA_PLATFORMS] as const;

type PlatformKey = (typeof ALL_PLATFORMS)[number]['key'];
type PlatformDef = (typeof ALL_PLATFORMS)[number];

type SlotStatus = 'connected' | 'disconnected' | 'missing';
type AccountOwner = 'agency' | 'client' | 'unknown';

interface PlatformSlot {
  status: SlotStatus;
  username: string | null;
  disconnectedAt: string | null;
  tokenExpiresAt: string | null;
  tokenStatus: string | null;
  accountOwner: AccountOwner;
}

interface ClientRow {
  id: string;
  name: string;
  slug: string | null;
  logoUrl: string | null;
  services: string[];
  profiles: Record<PlatformKey, PlatformSlot>;
}

const PRODUCTION_SERVICES = ['SMM', 'Editing'] as const;

function hasActiveProduction(c: ClientRow): boolean {
  return c.services.some((s) =>
    (PRODUCTION_SERVICES as readonly string[]).includes(s),
  );
}

function hasSmm(c: ClientRow): boolean {
  return c.services.includes('SMM');
}

interface MatrixResponse {
  clients: ClientRow[];
  totals: {
    connected: number;
    disconnected: number;
    missing: number;
  };
}

export function ConnectionsTab() {
  const [data, setData] = useState<MatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [showAllPlatforms, setShowAllPlatforms] = useState(false);
  const [inviteFor, setInviteFor] = useState<ClientRow | null>(null);

  async function load(silent = false) {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      if (silent) {
        // Re-check pings Zernio for fresh token expiry, plus back-fills
        // `late_account_id` for any social_profiles row whose handle
        // matches a Zernio account that was connected outside our invite
        // flow. Failures here don't block the matrix render, the cached
        // `token_expires_at` will still surface.
        try {
          const syncRes = await fetch(
            '/api/admin/content-tools/connections-matrix/sync',
            { method: 'POST' },
          );
          if (syncRes.ok) {
            const syncBody = (await syncRes.json()) as {
              linked?: number;
              ambiguous?: { platform: string; username: string }[];
            };
            if (syncBody.linked && syncBody.linked > 0) {
              toast.success(
                `Linked ${syncBody.linked} Zernio account${
                  syncBody.linked === 1 ? '' : 's'
                } to existing brands`,
              );
            }
            if (syncBody.ambiguous && syncBody.ambiguous.length > 0) {
              toast.warning(
                `${syncBody.ambiguous.length} handle${
                  syncBody.ambiguous.length === 1 ? '' : 's'
                } matched multiple brands, link manually`,
              );
            }
          }
        } catch {
          // Swallow; matrix still renders from cached state.
        }
      }
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

  const visiblePlatforms: readonly PlatformDef[] = showAllPlatforms
    ? ALL_PLATFORMS
    : CORE_PLATFORMS;

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const matches = data.clients.filter((c) => {
      if (activeOnly && !hasActiveProduction(c)) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.slug ?? '').toLowerCase().includes(q)
      );
    });
    // SMM brands are the audience that actually depends on these tokens
    // staying alive, so they sort to the top. Within each tier we keep
    // the alpha order the API returned.
    return matches.toSorted((a, b) => {
      const aSmm = hasSmm(a) ? 0 : 1;
      const bSmm = hasSmm(b) ? 0 : 1;
      if (aSmm !== bSmm) return aSmm - bSmm;
      return a.name.localeCompare(b.name);
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
            onClick={() => setShowAllPlatforms((v) => !v)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${
              showAllPlatforms
                ? 'border-accent-text/40 bg-accent-text/10 text-accent-text'
                : 'border-nativz-border bg-background text-text-muted hover:text-text-primary'
            }`}
            aria-pressed={showAllPlatforms}
            title="Show every Zernio-supported platform"
          >
            <span>All platforms</span>
          </button>
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
        <MatrixTable
          rows={filtered}
          platforms={visiblePlatforms}
          onPickClient={setInviteFor}
          onCycleOwner={async (clientId, platformKey, nextOwner) => {
            setData((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                clients: prev.clients.map((c) =>
                  c.id === clientId
                    ? {
                        ...c,
                        profiles: {
                          ...c.profiles,
                          [platformKey]: {
                            ...c.profiles[platformKey],
                            accountOwner: nextOwner,
                          },
                        },
                      }
                    : c,
                ),
              };
            });
            try {
              const res = await fetch(
                '/api/admin/content-tools/connections-matrix/owner',
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    clientId,
                    platform: platformKey,
                    accountOwner: nextOwner,
                  }),
                },
              );
              if (!res.ok) throw new Error('save failed');
            } catch {
              toast.error('Could not save ownership, reloading');
              void load(true);
            }
          }}
        />
      )}

      <Legend />

      <InviteBuilderModal
        client={inviteFor}
        onClose={() => setInviteFor(null)}
        onSent={() => {
          setInviteFor(null);
          void load(true);
        }}
      />
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

function MatrixTable({
  rows,
  platforms,
  onPickClient,
  onCycleOwner,
}: {
  rows: ClientRow[];
  platforms: readonly PlatformDef[];
  onPickClient: (c: ClientRow) => void;
  onCycleOwner: (
    clientId: string,
    platformKey: PlatformKey,
    nextOwner: AccountOwner,
  ) => void | Promise<void>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-nativz-border bg-background/40">
            <th className="px-5 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-text-muted">
              Brand
            </th>
            {platforms.map(({ key, label, Icon }) => (
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
                <button
                  type="button"
                  onClick={() => onPickClient(row)}
                  className="-mx-1.5 -my-1 flex items-center gap-2.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-hover focus:bg-surface-hover focus:outline-none"
                  title="Send connection invite"
                >
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
                </button>
              </td>
              {platforms.map(({ key }) => (
                <td key={key} className="px-3 py-3 text-center">
                  <SlotCell
                    slot={row.profiles[key]}
                    platformKey={key}
                    onCycleOwner={(next) => onCycleOwner(row.id, key, next)}
                  />
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
  onCycleOwner,
}: {
  slot: PlatformSlot;
  platformKey: PlatformKey;
  onCycleOwner: (next: AccountOwner) => void | Promise<void>;
}) {
  const meta = STATUS_META[slot.status];
  const Icon = meta.Icon;
  const ownerMeta = OWNER_META[slot.accountOwner];
  const tooltip = describeSlot(slot, platformKey);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="relative inline-flex">
          <span
            className={`inline-flex items-center justify-center rounded-full border ${meta.chip}`}
            style={{ height: 26, width: 26 }}
            aria-label={`${platformKey} ${meta.label}`}
          >
            <Icon className="size-3.5" />
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void onCycleOwner(nextOwner(slot.accountOwner));
            }}
            className={`absolute -bottom-1 -right-1 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full border px-[3px] text-[8px] font-semibold leading-none transition-colors ${ownerMeta.chip}`}
            aria-label={`Owner: ${ownerMeta.label}, click to change`}
            title={`Owner: ${ownerMeta.label} (click to cycle)`}
          >
            {ownerMeta.letter}
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="w-56">
        <div className="font-medium text-text-primary">{meta.label}</div>
        <div className="mt-0.5 text-text-muted">{tooltip}</div>
        <div className="mt-1.5 border-t border-nativz-border/60 pt-1.5 text-text-muted">
          Owner: <span className="text-text-primary">{ownerMeta.label}</span>.
          Click the corner badge to cycle.
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

const OWNER_META: Record<
  AccountOwner,
  { letter: string; label: string; chip: string }
> = {
  agency: {
    letter: 'A',
    label: 'Agency-owned (we made it)',
    chip: 'border-accent-text/40 bg-accent-text/15 text-accent-text',
  },
  client: {
    letter: 'C',
    label: 'Client-owned',
    chip: 'border-status-success/40 bg-status-success/15 text-status-success',
  },
  unknown: {
    letter: '?',
    label: 'Ownership unknown (triage)',
    chip: 'border-nativz-border bg-surface-elevated text-text-muted',
  },
};

function nextOwner(current: AccountOwner): AccountOwner {
  if (current === 'unknown') return 'agency';
  if (current === 'agency') return 'client';
  return 'unknown';
}

function needsReconnect(status: string | null): boolean {
  return status === 'needs_refresh' || status === 'expired';
}

function describeSlot(slot: PlatformSlot, platform: PlatformKey): string {
  const noun =
    ALL_PLATFORMS.find((p) => p.key === platform)?.label ?? platform;
  switch (slot.status) {
    case 'connected': {
      const base = slot.username
        ? `Posting as @${slot.username} via Zernio.`
        : `${noun} is connected via Zernio.`;
      if (needsReconnect(slot.tokenStatus)) {
        return `${base} Zernio flagged this token as needs_refresh, send a reconnect invite.`;
      }
      return base;
    }
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
      return `No ${noun} token on file. Send a connection invite to reconnect.`;
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
  disconnected: {
    label: 'Disconnected',
    Icon: AlertTriangle,
    chip: 'border-status-danger/40 bg-status-danger/10 text-status-danger',
  },
  missing: {
    label: 'Not connected',
    Icon: Circle,
    chip: 'border-nativz-border bg-surface-elevated text-text-secondary',
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
  if (totals.missing > 0) parts.push(`${totals.missing} missing`);
  return parts.join(' · ');
}

interface Contact {
  id: string;
  name: string | null;
  email: string;
  isPrimary: boolean;
}

interface InviteContext {
  contacts: Contact[];
  hasChatWebhook: boolean;
}

/**
 * Invite Builder modal.
 *
 * Lets the admin configure a self-serve connection invite for a brand:
 *   - which platforms to ask for (defaults to non-Connected platforms)
 *   - which POCs to email (multi-select against the brand's contacts)
 *   - whether to ping Google Chat / email on each connection
 *
 * Posts to `/api/admin/connection-invites`, which mints the token,
 * inserts the row, and fires the Resend email per recipient.
 */
function InviteBuilderModal({
  client,
  onClose,
  onSent,
}: {
  client: ClientRow | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const open = !!client;

  const [ctx, setCtx] = useState<InviteContext | null>(null);
  const [ctxLoading, setCtxLoading] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<PlatformKey>>(
    new Set(),
  );
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(
    new Set(),
  );
  const [extraEmail, setExtraEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [copying, setCopying] = useState(false);
  const [showExtras, setShowExtras] = useState(false);

  // Mode is derived on-the-fly from the picked platforms, no UI toggle.
  // If every selected platform has never been linked before, this is a
  // first-time "Connect"; otherwise (anything previously connected,
  // expired, or revoked) it's a "Reconnect". Empty selection defaults
  // to "connect" for the title copy preview.
  const mode: 'connect' | 'reconnect' = useMemo(() => {
    if (!client || selectedPlatforms.size === 0) return 'connect';
    const allFirstTime = Array.from(selectedPlatforms).every(
      (k) => client.profiles[k].status === 'missing',
    );
    return allFirstTime ? 'connect' : 'reconnect';
  }, [client, selectedPlatforms]);

  // Reset state every time we open for a new brand.
  useEffect(() => {
    if (!client) return;
    const defaults = new Set<PlatformKey>();
    for (const p of CORE_PLATFORMS) {
      if (client.profiles[p.key].status !== 'connected') defaults.add(p.key);
    }
    setSelectedPlatforms(defaults);
    setSelectedContactIds(new Set());
    setExtraEmail('');
    setShowExtras(false);

    void (async () => {
      setCtxLoading(true);
      try {
        const r = await fetch(
          `/api/admin/connection-invites/context?clientId=${client.id}`,
          { cache: 'no-store' },
        );
        if (!r.ok) throw new Error('ctx failed');
        const body = (await r.json()) as InviteContext;
        setCtx(body);
        // Pre-check the primary contact.
        const primary = body.contacts.find((c) => c.isPrimary);
        if (primary) setSelectedContactIds(new Set([primary.id]));
      } catch {
        setCtx({ contacts: [], hasChatWebhook: false });
      } finally {
        setCtxLoading(false);
      }
    })();
  }, [client]);

  const togglePlatform = (key: PlatformKey) =>
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleContact = (id: string) =>
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function handleSend() {
    if (!client) return;
    const platforms = Array.from(selectedPlatforms);
    if (platforms.length === 0) {
      toast.error('Pick at least one platform');
      return;
    }
    const ctxContacts = ctx?.contacts ?? [];
    const recipientEmails = ctxContacts
      .filter((c) => selectedContactIds.has(c.id))
      .map((c) => c.email);
    const trimmedExtra = extraEmail.trim();
    if (trimmedExtra) recipientEmails.push(trimmedExtra);
    if (recipientEmails.length === 0) {
      toast.error('Pick at least one recipient or add an email');
      return;
    }

    setSending(true);
    try {
      const res = await fetch('/api/admin/connection-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id,
          platforms,
          recipientEmails,
          notifyChat: true,
          notifyEmail: false,
          mode,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        sent?: number;
      };
      if (!res.ok) throw new Error(body.error ?? 'Send failed');
      const noun = mode === 'connect' ? 'Connect invite' : 'Reconnect invite';
      const count = body.sent ?? recipientEmails.length;
      toast.success(`${noun} sent to ${count} recipient${count === 1 ? '' : 's'}`);
      onSent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  // Mints a fresh invite + copies the reconnect URL to the clipboard.
  // Recipients aren't required, the email send is skipped, and the URL
  // is the same `/s/{token}` that the email CTA points at.
  async function handleCopyLink() {
    if (!client) return;
    const platforms = Array.from(selectedPlatforms);
    if (platforms.length === 0) {
      toast.error('Pick at least one platform');
      return;
    }
    setCopying(true);
    try {
      const res = await fetch('/api/admin/connection-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client.id,
          platforms,
          recipientEmails: [],
          notifyChat: true,
          notifyEmail: false,
          skipEmail: true,
          mode,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        url?: string;
      };
      if (!res.ok || !body.url) throw new Error(body.error ?? 'Copy failed');
      await navigator.clipboard.writeText(body.url);
      toast.success(
        mode === 'connect' ? 'Connect link copied' : 'Reconnect link copied',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Copy failed');
    } finally {
      setCopying(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        client
          ? mode === 'connect'
            ? `Connect ${client.name}'s accounts`
            : `Reconnect ${client.name}'s accounts`
          : 'Send connection invite'
      }
      maxWidth="lg"
    >
      {client && (
        <div className="space-y-5">
          <p className="text-xs text-text-muted">
            {mode === 'connect'
              ? "Pick the platforms you want them to link for the first time, choose who the email goes to, and we'll send a one-tap connect page. They never see a password screen on our side."
              : "Pick the platforms whose access dropped, choose who the email goes to, and we'll send a one-tap reconnect page. They never see a password screen on our side."}
          </p>

          <Section title="Platforms">
            <ul className="divide-y divide-nativz-border/60 rounded-lg border border-nativz-border bg-background/40">
              {CORE_PLATFORMS.map((p) => (
                <PlatformPickerRow
                  key={p.key}
                  platform={p}
                  slot={client.profiles[p.key]}
                  checked={selectedPlatforms.has(p.key)}
                  onToggle={() => togglePlatform(p.key)}
                />
              ))}
              {showExtras &&
                EXTRA_PLATFORMS.map((p) => (
                  <PlatformPickerRow
                    key={p.key}
                    platform={p}
                    slot={client.profiles[p.key]}
                    checked={selectedPlatforms.has(p.key)}
                    onToggle={() => togglePlatform(p.key)}
                  />
                ))}
            </ul>
            {!showExtras ? (
              <button
                type="button"
                onClick={() => setShowExtras(true)}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-accent-text hover:underline"
              >
                <Plus className="size-3.5" />
                More platforms (Google Business, Pinterest, X, Threads, Bluesky)
              </button>
            ) : null}
          </Section>

          <Section title="Recipients">
            {ctxLoading ? (
              <div className="text-xs text-text-muted">Loading contacts...</div>
            ) : (
              <>
                {(ctx?.contacts ?? []).length === 0 ? (
                  <div className="text-xs text-text-muted">
                    No contacts on file for this brand. Add one below.
                  </div>
                ) : (
                  <ul className="divide-y divide-nativz-border/60 rounded-lg border border-nativz-border bg-background/40">
                    {(ctx?.contacts ?? []).map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center gap-3 px-3 py-2.5"
                      >
                        <Checkbox
                          checked={selectedContactIds.has(c.id)}
                          onCheckedChange={() => toggleContact(c.id)}
                          aria-label={`Send invite to ${c.name ?? c.email}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-text-primary">
                            {c.name ?? c.email}
                            {c.isPrimary ? (
                              <span className="ml-2 rounded bg-accent-text/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-text">
                                Primary
                              </span>
                            ) : null}
                          </div>
                          {c.name ? (
                            <div className="truncate text-xs text-text-muted">
                              {c.email}
                            </div>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3">
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-text-muted">
                    Or add another email
                  </label>
                  <input
                    type="email"
                    value={extraEmail}
                    onChange={(e) => setExtraEmail(e.target.value)}
                    placeholder="someone@example.com"
                    className="mt-1 h-8 w-full rounded-md border border-nativz-border bg-background px-2.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent-text focus:outline-none focus:ring-1 focus:ring-accent-text/40"
                  />
                </div>
              </>
            )}
          </Section>

          <div className="flex items-center justify-end gap-2 border-t border-nativz-border pt-4">
            <Button
              variant="outline"
              onClick={() => void handleCopyLink()}
              disabled={copying || sending}
              title={
                mode === 'connect'
                  ? 'Mint a connect link and copy it to your clipboard. No email sent.'
                  : 'Mint a reconnect link and copy it to your clipboard. No email sent.'
              }
            >
              <Copy className="size-3.5" />
              {copying ? 'Copying...' : 'Copy link'}
            </Button>
            <Button
              onClick={() => void handleSend()}
              disabled={sending || copying}
            >
              <Send className="size-3.5" />
              {sending
                ? 'Sending...'
                : mode === 'connect'
                  ? 'Send connect invite'
                  : 'Send reconnect invite'}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-muted">
        {title}
      </div>
      {children}
    </div>
  );
}

function PlatformPickerRow({
  platform,
  slot,
  checked,
  onToggle,
}: {
  platform: PlatformDef;
  slot: PlatformSlot;
  checked: boolean;
  onToggle: () => void;
}) {
  const meta = STATUS_META[slot.status];
  const StatusIcon = meta.Icon;
  const { label, Icon } = platform;
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        aria-label={`Include ${label}`}
      />
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-nativz-border bg-surface text-text-secondary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-text-primary">{label}</div>
        {slot.username ? (
          <div className="text-[11px] text-text-muted">@{slot.username}</div>
        ) : null}
      </div>
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${meta.chip}`}
      >
        <StatusIcon className="size-3" />
        {meta.label}
      </span>
    </li>
  );
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

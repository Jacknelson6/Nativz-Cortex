'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Cable,
  CalendarClock,
  CheckCircle2,
  Circle,
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

interface PlatformSlot {
  status: SlotStatus;
  username: string | null;
  disconnectedAt: string | null;
  tokenExpiresAt: string | null;
  tokenStatus: string | null;
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
        // Re-check pings Zernio for fresh token expiry before re-reading.
        // Failures here don't block the matrix render — the cached
        // `token_expires_at` will still surface.
        await fetch('/api/admin/content-tools/connections-matrix/sync', {
          method: 'POST',
        }).catch(() => undefined);
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
}: {
  rows: ClientRow[];
  platforms: readonly PlatformDef[];
  onPickClient: (c: ClientRow) => void;
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
  const expiringSoon = isExpiringSoon(slot.tokenExpiresAt);

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
          {expiringSoon && slot.status === 'connected' ? (
            <span className="absolute -right-1 -top-1 flex size-3.5 items-center justify-center rounded-full border border-status-warning/50 bg-status-warning/20 text-status-warning">
              <CalendarClock className="size-2.5" />
            </span>
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="w-56">
        <div className="font-medium text-text-primary">{meta.label}</div>
        <div className="mt-0.5 text-text-muted">{tooltip}</div>
      </TooltipContent>
    </Tooltip>
  );
}

function isExpiringSoon(iso: string | null): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  const days = (t - Date.now()) / (1000 * 60 * 60 * 24);
  return days >= 0 && days <= 14;
}

function describeSlot(slot: PlatformSlot, platform: PlatformKey): string {
  const noun =
    ALL_PLATFORMS.find((p) => p.key === platform)?.label ?? platform;
  switch (slot.status) {
    case 'connected': {
      const base = slot.username
        ? `Posting as @${slot.username} via Zernio.`
        : `${noun} is connected via Zernio.`;
      if (slot.tokenExpiresAt && isExpiringSoon(slot.tokenExpiresAt)) {
        const days = Math.max(
          0,
          Math.round(
            (Date.parse(slot.tokenExpiresAt) - Date.now()) /
              (1000 * 60 * 60 * 24),
          ),
        );
        return `${base} Token expires in ${days} day${days === 1 ? '' : 's'} — send a reconnect invite.`;
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
      if (platform === 'linkedin') {
        return `${noun}: Zernio has no LinkedIn flow. Posts go through the client account by hand.`;
      }
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
      <div className="inline-flex items-center gap-1.5">
        <span className="inline-flex size-4 items-center justify-center rounded-full border border-status-warning/50 bg-status-warning/20 text-status-warning">
          <CalendarClock className="size-2.5" />
        </span>
        <span>Token expiring soon</span>
      </div>
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
  const [notifyChat, setNotifyChat] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [sending, setSending] = useState(false);
  const [showExtras, setShowExtras] = useState(false);

  // Reset state every time we open for a new brand.
  useEffect(() => {
    if (!client) return;
    const defaults = new Set<PlatformKey>();
    for (const p of CORE_PLATFORMS) {
      if (p.key === 'linkedin') continue;
      if (client.profiles[p.key].status !== 'connected') defaults.add(p.key);
    }
    setSelectedPlatforms(defaults);
    setSelectedContactIds(new Set());
    setExtraEmail('');
    setNotifyChat(true);
    setNotifyEmail(true);
    setShowExtras(false);

    setCtxLoading(true);
    void fetch(`/api/admin/connection-invites/context?clientId=${client.id}`, {
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('ctx failed'))))
      .then((body: InviteContext) => {
        setCtx(body);
        // Pre-check the primary contact.
        const primary = body.contacts.find((c) => c.isPrimary);
        if (primary) setSelectedContactIds(new Set([primary.id]));
      })
      .catch(() => setCtx({ contacts: [], hasChatWebhook: false }))
      .finally(() => setCtxLoading(false));
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
          notifyChat,
          notifyEmail,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        sent?: number;
      };
      if (!res.ok) throw new Error(body.error ?? 'Send failed');
      toast.success(`Invite sent to ${body.sent ?? recipientEmails.length} recipient${(body.sent ?? recipientEmails.length) === 1 ? '' : 's'}`);
      onSent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={client ? `Invite ${client.name} to reconnect` : 'Send connection invite'}
      maxWidth="lg"
    >
      {client && (
        <div className="space-y-5">
          <p className="text-xs text-text-muted">
            Pick the platforms you want them to reconnect, choose who the
            email goes to, and we&apos;ll send a one-tap connect page.
            They never see a password screen on our side.
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
                        <input
                          type="checkbox"
                          checked={selectedContactIds.has(c.id)}
                          onChange={() => toggleContact(c.id)}
                          className="size-4 rounded border-nativz-border bg-background text-accent-text focus:ring-accent-text/40"
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

          <Section title="Notify on connect">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={notifyChat}
                  onChange={(e) => setNotifyChat(e.target.checked)}
                  disabled={!ctx?.hasChatWebhook}
                  className="size-4 rounded border-nativz-border bg-background text-accent-text focus:ring-accent-text/40 disabled:opacity-40"
                />
                <span>
                  Post to Google Chat
                  {ctx && !ctx.hasChatWebhook ? (
                    <span className="ml-1.5 text-text-muted">
                      (no webhook on file for this brand)
                    </span>
                  ) : null}
                </span>
              </label>
              <label className="flex items-center gap-2 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={notifyEmail}
                  onChange={(e) => setNotifyEmail(e.target.checked)}
                  className="size-4 rounded border-nativz-border bg-background text-accent-text focus:ring-accent-text/40"
                />
                <span>Email me on each connection</span>
              </label>
            </div>
          </Section>

          <div className="flex items-center justify-end gap-2 border-t border-nativz-border pt-4">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleSend()}
              disabled={sending}
            >
              <Send className="size-3.5" />
              {sending ? 'Sending...' : 'Send invite'}
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
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="size-4 rounded border-nativz-border bg-background text-accent-text focus:ring-accent-text/40"
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

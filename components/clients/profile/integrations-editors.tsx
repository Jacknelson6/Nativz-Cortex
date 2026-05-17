'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Loader2,
  MoreHorizontal,
  Facebook,
  Instagram,
  Linkedin,
  Music2,
  Twitter,
  Youtube,
  Key,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  InlineSection,
  SectionCard,
  EditorField,
  editorInputClass,
} from './section-editor';
import { Dialog } from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm-dialog';

/* -------------------------------------------------------------------------- */
/* Shared row primitive                                                        */
/* -------------------------------------------------------------------------- */

type RowStatus = 'connected' | 'pending' | 'disconnected' | 'error' | 'idle';

const STATUS_DOT: Record<RowStatus, string> = {
  connected: 'bg-emerald-400',
  pending: 'bg-amber-400',
  disconnected: 'bg-text-muted/40',
  error: 'bg-rose-400',
  idle: 'bg-text-muted/40',
};

const STATUS_LABEL: Record<RowStatus, string> = {
  connected: 'Connected',
  pending: 'Pending',
  disconnected: 'Not connected',
  error: 'Error',
  idle: 'Not connected',
};

/**
 * Single-row integration card. Icon swatch + title + 1-line subtitle on the
 * left, primary CTA (Connect) or overflow menu on the right. Mirrors the
 * Dovetail integration tiles: each row is a self-contained surface and any
 * editing pops into a dialog so the list itself stays scannable.
 */
function IntegrationRow({
  icon: Icon,
  title,
  subtitle,
  status,
  primaryLabel,
  onPrimary,
  menuItems,
  busy,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: ReactNode;
  status?: RowStatus;
  primaryLabel?: string;
  onPrimary?: () => void;
  menuItems?: { label: string; onSelect: () => void | Promise<void>; destructive?: boolean }[];
  busy?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-nativz-border bg-surface px-4 py-3.5 transition-colors hover:border-nativz-border/80">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-surface ring-1 ring-inset ring-accent/15">
        <Icon size={16} className="text-accent-text" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-[13px] font-semibold text-text-primary leading-tight">
            {title}
          </h3>
          {status && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-text-muted">
              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
              {STATUS_LABEL[status]}
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-[12px] text-text-muted leading-relaxed">
          {subtitle}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {primaryLabel && onPrimary && (
          <button
            type="button"
            onClick={onPrimary}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-accent-hover disabled:opacity-60 transition-colors"
          >
            {busy && <Loader2 size={12} className="animate-spin" />}
            {primaryLabel}
          </button>
        )}
        {menuItems && menuItems.length > 0 && <RowMenu items={menuItems} busy={busy} />}
      </div>
    </div>
  );
}

function RowMenu({
  items,
  busy,
}: {
  items: { label: string; onSelect: () => void | Promise<void>; destructive?: boolean }[];
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors"
        aria-label="Integration actions"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <MoreHorizontal size={14} />}
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default bg-transparent"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-nativz-border bg-surface text-xs shadow-xl">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={async () => {
                  setOpen(false);
                  await item.onSelect();
                }}
                className={`block w-full px-3 py-2 text-left transition-colors hover:bg-surface-hover ${
                  item.destructive
                    ? 'text-rose-300 hover:text-rose-200'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Webhooks (config form, kept as InlineSection)                               */
/* -------------------------------------------------------------------------- */

type WebhookDraft = {
  chat_webhook_url: string;
  revision_webhook_url: string;
  paid_media_webhook_url: string;
};

export function WebhooksEditor({
  clientId,
  initial,
}: {
  clientId: string;
  initial: WebhookDraft;
}) {
  return (
    <InlineSection<WebhookDraft>
      title="Webhooks"
      description="Where Cortex pushes events. Leave blank to disable. URLs are admin-only, clients never see them."
      initial={initial}
      endpoint={`/api/clients/${clientId}`}
      validate={(d) => {
        for (const [label, value] of Object.entries({
          'Chat webhook': d.chat_webhook_url,
          'Revision webhook': d.revision_webhook_url,
          'Paid media webhook': d.paid_media_webhook_url,
        })) {
          const v = value.trim();
          if (!v) continue;
          try {
            new URL(v);
          } catch {
            return `${label} must be a valid URL`;
          }
        }
        return null;
      }}
      buildBody={(d) => ({
        chat_webhook_url: d.chat_webhook_url.trim() || null,
        revision_webhook_url: d.revision_webhook_url.trim() || null,
        paid_media_webhook_url: d.paid_media_webhook_url.trim() || null,
      })}
    >
      {(d, set) => (
        <>
          <EditorField
            label="Chat webhook"
            hint="Google Chat space URL. Gets every approval comment + new-post ping."
          >
            <input
              type="url"
              value={d.chat_webhook_url}
              onChange={(e) => set({ chat_webhook_url: e.target.value })}
              className={editorInputClass}
              placeholder="https://chat.googleapis.com/v1/spaces/..."
            />
          </EditorField>
          <EditorField
            label="Revision webhook"
            hint="Frame.io / Monday / Slack. Fires on revision request."
          >
            <input
              type="url"
              value={d.revision_webhook_url}
              onChange={(e) => set({ revision_webhook_url: e.target.value })}
              className={editorInputClass}
              placeholder="https://"
            />
          </EditorField>
          <EditorField label="Paid media webhook" hint="Where paid-media all-clear pings land.">
            <input
              type="url"
              value={d.paid_media_webhook_url}
              onChange={(e) => set({ paid_media_webhook_url: e.target.value })}
              className={editorInputClass}
              placeholder="https://"
            />
          </EditorField>
        </>
      )}
    </InlineSection>
  );
}

/* -------------------------------------------------------------------------- */
/* UpPromote                                                                  */
/* -------------------------------------------------------------------------- */

export function UpPromoteEditor({
  clientId,
  connected,
  maskedKey,
}: {
  clientId: string;
  connected: boolean;
  maskedKey: string | null;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm({
    title: 'Disconnect UpPromote?',
    description: 'Cortex will stop pulling affiliate earnings and sign-ups for the weekly digest.',
    confirmLabel: 'Disconnect',
    variant: 'danger',
  });

  function openDialog() {
    setValue('');
    setDialogOpen(true);
  }

  async function handleSave() {
    const trimmed = value.trim();
    if (!trimmed) {
      toast.error('Paste an API key first');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uppromote_api_key: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Save failed (${res.status})`);
      }
      toast.success('UpPromote key saved');
      setDialogOpen(false);
      setValue('');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!(await confirm())) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uppromote_api_key: null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Disconnect failed (${res.status})`);
      }
      toast.success('UpPromote disconnected');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Disconnect failed');
    } finally {
      setBusy(false);
    }
  }

  const subtitle = connected
    ? maskedKey
      ? <>Key <span className="font-mono text-text-secondary">{maskedKey}</span> · weekly affiliate digest active</>
      : 'Weekly affiliate digest active'
    : 'Pulls affiliate earnings + new sign-ups for the weekly digest';

  return (
    <>
      <SectionCard
        title="Affiliate tracking"
        description="External tools that feed Cortex client-level numbers."
        bodyClassName="px-5 sm:px-6 py-5"
      >
        <IntegrationRow
          icon={Key}
          title="UpPromote"
          subtitle={subtitle}
          status={connected ? 'connected' : 'idle'}
          primaryLabel={connected ? undefined : 'Connect'}
          onPrimary={connected ? undefined : openDialog}
          menuItems={
            connected
              ? [
                  { label: 'Update API key', onSelect: openDialog },
                  { label: 'Disconnect', onSelect: handleDisconnect, destructive: true },
                ]
              : undefined
          }
          busy={busy}
        />
      </SectionCard>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={connected ? 'Update UpPromote key' : 'Connect UpPromote'}
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-[12.5px] text-text-muted leading-relaxed">
            Paste the API key from UpPromote → Settings → API. Cortex stores it encrypted;
            clients never see the value.
          </p>
          <EditorField label="API key">
            <input
              type="password"
              autoComplete="off"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className={editorInputClass}
              placeholder={connected ? 'Paste a new key' : 'up_live_...'}
            />
          </EditorField>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
              className="rounded-full px-3 py-1.5 text-[12px] text-text-muted hover:bg-surface-hover hover:text-text-primary disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !value.trim()}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-[12px] font-medium text-white hover:bg-accent-hover disabled:opacity-40 transition-colors"
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              {connected ? 'Update key' : 'Connect'}
            </button>
          </div>
        </div>
      </Dialog>

      {confirmDialog}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Social accounts                                                            */
/* -------------------------------------------------------------------------- */

type ConnectionStatus = 'pending' | 'connected' | 'disconnected' | 'error';

const PLATFORM_ICONS: Record<string, LucideIcon> = {
  instagram: Instagram,
  tiktok: Music2,
  youtube: Youtube,
  facebook: Facebook,
  linkedin: Linkedin,
  x: Twitter,
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  x: 'X',
};

type SocialRow = {
  platform: string;
  handle: string | null;
  connection_status: ConnectionStatus | null;
  connected_via: string | null;
};

/**
 * Dovetail-style social accounts layout: connected handles surface as
 * full-width single rows up top, the rest live in an "Add accounts" grid
 * below. Each row only has a label + status + overflow menu. Handle
 * editing pops a dedicated dialog so the list never carries inline inputs.
 */
export function SocialAccountsEditor({
  clientId,
  initial,
  platforms,
}: {
  clientId: string;
  initial: Record<string, SocialRow>;
  platforms: string[];
}) {
  const connected = platforms.filter((p) => initial[p]?.handle);
  const available = platforms.filter((p) => !initial[p]?.handle);

  return (
    <div className="space-y-6">
      {connected.length > 0 && (
        <SectionCard
          title="Connected accounts"
          description="Handles we already pull from for posting, analytics, and the weekly social digest."
          bodyClassName="px-5 sm:px-6 py-5"
        >
          <div className="space-y-2">
            {connected.map((platform) => (
              <SocialAccountRow
                key={platform}
                clientId={clientId}
                platform={platform}
                initial={initial[platform]}
              />
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard
        title={connected.length > 0 ? 'Add accounts' : 'Social accounts'}
        description={
          connected.length > 0
            ? 'Add the remaining platforms this brand posts to.'
            : 'Connect the platforms this brand posts to.'
        }
        bodyClassName="px-5 sm:px-6 py-5"
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {available.map((platform) => (
            <SocialAccountRow
              key={platform}
              clientId={clientId}
              platform={platform}
              initial={initial[platform]}
            />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function SocialAccountRow({
  clientId,
  platform,
  initial,
}: {
  clientId: string;
  platform: string;
  initial: SocialRow | undefined;
}) {
  const router = useRouter();
  const Icon = PLATFORM_ICONS[platform] ?? Key;
  const label = PLATFORM_LABELS[platform] ?? platform;

  const initialHandle = (initial?.handle ?? '').replace(/^@+/, '');
  const isConnected = Boolean(initial?.handle) && initial?.connection_status === 'connected';
  const status: RowStatus =
    initial?.connection_status ??
    (initial?.handle ? 'connected' : 'idle');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [handle, setHandle] = useState(initialHandle);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const baselineRef = useRef(initialHandle);

  const { confirm, dialog: confirmDialog } = useConfirm({
    title: `Disconnect ${label}?`,
    description: `Cortex will stop posting to and reading from this ${label} handle.`,
    confirmLabel: 'Disconnect',
    variant: 'danger',
  });

  useEffect(() => {
    baselineRef.current = initialHandle;
    setHandle(initialHandle);
  }, [initialHandle]);

  function openDialog() {
    setHandle(baselineRef.current);
    setDialogOpen(true);
  }

  async function handleSave() {
    const trimmed = handle.trim().replace(/^@+/, '');
    if (!trimmed) {
      toast.error('Add a handle first');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/social-accounts/${platform}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handle: trimmed,
          connection_status: 'connected',
          connected_via: 'manual',
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Save failed (${res.status})`);
      }
      toast.success(`${label} saved`);
      baselineRef.current = trimmed;
      setHandle(trimmed);
      setDialogOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!(await confirm())) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/social-accounts/${platform}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Disconnect failed (${res.status})`);
      }
      toast.success(`${label} disconnected`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Disconnect failed');
    } finally {
      setBusy(false);
    }
  }

  const subtitle = isConnected
    ? <span className="font-mono text-text-secondary">@{baselineRef.current}</span>
    : initial?.handle
    ? <>Saved as <span className="font-mono">@{baselineRef.current}</span>, awaiting verification</>
    : 'Not connected';

  return (
    <>
      <IntegrationRow
        icon={Icon}
        title={label}
        subtitle={subtitle}
        status={status}
        primaryLabel={isConnected ? undefined : 'Connect'}
        onPrimary={isConnected ? undefined : openDialog}
        menuItems={
          isConnected
            ? [
                { label: 'Edit handle', onSelect: openDialog },
                { label: 'Disconnect', onSelect: handleDisconnect, destructive: true },
              ]
            : undefined
        }
        busy={busy}
      />

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={isConnected ? `Edit ${label} handle` : `Connect ${label}`}
        maxWidth="md"
      >
        <div className="space-y-4">
          <EditorField label="Handle" hint={`Just the username, no @ or URL.`}>
            <div className="flex items-stretch overflow-hidden rounded-lg border border-nativz-border/80 bg-background/60 transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
              <span className="flex items-center px-3 text-[13px] text-text-muted select-none border-r border-nativz-border/60">
                @
              </span>
              <input
                type="text"
                autoComplete="off"
                autoFocus
                value={handle}
                onChange={(e) => setHandle(e.target.value.replace(/^@+/, ''))}
                placeholder={`${label.toLowerCase()}-handle`}
                className="flex-1 bg-transparent px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted/60 focus:outline-none"
              />
            </div>
          </EditorField>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
              className="rounded-full px-3 py-1.5 text-[12px] text-text-muted hover:bg-surface-hover hover:text-text-primary disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !handle.trim()}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-[12px] font-medium text-white hover:bg-accent-hover disabled:opacity-40 transition-colors"
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              {isConnected ? 'Save handle' : 'Connect'}
            </button>
          </div>
        </div>
      </Dialog>

      {confirmDialog}
    </>
  );
}

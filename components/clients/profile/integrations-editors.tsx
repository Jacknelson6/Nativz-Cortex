'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Loader2,
  Plug2,
  Facebook,
  Instagram,
  Linkedin,
  Music2,
  Twitter,
  Youtube,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  InlineSection,
  EditorField,
  editorInputClass,
} from './section-editor';

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
      description="Where Cortex pushes events. Leave blank to disable. URLs are admin-only — clients never see them."
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
            hint="Google Chat space URL — gets every approval comment + new-drop ping."
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
            hint="Frame.io / Monday / Slack — fires on revision request."
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

/**
 * UpPromote key never round-trips its value. The input is empty unless the
 * admin is actively replacing the key; saving an empty input is a no-op,
 * saving a populated input writes the new key. Disconnect is its own button.
 */
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
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const dirty = value.trim().length > 0;

  async function handleSave() {
    if (!dirty) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uppromote_api_key: value.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Save failed (${res.status})`);
      }
      toast.success('UpPromote key saved');
      setValue('');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
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
      setDisconnecting(false);
    }
  }

  return (
    <section>
      <header className="mb-4">
        <h2 className="ui-section-title">UpPromote</h2>
        <p className="mt-1.5 text-[13px] text-text-muted leading-relaxed max-w-[60ch]">
          Pulls affiliate earnings + new sign-ups for the weekly digest.
          {connected && maskedKey && (
            <>
              {' '}
              Current key: <span className="font-mono text-text-secondary">{maskedKey}</span>
            </>
          )}
        </p>
      </header>
      <div className="rounded-2xl border border-nativz-border bg-surface overflow-hidden">
        <div className="px-5 py-5 sm:px-6 sm:py-6">
          <EditorField
            label="API key"
            hint={
              connected
                ? 'Paste a new key to replace the current one, or use Disconnect to remove it.'
                : 'Paste the key from UpPromote → Settings → API.'
            }
          >
            <input
              type="password"
              autoComplete="off"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className={editorInputClass}
              placeholder={connected ? '••••••••••••' : 'up_live_...'}
            />
          </EditorField>
        </div>
        <footer
          className={`flex items-center justify-between gap-3 border-t border-nativz-border/70 px-5 sm:px-6 py-3 transition-colors ${
            dirty ? 'bg-accent-surface/30' : 'bg-surface-hover/20'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            {connected && (
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={saving || disconnecting}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/10 disabled:opacity-60 transition-colors"
              >
                {disconnecting && <Loader2 size={12} className="animate-spin" />}
                Disconnect
              </button>
            )}
            {!connected && (
              <span className="text-[11.5px] text-text-muted opacity-60">Not connected</span>
            )}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving || disconnecting}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            {connected ? 'Update key' : 'Connect'}
          </button>
        </footer>
      </div>
    </section>
  );
}

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

const STATUS_OPTIONS: { value: ConnectionStatus; label: string }[] = [
  { value: 'connected', label: 'Connected' },
  { value: 'pending', label: 'Pending' },
  { value: 'disconnected', label: 'Disconnected' },
  { value: 'error', label: 'Error' },
];

type SocialRow = {
  platform: string;
  handle: string | null;
  connection_status: ConnectionStatus | null;
  connected_via: string | null;
};

/**
 * Inline social-accounts editor — one row per platform, each row has its own
 * handle input, status select, and Save/Disconnect actions. Save only
 * activates when the row is dirty. Disconnect only appears for currently
 * connected platforms.
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
  return (
    <section>
      <header className="mb-4">
        <h2 className="ui-section-title">Social accounts</h2>
        <p className="mt-1.5 text-[13px] text-text-muted leading-relaxed max-w-[60ch]">
          Connected handles used for posting, analytics, and the weekly social digest.
        </p>
      </header>
      <div className="rounded-2xl border border-nativz-border bg-surface overflow-hidden divide-y divide-nativz-border/70">
        {platforms.map((platform) => (
          <SocialAccountRow
            key={platform}
            clientId={clientId}
            platform={platform}
            initial={initial[platform]}
          />
        ))}
      </div>
    </section>
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
  const Icon = PLATFORM_ICONS[platform];
  const label = PLATFORM_LABELS[platform] ?? platform;

  const initialHandle = (initial?.handle ?? '').replace(/^@+/, '');
  const initialStatus: ConnectionStatus =
    initial?.connection_status ?? (initial?.handle ? 'connected' : 'pending');

  const [handle, setHandle] = useState(initialHandle);
  const [status, setStatus] = useState<ConnectionStatus>(initialStatus);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const baselineRef = useRef({ handle: initialHandle, status: initialStatus });

  useEffect(() => {
    baselineRef.current = { handle: initialHandle, status: initialStatus };
    setHandle(initialHandle);
    setStatus(initialStatus);
  }, [initialHandle, initialStatus]);

  const dirty = useMemo(
    () => handle.trim() !== baselineRef.current.handle || status !== baselineRef.current.status,
    [handle, status],
  );
  const isConnected = initial?.connection_status === 'connected';

  async function handleSave() {
    const trimmed = handle.trim().replace(/^@+/, '');
    if (status === 'connected' && !trimmed) {
      toast.error('Add a handle before marking as connected');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/clients/${clientId}/social-accounts/${platform}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            handle: trimmed || null,
            connection_status: status,
            connected_via: 'manual',
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Save failed (${res.status})`);
      }
      toast.success(`${label} saved`);
      baselineRef.current = { handle: trimmed, status };
      setHandle(trimmed);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch(
        `/api/clients/${clientId}/social-accounts/${platform}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Disconnect failed (${res.status})`);
      }
      toast.success(`${label} disconnected`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Disconnect failed');
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 px-5 sm:px-6 py-4">
      <div className="flex items-center gap-3 min-w-[9rem]">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-surface ring-1 ring-inset ring-accent/15">
          {Icon && <Icon size={15} className="text-accent-text" />}
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-text-primary leading-tight">{label}</div>
          <StatusDot status={status} />
        </div>
      </div>
      <div className="flex flex-1 items-center gap-1 min-w-[12rem]">
        <span className="text-text-muted text-sm select-none pl-1">@</span>
        <input
          type="text"
          autoComplete="off"
          value={handle}
          onChange={(e) => setHandle(e.target.value.replace(/^@+/, ''))}
          placeholder="handle"
          className={`${editorInputClass} flex-1`}
        />
      </div>
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as ConnectionStatus)}
        className={`${editorInputClass} w-[10rem] shrink-0`}
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-1 shrink-0">
        {isConnected && (
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={saving || disconnecting}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/10 disabled:opacity-60 transition-colors"
          >
            {disconnecting && <Loader2 size={12} className="animate-spin" />}
            Disconnect
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving || disconnecting}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? (
            <Loader2 size={12} className="animate-spin" />
          ) : isConnected ? null : (
            <Plug2 size={12} />
          )}
          {isConnected ? 'Save' : 'Connect'}
        </button>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: ConnectionStatus }) {
  const style: Record<ConnectionStatus, { dot: string; label: string }> = {
    connected: { dot: 'bg-emerald-400', label: 'Connected' },
    pending: { dot: 'bg-amber-400', label: 'Pending' },
    disconnected: { dot: 'bg-text-muted/40', label: 'Disconnected' },
    error: { dot: 'bg-rose-400', label: 'Error' },
  };
  const s = style[status];
  return (
    <div className="flex items-center gap-1.5 mt-0.5">
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      <span className="text-[10.5px] text-text-muted">{s.label}</span>
    </div>
  );
}

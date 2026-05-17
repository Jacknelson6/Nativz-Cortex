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
    <section className="space-y-3">
      <header className="space-y-1">
        <h2 className="text-sm font-semibold text-text-primary leading-tight">UpPromote</h2>
        <p className="text-xs text-text-muted leading-relaxed">
          Pulls affiliate earnings + new sign-ups for the weekly digest.
          {connected && maskedKey && (
            <>
              {' '}
              Current key: <span className="font-mono text-text-secondary">{maskedKey}</span>
            </>
          )}
        </p>
      </header>
      <div className="rounded-xl border border-nativz-border bg-surface overflow-hidden">
        <div className="px-4 py-4">
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
        <footer className="flex items-center justify-between gap-2 border-t border-nativz-border bg-surface-hover/30 px-4 py-2.5">
          <div>
            {connected && (
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={saving || disconnecting}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-400/30 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-60"
              >
                {disconnecting && <Loader2 size={12} className="animate-spin" />}
                Disconnect
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving || disconnecting}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
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
    <section className="space-y-3">
      <header className="space-y-1">
        <h2 className="text-sm font-semibold text-text-primary leading-tight">
          Social accounts
        </h2>
        <p className="text-xs text-text-muted leading-relaxed">
          Connected handles used for posting, analytics, and the weekly social digest.
        </p>
      </header>
      <div className="rounded-xl border border-nativz-border bg-surface overflow-hidden">
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
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-nativz-border/60 last:border-b-0">
      <div className="flex items-center gap-2.5 min-w-[7.5rem]">
        {Icon && <Icon size={16} className="text-text-muted" />}
        <span className="text-sm font-medium text-text-primary">{label}</span>
      </div>
      <div className="flex flex-1 items-center gap-2 min-w-[12rem]">
        <span className="text-text-muted text-sm select-none">@</span>
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
      <div className="flex items-center gap-2 shrink-0">
        {isConnected && (
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={saving || disconnecting}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-400/30 bg-red-500/5 px-2.5 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-60"
          >
            {disconnecting && <Loader2 size={12} className="animate-spin" />}
            Disconnect
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving || disconnecting}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
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

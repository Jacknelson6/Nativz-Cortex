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
  SectionCard,
  SectionFooter,
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
            hint="Google Chat space URL. Gets every approval comment + new-drop ping."
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

  const showFooter = dirty || connected;
  return (
    <SectionCard
      title="UpPromote"
      description={
        <>
          Pulls affiliate earnings + new sign-ups for the weekly digest.
          {connected && maskedKey && (
            <>
              {' '}
              Current key: <span className="font-mono text-text-secondary">{maskedKey}</span>
            </>
          )}
        </>
      }
      headerAction={
        <StatusPill kind={connected ? 'connected' : 'idle'}>
          {connected ? 'Connected' : 'Not connected'}
        </StatusPill>
      }
      footer={
        showFooter ? (
          <SectionFooter
            saving={saving}
            onSave={handleSave}
            saveLabel={connected ? 'Update key' : 'Connect'}
            disabled={!dirty}
            leftSlot={
              connected ? (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  disabled={saving || disconnecting}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium text-rose-300 hover:bg-rose-500/10 disabled:opacity-60 transition-colors"
                >
                  {disconnecting && <Loader2 size={12} className="animate-spin" />}
                  Disconnect
                </button>
              ) : undefined
            }
          />
        ) : null
      }
    >
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
    </SectionCard>
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

type SocialRow = {
  platform: string;
  handle: string | null;
  connection_status: ConnectionStatus | null;
  connected_via: string | null;
};

/**
 * Inline social-accounts editor: one row per platform, each row has its own
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
    <SectionCard
      title="Social accounts"
      description="Connected handles used for posting, analytics, and the weekly social digest."
      bodyClassName="divide-y divide-nativz-border/60"
    >
      {platforms.map((platform) => (
        <SocialAccountRow
          key={platform}
          clientId={clientId}
          platform={platform}
          initial={initial[platform]}
        />
      ))}
    </SectionCard>
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
  const status: ConnectionStatus =
    initial?.connection_status ?? (initial?.handle ? 'connected' : 'pending');

  const [handle, setHandle] = useState(initialHandle);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const baselineRef = useRef(initialHandle);

  useEffect(() => {
    baselineRef.current = initialHandle;
    setHandle(initialHandle);
  }, [initialHandle]);

  const dirty = useMemo(() => handle.trim() !== baselineRef.current, [handle]);
  const isConnected = initial?.connection_status === 'connected';

  async function handleSave() {
    const trimmed = handle.trim().replace(/^@+/, '');
    if (!trimmed) {
      toast.error('Add a handle before saving');
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
            handle: trimmed,
            connection_status: 'connected',
            connected_via: 'manual',
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Save failed (${res.status})`);
      }
      toast.success(`${label} saved`);
      baselineRef.current = trimmed;
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

  const statusMeta: Record<ConnectionStatus, { dot: string; label: string }> = {
    connected: { dot: 'bg-emerald-400', label: 'Connected' },
    pending: { dot: 'bg-amber-400', label: 'Pending' },
    disconnected: { dot: 'bg-text-muted/40', label: 'Not connected' },
    error: { dot: 'bg-rose-400', label: 'Error' },
  };
  const sm = statusMeta[status];

  return (
    <div className="flex items-center gap-4 px-5 sm:px-6 py-3.5">
      <div className="flex items-center gap-3 min-w-[10rem] shrink-0">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-surface ring-1 ring-inset ring-accent/15">
          {Icon && <Icon size={15} className="text-accent-text" />}
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-text-primary leading-tight">{label}</div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${sm.dot}`} />
            <span className="text-[11px] text-text-muted">{sm.label}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-1 items-center gap-1 min-w-0">
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
      <div className="flex items-center gap-2 shrink-0">
        {isConnected && !dirty && (
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={saving || disconnecting}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium text-rose-300 hover:bg-rose-500/10 disabled:opacity-60 transition-colors"
          >
            {disconnecting && <Loader2 size={12} className="animate-spin" />}
            Disconnect
          </button>
        )}
        {dirty && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || disconnecting}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-[12px] font-medium text-white hover:bg-accent-hover disabled:opacity-60 transition-colors"
          >
            {saving ? (
              <Loader2 size={12} className="animate-spin" />
            ) : !isConnected ? (
              <Plug2 size={12} />
            ) : null}
            {isConnected ? 'Save' : 'Connect'}
          </button>
        )}
      </div>
    </div>
  );
}

function StatusPill({
  kind,
  children,
}: {
  kind: 'connected' | 'idle';
  children: React.ReactNode;
}) {
  const cls =
    kind === 'connected'
      ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
      : 'border-nativz-border bg-background/60 text-text-muted';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${cls}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          kind === 'connected' ? 'bg-emerald-400' : 'bg-text-muted/50'
        }`}
      />
      {children}
    </span>
  );
}

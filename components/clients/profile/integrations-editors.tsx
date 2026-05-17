'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, X, Loader2, Plug2 } from 'lucide-react';
import {
  SectionEditor,
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
    <SectionEditor<WebhookDraft>
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
          <EditorField label="Revision webhook" hint="Frame.io / Monday / Slack — fires on revision request.">
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
    </SectionEditor>
  );
}

type UpPromoteDraft = { uppromote_api_key: string };

/**
 * UpPromote key never round-trips its value. Editor accepts a new key on
 * save; an empty submission clears it. The page itself only displays
 * "Connected" / "Not connected" from a boolean.
 */
export function UpPromoteEditor({
  clientId,
  connected,
}: {
  clientId: string;
  connected: boolean;
}) {
  return (
    <SectionEditor<UpPromoteDraft>
      label={connected ? 'Update' : 'Connect'}
      title="UpPromote API key"
      description="Used to pull affiliate earnings + new signups for the weekly digest."
      initial={{ uppromote_api_key: '' }}
      endpoint={`/api/clients/${clientId}`}
      buildBody={(d) => ({
        uppromote_api_key: d.uppromote_api_key.trim() || null,
      })}
    >
      {(d, set) => (
        <EditorField
          label="API key"
          hint={connected ? 'Paste a new key to replace the current one. Submit blank to disconnect.' : 'Paste the key from UpPromote → Settings → API.'}
        >
          <input
            type="password"
            autoComplete="off"
            value={d.uppromote_api_key}
            onChange={(e) => set({ uppromote_api_key: e.target.value })}
            className={editorInputClass}
            placeholder={connected ? '••••••••••••' : 'up_live_...'}
          />
        </EditorField>
      )}
    </SectionEditor>
  );
}

/**
 * SocialAccountEditor — per-platform editor for the integrations page.
 * Custom dialog (not SectionEditor) because we want Save + Disconnect
 * actions in the same drawer, and a status selector beside the handle.
 *
 * Writes through `/api/clients/[id]/social-accounts/[platform]` which
 * delegates to `upsertClientSocialAccount`. Idempotent on (client, platform).
 */
type ConnectionStatus = 'pending' | 'connected' | 'disconnected' | 'error';

const STATUS_OPTIONS: { value: ConnectionStatus; label: string }[] = [
  { value: 'connected', label: 'Connected' },
  { value: 'pending', label: 'Pending' },
  { value: 'disconnected', label: 'Disconnected' },
  { value: 'error', label: 'Error' },
];

export function SocialAccountEditor({
  clientId,
  platform,
  platformLabel,
  initial,
}: {
  clientId: string;
  platform: string;
  platformLabel: string;
  initial: {
    handle: string | null;
    connection_status: ConnectionStatus | null;
    connected_via: string | null;
  };
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [handle, setHandle] = useState(initial.handle ?? '');
  const [status, setStatus] = useState<ConnectionStatus>(
    initial.connection_status ?? 'connected',
  );

  const isConnected = initial.connection_status === 'connected';

  useEffect(() => {
    if (open) {
      setHandle(initial.handle ?? '');
      setStatus(initial.connection_status ?? 'connected');
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [open, initial.handle, initial.connection_status]);

  async function handleSave() {
    const trimmed = handle.trim().replace(/^@+/, '');
    if (status === 'connected' && !trimmed) {
      toast.error('Add a handle before marking as connected');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/social-accounts/${platform}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handle: trimmed || null,
          connection_status: status,
          connected_via: 'manual',
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Save failed (${res.status})`);
      }
      toast.success('Saved');
      setOpen(false);
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
      const res = await fetch(`/api/clients/${clientId}/social-accounts/${platform}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Disconnect failed (${res.status})`);
      }
      toast.success(`Disconnected ${platformLabel}`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Disconnect failed');
    } finally {
      setDisconnecting(false);
    }
  }

  const buttonLabel = isConnected ? 'Edit' : 'Connect';
  const ButtonIcon = isConnected ? Pencil : Plug2;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface px-2.5 py-1 text-[11px] text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors shrink-0"
      >
        <ButtonIcon size={11} />
        {buttonLabel}
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onCancel={(e) => {
          e.preventDefault();
          setOpen(false);
        }}
        className="m-auto w-[min(520px,calc(100vw-2rem))] rounded-2xl border border-nativz-border bg-surface p-0 text-text-primary backdrop:bg-black/60"
      >
        {open && (
          <div className="flex max-h-[85vh] flex-col">
            <header className="flex items-start justify-between gap-3 border-b border-nativz-border px-5 py-4">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-text-primary">
                  {platformLabel} account
                </h3>
                <p className="text-xs text-text-muted mt-1 leading-relaxed">
                  Handle and status the rest of Cortex uses for posting, analytics, and digests.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-text-muted hover:text-text-primary hover:bg-surface-hover"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <EditorField
                label="Handle"
                hint="Without the @. Used in captions, share links, and the social digest."
              >
                <input
                  type="text"
                  autoComplete="off"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  className={editorInputClass}
                  placeholder="brandname"
                />
              </EditorField>
              <EditorField
                label="Connection status"
                hint="Mark as connected once posting + analytics are wired. Pending = handle known but Zernio not linked yet."
              >
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ConnectionStatus)}
                  className={editorInputClass}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </EditorField>
            </div>
            <footer className="flex items-center justify-between gap-2 border-t border-nativz-border bg-surface-hover/40 px-5 py-3">
              <div>
                {isConnected && (
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={saving || disconnecting}
                  className="rounded-md px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || disconnecting}
                  className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
                >
                  {saving && <Loader2 size={12} className="animate-spin" />}
                  Save changes
                </button>
              </div>
            </footer>
          </div>
        )}
      </dialog>
    </>
  );
}

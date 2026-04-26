'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Pencil,
  RotateCcw,
  Send,
  Settings,
  Webhook,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { InlineSpinner, SkeletonRows } from '@/components/ui/loading-skeletons';
import { LabeledInput } from './contacts-tab';
import { TONE_PILL } from './_status-tokens';

type SecretMeta = {
  key: string;
  envConfigured: boolean;
  source: 'db' | 'env' | 'missing';
  updatedBy: string | null;
  updatedAt: string | null;
};

type SecretsResponse = {
  encryptionReady: boolean;
  secrets: SecretMeta[];
};

const SECRET_DESCRIPTIONS: Record<string, string> = {
  RESEND_API_KEY: 'Required. Resend outbound API key — rotate here after regenerating in the Resend dashboard.',
  RESEND_WEBHOOK_SECRET:
    'Shared fallback signing secret. Covers both agencies when set — use this if you have a single Resend webhook endpoint.',
  RESEND_WEBHOOK_SECRET_NATIVZ:
    'Optional per-agency override for nativz.io webhook signatures. Overrides the shared secret for Nativz events only.',
  RESEND_WEBHOOK_SECRET_ANDERSON:
    'Optional per-agency override for andersoncollaborative.com webhook signatures.',
};

type Agency = {
  key: 'nativz' | 'anderson';
  label: string;
  from: string;
  replyTo: string;
  sendDomain: string;
  webhookSecretEnvVar: string;
  webhookSecretConfigured: boolean;
  webhookSecretSource: 'dedicated' | 'shared' | 'missing';
};

type SetupData = {
  agencies: Agency[];
  env: {
    resendKeyConfigured: boolean;
    sharedWebhookSecretConfigured: boolean;
    cronSecretConfigured: boolean;
  };
  webhook: {
    endpoint: string;
    eventsLast24h: number;
    eventsByType: Record<string, number>;
    latestEventAt: string | null;
    rejectedLast24h: number;
    latestRejectedAt: string | null;
  };
};

export function SetupTab() {
  const { data, error, isLoading, mutate } = useSWR<SetupData>('/api/admin/email-hub/setup');

  if (error) {
    return (
      <section className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-center">
        <p className="text-sm text-rose-500">Couldn&apos;t load setup state.</p>
        <button
          type="button"
          onClick={() => void mutate()}
          className="mt-3 rounded-full border border-nativz-border bg-background px-4 py-2 text-xs font-medium text-text-secondary hover:text-text-primary"
        >
          Retry
        </button>
      </section>
    );
  }

  if (isLoading || !data) {
    return (
      <section className="rounded-2xl border border-nativz-border bg-surface">
        <InlineSpinner label="Loading setup…" />
      </section>
    );
  }

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${data.webhook.endpoint}`
    : data.webhook.endpoint;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-nativz-border bg-surface overflow-hidden">
        <header className="flex items-center gap-2.5 px-5 py-4 border-b border-nativz-border">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-surface border border-nativz-border">
            <Settings size={15} className="text-accent-text" />
          </div>
          <h2 className="text-base font-semibold text-text-primary">Sender identities</h2>
        </header>
        <ul className="divide-y divide-nativz-border">
          {data.agencies.map((a) => (
            <li key={a.key} className="px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">{a.label}</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    Send domain: <code>{a.sendDomain}</code>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <WebhookSecretChip
                    configured={a.webhookSecretConfigured}
                    source={a.webhookSecretSource}
                    envVar={a.webhookSecretEnvVar}
                  />
                  <TestSendButton agency={a.key} />
                </div>
              </div>
              <dl className="mt-3 text-xs">
                <div className="rounded-xl border border-nativz-border bg-background px-3 py-2.5">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    From
                  </dt>
                  <dd className="mt-0.5 text-text-primary font-mono">{a.from}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </section>

      <SecretsSection cronSecretConfigured={data.env.cronSecretConfigured} />

      <section className="rounded-2xl border border-nativz-border bg-surface overflow-hidden">
        <header className="flex items-center gap-2.5 px-5 py-4 border-b border-nativz-border">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-surface border border-nativz-border">
            <Webhook size={15} className="text-accent-text" />
          </div>
          <h2 className="text-base font-semibold text-text-primary">Webhook</h2>
        </header>
        <div className="p-5 space-y-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">
              Endpoint — paste into Resend dashboard
            </p>
            <div className="flex items-center gap-2 rounded-xl border border-nativz-border bg-background px-3 py-2.5">
              <code className="text-xs text-text-primary truncate flex-1">{webhookUrl}</code>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(webhookUrl)}
                className="text-text-muted hover:text-text-primary"
                title="Copy"
              >
                <Copy size={13} />
              </button>
              <a
                href="https://resend.com/webhooks"
                target="_blank"
                rel="noreferrer"
                className="text-text-muted hover:text-text-primary"
                title="Open Resend dashboard"
              >
                <ExternalLink size={13} />
              </a>
            </div>
          </div>
          <p className="text-xs text-text-muted">
            Subscribe to <code>email.sent</code>, <code>email.delivered</code>,{' '}
            <code>email.opened</code>, <code>email.clicked</code>,{' '}
            <code>email.bounced</code>, <code>email.complained</code>, and{' '}
            <code>email.failed</code>. Paste the generated signing secret into your
            environment as <code>RESEND_WEBHOOK_SECRET</code>.
          </p>

          <div className="rounded-xl border border-nativz-border bg-background/60 px-4 py-3">
            <p className="text-xs font-semibold text-text-primary mb-1.5">
              Last 24 hours
            </p>
            {data.webhook.eventsLast24h === 0 && data.webhook.rejectedLast24h === 0 ? (
              <p className="text-sm text-text-muted">
                No webhook events received yet. Send a test email from above — the
                event should show up here within ~30 seconds. If it still doesn&apos;t
                appear, double-check that the endpoint URL and signing secret in
                Resend match the values on this page.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.webhook.eventsByType).map(([type, count]) => (
                  <span
                    key={type}
                    className="inline-flex items-center rounded-full border border-nativz-border bg-surface px-2.5 py-1 text-xs text-text-secondary"
                  >
                    <span className="font-mono mr-1.5 text-text-primary">{count}</span>
                    {type}
                  </span>
                ))}
              </div>
            )}
            {data.webhook.latestEventAt && (
              <p className="mt-2 text-[11px] text-text-muted">
                Latest: {new Date(data.webhook.latestEventAt).toLocaleString()}
              </p>
            )}
            {data.webhook.rejectedLast24h > 0 ? (
              <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                <p className="text-xs font-semibold text-amber-500">
                  {data.webhook.rejectedLast24h} rejected attempt
                  {data.webhook.rejectedLast24h === 1 ? '' : 's'} · signature failed
                </p>
                <p className="mt-0.5 text-[11px] text-amber-500/80">
                  Resend is reaching the endpoint but the signing secret doesn&apos;t
                  match. Copy a fresh secret from the Resend webhook page and update{' '}
                  <code>RESEND_WEBHOOK_SECRET</code>.
                  {data.webhook.latestRejectedAt
                    ? ` Latest: ${new Date(data.webhook.latestRejectedAt).toLocaleString()}`
                    : ''}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function WebhookSecretChip({
  configured,
  source,
  envVar,
}: {
  configured: boolean;
  source: 'dedicated' | 'shared' | 'missing';
  envVar: string;
}) {
  const label =
    source === 'dedicated'
      ? 'Secret set'
      : source === 'shared'
      ? 'Shared secret'
      : 'Secret missing';
  const tooltip =
    source === 'dedicated'
      ? `Signed with ${envVar}`
      : source === 'shared'
      ? `Using shared RESEND_WEBHOOK_SECRET. Set ${envVar} for a per-agency override.`
      : `Set ${envVar} in Vercel (or RESEND_WEBHOOK_SECRET as a shared fallback).`;
  const tone = !configured ? 'warning' : source === 'dedicated' ? 'success' : 'info';
  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ${TONE_PILL[tone]}`}
    >
      {configured ? <CheckCircle2 size={11} aria-hidden /> : <AlertCircle size={11} aria-hidden />}
      {label}
    </span>
  );
}

function TestSendButton({ agency }: { agency: 'nativz' | 'anderson' }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'idle' | 'ok' | 'err'>('idle');

  async function send() {
    const to = prompt(`Send a test ${agency} email to:`);
    if (!to) return;
    setBusy(true);
    setStatus('idle');
    try {
      const res = await fetch('/api/admin/email-hub/setup/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, agency }),
      });
      setStatus(res.ok ? 'ok' : 'err');
    } catch {
      setStatus('err');
    } finally {
      setBusy(false);
      setTimeout(() => setStatus('idle'), 4000);
    }
  }

  const stateClass =
    status === 'ok'
      ? TONE_PILL.success
      : status === 'err'
      ? TONE_PILL.danger
      : 'border-nativz-border bg-background text-text-secondary hover:text-text-primary';
  return (
    <button
      type="button"
      onClick={send}
      disabled={busy}
      aria-label={`Send a test email from ${agency}`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60 ${stateClass}`}
    >
      <Send size={12} aria-hidden />
      {status === 'ok' ? 'Sent' : status === 'err' ? 'Failed' : busy ? 'Sending…' : 'Test send'}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Editable secrets section — reads /api/admin/secrets, lets admins rotate
// DB-override values. CRON_SECRET still env-only (see lib/secrets/store.ts).
// ---------------------------------------------------------------------------

function SecretsSection({ cronSecretConfigured }: { cronSecretConfigured: boolean }) {
  const { data, mutate } = useSWR<SecretsResponse>('/api/admin/secrets');
  const [editingKey, setEditingKey] = useState<string | null>(null);

  async function clearOverride(key: string) {
    if (!confirm(`Clear the DB override for ${key}? The env value will take over on the next request.`)) return;
    const res = await fetch(`/api/admin/secrets/${encodeURIComponent(key)}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error ?? 'Failed to clear override');
      return;
    }
    toast.success(`${key} override cleared`);
    void mutate();
  }

  return (
    <section className="rounded-2xl border border-nativz-border bg-surface overflow-hidden">
      <header className="flex items-center gap-2.5 px-5 py-4 border-b border-nativz-border">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-surface border border-nativz-border">
          <KeyRound size={15} className="text-accent-text" />
        </div>
        <h2 className="text-base font-semibold text-text-primary">Environment &amp; secrets</h2>
      </header>

      {!data ? (
        <SkeletonRows count={4} withAvatar={false} />
      ) : (
        <>
          {!data.encryptionReady ? (
            <div className="mx-5 mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-500">
              <p className="font-semibold">SECRETS_ENCRYPTION_KEY is not set.</p>
              <p className="mt-0.5 text-amber-500/80">
                Add a 64-char hex string as <code>SECRETS_ENCRYPTION_KEY</code> in Vercel and
                redeploy to enable UI-based secret rotation. Until then each row below reflects
                env-only state and the edit button stays disabled.
              </p>
            </div>
          ) : null}
          <ul className="divide-y divide-nativz-border">
            {data.secrets.map((s) => (
              <SecretRow
                key={s.key}
                secret={s}
                editable={data.encryptionReady}
                onEdit={() => setEditingKey(s.key)}
                onClear={() => clearOverride(s.key)}
              />
            ))}
            <ReadOnlyEnvRow
              label="CRON_SECRET"
              configured={cronSecretConfigured}
              description="Required for Vercel cron jobs. Not UI-editable yet — rotate via `vercel env` and redeploy."
            />
          </ul>
        </>
      )}

      {editingKey ? (
        <SecretEditModal
          secretKey={editingKey}
          onClose={() => setEditingKey(null)}
          onSaved={() => {
            setEditingKey(null);
            void mutate();
          }}
        />
      ) : null}
    </section>
  );
}

function SecretRow({
  secret,
  editable,
  onEdit,
  onClear,
}: {
  secret: SecretMeta;
  editable: boolean;
  onEdit: () => void;
  onClear: () => void;
}) {
  const description = SECRET_DESCRIPTIONS[secret.key] ?? '';
  const tone =
    secret.source === 'db' ? 'info' : secret.source === 'env' ? 'success' : 'warning';
  const pillLabel =
    secret.source === 'db' ? 'Overridden' : secret.source === 'env' ? 'Env' : 'Missing';
  const isSet = secret.source !== 'missing';

  return (
    <li className="flex items-center gap-3 px-5 py-3.5">
      {isSet ? (
        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
      ) : (
        <AlertCircle size={16} className="text-amber-500 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary font-mono">{secret.key}</p>
        <p className="text-xs text-text-muted mt-0.5">{description}</p>
        {secret.source === 'db' && secret.updatedAt ? (
          <p className="text-[11px] text-text-muted mt-1">
            Overridden
            {secret.updatedBy ? ` by ${secret.updatedBy}` : ''}
            {' · '}
            {new Date(secret.updatedAt).toLocaleString()}
          </p>
        ) : null}
      </div>
      <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${TONE_PILL[tone]}`}
      >
        {pillLabel}
      </span>
      {secret.source === 'db' ? (
        <button
          type="button"
          onClick={onClear}
          title="Clear DB override, fall back to env"
          aria-label={`Clear DB override for ${secret.key}`}
          className="rounded-md p-2 text-text-muted hover:bg-rose-500/10 hover:text-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
        >
          <RotateCcw size={14} aria-hidden />
        </button>
      ) : null}
      <button
        type="button"
        onClick={onEdit}
        disabled={!editable}
        title={editable ? 'Edit value' : 'SECRETS_ENCRYPTION_KEY not configured'}
        aria-label={`Edit ${secret.key}`}
        className="rounded-md p-2 text-text-muted hover:bg-surface-hover/40 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Pencil size={14} aria-hidden />
      </button>
    </li>
  );
}

function ReadOnlyEnvRow({
  label,
  configured,
  description,
}: {
  label: string;
  configured: boolean;
  description: string;
}) {
  return (
    <li className="flex items-center gap-3 px-5 py-3.5">
      {configured ? (
        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
      ) : (
        <AlertCircle size={16} className="text-amber-500 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary font-mono">{label}</p>
        <p className="text-xs text-text-muted mt-0.5">{description}</p>
      </div>
      <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${TONE_PILL[configured ? 'success' : 'warning']}`}
      >
        {configured ? 'Set' : 'Missing'}
      </span>
    </li>
  );
}

function SecretEditModal({
  secretKey,
  onClose,
  onSaved,
}: {
  secretKey: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!value.trim()) {
      toast.error('Value is required');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/secrets/${encodeURIComponent(secretKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.error ?? 'Failed to save');
        return;
      }
      toast.success(`${secretKey} updated — takes effect on next request`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={`Set ${secretKey}`} maxWidth="md">
      <div className="space-y-3">
        <p className="text-xs text-text-muted">
          The value is encrypted at rest and never returned back to the UI. Pasting a new value
          overrides the current env var for every runtime read; clear the override later to fall
          back to <code>process.env.{secretKey}</code>.
        </p>
        <LabeledInput
          label="New value"
          value={value}
          onChange={setValue}
          placeholder={secretKey.includes('WEBHOOK') ? 'whsec_…' : secretKey === 'RESEND_API_KEY' ? 're_…' : ''}
          autoFocus
        />
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-nativz-border bg-background px-4 py-1.5 text-sm text-text-secondary hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !value.trim()}
            className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

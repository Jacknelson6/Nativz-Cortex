'use client';

import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Send,
  Settings,
  Webhook,
} from 'lucide-react';

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
  };
};

export function SetupTab() {
  const [data, setData] = useState<SetupData | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/admin/email-hub/setup');
    const json = await res.json();
    setData(json as SetupData);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  if (loading || !data) {
    return (
      <section className="rounded-2xl border border-nativz-border bg-surface p-12 text-center text-sm text-text-muted">
        Loading setup…
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
              <dl className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-nativz-border bg-background px-3 py-2.5">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    From
                  </dt>
                  <dd className="mt-0.5 text-text-primary font-mono">{a.from}</dd>
                </div>
                <div className="rounded-xl border border-nativz-border bg-background px-3 py-2.5">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                    Reply-to
                  </dt>
                  <dd className="mt-0.5 text-text-primary font-mono">{a.replyTo}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-nativz-border bg-surface overflow-hidden">
        <header className="flex items-center gap-2.5 px-5 py-4 border-b border-nativz-border">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-surface border border-nativz-border">
            <KeyRound size={15} className="text-accent-text" />
          </div>
          <h2 className="text-base font-semibold text-text-primary">Environment</h2>
        </header>
        <ul className="divide-y divide-nativz-border">
          <EnvRow
            label="RESEND_API_KEY"
            configured={data.env.resendKeyConfigured}
            description="Required. Resend outbound API key."
          />
          <EnvRow
            label="RESEND_WEBHOOK_SECRET"
            configured={data.env.sharedWebhookSecretConfigured}
            description="Optional shared fallback. Covers both agencies when set — use this if you have a single Resend webhook endpoint. Per-agency overrides appear next to each identity above."
          />
          <EnvRow
            label="CRON_SECRET"
            configured={data.env.cronSecretConfigured}
            description="Required for Vercel cron drain jobs in prod."
          />
        </ul>
      </section>

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
            {data.webhook.eventsLast24h === 0 ? (
              <p className="text-sm text-text-muted">
                No webhook events received yet. Send a test email from above — the
                event should show up here within ~30 seconds.
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
          </div>
        </div>
      </section>
    </div>
  );
}

function EnvRow({
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
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
          configured
            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
            : 'bg-amber-500/10 text-amber-500 border-amber-500/30'
        }`}
      >
        {configured ? 'Set' : 'Missing'}
      </span>
    </li>
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
  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ${
        configured
          ? source === 'dedicated'
            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
            : 'bg-sky-500/10 text-sky-400 border-sky-500/30'
          : 'bg-amber-500/10 text-amber-500 border-amber-500/30'
      }`}
    >
      {configured ? (
        <CheckCircle2 size={11} />
      ) : (
        <AlertCircle size={11} />
      )}
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
    const res = await fetch('/api/admin/email-hub/setup/test-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, agency }),
    });
    setBusy(false);
    setStatus(res.ok ? 'ok' : 'err');
    setTimeout(() => setStatus('idle'), 4000);
  }

  return (
    <button
      type="button"
      onClick={send}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
        status === 'ok'
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
          : status === 'err'
          ? 'border-rose-500/30 bg-rose-500/10 text-rose-500'
          : 'border-nativz-border bg-background text-text-secondary hover:text-text-primary'
      } disabled:opacity-60`}
    >
      <Send size={12} />
      {status === 'ok' ? 'Sent' : status === 'err' ? 'Failed' : busy ? 'Sending…' : 'Test send'}
    </button>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Github,
  Loader2,
  Send,
  Trash2,
} from 'lucide-react';

type Proposal = {
  id: string;
  slug: string;
  title: string;
  status: string;
  agency: 'anderson' | 'nativz';
  signer_name: string | null;
  signer_email: string | null;
  signer_title: string | null;
  signer_legal_entity: string | null;
  signer_address: string | null;
  external_repo: string | null;
  external_folder: string | null;
  external_url: string | null;
  published_at: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  paid_at: string | null;
  stripe_payment_link_url: string | null;
};

type ProposalEvent = {
  type: string;
  occurred_at: string;
  metadata: Record<string, unknown>;
};

type Template = {
  name: string;
  source_repo: string;
  source_folder: string;
  public_base_url: string;
};

const EVENT_LABEL: Record<string, string> = {
  published: 'Published to docs repo',
  sent: 'Email sent',
  viewed: 'Proposal viewed',
  signed: 'Proposal signed',
  paid: 'Deposit paid',
};

export function ProposalDetail({
  proposal,
  clientName,
  template,
  events,
}: {
  proposal: Proposal;
  clientName: string | null;
  clientSlug: string | null;
  template: Template | null;
  events: ProposalEvent[];
}) {
  const router = useRouter();
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendOk, setResendOk] = useState(false);
  const [copied, setCopied] = useState(false);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function resend() {
    if (!proposal.external_url) return;
    if (!confirm(`Resend the proposal email to ${proposal.signer_email}?`)) return;
    setResending(true);
    setResendError(null);
    setResendOk(false);
    const res = await fetch(`/api/admin/proposals/${proposal.id}/send`, { method: 'POST' });
    const json = await res.json();
    setResending(false);
    if (!res.ok) {
      setResendError(json.error ?? 'Send failed');
      return;
    }
    setResendOk(true);
    router.refresh();
  }

  async function deleteProposal() {
    const confirmText = `${proposal.signer_email ?? proposal.title}`;
    const typed = window.prompt(
      `Type "${confirmText}" to confirm. This permanently deletes the proposal + signing record.`,
    );
    if (typed?.trim() !== confirmText) {
      if (typed !== null) alert('Confirmation text did not match. Nothing deleted.');
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    const res = await fetch(`/api/admin/proposals/${proposal.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      setDeleting(false);
      setDeleteError(json?.error ?? `Delete failed (${res.status})`);
      return;
    }
    router.push('/admin/proposals');
    router.refresh();
  }

  async function copyUrl() {
    if (!proposal.external_url) return;
    try {
      await navigator.clipboard.writeText(proposal.external_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  // The iframe must use a same-origin path so it works on whichever Cortex
  // host is currently serving (cortex.nativz.io vs cortex.andersoncollaborative.com
  // vs localhost during dev). external_url stores the canonical absolute URL,
  // but the iframe + Open button can use the slug-relative path.
  const samePathPreviewUrl = `/proposals/${proposal.slug}`;

  const repoHref =
    proposal.external_repo && proposal.external_folder
      ? `https://github.com/${proposal.external_repo}/tree/main/${proposal.external_folder}`
      : null;

  return (
    <div className="cortex-page-gutter mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/admin/proposals"
            className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary"
          >
            <ArrowLeft size={12} /> All proposals
          </Link>
          <StatusPill status={proposal.status} />
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            {proposal.agency === 'anderson' ? 'Anderson Collaborative' : 'Nativz'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {proposal.external_url ? (
            <>
              <button
                type="button"
                onClick={copyUrl}
                className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface px-3 py-1 text-[11px] text-text-primary hover:bg-white/5"
              >
                <Copy size={11} /> {copied ? 'Copied' : 'Copy link'}
              </button>
              <a
                href={proposal.external_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-nativz-border bg-surface px-3 py-1 text-[11px] text-text-primary hover:bg-white/5"
              >
                <ExternalLink size={11} /> Open
              </a>
              {!['signed', 'paid'].includes(proposal.status) ? (
                <button
                  type="button"
                  onClick={resend}
                  disabled={resending}
                  className="inline-flex items-center gap-1 rounded-full bg-nz-cyan px-3 py-1 text-[11px] font-semibold text-white hover:bg-nz-cyan/90 disabled:opacity-50"
                >
                  {resending ? (
                    <>
                      <Loader2 size={11} className="animate-spin" /> Sending…
                    </>
                  ) : (
                    <>
                      <Send size={11} /> {proposal.sent_at ? 'Resend' : 'Send'}
                    </>
                  )}
                </button>
              ) : null}
            </>
          ) : null}
          {!['signed', 'paid'].includes(proposal.status) ? (
            <button
              type="button"
              onClick={deleteProposal}
              disabled={deleting}
              className="inline-flex items-center gap-1 rounded-full border border-coral-500/30 bg-coral-500/5 px-3 py-1 text-[11px] text-coral-300 hover:bg-coral-500/10 disabled:opacity-50"
              title="Delete this proposal"
            >
              <Trash2 size={11} /> {deleting ? 'Deleting…' : 'Delete'}
            </button>
          ) : null}
        </div>
      </header>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{proposal.title}</h1>
        {clientName ? <p className="text-sm text-text-muted">{clientName}</p> : null}
      </div>

      {resendError ? <p className="text-sm text-coral-300">{resendError}</p> : null}
      {resendOk ? <p className="text-sm text-emerald-300">Email sent.</p> : null}
      {deleteError ? <p className="text-sm text-coral-300">{deleteError}</p> : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <section className="overflow-hidden rounded-xl border border-nativz-border bg-surface">
            <header className="flex items-center justify-between border-b border-nativz-border px-4 py-2.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Live proposal
              </h2>
              {proposal.external_url ? (
                <a
                  href={proposal.external_url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-[11px] font-mono text-nz-cyan hover:underline"
                >
                  {proposal.external_url}
                </a>
              ) : (
                <span className="text-[11px] text-text-muted">Not yet published</span>
              )}
            </header>
            {proposal.external_url ? (
              iframeBlocked ? (
                <div className="px-5 py-12 text-center text-sm text-text-muted">
                  Inline preview unavailable. Click <strong>Open</strong> above to view in a new tab.
                </div>
              ) : (
                <iframe
                  src={samePathPreviewUrl}
                  title={`${proposal.title} preview`}
                  className="h-[900px] w-full bg-white"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                  onError={() => setIframeBlocked(true)}
                />
              )
            ) : (
              <div className="px-5 py-12 text-center text-sm text-text-muted">
                This proposal hasn&rsquo;t been published yet.
              </div>
            )}
          </section>

          <section className="rounded-xl border border-nativz-border bg-surface p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Activity
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-text-secondary">
              {events.length === 0 ? (
                <li className="text-text-muted">No activity yet.</li>
              ) : (
                events.map((e, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mt-1 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-nz-cyan opacity-60" />
                    <div className="flex-1">
                      <p className="text-text-primary">{EVENT_LABEL[e.type] ?? e.type}</p>
                      <p className="text-[11px] text-text-muted">
                        {new Date(e.occurred_at).toLocaleString('en-US')}
                      </p>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border border-nativz-border bg-surface p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Status
            </h2>
            <dl className="mt-3 space-y-2 text-xs">
              <Row label="Published" value={formatDate(proposal.published_at)} />
              <Row label="Sent" value={formatDate(proposal.sent_at)} />
              <Row label="Viewed" value={formatDate(proposal.viewed_at)} />
              <Row
                label="Signed"
                value={formatDate(proposal.signed_at)}
                icon={proposal.signed_at ? <CheckCircle2 size={11} className="text-emerald-300" /> : null}
              />
              <Row
                label="Paid"
                value={formatDate(proposal.paid_at)}
                icon={proposal.paid_at ? <CheckCircle2 size={11} className="text-emerald-300" /> : null}
              />
            </dl>
          </section>

          <section className="rounded-xl border border-nativz-border bg-surface p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Signer
            </h2>
            <dl className="mt-3 space-y-2 text-xs text-text-secondary">
              <Row label="Name" value={proposal.signer_name ?? '—'} />
              <Row label="Email" value={proposal.signer_email ?? '—'} />
              {proposal.signer_title ? <Row label="Title" value={proposal.signer_title} /> : null}
              {proposal.signer_legal_entity ? (
                <Row label="Legal entity" value={proposal.signer_legal_entity} />
              ) : null}
              {proposal.signer_address ? (
                <Row label="Address" value={proposal.signer_address} />
              ) : null}
            </dl>
          </section>

          {template ? (
            <section className="rounded-xl border border-nativz-border bg-surface p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Source
              </h2>
              <dl className="mt-3 space-y-2 text-xs text-text-secondary">
                <Row label="Template" value={template.name} />
                <Row
                  label="Source"
                  value={
                    <span className="font-mono text-[11px]">
                      {template.source_repo}/{template.source_folder}
                    </span>
                  }
                />
                {repoHref ? (
                  <a
                    href={repoHref}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[11px] text-nz-cyan hover:underline"
                  >
                    <Github size={11} /> Open generated folder
                  </a>
                ) : null}
              </dl>
            </section>
          ) : null}

          {proposal.stripe_payment_link_url ? (
            <section className="rounded-xl border border-nativz-border bg-surface p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Stripe
              </h2>
              <a
                href={proposal.stripe_payment_link_url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 block break-all text-[11px] text-nz-cyan hover:underline"
              >
                {proposal.stripe_payment_link_url}
              </a>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-start gap-2">
      <dt className="text-[10px] uppercase tracking-wider text-text-muted">{label}</dt>
      <dd className="flex items-center gap-1 text-right text-text-primary">
        {icon ?? null}
        <span className="flex-1 break-words text-right">{value ?? '—'}</span>
      </dd>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const variants: Record<string, string> = {
    draft: 'bg-white/10 text-text-muted',
    sent: 'bg-nz-cyan/10 text-nz-cyan',
    viewed: 'bg-indigo-500/10 text-indigo-200',
    signed: 'bg-emerald-500/10 text-emerald-300',
    paid: 'bg-emerald-500/20 text-emerald-200',
    expired: 'bg-coral-500/10 text-coral-300',
    canceled: 'bg-coral-500/10 text-coral-300',
  };
  const classes = variants[status] ?? 'bg-white/10 text-text-muted';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-wider ${classes}`}
    >
      {status === 'sent' || status === 'viewed' ? <Clock size={10} /> : null}
      {status}
    </span>
  );
}

function formatDate(iso: string | null): React.ReactNode {
  if (!iso) return '—';
  return (
    <span>
      {new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      <span className="ml-1 text-[10px] text-text-muted">
        {new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
      </span>
    </span>
  );
}

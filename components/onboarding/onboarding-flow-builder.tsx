'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { ClientLogo } from '@/components/clients/client-logo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  type FlowStatus,
  type SegmentKind,
  SEGMENT_KIND_LABEL,
} from '@/lib/onboarding/flows';

// ────────────────────────────────────────────────────────────────────────
// Types — mirror the props the server page passes in.
// ────────────────────────────────────────────────────────────────────────

type SegmentSummary = {
  id: string;
  kind: SegmentKind;
  tracker_id: string | null;
  position: number;
  status: 'pending' | 'in_progress' | 'done';
  tracker_title: string | null;
  tracker_service: string | null;
  item_total: number;
  item_done: number;
};

type Stakeholder = {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  role_label: string | null;
  notify_on_invoice_paid: boolean;
  notify_on_segment_completed: boolean;
  notify_on_onboarding_complete: boolean;
};

type AdminUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  role_title: string | null;
};

type Proposal = {
  id: string;
  slug: string;
  title: string;
  status: string;
  signer_email: string | null;
  total_cents: number | null;
  deposit_cents: number | null;
  expires_at: string | null;
  signed_at: string | null;
  paid_at: string | null;
};

type Client =
  | { id: string; name: string; slug: string; logo_url: string | null; agency: string | null }
  | null;

type Flow = {
  id: string;
  client_id: string;
  status: FlowStatus;
  proposal_id: string | null;
  share_token: string;
  poc_emails: string[];
  started_at: string | null;
  completed_at: string | null;
  closed_at: string | null;
  created_at: string;
};

const SEGMENT_PALETTE: { kind: SegmentKind; description: string; available: boolean }[] = [
  {
    kind: 'social',
    description: 'TikTok / Instagram / YouTube / Facebook account access + brand assets + raw footage.',
    available: true,
  },
  { kind: 'paid_media', description: 'Coming soon — paid media ad-account access + creative briefs.', available: false },
  { kind: 'web', description: 'Coming soon — domain access, hosting, content migration.', available: false },
];

const STATUS_LABEL: Record<FlowStatus, string> = {
  needs_proposal: 'Needs proposal',
  awaiting_payment: 'Awaiting payment',
  active: 'In progress',
  paused: 'Paused',
  completed: 'Completed',
  archived: 'Archived',
};

const SEGMENT_STATUS_PILL: Record<SegmentSummary['status'], string> = {
  pending: 'border-zinc-400/30 bg-zinc-400/5 text-zinc-300',
  in_progress: 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200',
  done: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
};

// ────────────────────────────────────────────────────────────────────────
// Builder
// ────────────────────────────────────────────────────────────────────────

export function OnboardingFlowBuilder(props: {
  flow: Flow;
  client: Client;
  segments: SegmentSummary[];
  proposal: Proposal | null;
  stakeholders: Stakeholder[];
  adminUsers: AdminUser[];
}) {
  const router = useRouter();
  const { flow, client, proposal, adminUsers } = props;
  const [segments, setSegments] = useState(props.segments);
  const [stakeholders, setStakeholders] = useState(props.stakeholders);
  const [pocEmails, setPocEmails] = useState<string[]>(flow.poc_emails);
  const [pocDraft, setPocDraft] = useState('');
  const [showStakeholderPicker, setShowStakeholderPicker] = useState(false);
  const [showSegmentPicker, setShowSegmentPicker] = useState(false);
  const [pending, start] = useTransition();

  const shareUrl = `${typeof window === 'undefined' ? '' : window.location.origin}/onboarding/${client?.slug ?? 'flow'}?token=${flow.share_token}`;
  const canSendPocInvite = flow.status === 'active' && pocEmails.length > 0;

  const segmentTimeline = useMemo(() => [...segments].sort((a, b) => a.position - b.position), [segments]);
  const claimedKinds = new Set(segments.map((s) => s.kind));

  // ──────────────────────────────────────────────────────────────────────
  // POC emails
  // ──────────────────────────────────────────────────────────────────────

  async function persistPocEmails(next: string[]) {
    setPocEmails(next);
    try {
      const res = await fetch(`/api/onboarding/flows/${flow.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ poc_emails: next }),
      });
      if (!res.ok) throw new Error(`failed (${res.status})`);
    } catch (err) {
      toast.error('Could not update POC emails', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  function addPocEmail() {
    const v = pocDraft.trim();
    if (!v) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
      toast.error('That email looks invalid');
      return;
    }
    if (pocEmails.includes(v)) {
      setPocDraft('');
      return;
    }
    void persistPocEmails([...pocEmails, v]);
    setPocDraft('');
  }

  function removePocEmail(email: string) {
    void persistPocEmails(pocEmails.filter((e) => e !== email));
  }

  // ──────────────────────────────────────────────────────────────────────
  // Segments
  // ──────────────────────────────────────────────────────────────────────

  async function addSegment(kind: SegmentKind) {
    setShowSegmentPicker(false);
    try {
      const res = await fetch(`/api/onboarding/flows/${flow.id}/segments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind }),
      });
      const json = (await res.json()) as
        | { ok: true; segment: SegmentSummary }
        | { ok: false; error: string };
      if (!res.ok || !('ok' in json) || !json.ok) {
        throw new Error('error' in json ? json.error : `failed (${res.status})`);
      }
      setSegments((prev) => [...prev, json.segment]);
      toast.success(`${SEGMENT_KIND_LABEL[kind]} segment added`);
      start(() => router.refresh());
    } catch (err) {
      toast.error('Could not add segment', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  async function removeSegment(segId: string) {
    if (!confirm('Remove this segment? Tasks and uploads attached to it will be lost.')) return;
    try {
      const res = await fetch(`/api/onboarding/flows/${flow.id}/segments/${segId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`failed (${res.status})`);
      setSegments((prev) => prev.filter((s) => s.id !== segId));
      toast.success('Segment removed');
      start(() => router.refresh());
    } catch (err) {
      toast.error('Could not remove segment', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Stakeholders
  // ──────────────────────────────────────────────────────────────────────

  async function addStakeholder(userId: string) {
    setShowStakeholderPicker(false);
    try {
      const res = await fetch(`/api/onboarding/flows/${flow.id}/stakeholders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      const json = (await res.json()) as { ok: true; stakeholder: Stakeholder } | { ok: false; error: string };
      if (!res.ok || !('ok' in json) || !json.ok) {
        throw new Error('error' in json ? json.error : `failed (${res.status})`);
      }
      setStakeholders((prev) => [...prev, json.stakeholder]);
      toast.success(`Added ${json.stakeholder.display_name ?? json.stakeholder.email}`);
    } catch (err) {
      toast.error('Could not add stakeholder', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  async function updateStakeholder(id: string, patch: Partial<Stakeholder>) {
    setStakeholders((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    try {
      await fetch(`/api/onboarding/flows/${flow.id}/stakeholders/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } catch (err) {
      toast.error('Could not update stakeholder', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  async function removeStakeholder(id: string) {
    setStakeholders((prev) => prev.filter((s) => s.id !== id));
    try {
      await fetch(`/api/onboarding/flows/${flow.id}/stakeholders/${id}`, { method: 'DELETE' });
    } catch (err) {
      toast.error('Could not remove stakeholder', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Send POC invite
  // ──────────────────────────────────────────────────────────────────────

  async function sendPocInvite() {
    if (!canSendPocInvite) return;
    try {
      const res = await fetch(`/api/onboarding/flows/${flow.id}/send-poc-invite`, {
        method: 'POST',
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; sent: number }
        | { ok: false; error: string }
        | null;
      if (!res.ok || !json || !('ok' in json) || !json.ok) {
        throw new Error(json && 'error' in json ? json.error : `failed (${res.status})`);
      }
      toast.success(`POC invite sent to ${json.sent} recipient${json.sent === 1 ? '' : 's'}`);
    } catch (err) {
      toast.error('Could not send POC invite', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────

  return (
    <div className="cortex-page-gutter max-w-5xl mx-auto space-y-6">
      <Link
        href="/admin/onboarding"
        className="inline-flex items-center gap-1.5 text-[12px] text-text-muted hover:text-text-primary"
      >
        <ArrowLeft size={13} />
        All flows
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start gap-4 rounded-xl border border-nativz-border bg-surface/60 p-4">
        <ClientLogo src={client?.logo_url ?? null} name={client?.name ?? '?'} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="ui-page-title truncate">{client?.name ?? 'Unknown brand'}</h1>
          <p className="mt-1 text-[13px] text-text-muted">
            Status: <span className="text-text-primary">{STATUS_LABEL[flow.status]}</span> ·
            Started {flow.started_at ? new Date(flow.started_at).toLocaleDateString() : 'not yet'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {client?.slug && (
            <Link
              href={`/admin/clients/${client.slug}/settings/info`}
              className="text-[12px] text-text-muted hover:text-text-primary"
            >
              Brand settings →
            </Link>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => navigator.clipboard.writeText(shareUrl)}
            className="gap-1.5"
            title={shareUrl}
          >
            Copy POC link
          </Button>
        </div>
      </div>

      {/* Timeline of segments */}
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Timeline</h2>
            <p className="text-[13px] text-text-muted">
              Agreement & Payment is always first. Add service segments after.
            </p>
          </div>
          <div className="relative">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowSegmentPicker((s) => !s)}
              className="gap-1.5"
            >
              <Plus size={14} />
              Add segment
            </Button>
            {showSegmentPicker && (
              <div className="absolute right-0 top-full mt-1 w-72 rounded-lg border border-nativz-border bg-surface shadow-lg z-10 p-1">
                {SEGMENT_PALETTE.map((opt) => {
                  const isClaimed = claimedKinds.has(opt.kind);
                  const disabled = !opt.available || isClaimed;
                  return (
                    <button
                      key={opt.kind}
                      type="button"
                      disabled={disabled}
                      onClick={() => addSegment(opt.kind)}
                      className="block w-full rounded-md px-3 py-2 text-left transition disabled:opacity-40 enabled:hover:bg-surface-hover"
                    >
                      <div className="flex items-center justify-between text-sm font-medium text-text-primary">
                        {SEGMENT_KIND_LABEL[opt.kind]}
                        {isClaimed && <span className="text-[10px] text-text-muted">added</span>}
                      </div>
                      <div className="text-[11px] text-text-muted">{opt.description}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <ol className="space-y-3">
          {segmentTimeline.map((s) => (
            <SegmentCard
              key={s.id}
              segment={s}
              proposal={proposal}
              flow={flow}
              clientSlug={client?.slug ?? ''}
              onRemove={() => removeSegment(s.id)}
            />
          ))}
        </ol>
      </section>

      {/* POC */}
      <section className="space-y-3 rounded-xl border border-nativz-border bg-surface/60 p-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Point of contact</h2>
            <p className="text-[13px] text-text-muted">
              Recipients of the POC link + 48h reminders. Multi-recipient supported.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={!canSendPocInvite || pending}
            onClick={sendPocInvite}
            className="gap-1.5"
          >
            <Send size={13} />
            Send POC invite
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {pocEmails.map((e) => (
            <span
              key={e}
              className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[12px] text-accent-text"
            >
              {e}
              <button
                type="button"
                onClick={() => removePocEmail(e)}
                className="text-accent-text/60 hover:text-accent-text"
                aria-label={`Remove ${e}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
          <input
            type="email"
            value={pocDraft}
            onChange={(e) => setPocDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addPocEmail();
              }
            }}
            onBlur={addPocEmail}
            placeholder="add poc email..."
            className="rounded-md border border-nativz-border bg-background px-2.5 py-1 text-[12px] text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </div>
        {!canSendPocInvite && flow.status !== 'active' && (
          <p className="text-[11px] text-text-muted">
            POC invite unlocks once the proposal is paid (flow status: {STATUS_LABEL[flow.status]}).
          </p>
        )}
      </section>

      {/* Stakeholders */}
      <section className="space-y-3 rounded-xl border border-nativz-border bg-surface/60 p-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Internal stakeholders</h2>
            <p className="text-[13px] text-text-muted">
              Team members that get notified on milestones. Pick which milestones each one cares about.
            </p>
          </div>
          <div className="relative">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowStakeholderPicker((s) => !s)}
              className="gap-1.5"
            >
              <Plus size={14} />
              Add stakeholder
            </Button>
            {showStakeholderPicker && (
              <StakeholderPicker
                adminUsers={adminUsers}
                claimed={new Set(stakeholders.map((s) => s.user_id))}
                onPick={(uid) => addStakeholder(uid)}
                onClose={() => setShowStakeholderPicker(false)}
              />
            )}
          </div>
        </div>
        {stakeholders.length === 0 ? (
          <p className="text-[12px] text-text-muted">
            No stakeholders yet. The flow creator gets system notifications by default.
          </p>
        ) : (
          <ul className="space-y-2">
            {stakeholders.map((s) => (
              <StakeholderRow
                key={s.id}
                stakeholder={s}
                onUpdate={(patch) => updateStakeholder(s.id, patch)}
                onRemove={() => removeStakeholder(s.id)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Subcomponents
// ────────────────────────────────────────────────────────────────────────

function SegmentCard({
  segment,
  proposal,
  flow,
  clientSlug,
  onRemove,
}: {
  segment: SegmentSummary;
  proposal: Proposal | null;
  flow: Flow;
  clientSlug: string;
  onRemove: () => void;
}) {
  const isAgreement = segment.kind === 'agreement_payment';

  return (
    <li className="rounded-xl border border-nativz-border bg-surface/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge className={`${SEGMENT_STATUS_PILL[segment.status]} border`}>
              <span className="text-[10px] uppercase tracking-wider">{segment.status.replace('_', ' ')}</span>
            </Badge>
            <h3 className="text-[15px] font-semibold text-text-primary">
              {SEGMENT_KIND_LABEL[segment.kind]}
            </h3>
          </div>
          {isAgreement ? (
            <AgreementSegmentBody proposal={proposal} flow={flow} clientSlug={clientSlug} />
          ) : (
            <ServiceSegmentBody segment={segment} />
          )}
        </div>
        {!isAgreement && (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded p-1.5 text-text-muted opacity-50 hover:bg-surface-hover hover:opacity-100"
            aria-label="Remove segment"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </li>
  );
}

function AgreementSegmentBody({
  proposal,
  flow,
  clientSlug,
}: {
  proposal: Proposal | null;
  flow: Flow;
  clientSlug: string;
}) {
  if (!proposal) {
    return (
      <div className="mt-3 space-y-2">
        <p className="text-[13px] text-text-muted">
          Send a proposal to start this onboarding. Once the proposal is paid, the POC link unlocks.
        </p>
        <Link
          href={`/admin/proposals/new?flowId=${flow.id}&clientSlug=${clientSlug}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-text hover:underline"
        >
          Create proposal
          <ArrowUpRight size={12} />
        </Link>
      </div>
    );
  }

  const checks: { label: string; done: boolean; ts: string | null }[] = [
    { label: 'Proposal sent', done: ['sent', 'viewed', 'signed', 'paid'].includes(proposal.status), ts: null },
    { label: 'Signer signs', done: ['signed', 'paid'].includes(proposal.status), ts: proposal.signed_at },
    { label: 'Payment cleared', done: proposal.status === 'paid', ts: proposal.paid_at },
  ];

  return (
    <div className="mt-3 space-y-2">
      <Link
        href={`/admin/proposals/${proposal.slug}`}
        className="inline-flex items-center gap-1.5 text-[12px] text-accent-text hover:underline"
      >
        {proposal.title}
        <ArrowUpRight size={11} />
      </Link>
      <ul className="space-y-1">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center gap-2 text-[13px]">
            {c.done ? (
              <CheckCircle2 size={13} className="text-emerald-300" />
            ) : (
              <Clock size={13} className="text-text-muted" />
            )}
            <span className={c.done ? 'text-text-primary' : 'text-text-muted'}>{c.label}</span>
            {c.ts && (
              <span className="text-[11px] text-text-muted/70">· {new Date(c.ts).toLocaleDateString()}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ServiceSegmentBody({ segment }: { segment: SegmentSummary }) {
  return (
    <div className="mt-3 space-y-2">
      <p className="text-[13px] text-text-muted">
        {segment.tracker_title ?? SEGMENT_KIND_LABEL[segment.kind]} ·{' '}
        <span className="text-text-primary">
          {segment.item_done}/{segment.item_total} tasks done
        </span>
      </p>
      {segment.tracker_id && (
        <Link
          href={`/admin/onboarding/tracker/${segment.tracker_id}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-text hover:underline"
        >
          Open segment editor
          <ArrowUpRight size={12} />
        </Link>
      )}
    </div>
  );
}

function StakeholderPicker({
  adminUsers,
  claimed,
  onPick,
  onClose,
}: {
  adminUsers: AdminUser[];
  claimed: Set<string>;
  onPick: (userId: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const filtered = adminUsers.filter((u) => {
    if (claimed.has(u.id)) return false;
    if (!q) return true;
    const ql = q.toLowerCase();
    return (
      (u.full_name ?? '').toLowerCase().includes(ql) ||
      (u.email ?? '').toLowerCase().includes(ql) ||
      (u.role_title ?? '').toLowerCase().includes(ql)
    );
  });

  return (
    <div className="absolute right-0 top-full mt-1 w-80 rounded-lg border border-nativz-border bg-surface shadow-lg z-10">
      <div className="border-b border-nativz-border p-2">
        <input
          autoFocus
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search admins…"
          className="w-full rounded-md border border-nativz-border bg-background px-2.5 py-1 text-[12px] text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
      </div>
      <ul className="max-h-72 overflow-y-auto">
        {filtered.length === 0 ? (
          <li className="px-3 py-3 text-[12px] text-text-muted">No matches.</li>
        ) : (
          filtered.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => onPick(u.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-hover"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-text-primary">
                    {u.full_name ?? u.email ?? 'unknown'}
                  </div>
                  <div className="text-[11px] text-text-muted">
                    {u.role_title ?? 'admin'} · {u.email}
                  </div>
                </div>
                <Plus size={13} className="text-accent-text" />
              </button>
            </li>
          ))
        )}
      </ul>
      <div className="border-t border-nativz-border p-2 text-right">
        <button type="button" onClick={onClose} className="text-[11px] text-text-muted hover:text-text-primary">
          Close
        </button>
      </div>
    </div>
  );
}

function StakeholderRow({
  stakeholder,
  onUpdate,
  onRemove,
}: {
  stakeholder: Stakeholder;
  onUpdate: (patch: Partial<Stakeholder>) => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-nativz-border bg-background/40 p-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-text-primary truncate">
          {stakeholder.display_name ?? stakeholder.email}
        </div>
        <div className="text-[11px] text-text-muted">
          {stakeholder.role_label ?? 'admin'} · {stakeholder.email}
        </div>
      </div>
      <div className="flex items-center gap-2 text-[11px]">
        <MilestoneToggle
          label="Invoice paid"
          on={stakeholder.notify_on_invoice_paid}
          onChange={(v) => onUpdate({ notify_on_invoice_paid: v })}
        />
        <MilestoneToggle
          label="Segment done"
          on={stakeholder.notify_on_segment_completed}
          onChange={(v) => onUpdate({ notify_on_segment_completed: v })}
        />
        <MilestoneToggle
          label="Onboarding done"
          on={stakeholder.notify_on_onboarding_complete}
          onChange={(v) => onUpdate({ notify_on_onboarding_complete: v })}
        />
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="rounded p-1.5 text-text-muted opacity-50 hover:bg-surface-hover hover:opacity-100"
        aria-label="Remove stakeholder"
      >
        <Trash2 size={12} />
      </button>
    </li>
  );
}

function MilestoneToggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition ${
        on
          ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
          : 'border-nativz-border bg-background text-text-muted hover:text-text-primary'
      }`}
    >
      {on ? <Check size={10} /> : <Plus size={10} />}
      {label}
    </button>
  );
}

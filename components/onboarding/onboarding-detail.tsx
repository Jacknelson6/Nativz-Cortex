'use client';

/**
 * Detail panel for a single onboarding. Sections:
 *   - Header: client + kind + share link + send-onboarding/copy/open + status
 *   - Steps: client-walked OR admin-toggled checkboxes per screen
 *   - Points of contact: brand-profile contacts for this client
 *   - Team: assignment dropdown that fires email + chat ping
 *   - Completion requirements: video count + boost budget + webhook acks
 *   - Email log + nudge composer w/ preview dialog
 *   - Danger zone: pause / resume / cancel
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Copy, ExternalLink, Mail, Pause, Play, Send, Trash2, UserPlus, Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import type {
  CompletionRequirements,
  EmailLogRow,
  OnboardingRow,
  TeamAssignmentRow,
  TeamRole,
} from '@/lib/onboarding/types';
import type { OnboardingScreen } from '@/lib/onboarding/screens';
import type { ProgressDescriptor } from '@/lib/onboarding/api';
import { StepStateView } from './step-state-view';
import { getBrandFromAgency } from '@/lib/agency/detect';
import { getCortexAppUrl } from '@/lib/agency/cortex-url';

interface ClientLite {
  id: string;
  name: string;
  slug: string;
  agency: string | null;
  logo_url: string | null;
  chat_webhook_url: string | null;
  paid_media_webhook_url: string | null;
}

interface MemberLite {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
}

interface ContactLite {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  is_primary: boolean | null;
}

const ROLE_LABELS: Record<TeamRole, string> = {
  account_manager: 'Account manager',
  strategist: 'Strategist',
  smm: 'SMM',
  editor: 'Editor',
  videographer: 'Videographer',
  poc: 'Client POC',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function shareUrl(token: string, agency: string | null): string {
  return `${getCortexAppUrl(getBrandFromAgency(agency))}/s/${token}`;
}

export function OnboardingDetail(props: {
  row: OnboardingRow;
  client: ClientLite | null;
  emails: EmailLogRow[];
  team: TeamAssignmentRow[];
  members: MemberLite[];
  contacts: ContactLite[];
  progress: ProgressDescriptor;
  screens: readonly OnboardingScreen[];
}) {
  const { row, client, emails, team, members, contacts, progress, screens } = props;
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Nudge composer
  const [nudgeOpen, setNudgeOpen] = useState(false);
  const [nudgeMessage, setNudgeMessage] = useState('');
  const [nudgeTo, setNudgeTo] = useState('');
  const [nudgeKind, setNudgeKind] =
    useState<'manual' | 'step_reminder' | 'lagging_nudge'>('manual');

  // Nudge preview dialog
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState<string>('');

  // Team picker
  const [newRole, setNewRole] = useState<TeamRole>('account_manager');
  const [newMemberId, setNewMemberId] = useState('');

  // Completion requirements local state (mirrors row but lets us debounce-save).
  const reqs: CompletionRequirements = row.completion_requirements ?? {};
  const isSmm = row.kind === 'smm';

  async function callApi(
    method: 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    setError(null);
    setBusy(path);
    try {
      const res = await fetch(path, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? `${method} ${path} failed`);
      startTransition(() => router.refresh());
      return payload;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl(row.share_token, client?.agency ?? null));
    } catch {
      // ignore
    }
  }

  async function openPreview() {
    setError(null);
    setBusy('preview');
    try {
      const res = await fetch(`/api/admin/onboardings/${row.id}/nudge/preview`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: nudgeKind,
          message: nudgeMessage.trim() || undefined,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? 'preview failed');
      setPreviewHtml(payload.html as string);
      setPreviewSubject(payload.subject as string);
      setPreviewOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setBusy(null);
    }
  }

  function isStepDone(idx: number, screen: OnboardingScreen): boolean {
    const overridden = row.admin_step_overrides?.[screen.key]?.checked === true;
    const walkedPast = idx < row.current_step || row.status === 'completed';
    return overridden || walkedPast;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-nativz-border bg-surface p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-wide text-text-secondary">
              {row.kind === 'smm' ? 'Social media onboarding' : 'Editing onboarding'}
            </div>
            <h1 className="text-2xl font-semibold text-text-primary">
              {client?.name ?? 'Unknown client'}
            </h1>
            <div className="text-sm text-text-secondary">
              Started {formatTime(row.started_at)}
              {row.completed_at ? ` , finished ${formatTime(row.completed_at)}` : null}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs ${
                row.status === 'completed'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : row.status === 'paused'
                  ? 'bg-amber-500/15 text-amber-300'
                  : row.status === 'abandoned'
                  ? 'bg-rose-500/15 text-rose-300'
                  : 'bg-accent/15 text-accent-text'
              }`}
            >
              {row.status.replace('_', ' ')}
            </span>
            <div className="flex flex-wrap justify-end gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() =>
                  callApi('POST', `/api/admin/onboardings/${row.id}/welcome`, {})
                }
              >
                <Send size={12} />
                Send onboarding
              </Button>
              <Button size="sm" variant="ghost" onClick={copyShareLink}>
                <Copy size={12} />
                Copy link
              </Button>
              <a
                href={shareUrl(row.share_token, client?.agency ?? null)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-nativz-border px-2.5 py-1.5 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
              >
                <ExternalLink size={12} />
                Open
              </a>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-text-secondary mb-1.5">
            <span>{progress.current_label}</span>
            <span>
              {progress.current_step + 1} of {progress.total} , {progress.pct}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-background overflow-hidden">
            <div
              className="h-full bg-accent"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      ) : null}

      {/* Steps as checkboxes */}
      <div className="rounded-2xl border border-nativz-border bg-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-nativz-border text-[11px] uppercase tracking-wide text-text-secondary">
          Steps
        </div>
        <div className="divide-y divide-nativz-border">
          {screens.map((screen, idx) => {
            const done = isStepDone(idx, screen);
            const override = row.admin_step_overrides?.[screen.key];
            const walkedPast = idx < row.current_step || row.status === 'completed';
            const stateValue = screen.step_state_key
              ? (row.step_state as Record<string, unknown>)[screen.step_state_key]
              : null;
            return (
              <div key={screen.key} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="pt-0.5">
                    <Checkbox
                      checked={done}
                      disabled={busy !== null}
                      onCheckedChange={(next) => {
                        const checked = next === true;
                        // Don't let admin "uncheck" a step the client actually
                        // walked past, that data is the source of truth.
                        if (walkedPast && !checked) return;
                        callApi('PATCH', `/api/admin/onboardings/${row.id}`, {
                          step_override: { screen_key: screen.key, checked },
                        });
                      }}
                      aria-label={`Mark ${screen.label} done`}
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm ${done ? 'text-text-primary' : 'text-text-secondary'}`}>
                        {screen.label}
                      </span>
                      {override?.checked ? (
                        <span className="text-[10px] uppercase tracking-wide text-amber-300">
                          admin-marked
                        </span>
                      ) : null}
                    </div>
                    {screen.description ? (
                      <div className="text-xs text-text-secondary">{screen.description}</div>
                    ) : null}
                    {stateValue !== null &&
                    typeof stateValue === 'object' &&
                    Object.keys(stateValue as Record<string, unknown>).length > 0 ? (
                      <StepStateView
                        screenKey={screen.key}
                        value={stateValue as Record<string, unknown>}
                      />
                    ) : null}
                  </div>
                  {!walkedPast && row.status !== 'completed' ? (
                    <button
                      type="button"
                      onClick={() =>
                        callApi('PATCH', `/api/admin/onboardings/${row.id}`, {
                          current_step: idx,
                        })
                      }
                      disabled={busy !== null}
                      className="rounded-lg border border-nativz-border px-2 py-1 text-xs text-text-muted hover:bg-surface-hover"
                    >
                      Jump here
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Points of contact */}
      <div className="rounded-2xl border border-nativz-border bg-surface overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-nativz-border">
          <span className="text-[11px] uppercase tracking-wide text-text-secondary">
            Points of contact
          </span>
          {client ? (
            <a
              href={`/admin/clients/${client.slug}/brand-profile`}
              className="text-xs text-accent-text hover:underline"
            >
              Manage on brand profile →
            </a>
          ) : null}
        </div>
        {contacts.length === 0 ? (
          <div className="px-4 py-6 text-sm text-text-muted">
            No POCs on the brand profile yet. Add one so welcome and nudge emails have a recipient.
          </div>
        ) : (
          <div className="divide-y divide-nativz-border">
            {contacts.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-text-primary truncate">{c.name}</span>
                    {c.is_primary ? (
                      <span className="text-[10px] uppercase tracking-wide text-accent-text">
                        primary
                      </span>
                    ) : null}
                    {c.role ? (
                      <span className="text-xs text-text-muted">{c.role}</span>
                    ) : null}
                  </div>
                  <div className="text-xs text-text-muted truncate">
                    {c.email ?? 'no email'}
                    {c.phone ? ` , ${c.phone}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Team assignments */}
      <div className="rounded-2xl border border-nativz-border bg-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-nativz-border text-[11px] uppercase tracking-wide text-text-secondary">
          Team
        </div>
        <div className="divide-y divide-nativz-border">
          {team.length === 0 ? (
            <div className="px-4 py-6 text-sm text-text-muted">
              No team assigned yet. Pick a member below; they&apos;ll get an email and chat ping.
            </div>
          ) : (
            team.map((t) => {
              const member = members.find((m) => m.id === t.team_member_id);
              return (
                <div key={t.id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-text-primary">
                      {member?.name ?? '(unknown)'}
                    </span>
                    <span className="text-xs text-text-muted">
                      {ROLE_LABELS[t.role]}
                      {t.is_primary ? ' , primary' : null}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      callApi(
                        'DELETE',
                        `/api/admin/onboardings/${row.id}/team/${t.id}`,
                      )
                    }
                    disabled={busy !== null}
                    className="text-text-muted hover:text-rose-300"
                    aria-label="Remove"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-nativz-border px-4 py-3">
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as TeamRole)}
            className="w-44 rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {(Object.entries(ROLE_LABELS) as [TeamRole, string][]).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={newMemberId}
            onChange={(e) => setNewMemberId(e.target.value)}
            className="flex-1 rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="">Pick team member...</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? m.email ?? m.id}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={!newMemberId || busy !== null}
            onClick={() =>
              callApi('POST', `/api/admin/onboardings/${row.id}/team`, {
                role: newRole,
                team_member_id: newMemberId,
              }).then(() => setNewMemberId(''))
            }
          >
            <UserPlus size={12} />
            Assign + notify
          </Button>
        </div>
      </div>

      {/* Completion requirements */}
      <CompletionPanel
        row={row}
        client={client}
        reqs={reqs}
        isSmm={isSmm}
        busy={busy}
        onPatch={(patch) =>
          callApi('PATCH', `/api/admin/onboardings/${row.id}`, {
            completion_requirements: patch,
          })
        }
      />

      {/* Email log */}
      <div className="rounded-2xl border border-nativz-border bg-surface overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-nativz-border">
          <span className="text-[11px] uppercase tracking-wide text-text-secondary">Emails</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setNudgeOpen((v) => !v)}
          >
            <Mail size={12} />
            {nudgeOpen ? 'Cancel' : 'Send nudge'}
          </Button>
        </div>

        {nudgeOpen ? (
          <div className="space-y-3 border-b border-nativz-border px-4 py-4">
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wide text-text-muted">Kind</label>
              <select
                value={nudgeKind}
                onChange={(e) =>
                  setNudgeKind(e.target.value as 'manual' | 'step_reminder' | 'lagging_nudge')
                }
                className="w-full rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="manual">Manual note</option>
                <option value="step_reminder">Step reminder</option>
                <option value="lagging_nudge">Lagging check-in</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wide text-text-muted">
                Override recipient (optional)
              </label>
              <Input
                type="email"
                placeholder="Falls back to brand profile primary contact"
                value={nudgeTo}
                onChange={(e) => setNudgeTo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wide text-text-muted">
                Note (optional)
              </label>
              <Textarea
                rows={3}
                placeholder="If set, replaces the default body copy."
                value={nudgeMessage}
                onChange={(e) => setNudgeMessage(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={openPreview}
              >
                <Eye size={12} />
                Preview
              </Button>
              <Button
                size="sm"
                disabled={busy !== null}
                onClick={() =>
                  callApi('POST', `/api/admin/onboardings/${row.id}/nudge`, {
                    kind: nudgeKind,
                    to: nudgeTo.trim() || undefined,
                    message: nudgeMessage.trim() || undefined,
                  }).then((payload) => {
                    if (payload) {
                      setNudgeOpen(false);
                      setNudgeMessage('');
                      setNudgeTo('');
                    }
                  })
                }
              >
                Send nudge
              </Button>
            </div>
          </div>
        ) : null}

        {emails.length === 0 ? (
          <div className="px-4 py-6 text-sm text-text-muted">No emails sent yet.</div>
        ) : (
          <div className="divide-y divide-nativz-border">
            {emails.map((e) => (
              <div key={e.id} className="px-4 py-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted capitalize">
                    {e.kind.replace('_', ' ')}
                  </span>
                  <span className={e.ok ? 'text-emerald-400' : 'text-rose-300'}>
                    {e.ok ? 'sent' : 'failed'}
                  </span>
                </div>
                <div className="mt-1 text-sm text-text-primary">{e.subject}</div>
                <div className="mt-0.5 text-xs text-text-muted">
                  to {e.to_email} , {formatTime(e.sent_at)}
                </div>
                {e.body_preview ? (
                  <div className="mt-1 text-xs text-text-muted line-clamp-2">
                    {e.body_preview}
                  </div>
                ) : null}
                {e.error ? (
                  <div className="mt-1 text-xs text-rose-300">{e.error}</div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div className="rounded-2xl border border-nativz-border bg-surface px-4 py-3 flex items-center justify-end gap-2">
        {row.status === 'in_progress' ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy !== null}
            onClick={() =>
              callApi('PATCH', `/api/admin/onboardings/${row.id}`, {
                status: 'paused',
              })
            }
          >
            <Pause size={12} />
            Pause
          </Button>
        ) : null}
        {row.status === 'paused' ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy !== null}
            onClick={() =>
              callApi('PATCH', `/api/admin/onboardings/${row.id}`, {
                status: 'in_progress',
              })
            }
          >
            <Play size={12} />
            Resume
          </Button>
        ) : null}
        {row.status !== 'abandoned' && row.status !== 'completed' ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy !== null}
            onClick={() =>
              callApi('DELETE', `/api/admin/onboardings/${row.id}`)
            }
          >
            <Trash2 size={12} />
            Cancel
          </Button>
        ) : null}
      </div>

      {/* Nudge preview dialog */}
      <Dialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={previewSubject || 'Nudge preview'}
        maxWidth="2xl"
        bodyClassName="p-0"
      >
        {previewHtml ? (
          <iframe
            title="Nudge preview"
            srcDoc={previewHtml}
            className="w-full h-[70vh] bg-white rounded-b-lg"
          />
        ) : (
          <div className="p-6 text-sm text-text-muted">Loading...</div>
        )}
      </Dialog>
    </div>
  );
}

/* ---------- Completion requirements sub-panel ----------------------- */

function CompletionPanel(props: {
  row: OnboardingRow;
  client: ClientLite | null;
  reqs: CompletionRequirements;
  isSmm: boolean;
  busy: string | null;
  onPatch: (patch: Partial<CompletionRequirements>) => Promise<unknown>;
}) {
  const { client, reqs, isSmm, busy, onPatch } = props;
  const [videoCount, setVideoCount] = useState<string>(
    reqs.video_count != null ? String(reqs.video_count) : '',
  );
  const [boostBudget, setBoostBudget] = useState<string>(
    reqs.boosting_budget_cents != null
      ? String(Math.round((reqs.boosting_budget_cents ?? 0) / 100))
      : '',
  );

  const hasEditingHook = !!client?.chat_webhook_url;
  const hasPaidHook = !!client?.paid_media_webhook_url;

  // Pre-completion requirements stay editable after the onboarding is
  // marked completed — these are audit fields that an admin needs to be
  // able to correct retroactively (e.g. fixed a typo in video count
  // post-handoff). The `busy` lock still applies during inflight saves.

  return (
    <div className="rounded-2xl border border-nativz-border bg-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-nativz-border text-[11px] uppercase tracking-wide text-text-secondary">
        Pre-completion requirements
      </div>
      <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs uppercase tracking-wide text-text-muted">
            Number of videos
          </label>
          {/* Number of videos stays editable even after completion so an
              admin can correct a typo without un-completing the onboarding.
              Same rationale for the webhook ack checkbox below — these are
              audit fields, not gates once we're past the finish line. */}
          <Input
            type="number"
            min={0}
            value={videoCount}
            disabled={busy !== null}
            onChange={(e) => setVideoCount(e.target.value)}
            onBlur={() => {
              const next = videoCount.trim() === '' ? null : Math.max(0, parseInt(videoCount, 10) || 0);
              if (next !== (reqs.video_count ?? null)) {
                onPatch({ video_count: next });
              }
            }}
          />
        </div>

        {isSmm ? (
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wide text-text-muted">
              Monthly boost budget (USD)
            </label>
            <Input
              type="number"
              min={0}
              value={boostBudget}
              disabled={busy !== null}
              onChange={(e) => setBoostBudget(e.target.value)}
              onBlur={() => {
                const dollars = boostBudget.trim() === '' ? null : Math.max(0, parseInt(boostBudget, 10) || 0);
                const cents = dollars == null ? null : dollars * 100;
                if (cents !== (reqs.boosting_budget_cents ?? null)) {
                  onPatch({ boosting_budget_cents: cents });
                }
              }}
            />
          </div>
        ) : null}

        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs uppercase tracking-wide text-text-muted">
            Editing team chat webhook
          </label>
          <div className="flex items-center justify-between gap-2 rounded-lg border border-nativz-border bg-background px-3 py-2">
            <div className="min-w-0 text-xs text-text-muted truncate">
              {hasEditingHook
                ? client?.chat_webhook_url
                : 'Not set on brand profile.'}
            </div>
            <div className="flex items-center gap-2">
              {client ? (
                <a
                  href={`/admin/clients/${client.slug}/profile/integrations`}
                  className="text-xs text-accent-text hover:underline whitespace-nowrap"
                >
                  Edit →
                </a>
              ) : null}
              <Checkbox
                checked={!!reqs.editing_webhook_ack}
                disabled={busy !== null || !hasEditingHook}
                onCheckedChange={(next) =>
                  onPatch({ editing_webhook_ack: next === true })
                }
                aria-label="Editing webhook confirmed"
              />
            </div>
          </div>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs uppercase tracking-wide text-text-muted">
            Paid media chat webhook
          </label>
          <div className="flex items-center justify-between gap-2 rounded-lg border border-nativz-border bg-background px-3 py-2">
            <div className="min-w-0 text-xs text-text-muted truncate">
              {hasPaidHook
                ? client?.paid_media_webhook_url
                : 'Not set on brand profile.'}
            </div>
            <div className="flex items-center gap-2">
              {client ? (
                <a
                  href={`/admin/clients/${client.slug}/profile/integrations`}
                  className="text-xs text-accent-text hover:underline whitespace-nowrap"
                >
                  Edit →
                </a>
              ) : null}
              <Checkbox
                checked={!!reqs.paid_media_webhook_ack}
                disabled={busy !== null || !hasPaidHook}
                onCheckedChange={(next) =>
                  onPatch({ paid_media_webhook_ack: next === true })
                }
                aria-label="Paid media webhook confirmed"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

/**
 * Detail panel for a single onboarding. Shows:
 *   - Header: client + kind + share link + status pill
 *   - Step inspector: every screen with a checkmark / current pill,
 *     and an inline view of the persisted step_state JSON
 *   - Team assignments: existing roles + add row picker
 *   - Email log: every send + a manual nudge composer
 *   - Danger row: pause / resume / cancel buttons
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check, Circle, Copy, ExternalLink, Mail, Pause, Play, Trash2, UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import type {
  EmailLogRow,
  OnboardingRow,
  TeamAssignmentRow,
  TeamRole,
} from '@/lib/onboarding/types';
import type { OnboardingScreen } from '@/lib/onboarding/screens';
import type { ProgressDescriptor } from '@/lib/onboarding/api';

interface ClientLite {
  id: string;
  name: string;
  slug: string;
  agency: string | null;
  logo_url: string | null;
}

interface MemberLite {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
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

function shareUrl(token: string): string {
  if (typeof window === 'undefined') return `/onboarding/${token}`;
  return `${window.location.origin}/onboarding/${token}`;
}

export function OnboardingDetail(props: {
  row: OnboardingRow;
  client: ClientLite | null;
  emails: EmailLogRow[];
  team: TeamAssignmentRow[];
  members: MemberLite[];
  progress: ProgressDescriptor;
  screens: readonly OnboardingScreen[];
}) {
  const { row, client, emails, team, members, progress, screens } = props;
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Manual nudge composer
  const [nudgeOpen, setNudgeOpen] = useState(false);
  const [nudgeMessage, setNudgeMessage] = useState('');
  const [nudgeTo, setNudgeTo] = useState('');

  // Add team row
  const [newRole, setNewRole] = useState<TeamRole>('account_manager');
  const [newMemberId, setNewMemberId] = useState('');

  async function callApi(
    method: 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: Record<string, unknown>,
  ) {
    setError(null);
    setBusy(path);
    try {
      const res = await fetch(path, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? `${method} ${path} failed`);
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setBusy(null);
    }
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl(row.share_token));
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="text-xs uppercase tracking-wide text-muted">
              {row.kind === 'smm' ? 'Social media onboarding' : 'Editing onboarding'}
            </div>
            <h1 className="text-2xl font-semibold text-foreground">
              {client?.name ?? 'Unknown client'}
            </h1>
            <div className="text-sm text-muted">
              Started {formatTime(row.started_at)}
              {row.completed_at ? ` · finished ${formatTime(row.completed_at)}` : null}
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
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" onClick={copyShareLink}>
                <Copy size={12} />
                Copy link
              </Button>
              <a
                href={shareUrl(row.share_token)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted hover:bg-background"
              >
                <ExternalLink size={12} />
                Open
              </a>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-muted mb-1.5">
            <span>{progress.current_label}</span>
            <span>
              {progress.current_step + 1} of {progress.total} · {progress.pct}%
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

      {/* Steps */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-xs uppercase tracking-wide text-muted">
          Steps
        </div>
        <div className="divide-y divide-border">
          {screens.map((screen, idx) => {
            const done = idx < row.current_step || row.status === 'completed';
            const current = idx === row.current_step && row.status !== 'completed';
            const stateValue = screen.step_state_key
              ? (row.step_state as Record<string, unknown>)[screen.step_state_key]
              : null;
            return (
              <div key={screen.key} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="pt-0.5">
                    {done ? (
                      <Check size={16} className="text-emerald-400" />
                    ) : current ? (
                      <Circle size={16} className="text-accent-text fill-current" />
                    ) : (
                      <Circle size={16} className="text-muted" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground">{screen.label}</span>
                      {current ? (
                        <span className="text-[10px] uppercase tracking-wide text-accent-text">
                          current
                        </span>
                      ) : null}
                    </div>
                    {screen.description ? (
                      <div className="text-xs text-muted">{screen.description}</div>
                    ) : null}
                    {stateValue !== null &&
                    typeof stateValue === 'object' &&
                    Object.keys(stateValue as Record<string, unknown>).length > 0 ? (
                      <pre className="mt-1 overflow-x-auto rounded-lg bg-background p-2 text-[11px] leading-relaxed text-muted">
                        {JSON.stringify(stateValue, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                  {!current && row.status !== 'completed' ? (
                    <button
                      type="button"
                      onClick={() =>
                        callApi('PATCH', `/api/admin/onboardings/${row.id}`, {
                          current_step: idx,
                        })
                      }
                      disabled={busy !== null}
                      className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:bg-background"
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

      {/* Team assignments */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-xs uppercase tracking-wide text-muted">
          Team
        </div>
        <div className="divide-y divide-border">
          {team.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted">
              No team assigned yet. Pick a member below to start.
            </div>
          ) : (
            team.map((t) => {
              const member = members.find((m) => m.id === t.team_member_id);
              return (
                <div key={t.id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-foreground">
                      {member?.name ?? '(unknown)'}
                    </span>
                    <span className="text-xs text-muted">
                      {ROLE_LABELS[t.role]}
                      {t.is_primary ? ' · primary' : null}
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
                    className="text-muted hover:text-rose-300"
                    aria-label="Remove"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-4 py-3">
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
            Assign
          </Button>
        </div>
      </div>

      {/* Email log */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-xs uppercase tracking-wide text-muted">Emails</span>
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
          <div className="space-y-3 border-b border-border px-4 py-4">
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wide text-muted">
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
              <label className="text-xs uppercase tracking-wide text-muted">
                Note (optional)
              </label>
              <Textarea
                rows={3}
                placeholder="If set, replaces the default body copy."
                value={nudgeMessage}
                onChange={(e) => setNudgeMessage(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={busy !== null}
                onClick={() =>
                  callApi('POST', `/api/admin/onboardings/${row.id}/nudge`, {
                    kind: 'manual',
                    to: nudgeTo.trim() || undefined,
                    message: nudgeMessage.trim() || undefined,
                  }).then(() => {
                    setNudgeOpen(false);
                    setNudgeMessage('');
                    setNudgeTo('');
                  })
                }
              >
                Send nudge
              </Button>
            </div>
          </div>
        ) : null}

        {emails.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted">No emails sent yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {emails.map((e) => (
              <div key={e.id} className="px-4 py-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted capitalize">
                    {e.kind.replace('_', ' ')}
                  </span>
                  <span className={e.ok ? 'text-emerald-400' : 'text-rose-300'}>
                    {e.ok ? 'sent' : 'failed'}
                  </span>
                </div>
                <div className="mt-1 text-sm text-foreground">{e.subject}</div>
                <div className="mt-0.5 text-xs text-muted">
                  to {e.to_email} · {formatTime(e.sent_at)}
                </div>
                {e.body_preview ? (
                  <div className="mt-1 text-xs text-muted line-clamp-2">
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
      <div className="rounded-2xl border border-border bg-surface px-4 py-3 flex items-center justify-end gap-2">
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
    </div>
  );
}

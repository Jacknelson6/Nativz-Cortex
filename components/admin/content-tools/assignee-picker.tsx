'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

/**
 * Inline picker for the three role slots on an editing project
 * (`strategist_id`, `videographer_id`, `assignee_id` aka editor).
 *
 * Used in two surfaces:
 *   - PipelineTable role cells -> "compact" variant: pill button only,
 *     no label. Clicking opens a popover with a search + member list.
 *   - EditingProjectDetail side column -> "field" variant: rendered
 *     inside a `SideField` so it visually matches Status / Type /
 *     Shoot date selects.
 *
 * Both variants PATCH the same `/api/admin/editing/projects/:id`
 * endpoint. The parent gets `onSaved()` so it can refresh the row
 * (table) or the detail data (detail panel).
 *
 * Member list is loaded lazily on first open. It's small (the agency
 * team) and a session-cache via module-scope ref is plenty - no need
 * for SWR or React Query here. The list IS shared across every picker
 * mounted on the page, so opening pickers down a 30-row table fires
 * one fetch, not 30.
 */

interface TeamMember {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  is_super_admin: boolean;
  editing_roles: string[];
}

let cachedMembers: TeamMember[] | null = null;
let inflight: Promise<TeamMember[]> | null = null;

async function fetchMembers(): Promise<TeamMember[]> {
  if (cachedMembers) return cachedMembers;
  if (inflight) return inflight;
  inflight = fetch('/api/admin/editing/team', { cache: 'no-store' })
    .then(async (res) => {
      if (!res.ok) throw new Error('Failed to load team');
      const body = (await res.json()) as { members: TeamMember[] };
      cachedMembers = body.members;
      return body.members;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export type AssigneeRole = 'assignee_id' | 'videographer_id' | 'strategist_id';

const ROLE_LABEL: Record<AssigneeRole, string> = {
  assignee_id: 'Editor',
  videographer_id: 'Videographer',
  strategist_id: 'Strategist',
};

/**
 * Map the editing_projects FK column name to the `team_members.editing_roles`
 * tag we filter by. Members are tagged in migration 212; the picker only
 * shows people whose tag matches the slot they're filling.
 */
const ROLE_TAG: Record<AssigneeRole, string> = {
  assignee_id: 'editor',
  videographer_id: 'videographer',
  strategist_id: 'strategist',
};

export function AssigneePicker({
  projectId,
  role,
  currentUserId,
  currentEmail,
  variant = 'compact',
  onSaved,
}: {
  projectId: string;
  role: AssigneeRole;
  currentUserId: string | null;
  currentEmail: string | null;
  variant?: 'compact' | 'field';
  /** Called after a successful PATCH so the parent can refresh data. */
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>(cachedMembers ?? []);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Lazy-load the member list the first time the popover opens. Keep
  // the cached copy mounted between opens so the second click feels
  // instant.
  useEffect(() => {
    if (!open || cachedMembers) return;
    setLoadingMembers(true);
    fetchMembers()
      .then((list) => setMembers(list))
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : 'Failed to load team'),
      )
      .finally(() => setLoadingMembers(false));
  }, [open]);

  // Autofocus search when popover opens. Radix returns focus to the
  // trigger on close, which is what we want.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const tag = ROLE_TAG[role];
    // Restrict to members tagged with the slot's role. The team API
    // returns every editing-eligible member; we narrow client-side so
    // a single fetch backs all three pickers on the page.
    const eligible = members.filter((m) =>
      Array.isArray(m.editing_roles) && m.editing_roles.includes(tag),
    );
    const q = query.trim().toLowerCase();
    if (!q) return eligible;
    return eligible.filter((m) => {
      const name = (m.full_name ?? '').toLowerCase();
      const email = m.email.toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [members, query, role]);

  async function patch(nextId: string | null) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/editing/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [role]: nextId }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as
          | { detail?: string }
          | null;
        throw new Error(err?.detail ?? 'Save failed');
      }
      toast.success(
        nextId
          ? `${ROLE_LABEL[role]} updated`
          : `${ROLE_LABEL[role]} cleared`,
      );
      setOpen(false);
      setQuery('');
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  // Resolve the currently-assigned member from the cached list when
  // we have one; otherwise fall back to the email passed by the
  // parent (so the trigger renders something useful before the list
  // has loaded).
  const current = useMemo(() => {
    if (!currentUserId) return null;
    return members.find((m) => m.id === currentUserId) ?? null;
  }, [currentUserId, members]);

  const triggerLabel = current
    ? memberLabel(current)
    : currentEmail
      ? currentEmail.split('@')[0]
      : 'Unassigned';

  const triggerSubtitle = current?.email ?? currentEmail ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          // Stop the parent <tr onClick> from opening the detail dialog
          // when the cell button is clicked.
          onClick={(e) => e.stopPropagation()}
          className={
            variant === 'compact'
              ? `inline-flex max-w-full items-center gap-1.5 rounded-md border border-transparent px-1.5 py-1 text-xs transition-colors hover:border-nativz-border hover:bg-surface-hover ${
                  currentUserId
                    ? 'text-text-secondary'
                    : 'text-text-muted'
                }`
              : 'flex w-full items-center justify-between gap-2 rounded-lg border border-nativz-border bg-surface px-3 py-2 text-sm text-text-primary transition-colors hover:border-accent/40 hover:bg-surface-hover'
          }
          title={triggerSubtitle ?? undefined}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <Avatar member={current} compact={variant === 'compact'} />
            <span className="truncate">{triggerLabel}</span>
          </span>
          <ChevronDown
            size={variant === 'compact' ? 12 : 14}
            className="shrink-0 text-text-muted"
            aria-hidden
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        matchAnchorWidth={false}
        disablePortal
        className="w-72 p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-nativz-border p-2">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${ROLE_LABEL[role].toLowerCase()}...`}
            className="block w-full rounded-md border border-transparent bg-background px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        <div className="max-h-72 overflow-y-auto py-1">
          {loadingMembers ? (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-text-muted">
              <Loader2 size={14} className="animate-spin" />
              Loading team...
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-text-muted">
              No matches.
            </p>
          ) : (
            <ul role="listbox">
              {filtered.map((m) => {
                const selected = m.id === currentUserId;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      disabled={saving}
                      onClick={() => void patch(m.id)}
                      className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors ${
                        selected
                          ? 'bg-accent-surface text-accent-text'
                          : 'text-text-primary hover:bg-surface-hover'
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      <Avatar member={m} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm">
                          {memberLabel(m)}
                        </span>
                        <span className="truncate text-[11px] text-text-muted">
                          {m.email}
                        </span>
                      </span>
                      {selected ? (
                        <Check size={14} className="shrink-0 text-accent-text" />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {currentUserId && (
          <div className="border-t border-nativz-border p-1">
            <button
              type="button"
              disabled={saving}
              onClick={() => void patch(null)}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              <X size={12} />
              Clear {ROLE_LABEL[role].toLowerCase()}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function memberLabel(m: TeamMember): string {
  return m.full_name?.trim() || m.email.split('@')[0];
}

function Avatar({
  member,
  compact = false,
}: {
  member: TeamMember | null;
  compact?: boolean;
}) {
  const size = compact ? 16 : 22;
  const px = `${size}px`;
  if (!member) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface-hover text-text-muted"
        style={{ width: px, height: px }}
      >
        <UserRound size={Math.round(size * 0.6)} />
      </span>
    );
  }
  if (member.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={member.avatar_url}
        alt=""
        className="shrink-0 rounded-full object-cover"
        style={{ width: px, height: px }}
      />
    );
  }
  const initial = (member.full_name ?? member.email).charAt(0).toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-accent-surface text-[10px] font-semibold text-accent-text"
      style={{ width: px, height: px }}
    >
      {initial}
    </span>
  );
}

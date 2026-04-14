'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Users, Search, Shield, Crown, Trash2, KeyRound, Mail,
  Clock, FileSearch, Building2, Loader2, ChevronDown, ChevronUp,
  Copy, Check, X, Briefcase, ArrowUpDown, UserPlus, Pencil,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatRelativeTime } from '@/lib/utils/format';
import { InviteUsersDialog } from '@/components/users/invite-users-dialog';
import { EmailComposerModal, type Recipient } from '@/components/users/email-composer-modal';
import { ScheduledEmailsTab } from '@/components/users/scheduled-emails-tab';
import { cn } from '@/lib/utils/cn';

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_super_admin: boolean;
  organization_id: string | null;
  avatar_url: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  auth_created_at: string;
  search_count: number;
  client_access: string[];
  // Team fields (merged from team_members)
  team_role: string | null;
  is_team_member: boolean;
}

type SortField = 'name' | 'role' | 'team' | 'last_active' | 'searches';
type SortDir = 'asc' | 'desc';

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function UsersPage() {
  const router = useRouter();
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'team' | 'viewer'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pageTab, setPageTab] = useState<'users' | 'scheduled'>('users');
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerRecipients, setComposerRecipients] = useState<Recipient[]>([]);

  function openComposerFor(recipients: Recipient[]) {
    setComposerRecipients(recipients);
    setComposerOpen(true);
  }

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/admin'); return; }
      const { data } = await supabase.from('users').select('is_super_admin').eq('id', user.id).single();
      if (!data?.is_super_admin) { router.replace('/admin'); return; }
      setIsSuperAdmin(true);
      loadUsers();
    })();
  }, [router]);

  async function loadUsers() {
    const res = await fetch('/api/admin/users');
    if (res.ok) {
      const data = await res.json();
      // Merge team member data
      const teamRes = await fetch('/api/team');
      let teamMembers: { user_id: string | null; role: string | null }[] = [];
      if (teamRes.ok) {
        const teamData = await teamRes.json();
        teamMembers = Array.isArray(teamData) ? teamData : (teamData.members ?? teamData.data ?? []);
      }

      // Build user_id → team_role map
      const teamRoleMap: Record<string, string> = {};
      for (const tm of teamMembers) {
        if (tm.user_id && tm.role) teamRoleMap[tm.user_id] = tm.role;
        else if (tm.user_id) teamRoleMap[tm.user_id] = 'Team member';
      }

      const enrichedUsers: UserRow[] = (data.users ?? []).map((u: UserRow) => ({
        ...u,
        team_role: teamRoleMap[u.id] ?? null,
        is_team_member: !!teamRoleMap[u.id],
      }));

      setUsers(enrichedUsers);
    }
    setLoading(false);
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  const filtered = useMemo(() => {
    let list = users;
    // Admins and team members are synonymous — the Team filter shows both
    if (roleFilter === 'team') list = list.filter((u) => u.role === 'admin' || u.is_team_member);
    else if (roleFilter === 'viewer') list = list.filter((u) => u.role === 'viewer');
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.team_role?.toLowerCase().includes(q)) ||
        u.client_access.some((c) => c.toLowerCase().includes(q))
      );
    }
    // Sort
    list = [...list].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortField) {
        case 'name': return a.full_name.localeCompare(b.full_name) * dir;
        case 'role': return a.role.localeCompare(b.role) * dir;
        case 'team': return (a.team_role ?? '').localeCompare(b.team_role ?? '') * dir;
        case 'last_active': {
          const aTime = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0;
          const bTime = b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : 0;
          return (aTime - bTime) * dir;
        }
        case 'searches': return (a.search_count - b.search_count) * dir;
        default: return 0;
      }
    });
    return list;
  }, [users, roleFilter, searchQuery, sortField, sortDir]);

  const viewerCount = users.filter((u) => u.role === 'viewer').length;
  const teamCount = users.filter((u) => u.role === 'admin' || u.is_team_member).length;

  if (isSuperAdmin === null) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-pulse text-text-muted text-sm">Checking permissions...</div>
      </div>
    );
  }

  return (
    <div className="cortex-page-gutter space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="ui-page-title flex items-center gap-2">
            <Users size={22} className="text-accent-text" />
            All users
          </h1>
          <p className="text-base text-text-muted mt-1">
            {teamCount} team · {viewerCount} portal user{viewerCount !== 1 ? 's' : ''} · {users.length} total
          </p>
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors cursor-pointer shrink-0"
        >
          <UserPlus size={14} />
          Invite users
        </button>
      </div>

      {/* Tab nav */}
      <nav className="mb-4 flex items-center gap-1 border-b border-nativz-border">
        <button
          type="button"
          onClick={() => setPageTab('users')}
          className={cn(
            'border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
            pageTab === 'users'
              ? 'border-accent text-text-primary'
              : 'border-transparent text-text-muted hover:text-text-secondary',
          )}
        >
          All users
        </button>
        <button
          type="button"
          onClick={() => setPageTab('scheduled')}
          className={cn(
            'border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
            pageTab === 'scheduled'
              ? 'border-accent text-text-primary'
              : 'border-transparent text-text-muted hover:text-text-secondary',
          )}
        >
          Scheduled emails
        </button>
      </nav>

      {pageTab === 'scheduled' ? (
        <ScheduledEmailsTab />
      ) : (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, email, team role, or client..."
                className="w-full rounded-lg border border-nativz-border bg-transparent pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text transition-colors"
              />
            </div>
            <div className="flex gap-1 rounded-lg border border-nativz-border p-1">
              {(['all', 'team', 'viewer'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRoleFilter(r)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
                    roleFilter === r
                      ? 'bg-accent text-white'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {r === 'all' ? 'All' : r === 'team' ? 'Team' : 'Portal'}
                </button>
              ))}
            </div>
          </div>

          {/* Sort controls */}
          <div className="flex items-center gap-1.5 text-sm text-text-muted">
            <ArrowUpDown size={14} className="mr-1" />
            Sort:
            {(['name', 'role', 'team', 'last_active', 'searches'] as SortField[]).map(field => (
              <button
                key={field}
                onClick={() => toggleSort(field)}
                className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                  sortField === field
                    ? 'bg-accent-surface text-accent-text font-medium'
                    : 'hover:bg-surface-hover'
                }`}
              >
                {field === 'last_active' ? 'Last active' : field.charAt(0).toUpperCase() + field.slice(1)}
                {sortField === field && (sortDir === 'asc' ? ' ↑' : ' ↓')}
              </button>
            ))}
          </div>

          {/* User list */}
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-surface-elevated animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Users size={24} className="mx-auto mb-2 text-text-muted/30" />
              <p className="text-sm text-text-muted">No users found</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map((user) => {
                const isExpanded = expandedId === user.id;
                return (
                  <UserCard
                    key={user.id}
                    user={user}
                    expanded={isExpanded}
                    onToggle={() => setExpandedId(isExpanded ? null : user.id)}
                    onUpdated={loadUsers}
                    onDeleted={(id) => setUsers((prev) => prev.filter((u) => u.id !== id))}
                    onSendEmail={(r) => openComposerFor([r])}
                  />
                );
              })}
            </div>
          )}
        </>
      )}

      <InviteUsersDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={loadUsers}
      />

      <EmailComposerModal
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        recipients={composerRecipients}
      />
    </div>
  );
}

interface UserSearch {
  id: string;
  query: string;
  status: string;
  created_at: string;
  client_name: string | null;
}

function UserCard({
  user: u,
  expanded,
  onToggle,
  onUpdated,
  onDeleted,
  onSendEmail,
}: {
  user: UserRow;
  expanded: boolean;
  onToggle: () => void;
  onUpdated: () => void;
  onDeleted: (id: string) => void;
  onSendEmail: (r: Recipient) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [changingRole, setChangingRole] = useState(false);

  // Inline edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(u.full_name);
  const [editEmail, setEditEmail] = useState(u.email);
  const [savingEdit, setSavingEdit] = useState(false);

  // Recent searches — lazy load on expand
  const [searches, setSearches] = useState<UserSearch[] | null>(null);
  const [loadingSearches, setLoadingSearches] = useState(false);

  useEffect(() => {
    if (!expanded || u.search_count === 0 || searches !== null) return;
    setLoadingSearches(true);
    fetch(`/api/admin/users/${u.id}/searches`)
      .then((r) => (r.ok ? r.json() : { searches: [] }))
      .then((data) => setSearches(data.searches ?? []))
      .catch(() => setSearches([]))
      .finally(() => setLoadingSearches(false));
  }, [expanded, u.id, u.search_count, searches]);

  useEffect(() => {
    setEditName(u.full_name);
    setEditEmail(u.email);
  }, [u.full_name, u.email]);

  async function handleSaveEdit() {
    const trimmedName = editName.trim();
    const trimmedEmail = editEmail.trim();
    if (!trimmedName) { toast.error('Name is required'); return; }
    if (!trimmedEmail.includes('@')) { toast.error('Valid email required'); return; }
    const changed: Record<string, string> = { id: u.id };
    if (trimmedName !== u.full_name) changed.full_name = trimmedName;
    if (trimmedEmail.toLowerCase() !== u.email.toLowerCase()) changed.email = trimmedEmail;
    if (Object.keys(changed).length === 1) { setEditing(false); return; }

    setSavingEdit(true);
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changed),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success('User updated');
      setEditing(false);
      onUpdated();
    } else {
      toast.error(data.error ?? 'Failed to update');
    }
    setSavingEdit(false);
  }

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: u.id }),
    });
    if (res.ok) {
      toast.success(`${u.full_name} deleted`);
      onDeleted(u.id);
    } else {
      toast.error('Failed to delete user');
    }
    setDeleting(false);
    setConfirmDelete(false);
  }

  async function handleResetPassword() {
    setResetting(true);
    const res = await fetch('/api/admin/users/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u.email }),
    });
    const data = await res.json();
    if (res.ok) {
      setResetLink(data.reset_link ?? null);
      toast.success(data.reset_link ? 'Reset link generated' : 'Reset email sent');
    } else {
      toast.error(data.error ?? 'Failed to generate reset link');
    }
    setResetting(false);
  }

  async function handleRoleChange(newRole: string) {
    setChangingRole(true);
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: u.id, role: newRole }),
    });
    if (res.ok) {
      toast.success(`${u.full_name} role changed to ${newRole}`);
      onUpdated();
    } else {
      toast.error('Failed to change role');
    }
    setChangingRole(false);
  }

  async function handleToggleSuperAdmin() {
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: u.id, is_super_admin: !u.is_super_admin }),
    });
    if (res.ok) {
      toast.success(u.is_super_admin ? 'Super admin removed' : 'Super admin granted');
      onUpdated();
    } else {
      toast.error('Failed to update');
    }
  }

  function handleCopyResetLink() {
    if (!resetLink) return;
    navigator.clipboard.writeText(resetLink);
    setCopied(true);
    toast.success('Copied');
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-xl border border-nativz-border bg-surface transition-colors hover:border-nativz-border/80">
      {/* Main row — FONT SIZES BUMPED to match rest of app */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left cursor-pointer"
      >
        {/* Avatar */}
        {u.avatar_url ? (
          <img src={u.avatar_url} alt={u.full_name} className="h-11 w-11 rounded-full object-cover ring-1 ring-nativz-border shrink-0" />
        ) : (
          <div className="h-11 w-11 rounded-full bg-gradient-to-br from-accent/15 to-accent2/15 ring-1 ring-nativz-border flex items-center justify-center shrink-0">
            <span className="text-base font-semibold text-text-secondary">{getInitials(u.full_name)}</span>
          </div>
        )}

        {/* Name + email + team role + client badges */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold text-text-primary truncate">{u.full_name}</span>
            {u.is_super_admin && <Crown size={15} className="text-amber-400 shrink-0" />}
            <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
              u.role === 'admin' ? 'bg-accent/[0.08] text-accent-text' : 'bg-surface-hover text-text-muted'
            }`}>
              {u.role}
            </span>
            {u.team_role && (
              <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-purple-500/10 text-purple-400 flex items-center gap-1">
                <Briefcase size={11} />
                {u.team_role}
              </span>
            )}
            {u.client_access.slice(0, 3).map((c) => (
              <span
                key={c}
                className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-emerald-500/10 text-emerald-400 flex items-center gap-1"
                title={`Client access: ${c}`}
              >
                <Building2 size={11} />
                {c}
              </span>
            ))}
            {u.client_access.length > 3 && (
              <span className="text-xs px-2 py-0.5 rounded-full shrink-0 bg-surface-hover text-text-muted">
                +{u.client_access.length - 3}
              </span>
            )}
          </div>
          <span className="text-sm text-text-muted mt-1 block truncate">{u.email}</span>
        </div>

        {/* Stats */}
        <div className="hidden sm:flex items-center gap-5 shrink-0 text-sm text-text-muted">
          <span className="flex items-center gap-1.5" title="Last active">
            <Clock size={14} />
            {u.last_sign_in_at ? formatRelativeTime(u.last_sign_in_at) : 'Never'}
          </span>
          <span className="flex items-center gap-1.5" title="Searches">
            <FileSearch size={14} />
            {u.search_count}
          </span>
          {u.client_access.length > 0 && (
            <span className="flex items-center gap-1.5" title="Client access">
              <Building2 size={14} />
              {u.client_access.length}
            </span>
          )}
        </div>

        {/* Expand chevron */}
        {expanded ? <ChevronUp size={16} className="text-text-muted shrink-0" /> : <ChevronDown size={16} className="text-text-muted shrink-0" />}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-nativz-border/50 space-y-5">
          {/* Inline edit name + email */}
          {editing ? (
            <div className="pt-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-muted uppercase tracking-wide mb-1.5">Full name</label>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-text"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted uppercase tracking-wide mb-1.5">Email</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full rounded-lg border border-nativz-border bg-transparent px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-text"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveEdit}
                  disabled={savingEdit}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {savingEdit ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  Save
                </button>
                <button
                  onClick={() => { setEditing(false); setEditName(u.full_name); setEditEmail(u.email); }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-nativz-border px-3 py-1.5 text-sm text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="pt-4 flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-text-primary">{u.full_name}</h3>
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-md p-1 text-text-muted hover:text-text-primary hover:bg-surface-hover cursor-pointer"
                  title="Edit name and email"
                >
                  <Pencil size={13} />
                </button>
              </div>
            </div>
          )}

          {/* Info grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wide">Email</p>
              <p className="text-sm text-text-secondary mt-1 flex items-center gap-1.5 break-all">
                <Mail size={13} className="shrink-0" />
                {u.email}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wide">Last active</p>
              <p className="text-sm text-text-secondary mt-1 flex items-center gap-1.5">
                <Clock size={13} />
                {u.last_sign_in_at ? formatRelativeTime(u.last_sign_in_at) : 'Never signed in'}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wide">Searches</p>
              <p className="text-sm text-text-secondary mt-1 flex items-center gap-1.5">
                <FileSearch size={13} />
                {u.search_count} search{u.search_count !== 1 ? 'es' : ''}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wide">Created</p>
              <p className="text-sm text-text-secondary mt-1">
                {new Date(u.auth_created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>

          {/* Team role */}
          {u.team_role && (
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wide mb-1.5">Team role</p>
              <span className="text-sm bg-purple-500/10 text-purple-400 px-3 py-1 rounded-lg inline-flex items-center gap-1.5">
                <Briefcase size={13} />
                {u.team_role}
              </span>
            </div>
          )}

          {/* Client access */}
          {u.client_access.length > 0 && (
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wide mb-1.5">Client access</p>
              <div className="flex flex-wrap gap-1.5">
                {u.client_access.map((c) => (
                  <span key={c} className="text-sm bg-emerald-500/10 text-emerald-400 px-2.5 py-0.5 rounded-lg inline-flex items-center gap-1.5">
                    <Building2 size={12} />
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recent searches */}
          {u.search_count > 0 && (
            <div>
              <p className="text-xs text-text-muted uppercase tracking-wide mb-1.5">
                Recent searches {searches && searches.length > 0 && `· last ${searches.length}`}
              </p>
              {loadingSearches ? (
                <div className="flex items-center gap-2 text-sm text-text-muted">
                  <Loader2 size={13} className="animate-spin" />
                  Loading…
                </div>
              ) : searches === null || searches.length === 0 ? (
                <p className="text-sm text-text-muted">No searches found.</p>
              ) : (
                <div className="rounded-lg border border-nativz-border/50 divide-y divide-nativz-border/50">
                  {searches.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 px-3 py-2">
                      <FileSearch size={13} className="text-text-muted shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-text-primary truncate">{s.query}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {s.client_name && (
                            <span className="text-xs text-emerald-400 flex items-center gap-1">
                              <Building2 size={10} />
                              {s.client_name}
                            </span>
                          )}
                          <span className={`text-xs ${
                            s.status === 'completed' ? 'text-text-muted' :
                            s.status === 'failed' ? 'text-red-400' :
                            'text-amber-400'
                          }`}>
                            {s.status}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-text-muted shrink-0">
                        {formatRelativeTime(s.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-nativz-border/30">
            {/* Role switcher */}
            <div className="flex items-center gap-1 rounded-lg border border-nativz-border p-0.5">
              {(['admin', 'viewer'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => handleRoleChange(r)}
                  disabled={changingRole || u.role === r}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer disabled:cursor-default ${
                    u.role === r
                      ? 'bg-accent text-white'
                      : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
                  }`}
                >
                  {r === 'admin' ? 'Admin' : 'Viewer'}
                </button>
              ))}
            </div>

            {/* Super admin toggle — only admins are eligible */}
            {u.role === 'admin' ? (
              <button
                onClick={handleToggleSuperAdmin}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors cursor-pointer ${
                  u.is_super_admin
                    ? 'border-amber-400/30 bg-amber-400/10 text-amber-400'
                    : 'border-nativz-border text-text-muted hover:text-text-secondary hover:bg-surface-hover'
                }`}
              >
                <Crown size={13} />
                {u.is_super_admin ? 'Super admin' : 'Grant super admin'}
              </button>
            ) : (
              <span
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-dashed border-nativz-border/60 text-text-muted/50 cursor-not-allowed"
                title="Only admin-role users can be made super admin. Switch this user to Admin first."
              >
                <Crown size={13} />
                Super admin (admins only)
              </span>
            )}

            {/* Send email */}
            <button
              type="button"
              onClick={() => onSendEmail({ id: u.id, email: u.email, full_name: u.full_name ?? null })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-nativz-border text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <Mail size={13} />
              Send email
            </button>

            {/* Reset password */}
            <button
              onClick={handleResetPassword}
              disabled={resetting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-nativz-border text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors cursor-pointer disabled:opacity-50"
            >
              <KeyRound size={13} />
              {resetting ? 'Generating...' : 'Reset password'}
            </button>

            {/* Delete */}
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-nativz-border text-text-muted hover:text-red-400 hover:border-red-400/30 hover:bg-red-500/5 transition-colors cursor-pointer ml-auto"
              >
                <Trash2 size={13} />
                Delete
              </button>
            ) : (
              <div className="flex items-center gap-2 ml-auto bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5">
                <span className="text-sm text-red-400">Delete {u.full_name}?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-sm text-red-400 font-medium hover:text-red-300 cursor-pointer"
                >
                  {deleting ? <Loader2 size={13} className="animate-spin" /> : 'Yes'}
                </button>
                <span className="text-red-500/30">|</span>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-sm text-text-muted hover:text-text-secondary cursor-pointer"
                >
                  No
                </button>
              </div>
            )}
          </div>

          {/* Reset link display */}
          {resetLink && (
            <div className="rounded-lg border border-nativz-border/50 p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <Check size={13} className="text-emerald-400" />
                <p className="text-sm text-emerald-400 font-medium">Reset link generated</p>
                <button onClick={() => setResetLink(null)} className="ml-auto text-text-muted hover:text-text-secondary cursor-pointer">
                  <X size={13} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={resetLink}
                  className="flex-1 rounded-md border border-nativz-border/50 bg-surface-hover/50 px-2.5 py-1.5 text-sm text-text-primary font-mono truncate"
                />
                <button
                  onClick={handleCopyResetLink}
                  className="shrink-0 rounded-md p-2 text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
                >
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </div>
              <p className="text-xs text-text-muted">Share this link with the user to reset their password</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

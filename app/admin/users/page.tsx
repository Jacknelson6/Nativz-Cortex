'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Users, Search, Shield, Crown, Trash2, KeyRound, Mail,
  Clock, FileSearch, Building2, Loader2, ChevronDown, ChevronUp,
  Copy, Check, X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatRelativeTime } from '@/lib/utils/format';

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
}

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function UsersPage() {
  const router = useRouter();
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'viewer'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
      setUsers(data.users ?? []);
    }
    setLoading(false);
  }

  const filtered = useMemo(() => {
    let list = users;
    if (roleFilter !== 'all') list = list.filter((u) => u.role === roleFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.client_access.some((c) => c.toLowerCase().includes(q))
      );
    }
    return list;
  }, [users, roleFilter, searchQuery]);

  const adminCount = users.filter((u) => u.role === 'admin').length;
  const viewerCount = users.filter((u) => u.role === 'viewer').length;

  if (isSuperAdmin === null) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-pulse text-text-muted text-sm">Checking permissions...</div>
      </div>
    );
  }

  return (
    <div className="cortex-page-gutter space-y-5 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="ui-page-title flex items-center gap-2">
          <Users size={22} className="text-accent-text" />
          All users
        </h1>
        <p className="text-sm text-text-muted mt-0.5">
          {adminCount} admin{adminCount !== 1 ? 's' : ''} · {viewerCount} portal user{viewerCount !== 1 ? 's' : ''} · {users.length} total
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, or client..."
            className="w-full rounded-lg border border-nativz-border bg-transparent pl-9 pr-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-text transition-colors"
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-nativz-border p-0.5">
          {(['all', 'admin', 'viewer'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1 text-xs rounded-md transition-colors cursor-pointer ${
                roleFilter === r
                  ? 'bg-accent text-white'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {r === 'all' ? 'All' : r === 'admin' ? 'Admins' : 'Portal'}
            </button>
          ))}
        </div>
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
        <div className="space-y-1">
          {filtered.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              expanded={expandedId === user.id}
              onToggle={() => setExpandedId(expandedId === user.id ? null : user.id)}
              onUpdated={loadUsers}
              onDeleted={(id) => setUsers((prev) => prev.filter((u) => u.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UserCard({
  user: u,
  expanded,
  onToggle,
  onUpdated,
  onDeleted,
}: {
  user: UserRow;
  expanded: boolean;
  onToggle: () => void;
  onUpdated: () => void;
  onDeleted: (id: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [changingRole, setChangingRole] = useState(false);

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
      {/* Main row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
      >
        {/* Avatar */}
        {u.avatar_url ? (
          <img src={u.avatar_url} alt={u.full_name} className="h-9 w-9 rounded-full object-cover ring-1 ring-nativz-border shrink-0" />
        ) : (
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-accent/15 to-accent2/15 ring-1 ring-nativz-border flex items-center justify-center shrink-0">
            <span className="text-xs font-semibold text-text-secondary">{getInitials(u.full_name)}</span>
          </div>
        )}

        {/* Name + email */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-text-primary truncate">{u.full_name}</span>
            {u.is_super_admin && <Crown size={11} className="text-amber-400 shrink-0" />}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
              u.role === 'admin' ? 'bg-accent/[0.08] text-accent-text' : 'bg-surface-hover text-text-muted'
            }`}>
              {u.role}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-text-muted/60">
            <span className="truncate">{u.email}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="hidden sm:flex items-center gap-4 shrink-0 text-[11px] text-text-muted/50">
          <span className="flex items-center gap-1" title="Last active">
            <Clock size={10} />
            {u.last_sign_in_at ? formatRelativeTime(u.last_sign_in_at) : 'Never'}
          </span>
          <span className="flex items-center gap-1" title="Searches">
            <FileSearch size={10} />
            {u.search_count}
          </span>
          {u.client_access.length > 0 && (
            <span className="flex items-center gap-1" title="Client access">
              <Building2 size={10} />
              {u.client_access.length}
            </span>
          )}
        </div>

        {/* Expand chevron */}
        {expanded ? <ChevronUp size={14} className="text-text-muted/40 shrink-0" /> : <ChevronDown size={14} className="text-text-muted/40 shrink-0" />}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-nativz-border/50 space-y-4">
          {/* Info grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            <div>
              <p className="text-[10px] text-text-muted/50 uppercase tracking-wide">Email</p>
              <p className="text-xs text-text-secondary mt-0.5 flex items-center gap-1">
                <Mail size={10} />
                {u.email}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-text-muted/50 uppercase tracking-wide">Last active</p>
              <p className="text-xs text-text-secondary mt-0.5 flex items-center gap-1">
                <Clock size={10} />
                {u.last_sign_in_at ? formatRelativeTime(u.last_sign_in_at) : 'Never signed in'}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-text-muted/50 uppercase tracking-wide">Searches</p>
              <p className="text-xs text-text-secondary mt-0.5 flex items-center gap-1">
                <FileSearch size={10} />
                {u.search_count} search{u.search_count !== 1 ? 'es' : ''}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-text-muted/50 uppercase tracking-wide">Created</p>
              <p className="text-xs text-text-secondary mt-0.5">
                {new Date(u.auth_created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>

          {/* Client access (viewers) */}
          {u.client_access.length > 0 && (
            <div>
              <p className="text-[10px] text-text-muted/50 uppercase tracking-wide mb-1">Client access</p>
              <div className="flex flex-wrap gap-1">
                {u.client_access.map((c) => (
                  <span key={c} className="text-[10px] bg-surface-hover text-text-secondary px-2 py-0.5 rounded">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-nativz-border/30">
            {/* Role switcher */}
            <div className="flex items-center gap-1 rounded-lg border border-nativz-border p-0.5">
              {(['admin', 'viewer'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => handleRoleChange(r)}
                  disabled={changingRole || u.role === r}
                  className={`px-2.5 py-1 text-[11px] rounded-md transition-colors cursor-pointer disabled:cursor-default ${
                    u.role === r
                      ? 'bg-accent text-white'
                      : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
                  }`}
                >
                  {r === 'admin' ? 'Admin' : 'Viewer'}
                </button>
              ))}
            </div>

            {/* Super admin toggle */}
            <button
              onClick={handleToggleSuperAdmin}
              className={`flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-lg border transition-colors cursor-pointer ${
                u.is_super_admin
                  ? 'border-amber-400/30 bg-amber-400/10 text-amber-400'
                  : 'border-nativz-border text-text-muted hover:text-text-secondary hover:bg-surface-hover'
              }`}
            >
              <Crown size={10} />
              {u.is_super_admin ? 'Super admin' : 'Grant super admin'}
            </button>

            {/* Reset password */}
            <button
              onClick={handleResetPassword}
              disabled={resetting}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-lg border border-nativz-border text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors cursor-pointer disabled:opacity-50"
            >
              <KeyRound size={10} />
              {resetting ? 'Generating...' : 'Reset password'}
            </button>

            {/* Delete */}
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-lg border border-nativz-border text-text-muted hover:text-red-400 hover:border-red-400/30 hover:bg-red-500/5 transition-colors cursor-pointer ml-auto"
              >
                <Trash2 size={10} />
                Delete
              </button>
            ) : (
              <div className="flex items-center gap-1.5 ml-auto bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-1">
                <span className="text-[11px] text-red-400">Delete {u.full_name}?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-[11px] text-red-400 font-medium hover:text-red-300 cursor-pointer"
                >
                  {deleting ? <Loader2 size={10} className="animate-spin" /> : 'Yes'}
                </button>
                <span className="text-red-500/30">|</span>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-[11px] text-text-muted hover:text-text-secondary cursor-pointer"
                >
                  No
                </button>
              </div>
            )}
          </div>

          {/* Reset link display */}
          {resetLink && (
            <div className="rounded-lg border border-nativz-border/50 p-2.5 space-y-1.5">
              <div className="flex items-center gap-1">
                <Check size={10} className="text-emerald-400" />
                <p className="text-[10px] text-emerald-400 font-medium">Reset link generated</p>
                <button onClick={() => setResetLink(null)} className="ml-auto text-text-muted/40 hover:text-text-secondary cursor-pointer">
                  <X size={10} />
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  readOnly
                  value={resetLink}
                  className="flex-1 rounded-md border border-nativz-border/50 bg-surface-hover/50 px-2 py-1 text-[10px] text-text-primary font-mono truncate"
                />
                <button
                  onClick={handleCopyResetLink}
                  className="shrink-0 rounded-md p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
                >
                  {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                </button>
              </div>
              <p className="text-[10px] text-text-muted/40">Share this link with the user to reset their password</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

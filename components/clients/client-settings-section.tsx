'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle, Trash2, Power, Link2, Copy, Check,
  Loader2, UserPlus, Users, X, RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InviteItem {
  id: string;
  token: string;
  invite_url: string;
  status: 'active' | 'used' | 'expired';
  expires_at: string;
  used_at: string | null;
  used_by: { email: string; full_name: string } | null;
  created_at: string;
}

interface PortalUser {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  last_login: string | null;
  created_at: string;
  is_active: boolean;
}

// ─── Invite Management ────────────────────────────────────────────────────────

function InviteManagement({ clientId }: { clientId: string }) {
  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchInvites = useCallback(async () => {
    try {
      const res = await fetch(`/api/invites?client_id=${clientId}`);
      if (res.ok) {
        const data = await res.json();
        setInvites(data.invites ?? []);
      }
    } catch {
      // Silently fail — non-critical
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchInvites(); }, [fetchInvites]);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to create invite');
        return;
      }
      toast.success('Invite link created');
      fetchInvites();
    } catch {
      toast.error('Failed to create invite');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(inviteId: string) {
    try {
      const res = await fetch(`/api/invites/${inviteId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to revoke');
        return;
      }
      toast.success('Invite revoked');
      setInvites(prev => prev.filter(i => i.id !== inviteId));
    } catch {
      toast.error('Failed to revoke invite');
    }
  }

  function handleCopy(invite: InviteItem) {
    navigator.clipboard.writeText(invite.invite_url);
    setCopiedId(invite.id);
    toast.success('Invite link copied');
    setTimeout(() => setCopiedId(null), 2000);
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'active': return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">Active</Badge>;
      case 'used': return <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px]">Used</Badge>;
      case 'expired': return <Badge className="bg-zinc-500/10 text-zinc-400 border-zinc-500/20 text-[10px]">Expired</Badge>;
      default: return null;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 size={14} className="text-text-muted" />
          <h3 className="text-sm font-medium text-text-primary">Invite links</h3>
        </div>
        <Button
          size="sm"
          variant="outline"
          type="button"
          onClick={handleCreate}
          disabled={creating}
        >
          {creating ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
          Generate link
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 size={16} className="animate-spin text-text-muted" />
        </div>
      ) : invites.length === 0 ? (
        <p className="text-xs text-text-muted py-2">
          No invite links yet. Generate one to give a client access to their portal.
        </p>
      ) : (
        <div className="space-y-2">
          {invites.map(invite => (
            <div
              key={invite.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {statusBadge(invite.status)}
                  <span className="text-xs text-text-muted truncate">
                    {invite.status === 'used' && invite.used_by
                      ? `Used by ${invite.used_by.full_name} (${invite.used_by.email})`
                      : invite.status === 'expired'
                        ? `Expired ${formatDate(invite.expires_at)}`
                        : `Expires ${formatDate(invite.expires_at)}`
                    }
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {invite.status === 'active' && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleCopy(invite)}
                      className="rounded-md p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
                      title="Copy invite link"
                    >
                      {copiedId === invite.id ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRevoke(invite.id)}
                      className="rounded-md p-1.5 text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Revoke invite"
                    >
                      <X size={13} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Portal Users ─────────────────────────────────────────────────────────────

function PortalUsersSection({ clientId }: { clientId: string }) {
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    async function fetch_() {
      try {
        const res = await fetch(`/api/clients/${clientId}/portal-users`);
        if (res.ok) {
          const data = await res.json();
          setUsers(data.users ?? []);
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }
    fetch_();
  }, [clientId]);

  async function handleToggle(userId: string, newActive: boolean) {
    setTogglingId(userId);
    try {
      const res = await fetch(`/api/clients/${clientId}/portal-users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newActive }),
      });
      if (!res.ok) {
        toast.error('Failed to update user');
        return;
      }
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: newActive } : u));
      toast.success(newActive ? 'User reactivated' : 'User deactivated');
    } catch {
      toast.error('Failed to update user');
    } finally {
      setTogglingId(null);
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Users size={14} className="text-text-muted" />
        <h3 className="text-sm font-medium text-text-primary">Portal users</h3>
        {users.length > 0 && (
          <span className="text-[10px] text-text-muted bg-surface-hover rounded-full px-1.5 py-0.5">
            {users.length}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 size={16} className="animate-spin text-text-muted" />
        </div>
      ) : users.length === 0 ? (
        <p className="text-xs text-text-muted py-2">
          No portal users yet. Share an invite link to get started.
        </p>
      ) : (
        <div className="space-y-2">
          {users.map(u => (
            <div
              key={u.id}
              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                u.is_active
                  ? 'border-white/[0.06] bg-white/[0.02]'
                  : 'border-red-500/10 bg-red-500/[0.02] opacity-60'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-surface-hover flex items-center justify-center text-[10px] font-medium text-text-muted shrink-0">
                    {u.full_name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-text-primary truncate">{u.full_name}</p>
                    <p className="text-xs text-text-muted truncate">{u.email}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-text-muted hidden sm:inline">
                  {u.last_login ? `Last login ${formatDate(u.last_login)}` : 'Never logged in'}
                </span>
                <button
                  type="button"
                  onClick={() => handleToggle(u.id, !u.is_active)}
                  disabled={togglingId === u.id}
                  className={`rounded-md p-1.5 transition-colors ${
                    u.is_active
                      ? 'text-text-muted hover:text-red-400 hover:bg-red-500/10'
                      : 'text-text-muted hover:text-emerald-400 hover:bg-emerald-500/10'
                  }`}
                  title={u.is_active ? 'Deactivate user' : 'Reactivate user'}
                >
                  {togglingId === u.id
                    ? <Loader2 size={13} className="animate-spin" />
                    : u.is_active
                      ? <Power size={13} />
                      : <RotateCcw size={13} />
                  }
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Portal Access Card (exported) ───────────────────────────────────────────

/** Invites and portal user list. Feature flags and API access live in Settings → Access & services. */
export function PortalAccessCard({ clientId }: { clientId: string }) {
  return (
    <Card>
      <h2 className="text-base font-semibold text-text-primary mb-5">Portal users</h2>

      <div className="space-y-6">
        <InviteManagement clientId={clientId} />

        <div className="border-t border-white/[0.06]" />

        <PortalUsersSection clientId={clientId} />
      </div>
    </Card>
  );
}

// ─── Danger Zone (exported, unchanged) ───────────────────────────────────────

export function DangerZone({
  clientId,
  clientName,
  isActive,
  setIsActive,
}: {
  clientId: string;
  clientName: string;
  isActive: boolean;
  setIsActive: (v: boolean) => void;
}) {
  const router = useRouter();
  const [deactivating, setDeactivating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  async function handleToggleActive(activate: boolean) {
    setDeactivating(true);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: activate }),
      });
      if (!res.ok) { toast.error(`Failed to ${activate ? 'reactivate' : 'deactivate'}`); return; }
      setIsActive(activate);
      toast.success(`${clientName} ${activate ? 'reactivated' : 'deactivated'}`);
    } catch { toast.error('Something went wrong'); }
    finally { setDeactivating(false); }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/clients/${clientId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string; details?: string };
        toast.error(
          [data.error || 'Failed to delete client', data.details].filter(Boolean).join(' — '),
        );
        return;
      }
      toast.success(`${clientName} deleted permanently`);
      router.push('/admin/clients');
    } catch { toast.error('Something went wrong'); }
    finally { setDeleting(false); }
  }

  return (
    <>
      <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-6">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle size={16} className="text-red-400" />
          <h2 className="text-base font-semibold text-red-400">Danger zone</h2>
        </div>
        <p className="text-sm text-text-muted mb-5">
          These actions affect the client&apos;s visibility and data.
        </p>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-text-primary">{isActive ? 'Deactivate' : 'Reactivate'} client</p>
              <p className="text-xs text-text-muted">{isActive ? 'Hide from portal and client list.' : 'Make visible in portal and client list.'}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => handleToggleActive(!isActive)}
              disabled={deactivating}
              className={isActive ? 'shrink-0 border-red-500/30 text-red-400 hover:bg-red-500/10' : 'shrink-0'}
            >
              <Power size={14} />
              {deactivating ? (isActive ? 'Deactivating...' : 'Activating...') : (isActive ? 'Deactivate' : 'Activate')}
            </Button>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-red-500/20 bg-red-500/[0.04] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-red-400">Delete client</p>
              <p className="text-xs text-text-muted">Permanently remove all data.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="shrink-0 border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              <Trash2 size={14} />
              Delete
            </Button>
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative w-full max-w-md rounded-xl border border-red-500/20 bg-surface p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-text-primary mb-2">Delete {clientName}?</h3>
            <p className="text-sm text-text-muted mb-4">
              This will permanently delete all data associated with this client including searches, ideas, strategies, and settings. This action cannot be undone.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-medium text-text-muted mb-1.5">
                Type <span className="font-mono text-red-400">{clientName}</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="w-full rounded-lg border border-nativz-border bg-surface-hover px-3 py-2 text-sm text-text-primary focus:border-red-500/50 focus:outline-none focus:ring-1 focus:ring-red-500/20"
                placeholder={clientName}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" type="button" onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}>
                Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={deleteConfirmText !== clientName || deleting}
                onClick={handleDelete}
                className="border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                <Trash2 size={14} />
                {deleting ? 'Deleting...' : 'Delete permanently'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

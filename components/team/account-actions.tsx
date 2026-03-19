'use client';

import { useState } from 'react';
import { LinkIcon, Send, Check, Copy, UserCheck, Unlink, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface LinkableUser {
  id: string;
  full_name: string;
  email: string;
}

interface AccountActionsProps {
  memberId: string;
  memberEmail: string | null;
  linkedUserId: string | null;
  linkedUserName?: string | null;
  isSuperAdmin?: boolean;
  onAccountDeleted?: () => void;
}

export function AccountActions({ memberId, memberEmail, linkedUserId, linkedUserName, isSuperAdmin = false, onAccountDeleted }: AccountActionsProps) {
  const [isLinked, setIsLinked] = useState(!!linkedUserId);
  const [currentLinkedName, setCurrentLinkedName] = useState(linkedUserName ?? null);
  const [linkableUsers, setLinkableUsers] = useState<LinkableUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showLinkDropdown, setShowLinkDropdown] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  async function fetchLinkableUsers() {
    setLoadingUsers(true);
    try {
      const res = await fetch('/api/team/linkable-users');
      if (res.ok) setLinkableUsers(await res.json());
    } catch { toast.error('Failed to load users'); }
    finally { setLoadingUsers(false); }
  }

  async function handleLink(userId: string, userName: string) {
    setLinking(true);
    try {
      const res = await fetch(`/api/team/${memberId}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to link');
      setIsLinked(true);
      setCurrentLinkedName(userName);
      setShowLinkDropdown(false);
      toast.success('Account linked');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to link');
    } finally { setLinking(false); }
  }

  async function handleUnlink() {
    setUnlinking(true);
    try {
      const res = await fetch(`/api/team/${memberId}/link`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to unlink');
      setIsLinked(false);
      setCurrentLinkedName(null);
      toast.success('Account unlinked');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to unlink');
    } finally { setUnlinking(false); }
  }

  async function handleInvite() {
    setInviting(true);
    try {
      const res = await fetch(`/api/team/${memberId}/invite`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create invite');
      setInviteUrl(data.invite_url);
      toast.success('Invite link created');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invite');
    } finally { setInviting(false); }
  }

  async function handleCopy() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/team/${memberId}/delete-account`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to delete account');
      }
      setIsLinked(false);
      setCurrentLinkedName(null);
      setShowDeleteConfirm(false);
      toast.success('Account deleted');
      onAccountDeleted?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-lg border border-nativz-border/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-medium text-text-muted uppercase tracking-wider flex items-center gap-1">
          <UserCheck size={10} />
          Cortex account
        </h3>
        {isLinked ? (
          <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">Linked</span>
        ) : (
          <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full">No account</span>
        )}
      </div>

      {isLinked ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">
              {currentLinkedName ?? 'Linked account'}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={handleUnlink}
                disabled={unlinking}
                className="text-[10px] text-text-muted/40 hover:text-amber-400 transition-colors cursor-pointer p-0.5"
                title="Unlink account"
              >
                <Unlink size={11} />
              </button>
              {isSuperAdmin && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-[10px] text-text-muted/40 hover:text-red-400 transition-colors cursor-pointer p-0.5"
                  title="Delete account"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          </div>
          {showDeleteConfirm && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] p-2.5 space-y-2">
              <p className="text-[11px] text-red-400">
                Delete this user&apos;s Cortex account? They will lose access and need a new invite.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  className="flex items-center gap-1 rounded-md bg-red-500/20 px-2.5 py-1 text-[10px] font-medium text-red-400 hover:bg-red-500/30 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {deleting ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                  {deleting ? 'Deleting...' : 'Delete account'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="rounded-md px-2.5 py-1 text-[10px] text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {!showLinkDropdown && !inviteUrl && (
            <div className="flex gap-2">
              <button
                onClick={() => { setShowLinkDropdown(true); fetchLinkableUsers(); }}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-nativz-border/60 px-2.5 py-1.5 text-[11px] text-text-secondary hover:bg-surface-hover transition-colors cursor-pointer"
              >
                <LinkIcon size={11} />
                Link existing
              </button>
              <button
                onClick={handleInvite}
                disabled={inviting || !memberEmail}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-nativz-border/60 px-2.5 py-1.5 text-[11px] text-text-secondary hover:bg-surface-hover transition-colors cursor-pointer disabled:opacity-40"
              >
                <Send size={11} />
                {inviting ? 'Creating...' : 'Invite'}
              </button>
            </div>
          )}

          {showLinkDropdown && (
            <div className="rounded-lg border border-nativz-border/50 p-2 space-y-1">
              <p className="text-[10px] text-text-muted mb-1">Select account</p>
              {loadingUsers ? (
                <p className="text-[10px] text-text-muted/50 py-1">Loading...</p>
              ) : linkableUsers.length === 0 ? (
                <p className="text-[10px] text-text-muted/50 py-1">No available accounts</p>
              ) : (
                <div className="max-h-32 overflow-y-auto space-y-0.5">
                  {linkableUsers.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleLink(u.id, u.full_name)}
                      disabled={linking}
                      className="w-full text-left px-2 py-1.5 rounded-md hover:bg-surface-hover transition-colors text-xs cursor-pointer"
                    >
                      <span className="text-text-primary">{u.full_name}</span>
                      <span className="text-text-muted/50 ml-1.5">{u.email}</span>
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setShowLinkDropdown(false)} className="text-[10px] text-text-muted hover:text-text-secondary cursor-pointer mt-1">
                Cancel
              </button>
            </div>
          )}

          {inviteUrl && (
            <div className="rounded-lg border border-nativz-border/50 p-2 space-y-1.5">
              <p className="text-[10px] text-text-muted">Share this link</p>
              <div className="flex items-center gap-1.5">
                <input
                  readOnly
                  value={inviteUrl}
                  className="flex-1 rounded-md border border-nativz-border/50 bg-surface-elevated px-2 py-1 text-[10px] text-text-primary font-mono truncate"
                />
                <Button variant="outline" size="sm" onClick={handleCopy} className="h-6 px-2">
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                </Button>
              </div>
              <p className="text-[9px] text-text-muted/40">Expires in 7 days</p>
            </div>
          )}

          {!memberEmail && !showLinkDropdown && (
            <p className="text-[9px] text-amber-400/60">Add an email to send invites</p>
          )}
        </div>
      )}
    </div>
  );
}

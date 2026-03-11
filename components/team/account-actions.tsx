'use client';

import { useState, useEffect } from 'react';
import { LinkIcon, Send, Check, Copy, UserCheck, Unlink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
}

export function AccountActions({ memberId, memberEmail, linkedUserId, linkedUserName }: AccountActionsProps) {
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

  async function fetchLinkableUsers() {
    setLoadingUsers(true);
    try {
      const res = await fetch('/api/team/linkable-users');
      if (res.ok) {
        const data = await res.json();
        setLinkableUsers(data);
      }
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  }

  function handleShowLink() {
    setShowLinkDropdown(true);
    fetchLinkableUsers();
  }

  async function handleLink(userId: string, userName: string) {
    setLinking(true);
    try {
      const res = await fetch(`/api/team/${memberId}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to link');
      }

      setIsLinked(true);
      setCurrentLinkedName(userName);
      setShowLinkDropdown(false);
      toast.success('Account linked');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to link account');
    } finally {
      setLinking(false);
    }
  }

  async function handleUnlink() {
    setUnlinking(true);
    try {
      const res = await fetch(`/api/team/${memberId}/link`, { method: 'DELETE' });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to unlink');
      }

      setIsLinked(false);
      setCurrentLinkedName(null);
      toast.success('Account unlinked');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to unlink');
    } finally {
      setUnlinking(false);
    }
  }

  async function handleInvite() {
    setInviting(true);
    try {
      const res = await fetch(`/api/team/${memberId}/invite`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to create invite');
      }

      setInviteUrl(data.invite_url);
      toast.success('Invite link created');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setInviting(false);
    }
  }

  async function handleCopy() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <h2 className="text-base font-semibold text-text-primary flex items-center gap-2 mb-4">
        <UserCheck size={16} className="text-blue-400" />
        Cortex account
      </h2>

      {isLinked ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="success">Linked</Badge>
            {currentLinkedName && (
              <span className="text-sm text-text-secondary">{currentLinkedName}</span>
            )}
          </div>
          <p className="text-xs text-text-muted">
            This team member can sign in and access the admin dashboard.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleUnlink}
            disabled={unlinking}
            className="text-red-400 hover:text-red-300"
          >
            <Unlink size={13} />
            {unlinking ? 'Unlinking...' : 'Unlink account'}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="warning">No account</Badge>
          </div>
          <p className="text-xs text-text-muted">
            Link an existing account or send an invite to create one.
          </p>

          <div className="flex flex-col gap-2">
            {/* Link existing */}
            {!showLinkDropdown ? (
              <Button variant="outline" size="sm" onClick={handleShowLink}>
                <LinkIcon size={13} />
                Link existing account
              </Button>
            ) : (
              <div className="rounded-lg border border-nativz-border p-3 space-y-2">
                <p className="text-xs font-medium text-text-secondary">Select an account to link</p>
                {loadingUsers ? (
                  <p className="text-xs text-text-muted">Loading...</p>
                ) : linkableUsers.length === 0 ? (
                  <p className="text-xs text-text-muted">No available accounts to link</p>
                ) : (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {linkableUsers.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => handleLink(u.id, u.full_name)}
                        disabled={linking}
                        className="w-full text-left px-2.5 py-2 rounded-md hover:bg-surface-elevated transition-colors text-sm"
                      >
                        <span className="text-text-primary font-medium">{u.full_name}</span>
                        <span className="text-text-muted text-xs ml-2">{u.email}</span>
                      </button>
                    ))}
                  </div>
                )}
                <Button variant="ghost" size="sm" onClick={() => setShowLinkDropdown(false)}>
                  Cancel
                </Button>
              </div>
            )}

            {/* Send invite */}
            {!inviteUrl ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleInvite}
                disabled={inviting || !memberEmail}
              >
                <Send size={13} />
                {inviting ? 'Creating invite...' : 'Generate invite link'}
              </Button>
            ) : (
              <div className="rounded-lg border border-nativz-border p-3 space-y-2">
                <p className="text-xs font-medium text-text-secondary">Share this link with the team member</p>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={inviteUrl}
                    className="flex-1 rounded-md border border-nativz-border bg-surface-elevated px-2.5 py-1.5 text-xs text-text-primary font-mono truncate"
                  />
                  <Button variant="outline" size="sm" onClick={handleCopy}>
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                  </Button>
                </div>
                <p className="text-[10px] text-text-muted">Expires in 7 days</p>
              </div>
            )}

            {!memberEmail && (
              <p className="text-[10px] text-amber-400">
                Add an email address to this member before sending an invite.
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

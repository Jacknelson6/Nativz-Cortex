'use client';

import { useState, useEffect } from 'react';
import { X, Link2, Copy, Check, Shield, Clock, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface ShareBoardModalProps {
  boardId: string;
  open: boolean;
  onClose: () => void;
}

interface ShareInfo {
  shared: boolean;
  url?: string;
  token?: string;
  hasPassword?: boolean;
  expires_at?: string | null;
}

export function ShareBoardModal({ boardId, open, onClose }: ShareBoardModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [shareInfo, setShareInfo] = useState<ShareInfo>({ shared: false });
  const [password, setPassword] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetchShareInfo();
  }, [open, boardId]);

  async function fetchShareInfo() {
    setLoading(true);
    try {
      const res = await fetch(`/api/moodboard/boards/${boardId}/share`);
      const data = await res.json();
      setShareInfo(data);
      if (data.expires_at) {
        setExpiresAt(data.expires_at.split('T')[0]);
      }
    } catch {
      toast.error('Failed to load share info');
    } finally {
      setLoading(false);
    }
  }

  async function handleEnableSharing() {
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (password) body.password = password;
      if (expiresAt) body.expires_at = new Date(expiresAt).toISOString();

      const res = await fetch(`/api/moodboard/boards/${boardId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setShareInfo(data);
      setPassword('');
      toast.success('Share link created');
    } catch {
      toast.error('Failed to create share link');
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke() {
    setSaving(true);
    try {
      await fetch(`/api/moodboard/boards/${boardId}/share`, { method: 'DELETE' });
      setShareInfo({ shared: false });
      setPassword('');
      setExpiresAt('');
      toast.success('Share link revoked');
    } catch {
      toast.error('Failed to revoke share link');
    } finally {
      setSaving(false);
    }
  }

  function handleCopyLink() {
    if (shareInfo.url) {
      navigator.clipboard.writeText(shareInfo.url);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-surface border border-nativz-border rounded-xl shadow-elevated animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-nativz-border">
          <div className="flex items-center gap-2">
            <Link2 size={16} className="text-accent-text" />
            <h2 className="text-sm font-semibold text-text-primary">Share Board</h2>
          </div>
          <button onClick={onClose} className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-surface-hover transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-text-muted" />
            </div>
          ) : shareInfo.shared ? (
            <>
              {/* Active share link */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-xs font-medium text-green-400">Sharing enabled</span>
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    value={shareInfo.url || ''}
                    readOnly
                    className="text-xs font-mono"
                  />
                  <Button variant="outline" size="sm" onClick={handleCopyLink}>
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </Button>
                </div>

                {shareInfo.hasPassword && (
                  <div className="flex items-center gap-1.5 text-xs text-text-muted">
                    <Shield size={12} />
                    Password protected
                  </div>
                )}

                {shareInfo.expires_at && (
                  <div className="flex items-center gap-1.5 text-xs text-text-muted">
                    <Clock size={12} />
                    Expires {new Date(shareInfo.expires_at).toLocaleDateString()}
                  </div>
                )}

                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleRevoke}
                  disabled={saving}
                  className="w-full"
                >
                  <Trash2 size={14} />
                  Revoke Share Link
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Create share link */}
              <p className="text-sm text-text-secondary">
                Create a public link to share this board. Anyone with the link can view it in read-only mode.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-text-muted mb-1 block flex items-center gap-1">
                    <Shield size={11} />
                    Password (optional)
                  </label>
                  <Input
                    type="password"
                    placeholder="Leave blank for no password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-text-muted mb-1 block flex items-center gap-1">
                    <Clock size={11} />
                    Expiry date (optional)
                  </label>
                  <Input
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>

                <Button
                  onClick={handleEnableSharing}
                  disabled={saving}
                  className="w-full"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                  Create Share Link
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Link2, Unlink, Loader2, X, Check } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UpPromoteLogo } from '@/components/integrations/uppromote-logo';
import { TikTokMark } from '@/components/integrations/tiktok-mark';
import { InstagramMark } from '@/components/integrations/instagram-mark';
import { FacebookMark } from '@/components/integrations/facebook-mark';
import { YouTubeMark } from '@/components/integrations/youtube-mark';
import { INTEGRATION_SOCIAL_ICON_TILE } from '@/components/integrations/integration-icon-tile';
import type { SocialPlatform } from '@/lib/types/reporting';

interface SocialProfile {
  id: string;
  platform: SocialPlatform;
  username: string;
  avatar_url: string | null;
}

const PLATFORMS: { key: SocialPlatform; label: string; icon: React.ReactNode }[] = [
  { key: 'instagram', label: 'Instagram', icon: <InstagramMark size={18} /> },
  { key: 'facebook', label: 'Facebook', icon: <FacebookMark size={18} /> },
  { key: 'tiktok', label: 'TikTok', icon: <TikTokMark size={18} /> },
  { key: 'youtube', label: 'YouTube', icon: <YouTubeMark size={18} /> },
];

// ── UpPromote API Key Modal ─────────────────────────────────────────────────

function UpPromoteModal({ clientId, onClose, onConnected }: { clientId: string; onClose: () => void; onConnected: () => void }) {
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/uppromote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? 'Failed to connect');
        return;
      }
      toast.success('UpPromote connected — initial sync started');
      onConnected();
      onClose();
    } catch {
      toast.error('Failed to connect');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-background rounded-xl border border-nativz-border p-5 animate-[modalScaleIn_200ms_ease-out]" style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <UpPromoteLogo size={32} className="h-8 w-8 ring-1 ring-white/10" />
            <h3 className="text-sm font-semibold text-text-primary">Connect UpPromote</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-text-muted mb-3">
          Find your API key in UpPromote → Settings → Integrations.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="pk_..."
            autoFocus
            className="w-full rounded-lg border border-nativz-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving || !apiKey.trim()}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
              {saving ? 'Connecting...' : 'Connect'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function ConnectedAccounts({
  clientId,
  hasAffiliateIntegration,
}: {
  clientId: string;
  hasAffiliateIntegration?: boolean;
}) {
  const [profiles, setProfiles] = useState<SocialProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<SocialPlatform | null>(null);
  const [upPromoteConnected, setUpPromoteConnected] = useState(hasAffiliateIntegration ?? false);
  const [upPromoteDisconnecting, setUpPromoteDisconnecting] = useState(false);
  const [showUpPromoteModal, setShowUpPromoteModal] = useState(false);

  useEffect(() => {
    setUpPromoteConnected(hasAffiliateIntegration ?? false);
  }, [hasAffiliateIntegration]);

  const fetchProfiles = useCallback(async () => {
    try {
      const res = await fetch(`/api/social/profiles?clientId=${clientId}`);
      if (res.ok) {
        setProfiles(await res.json());
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  // Check URL for ?connected= param (post-OAuth redirect)
  useEffect(() => {
    const url = new URL(window.location.href);
    const connected = url.searchParams.get('connected');
    if (connected) {
      toast.success(`${connected.charAt(0).toUpperCase() + connected.slice(1)} connected successfully`);
      url.searchParams.delete('connected');
      window.history.replaceState({}, '', url.pathname + url.search);
      fetchProfiles();
    }
    const error = url.searchParams.get('error');
    if (error) {
      toast.error(`Connection failed: ${error}`);
      url.searchParams.delete('error');
      url.searchParams.delete('message');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, [fetchProfiles]);

  async function handleDisconnect(profileId: string, platform: string) {
    setDisconnecting(profileId);
    try {
      const res = await fetch(`/api/social/disconnect/${profileId}`, { method: 'DELETE' });
      if (res.ok) {
        setProfiles((prev) => prev.filter((p) => p.id !== profileId));
        toast.success(`${platform} disconnected`);
      } else {
        toast.error('Failed to disconnect');
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setDisconnecting(null);
    }
  }

  async function handleConnect(platform: SocialPlatform) {
    setConnecting(platform);
    try {
      const res = await fetch('/api/scheduler/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, client_id: clientId }),
      });
      if (!res.ok) {
        toast.error('Failed to start connection');
        return;
      }
      const { authUrl } = await res.json();
      window.location.href = authUrl;
    } catch {
      toast.error('Something went wrong');
    } finally {
      setConnecting(null);
    }
  }

  async function handleUpPromoteDisconnect() {
    setUpPromoteDisconnecting(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/uppromote`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Failed to disconnect');
        return;
      }
      setUpPromoteConnected(false);
      toast.success('UpPromote disconnected');
    } catch {
      toast.error('Failed to disconnect');
    } finally {
      setUpPromoteDisconnecting(false);
    }
  }

  const connectedPlatforms = new Set(profiles.map((p) => p.platform));

  const ROW_CLASS = 'flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3';

  return (
    <>
      <Card>
        <h2 className="text-base font-semibold text-text-primary mb-1">Integrations</h2>
        <p className="text-sm text-text-muted mb-4">
          Connect accounts for analytics, reporting, and affiliate tracking.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-text-muted py-4">
            <Loader2 size={14} className="animate-spin" />
            Loading...
          </div>
        ) : (
          <div className="space-y-3">
            {PLATFORMS.map((p) => {
              const profile = profiles.find((pr) => pr.platform === p.key);
              const isConnected = connectedPlatforms.has(p.key);

              return (
                <div key={p.key} className={ROW_CLASS}>
                  <div className={INTEGRATION_SOCIAL_ICON_TILE}>{p.icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary">{p.label}</p>
                    {isConnected && profile ? (
                      <p className="text-xs text-text-muted truncate">@{profile.username}</p>
                    ) : (
                      <p className="text-xs text-text-muted">Not connected</p>
                    )}
                  </div>
                  {isConnected && profile ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDisconnect(profile.id, p.label)}
                      disabled={disconnecting === profile.id}
                      className="shrink-0 text-text-muted hover:text-red-400 hover:border-red-500/30"
                    >
                      {disconnecting === profile.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Unlink size={14} />
                      )}
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleConnect(p.key)}
                      disabled={connecting === p.key}
                      className="shrink-0"
                    >
                      {connecting === p.key ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Link2 size={14} />
                      )}
                      Connect
                    </Button>
                  )}
                </div>
              );
            })}

            {/* UpPromote row */}
            <div className={ROW_CLASS}>
              <div className={INTEGRATION_SOCIAL_ICON_TILE}>
                <UpPromoteLogo size={22} className="h-[22px] w-[22px] rounded-md object-contain" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary">UpPromote</p>
                {upPromoteConnected ? (
                  <p className="text-xs text-emerald-400 flex items-center gap-1"><Check size={10} />Connected</p>
                ) : (
                  <p className="text-xs text-text-muted">Not connected</p>
                )}
              </div>
              {upPromoteConnected ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUpPromoteDisconnect}
                  disabled={upPromoteDisconnecting}
                  className="shrink-0 text-text-muted hover:text-red-400 hover:border-red-500/30"
                >
                  {upPromoteDisconnecting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Unlink size={14} />
                  )}
                  Disconnect
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowUpPromoteModal(true)}
                  className="shrink-0"
                >
                  <Link2 size={14} />
                  Connect
                </Button>
              )}
            </div>

          </div>
        )}
      </Card>

      {showUpPromoteModal && (
        <UpPromoteModal
          clientId={clientId}
          onClose={() => setShowUpPromoteModal(false)}
          onConnected={() => setUpPromoteConnected(true)}
        />
      )}
    </>
  );
}

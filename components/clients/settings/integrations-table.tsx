'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Link2, Unlink, Loader2, X, Check, Search, MoreHorizontal } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UpPromoteLogo } from '@/components/integrations/uppromote-logo';
import { TikTokMark } from '@/components/integrations/tiktok-mark';
import { InstagramMark } from '@/components/integrations/instagram-mark';
import { FacebookMark } from '@/components/integrations/facebook-mark';
import { YouTubeMark } from '@/components/integrations/youtube-mark';
import type { SocialPlatform } from '@/lib/types/reporting';

interface SocialProfile {
  id: string;
  platform: SocialPlatform;
  username: string;
  avatar_url: string | null;
}

type IntegrationKind = SocialPlatform | 'uppromote';

type IntegrationRow = {
  key: IntegrationKind;
  label: string;
  icon: React.ReactNode;
  integrationLabel: string | null;
  identifier: string | null;
  account: string | null;
  connected: boolean;
  profileId: string | null;
};

function UpPromoteModal({
  clientId,
  onClose,
  onConnected,
}: {
  clientId: string;
  onClose: () => void;
  onConnected: () => void;
}) {
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
      <div
        className="relative w-full max-w-sm bg-background rounded-xl border border-nativz-border p-5"
        style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <UpPromoteLogo size={28} className="h-7 w-7 ring-1 ring-white/10" />
            <h3 className="text-sm font-semibold text-text-primary">Connect UpPromote</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
          >
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
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
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

export function IntegrationsTable({
  clientId,
  hasAffiliateIntegration,
}: {
  clientId: string;
  hasAffiliateIntegration?: boolean;
}) {
  const [profiles, setProfiles] = useState<SocialProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<IntegrationKind | null>(null);
  const [upPromoteConnected, setUpPromoteConnected] = useState(hasAffiliateIntegration ?? false);
  const [upPromoteDisconnecting, setUpPromoteDisconnecting] = useState(false);
  const [showUpPromoteModal, setShowUpPromoteModal] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    setUpPromoteConnected(hasAffiliateIntegration ?? false);
  }, [hasAffiliateIntegration]);

  const fetchProfiles = useCallback(async () => {
    try {
      const res = await fetch(`/api/social/profiles?clientId=${clientId}`);
      if (res.ok) setProfiles(await res.json());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

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

  async function handleDisconnect(profileId: string, label: string) {
    setDisconnecting(profileId);
    try {
      const res = await fetch(`/api/social/disconnect/${profileId}`, { method: 'DELETE' });
      if (res.ok) {
        setProfiles((prev) => prev.filter((p) => p.id !== profileId));
        toast.success(`${label} disconnected`);
      } else {
        toast.error('Failed to disconnect');
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setDisconnecting(null);
    }
  }

  async function handleConnectSocial(platform: SocialPlatform) {
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

  const rows = useMemo<IntegrationRow[]>(() => {
    const findProfile = (platform: SocialPlatform) => profiles.find((p) => p.platform === platform) ?? null;
    const socialRow = (
      key: SocialPlatform,
      label: string,
      icon: React.ReactNode,
    ): IntegrationRow => {
      const profile = findProfile(key);
      return {
        key,
        label,
        icon,
        integrationLabel: profile ? `@${profile.username}` : null,
        identifier: profile?.id ?? null,
        account: profile?.username ?? null,
        connected: !!profile,
        profileId: profile?.id ?? null,
      };
    };

    const all: IntegrationRow[] = [
      socialRow('instagram', 'Instagram', <InstagramMark size={18} />),
      socialRow('facebook', 'Facebook', <FacebookMark size={18} />),
      socialRow('tiktok', 'TikTok', <TikTokMark size={18} />),
      socialRow('youtube', 'YouTube', <YouTubeMark size={18} />),
      {
        key: 'uppromote',
        label: 'UpPromote',
        icon: <UpPromoteLogo size={20} className="h-[20px] w-[20px] rounded-sm object-contain" />,
        integrationLabel: upPromoteConnected ? 'Affiliate tracking' : null,
        identifier: null,
        account: null,
        connected: upPromoteConnected,
        profileId: null,
      },
    ];

    if (!query.trim()) return all;
    const q = query.trim().toLowerCase();
    return all.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        (r.account ?? '').toLowerCase().includes(q) ||
        (r.integrationLabel ?? '').toLowerCase().includes(q),
    );
  }, [profiles, upPromoteConnected, query]);

  const connectedCount = rows.filter((r) => r.connected).length;

  return (
    <>
      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-nativz-border">
          <div className="text-xs text-text-muted">
            Showing {rows.length} of {rows.length} rows
            {connectedCount > 0 && <span className="ml-2">· {connectedCount} connected</span>}
          </div>
          <div className="relative max-w-xs w-full">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-md border border-nativz-border bg-surface-hover px-2 py-1.5 pl-7 text-xs text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-text-muted py-10 justify-center">
            <Loader2 size={14} className="animate-spin" />
            Loading…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-nativz-border bg-surface-hover/30">
                  <Th className="w-[22%]">Integration</Th>
                  <Th className="w-[22%]">Label</Th>
                  <Th className="w-[20%]">Identifier</Th>
                  <Th className="w-[18%]">Account</Th>
                  <Th className="w-[12%]">Status</Th>
                  <Th className="w-[6%] text-right pr-4">{''}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.key}
                    className="border-b border-nativz-border last:border-b-0 hover:bg-surface-hover/20 transition-colors"
                  >
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                          {row.icon}
                        </span>
                        <span className="font-medium text-text-primary">{row.label}</span>
                      </div>
                    </Td>
                    <Td>
                      {row.integrationLabel ? (
                        <span className="text-text-secondary">{row.integrationLabel}</span>
                      ) : (
                        <span className="text-text-muted italic">—</span>
                      )}
                    </Td>
                    <Td>
                      {row.identifier ? (
                        <span className="font-mono text-xs text-text-muted truncate max-w-[180px] inline-block">
                          {row.identifier}
                        </span>
                      ) : (
                        <span className="text-text-muted italic">—</span>
                      )}
                    </Td>
                    <Td>
                      {row.account ? (
                        <span className="text-text-secondary">{row.account}</span>
                      ) : (
                        <span className="text-text-muted italic">—</span>
                      )}
                    </Td>
                    <Td>
                      {row.connected ? (
                        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] uppercase tracking-wider">
                          <Check size={10} className="mr-0.5" />
                          Connected
                        </Badge>
                      ) : (
                        <Badge className="bg-zinc-500/10 text-zinc-400 border-zinc-500/20 text-[10px] uppercase tracking-wider">
                          Not connected
                        </Badge>
                      )}
                    </Td>
                    <Td className="text-right pr-4">
                      <RowAction
                        row={row}
                        connecting={connecting === row.key}
                        disconnecting={
                          row.key === 'uppromote'
                            ? upPromoteDisconnecting
                            : disconnecting === row.profileId
                        }
                        onConnect={() => {
                          if (row.key === 'uppromote') {
                            setShowUpPromoteModal(true);
                          } else {
                            handleConnectSocial(row.key);
                          }
                        }}
                        onDisconnect={() => {
                          if (row.key === 'uppromote') {
                            handleUpPromoteDisconnect();
                          } else if (row.profileId) {
                            handleDisconnect(row.profileId, row.label);
                          }
                        }}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
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

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-text-muted ${className ?? ''}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle ${className ?? ''}`}>{children}</td>;
}

function RowAction({
  row,
  connecting,
  disconnecting,
  onConnect,
  onDisconnect,
}: {
  row: IntegrationRow;
  connecting: boolean;
  disconnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  if (!row.connected) {
    return (
      <Button variant="outline" size="sm" onClick={onConnect} disabled={connecting}>
        {connecting ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
        Connect
      </Button>
    );
  }
  return (
    <div className="inline-flex items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={onDisconnect}
        disabled={disconnecting}
        className="text-text-muted hover:text-red-400 hover:border-red-500/30"
      >
        {disconnecting ? <Loader2 size={12} className="animate-spin" /> : <Unlink size={12} />}
        Disconnect
      </Button>
      <button
        type="button"
        className="rounded-md p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
        title="More"
        aria-label="More"
      >
        <MoreHorizontal size={14} />
      </button>
    </div>
  );
}

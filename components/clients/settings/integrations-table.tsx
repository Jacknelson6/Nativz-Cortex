'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Link2, Unlink, Loader2, MessageSquare } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
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

type IntegrationKind = SocialPlatform | 'uppromote' | 'google_chat';

type IntegrationRow = {
  key: IntegrationKind;
  label: string;
  icon: React.ReactNode;
  /** One-liner shown under the name when connected (e.g. "@username", "Affiliate tracking"). */
  subtitle: string | null;
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
    <Dialog open onClose={onClose} title="" maxWidth="sm" bodyClassName="p-5">
      <div className="flex items-center gap-2 mb-4 pr-10">
        <UpPromoteLogo size={28} className="h-7 w-7 ring-1 ring-white/10" />
        <h3 className="text-sm font-semibold text-text-primary">Connect UpPromote</h3>
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
    </Dialog>
  );
}

function GoogleChatModal({
  clientId,
  initialUrl,
  onClose,
  onSaved,
}: {
  clientId: string;
  initialUrl: string | null;
  onClose: () => void;
  onSaved: (url: string) => void;
}) {
  const [url, setUrl] = useState(initialUrl ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed.startsWith('https://chat.googleapis.com/')) {
      toast.error('Must be a Google Chat webhook URL (https://chat.googleapis.com/...)');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/chat-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook_url: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? 'Failed to save webhook');
        return;
      }
      toast.success('Webhook connected — test message sent to the Chat space');
      onSaved(trimmed);
      onClose();
    } catch {
      toast.error('Failed to save webhook');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title="" maxWidth="sm" bodyClassName="p-5">
      <div className="flex items-center gap-2 mb-4 pr-10">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10 text-blue-400">
          <MessageSquare size={16} />
        </span>
        <h3 className="text-sm font-semibold text-text-primary">
          {initialUrl ? 'Update Google Chat webhook' : 'Connect Google Chat'}
        </h3>
      </div>
      <p className="text-xs text-text-muted mb-3">
        In your client&apos;s team Chat space, add an incoming webhook (avatar URL: cortex.nativz.io/avatar-nativz.png), then paste the URL below. Cortex sends a test message to verify.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://chat.googleapis.com/v1/spaces/.../messages?key=...&token=..."
          autoFocus
          className="w-full rounded-lg border border-nativz-border bg-surface-hover px-3 py-2 text-xs font-mono text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20"
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving || !url.trim()}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
            {saving ? 'Connecting...' : initialUrl ? 'Save' : 'Connect'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function IntegrationsTable({
  clientId,
  hasAffiliateIntegration,
  chatWebhookUrl: initialChatWebhookUrl = null,
  bare = false,
}: {
  clientId: string;
  hasAffiliateIntegration?: boolean;
  chatWebhookUrl?: string | null;
  /** When true, drops the outer Card chrome so the table embeds inside an
   *  InfoCard / equivalent surface without nested cards. */
  bare?: boolean;
}) {
  const [profiles, setProfiles] = useState<SocialProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<IntegrationKind | null>(null);
  const [upPromoteConnected, setUpPromoteConnected] = useState(hasAffiliateIntegration ?? false);
  const [upPromoteDisconnecting, setUpPromoteDisconnecting] = useState(false);
  const [showUpPromoteModal, setShowUpPromoteModal] = useState(false);
  const [chatWebhookUrl, setChatWebhookUrl] = useState<string | null>(initialChatWebhookUrl);
  const [chatDisconnecting, setChatDisconnecting] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);

  useEffect(() => {
    setUpPromoteConnected(hasAffiliateIntegration ?? false);
  }, [hasAffiliateIntegration]);

  useEffect(() => {
    setChatWebhookUrl(initialChatWebhookUrl);
  }, [initialChatWebhookUrl]);

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

  async function handleChatDisconnect() {
    setChatDisconnecting(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/chat-webhook`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Failed to disconnect');
        return;
      }
      setChatWebhookUrl(null);
      toast.success('Google Chat webhook disconnected');
    } catch {
      toast.error('Failed to disconnect');
    } finally {
      setChatDisconnecting(false);
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
        subtitle: profile ? `@${profile.username}` : null,
        connected: !!profile,
        profileId: profile?.id ?? null,
      };
    };

    return [
      socialRow('instagram', 'Instagram', <InstagramMark size={20} />),
      socialRow('facebook', 'Facebook', <FacebookMark size={20} />),
      socialRow('tiktok', 'TikTok', <TikTokMark size={20} />),
      socialRow('youtube', 'YouTube', <YouTubeMark size={20} />),
      {
        key: 'uppromote',
        label: 'UpPromote',
        icon: <UpPromoteLogo size={22} className="h-[22px] w-[22px] rounded-sm object-contain" />,
        subtitle: upPromoteConnected ? 'Affiliate tracking enabled' : null,
        connected: upPromoteConnected,
        profileId: null,
      },
      {
        key: 'google_chat',
        label: 'Google Chat',
        icon: (
          <span className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-blue-500/10 text-blue-400">
            <MessageSquare size={13} />
          </span>
        ),
        subtitle: chatWebhookUrl
          ? `Space ${extractSpaceId(chatWebhookUrl) ?? 'connected'}`
          : null,
        connected: Boolean(chatWebhookUrl),
        profileId: null,
      },
    ];
  }, [profiles, upPromoteConnected, chatWebhookUrl]);

  const connectedCount = rows.filter((r) => r.connected).length;

  const Shell = bare
    ? ({ children }: { children: React.ReactNode }) => (
      <div className="rounded-lg border border-nativz-border overflow-hidden">{children}</div>
    )
    : ({ children }: { children: React.ReactNode }) => (
      <Card className="p-0 overflow-hidden">{children}</Card>
    );

  return (
    <>
      <Shell>
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-nativz-border bg-surface-hover/20">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            {connectedCount} of {rows.length} connected
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-text-muted py-10 justify-center">
            <Loader2 size={14} className="animate-spin" />
            Loading…
          </div>
        ) : (
          <ul className="divide-y divide-nativz-border">
            {rows.map((row) => (
              <li
                key={row.key}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover/20 transition-colors"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-nativz-border bg-surface">
                  {row.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary truncate">{row.label}</span>
                    {row.connected && (
                      <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
                    )}
                  </div>
                  <p className="text-xs text-text-muted truncate">
                    {row.subtitle ?? 'Not connected'}
                  </p>
                </div>
                <RowAction
                  row={row}
                  connecting={connecting === row.key}
                  disconnecting={
                    row.key === 'uppromote'
                      ? upPromoteDisconnecting
                      : row.key === 'google_chat'
                      ? chatDisconnecting
                      : disconnecting === row.profileId
                  }
                  onConnect={() => {
                    if (row.key === 'uppromote') {
                      setShowUpPromoteModal(true);
                    } else if (row.key === 'google_chat') {
                      setShowChatModal(true);
                    } else {
                      handleConnectSocial(row.key as SocialPlatform);
                    }
                  }}
                  onDisconnect={() => {
                    if (row.key === 'uppromote') {
                      handleUpPromoteDisconnect();
                    } else if (row.key === 'google_chat') {
                      handleChatDisconnect();
                    } else if (row.profileId) {
                      handleDisconnect(row.profileId, row.label);
                    }
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Shell>

      {showUpPromoteModal && (
        <UpPromoteModal
          clientId={clientId}
          onClose={() => setShowUpPromoteModal(false)}
          onConnected={() => setUpPromoteConnected(true)}
        />
      )}

      {showChatModal && (
        <GoogleChatModal
          clientId={clientId}
          initialUrl={chatWebhookUrl}
          onClose={() => setShowChatModal(false)}
          onSaved={(url) => setChatWebhookUrl(url)}
        />
      )}
    </>
  );
}

function extractSpaceId(webhookUrl: string): string | null {
  const m = webhookUrl.match(/\/spaces\/([A-Za-z0-9_-]+)\//);
  return m ? m[1] : null;
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
      <Button variant="outline" size="sm" onClick={onConnect} disabled={connecting} className="shrink-0">
        {connecting ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
        Connect
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onDisconnect}
      disabled={disconnecting}
      className="shrink-0 text-text-muted hover:text-red-400"
    >
      {disconnecting ? <Loader2 size={12} className="animate-spin" /> : <Unlink size={12} />}
      Disconnect
    </Button>
  );
}

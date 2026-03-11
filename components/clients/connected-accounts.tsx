'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Link2, Unlink, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { SocialPlatform } from '@/lib/types/reporting';

interface SocialProfile {
  id: string;
  platform: SocialPlatform;
  username: string;
  avatar_url: string | null;
}

// Brand SVG icons
const InstagramIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0z" fill="url(#ig-gradient)"/>
    <path d="M12 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8z" fill="url(#ig-gradient)"/>
    <circle cx="18.406" cy="5.594" r="1.44" fill="url(#ig-gradient)"/>
    <defs>
      <linearGradient id="ig-gradient" x1="0" y1="24" x2="24" y2="0">
        <stop stopColor="#FD5" /><stop offset=".5" stopColor="#FF543E" /><stop offset="1" stopColor="#C837AB" />
      </linearGradient>
    </defs>
  </svg>
);

const FacebookIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M24 12c0-6.627-5.373-12-12-12S0 5.373 0 12c0 5.99 4.388 10.954 10.125 11.854V15.47H7.078V12h3.047V9.356c0-3.007 1.792-4.668 4.533-4.668 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874V12h3.328l-.532 3.47h-2.796v8.385C19.612 22.954 24 17.99 24 12z" fill="#1877F2"/>
  </svg>
);

const TikTokIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.75a8.18 8.18 0 004.77 1.52V6.84a4.84 4.84 0 01-1-.15z" fill="url(#tt-gradient)"/>
    <defs>
      <linearGradient id="tt-gradient" x1="4" y1="22" x2="20" y2="2">
        <stop stopColor="#25F4EE" /><stop offset="1" stopColor="#BE2EDD" />
      </linearGradient>
    </defs>
  </svg>
);

const YouTubeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" fill="#FF0000"/>
    <path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="#fff"/>
  </svg>
);

const PLATFORMS: {
  key: SocialPlatform;
  label: string;
  icon: React.ReactNode;
  bg: string;
}[] = [
  { key: 'instagram', label: 'Instagram', icon: <InstagramIcon />, bg: 'bg-pink-500/10' },
  { key: 'facebook', label: 'Facebook', icon: <FacebookIcon />, bg: 'bg-blue-500/10' },
  { key: 'tiktok', label: 'TikTok', icon: <TikTokIcon />, bg: 'bg-purple-500/10' },
  { key: 'youtube', label: 'YouTube', icon: <YouTubeIcon />, bg: 'bg-red-500/10' },
];

export function ConnectedAccounts({ clientId }: { clientId: string }) {
  const [profiles, setProfiles] = useState<SocialProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<SocialPlatform | null>(null);

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

  const connectedPlatforms = new Set(profiles.map((p) => p.platform));

  return (
    <Card>
      <h2 className="text-base font-semibold text-text-primary mb-1">Connected accounts</h2>
      <p className="text-sm text-text-muted mb-4">
        Connect social media accounts for analytics and reporting.
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
              <div
                key={p.key}
                className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3"
              >
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${p.bg}`}>
                  {p.icon}
                </div>
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
        </div>
      )}
    </Card>
  );
}

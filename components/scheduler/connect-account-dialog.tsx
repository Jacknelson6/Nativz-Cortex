'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import type { ConnectedProfile } from './types';

const PLATFORMS = [
  { id: 'instagram' as const, label: 'Instagram' },
  { id: 'tiktok' as const, label: 'TikTok' },
  { id: 'youtube' as const, label: 'YouTube' },
  { id: 'facebook' as const, label: 'Facebook' },
];

interface ConnectAccountDialogProps {
  open: boolean;
  onClose: () => void;
  clientId: string;
  profiles: ConnectedProfile[];
}

export function ConnectAccountDialog({ open, onClose, clientId, profiles }: ConnectAccountDialogProps) {
  const [connecting, setConnecting] = useState<string | null>(null);

  const connectedPlatforms = new Set(profiles.map(p => p.platform));

  async function handleConnect(platform: string) {
    setConnecting(platform);
    try {
      const res = await fetch('/api/scheduler/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, client_id: clientId }),
      });
      if (!res.ok) throw new Error('Failed to start connection');
      const { authUrl } = await res.json();
      window.location.href = authUrl;
    } catch {
      toast.error('Failed to connect account');
      setConnecting(null);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="" maxWidth="md" bodyClassName="p-6">
      <div className="pr-10">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Connect account</h2>
        <p className="text-sm text-text-muted mb-4">
          Connect a social media account to start scheduling posts.
        </p>
        <div className="space-y-2">
          {PLATFORMS.map(({ id, label }) => {
            const connected = connectedPlatforms.has(id);
            const profile = profiles.find(p => p.platform === id);

            if (connected) {
              return (
                <div
                  key={id}
                  className="flex items-center justify-between w-full rounded-lg border border-nativz-border bg-surface-hover px-4 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <Check size={14} className="text-green-400" />
                    <span className="text-sm text-text-primary">{label}</span>
                    <span className="text-xs text-text-muted">@{profile?.username}</span>
                  </div>
                </div>
              );
            }

            return (
              <Button
                key={id}
                variant="secondary"
                className="w-full justify-start"
                disabled={connecting !== null}
                onClick={() => handleConnect(id)}
              >
                {connecting === id ? 'Connecting...' : `Connect ${label}`}
              </Button>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}

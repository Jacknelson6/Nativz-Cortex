'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Calendar, Check, Loader2, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function GoogleCalendarSection({
  connected,
  onConnectionChange,
}: {
  connected: boolean;
  onConnectionChange: (connected: boolean) => void;
}) {
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await fetch('/api/nango/connect', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Could not start calendar auth');
        return;
      }
      const { token } = await res.json();

      const { default: Nango } = await import('@nangohq/frontend');
      const nango = new Nango({ connectSessionToken: token });
      const result = await nango.auth('google-calendar');

      const callbackRes = await fetch('/api/nango/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: result.connectionId }),
      });

      if (!callbackRes.ok) {
        toast.error('Connected to Google but failed to save. Try reconnecting.');
        return;
      }

      toast.success('Google Calendar connected');
      onConnectionChange(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      if (message.includes('closed') || message.includes('cancelled')) {
        toast.error('Calendar connection was cancelled');
      } else {
        toast.error('Failed to connect calendar. Try again.');
      }
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch('/api/nango/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: '' }),
      });

      if (!res.ok) {
        toast.error('Failed to disconnect calendar.');
        return;
      }

      await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nango_connection_id: null }),
      });

      toast.success('Google Calendar disconnected');
      onConnectionChange(false);
    } catch {
      toast.error('Something went wrong.');
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-hover">
          <Image src="/icons/google-calendar.svg" alt="Google Calendar" width={22} height={22} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text-primary">Google Calendar</h3>
            {connected && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                <Check size={10} />
                Connected
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            {connected
              ? 'Syncs shoot events from your calendar'
              : 'Connect to detect upcoming shoots from your calendar'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {connected ? (
            <>
              <Link href="/admin/settings/calendar">
                <Button variant="outline" size="sm">
                  <Calendar size={12} />
                  Manage
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="text-text-muted hover:text-red-400"
              >
                {disconnecting ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Unlink size={12} />
                )}
                Disconnect
              </Button>
            </>
          ) : (
            <Button onClick={handleConnect} disabled={connecting} size="sm">
              {connecting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Calendar size={14} />
              )}
              {connecting ? 'Connecting...' : 'Connect Google Calendar'}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

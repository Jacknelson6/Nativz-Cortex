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
  const [disconnecting, setDisconnecting] = useState(false);

  function handleConnect() {
    window.location.href = '/api/google';
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch('/api/google/disconnect', { method: 'POST' });
      if (!res.ok) {
        toast.error('Failed to disconnect calendar.');
        return;
      }

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
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
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
            <Button onClick={handleConnect} size="sm">
              <Calendar size={14} />
              Connect Google Calendar
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

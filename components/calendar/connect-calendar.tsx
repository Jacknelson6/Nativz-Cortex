'use client';

import { useState, useEffect } from 'react';
import { Calendar, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GlassButton } from '@/components/ui/glass-button';

interface ConnectionStatus {
  connected: boolean;
  lastSynced: string | null;
  calendarId: string | null;
}

export function ConnectCalendar() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    checkStatus();

    // Check URL params for callback result
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'connected') {
      toast.success('Google Calendar connected successfully');
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('error')) {
      const err = params.get('error');
      const messages: Record<string, string> = {
        denied: 'Calendar access was denied',
        missing_params: 'Missing parameters from Google',
        no_refresh_token: 'Could not get offline access. Try again.',
        exchange_failed: 'Token exchange failed. Try again.',
      };
      toast.error(messages[err ?? ''] ?? 'Calendar connection failed');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  async function checkStatus() {
    try {
      const res = await fetch('/api/calendar/events');
      if (res.ok) {
        await res.json();
        setStatus({
          connected: true,
          lastSynced: null, // Would need separate endpoint
          calendarId: 'primary',
        });
      } else if (res.status === 404) {
        setStatus({ connected: false, lastSynced: null, calendarId: null });
      }
    } catch {
      setStatus({ connected: false, lastSynced: null, calendarId: null });
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await fetch('/api/calendar/connect');
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Could not start Google auth');
        return;
      }
      const data = await res.json();
      // Redirect to Google OAuth
      window.location.href = data.url;
    } catch {
      toast.error('Failed to connect. Try again.');
    } finally {
      setConnecting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch('/api/calendar/sync', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Sync failed');
        return;
      }
      const data = await res.json();
      toast.success(
        `Synced! Found ${data.shootsFound} shoots (${data.created} new, ${data.matched} matched to clients)`
      );
    } catch {
      toast.error('Sync failed. Try again.');
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <Loader2 size={16} className="animate-spin text-text-muted" />
          <span className="text-sm text-text-muted">Checking calendar connection...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <div className={`
          flex h-10 w-10 items-center justify-center rounded-xl
          ${status?.connected ? 'bg-emerald-500/15 text-emerald-400' : 'bg-surface-hover text-text-muted'}
        `}>
          <Calendar size={18} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Google Calendar</h3>
          <p className="text-xs text-text-muted">
            {status?.connected
              ? 'Connected — syncs shoot events automatically'
              : 'Connect to detect upcoming shoots'}
          </p>
        </div>
        {status?.connected && (
          <div className="ml-auto flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-400 font-medium">Connected</span>
          </div>
        )}
      </div>

      {status?.connected ? (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {syncing ? 'Syncing...' : 'Sync now'}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleConnect}>
            <ExternalLink size={12} />
            Reconnect
          </Button>
        </div>
      ) : (
        <GlassButton onClick={handleConnect} loading={connecting}>
          <Calendar size={14} />
          Connect Google Calendar
        </GlassButton>
      )}

      {/* Easter egg: the calendar icon subtly rotates on hover */}
    </Card>
  );
}

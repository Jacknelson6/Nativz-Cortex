'use client';

import { useState, useEffect } from 'react';
import { Calendar, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import Nango from '@nangohq/frontend';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GlassButton } from '@/components/ui/glass-button';

interface ConnectionStatus {
  connected: boolean;
  lastSynced: string | null;
}

export function ConnectCalendar() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    try {
      const res = await fetch('/api/calendar/sync', { method: 'POST' });
      if (res.ok) {
        setStatus({ connected: true, lastSynced: new Date().toISOString() });
      } else {
        setStatus({ connected: false, lastSynced: null });
      }
    } catch {
      setStatus({ connected: false, lastSynced: null });
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    try {
      // Get a connect session token from our backend
      const res = await fetch('/api/calendar/connect');
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Could not start calendar auth');
        return;
      }
      const { token } = await res.json();

      // Open Nango OAuth popup
      const nango = new Nango({ connectSessionToken: token });
      const result = await nango.auth('google-calendar');

      // Store the connectionId in our DB immediately (no webhook dependency)
      const confirmRes = await fetch('/api/calendar/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: result.connectionId }),
      });

      if (!confirmRes.ok) {
        toast.error('Connected to Google but failed to save. Try reconnecting.');
        return;
      }

      toast.success('Google Calendar connected — syncing events...');
      await handleSync();
      setStatus({ connected: true, lastSynced: new Date().toISOString() });
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
      setStatus({ connected: true, lastSynced: new Date().toISOString() });
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
      <div className="flex items-center gap-3">
        <div className={`
          flex h-10 w-10 shrink-0 items-center justify-center rounded-xl
          ${status?.connected ? 'bg-emerald-500/15 text-emerald-400' : 'bg-surface-hover text-text-muted'}
        `}>
          <Calendar size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-text-primary">Google Calendar</h3>
          <p className="text-xs text-text-muted">
            {status?.connected
              ? 'Connected — syncs shoot events automatically'
              : 'Connect to detect upcoming shoots from your calendar'}
          </p>
        </div>

        {status?.connected ? (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {syncing ? 'Syncing...' : 'Sync now'}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleConnect} disabled={connecting}>
              <Calendar size={12} />
              Reconnect
            </Button>
          </div>
        ) : (
          <GlassButton onClick={handleConnect} disabled={connecting} className="shrink-0">
            {connecting ? <Loader2 size={14} className="animate-spin" /> : <Calendar size={14} />}
            {connecting ? 'Connecting...' : 'Connect'}
          </GlassButton>
        )}
      </div>
    </Card>
  );
}
